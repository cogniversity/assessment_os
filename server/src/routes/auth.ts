import { Router, type Request as ExpressRequest } from "express";
import * as client from "openid-client";
import { z } from "zod";
import { config, oidcConfigured } from "../config.js";
import { prisma } from "../db.js";
import { Role, highestRole, type Role as AppRole } from "@assessment-os/shared";
import { loginSchema } from "@assessment-os/shared";
import { resolveOidcIdentity } from "../services/oidcIdentity.js";
import { mergeUserRoles, resolveAppRoles } from "../services/roleResolver.js";
import { getUserAppIdRoles, isAppIdConfigured } from "../services/appidManagement.js";
import { ensureProfile } from "../services/profileService.js";
import type { User } from "@prisma/client";

export const authRouter = Router();

let oidcConfig: client.Configuration | null = null;

async function getOidcConfig() {
  if (!oidcConfigured) return null;
  if (!oidcConfig) {
    oidcConfig = await client.discovery(
      new URL(config.oidc.issuer),
      config.oidc.clientId,
      config.oidc.clientSecret
    );
  }
  return oidcConfig;
}

function resolveActiveRole(sessionActive: AppRole | undefined, granted: AppRole[]): AppRole {
  if (sessionActive && granted.includes(sessionActive)) return sessionActive;
  return highestRole(granted);
}

function homePathForRole(role: AppRole): string {
  if (role === Role.ADMIN) return "/admin";
  if (role === Role.CAPABILITY_MANAGER) return "/manager";
  return "/dashboard";
}

function formatAuthUser(user: User, activeRole: AppRole) {
  const roles = user.roles as AppRole[];
  return {
    ...user,
    roles,
    activeRole,
    role: activeRole,
  };
}

authRouter.get("/me", async (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: req.session.userId },
    include: { profile: true },
  });
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const roles = user.roles as AppRole[];
  const activeRole = resolveActiveRole(req.session.activeRole as AppRole | undefined, roles);
  req.session.activeRole = activeRole;
  res.json(formatAuthUser(user, activeRole));
});

