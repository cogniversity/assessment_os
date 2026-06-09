import * as client from "openid-client";
import { appIdRolesFromClaims, decodeJwtPayload } from "./roleResolver.js";

export function emailFromClaims(claims: Record<string, unknown> | undefined): string | undefined {
  if (!claims) return undefined;
  const candidates = [claims.email, claims.preferred_username, claims.upn];
  for (const value of candidates) {
    if (typeof value === "string" && value.includes("@")) {
      return value.trim().toLowerCase();
    }
  }
  return undefined;
}

export async function resolveOidcIdentity(
  oidc: client.Configuration,
  tokens: client.TokenEndpointResponse & { access_token?: string }
): Promise<{ sub: string; email: string; name: string; appIdRoles: string[] }> {
  const idClaims = tokens.claims() as Record<string, unknown> | undefined;
  const sub = (idClaims?.sub as string) || "";
  let email = emailFromClaims(idClaims);
  let name = typeof idClaims?.name === "string" ? idClaims.name : undefined;

  const roleSets: string[][] = [appIdRolesFromClaims(idClaims)];
  if (tokens.access_token) {
    roleSets.push(appIdRolesFromClaims(decodeJwtPayload(tokens.access_token)));
  }

  if ((!email || !email.includes("@")) && tokens.access_token && sub) {
    try {
      const info = (await client.fetchUserInfo(oidc, tokens.access_token, sub)) as Record<
        string,
        unknown
      >;
      email = emailFromClaims(info) || email;
      if (!name && typeof info.name === "string") name = info.name;
      roleSets.push(appIdRolesFromClaims(info));
    } catch (e) {
      console.warn("OIDC userinfo fetch failed:", e);
    }
  }

  const resolvedEmail = (email || `${sub}@oidc.local`).trim().toLowerCase();
  const appIdRoles = [...new Set(roleSets.flat())];
  return {
    sub,
    email: resolvedEmail,
    name: name || resolvedEmail,
    appIdRoles,
  };
}