authRouter.post("/switch-role", async (req, res, next) => {
  try {
    if (!req.session.userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const { role } = z.object({ role: z.enum(["admin", "capability_manager", "candidate"]) }).parse(req.body);
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      include: { profile: true },
    });
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const roles = user.roles as AppRole[];
    if (!roles.includes(role as AppRole)) {
      res.status(403).json({ error: "Role not granted" });
      return;
    }
    req.session.activeRole = role as AppRole;
    await saveSession(req);
    res.json(formatAuthUser(user, role as AppRole));
  } catch (e) {
    next(e);
  }
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

authRouter.get("/config", (_req, res) => {
  res.json({ devAuth: config.devAuthEnabled, oidcConfigured });
});

authRouter.get("/login", async (req, res, next) => {
  try {
    const oidc = await getOidcConfig();
    if (!oidc) {
      res.json({ devAuth: config.devAuthEnabled, oidcConfigured: false });
      return;
    }
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();
    const nonce = client.randomNonce();
    req.session.oidcState = state;
    req.session.oidcNonce = nonce;
    req.session.oidcCodeVerifier = codeVerifier;
    const url = client.buildAuthorizationUrl(oidc, {
      redirect_uri: config.oidc.callbackUrl,
      scope: "openid email profile",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      nonce,
    });
    await saveSession(req);
    console.info(
      `OIDC login started: redirect_uri=${config.oidc.callbackUrl} sessionId=${req.sessionID}`
    );
    res.json({ url: url.href });
  } catch (e) {
    console.error("OIDC login setup failed:", e);
    if (config.devAuthEnabled) {
      res.json({ devAuth: true, oidcConfigured: false });
      return;
    }
    next(e);
  }
});

function oidcCallbackUrl(req: { url: string; query: Record<string, unknown> }): URL {
  const currentUrl = new URL(config.oidc.callbackUrl);
  for (const [key, value] of Object.entries(req.query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) value.forEach((v) => currentUrl.searchParams.append(key, String(v)));
    else currentUrl.searchParams.set(key, String(value));
  }
  return currentUrl;
}

function saveSession(req: ExpressRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

authRouter.get("/callback", async (req, res) => {
  const oidc = await getOidcConfig();
  if (!oidc) {
    res.redirect(`${config.clientBaseUrl}/login?error=oidc_not_configured`);
    return;
  }
  try {
    if (!req.session.oidcCodeVerifier || !req.session.oidcState) {
      console.error(
        "OIDC callback: missing session (PKCE/state).",
        {
          callbackUrl: config.oidc.callbackUrl,
          clientUrl: config.clientBaseUrl,
          hasCookieHeader: Boolean(req.headers.cookie),
          sessionId: req.sessionID,
          cookieSecure: process.env.SESSION_COOKIE_SECURE,
        }
      );
      res.redirect(`${config.clientBaseUrl}/login?error=session_lost`);
      return;
    }
    const currentUrl = oidcCallbackUrl(req);
    const tokens = await client.authorizationCodeGrant(oidc, currentUrl, {
      expectedState: req.session.oidcState,
      expectedNonce: req.session.oidcNonce,
      pkceCodeVerifier: req.session.oidcCodeVerifier,
    });
    const { sub, email, name, appIdRoles: tokenRoles } = await resolveOidcIdentity(oidc, tokens);
    let appIdRoles = tokenRoles;
    if (appIdRoles.length === 0 && isAppIdConfigured()) {
      appIdRoles = await getUserAppIdRoles(sub);
    }
    const fromLogin = resolveAppRoles(email, sub, appIdRoles);
    console.info(
      `OIDC login: sub=${sub} email=${email} appIdRoles=[${appIdRoles.join(", ")}] roles=[${fromLogin.join(", ")}]`
    );
    // Link by OIDC subject, or by email (e.g. user provisioned in admin before first IBM login)
    let user =
      (sub ? await prisma.user.findFirst({ where: { oidcSub: sub } }) : null) ??
      (await prisma.user.findUnique({ where: { email } }));

    const roles = mergeUserRoles(user?.roles as AppRole[] | undefined, fromLogin);
    const activeRole = highestRole(roles);

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          oidcSub: sub || null,
          roles,
        },
      });
    } else {
      const updateEmail = user.email.endsWith("@oidc.local") && !email.endsWith("@oidc.local");
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name,
          roles,
          ...(sub ? { oidcSub: sub } : {}),
          ...(updateEmail && email.includes("@") ? { email } : {}),
        },
      });
    }
    await ensureProfile(user.id);
    req.session.userId = user.id;
    req.session.activeRole = activeRole;
    delete req.session.oidcState;
    delete req.session.oidcNonce;
    delete req.session.oidcCodeVerifier;
    await saveSession(req);

    res.redirect(`${config.clientBaseUrl}${homePathForRole(activeRole)}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("OIDC callback failed:", e);
    if (msg.includes("Unique constraint") && msg.includes("email")) {
      res.redirect(`${config.clientBaseUrl}/login?error=email_link_failed`);
      return;
    }
    res.redirect(`${config.clientBaseUrl}/login?error=auth_failed`);
  }
});

authRouter.post("/dev-login", async (req, res) => {
  if (!config.devAuthEnabled && oidcConfigured) {
    res.status(403).json({ error: "Dev auth disabled" });
    return;
  }
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(parsed.error.flatten());
    return;
  }
  const { email, name } = parsed.data;
  let user = await prisma.user.findUnique({ where: { email } });
  const fromLogin = resolveAppRoles(email.toLowerCase(), undefined, []);
  const roles = mergeUserRoles(user?.roles as AppRole[] | undefined, fromLogin);
  const activeRole = highestRole(roles);
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: name || email.split("@")[0],
        roles,
      },
    });
    await prisma.candidateProfile.create({ data: { userId: user.id } });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { name: name || email.split("@")[0], roles },
    });
  }
  req.session.userId = user.id;
  req.session.activeRole = activeRole;
  await saveSession(req);
  res.json(formatAuthUser(user, activeRole));
});
