import { prisma } from "../db.js";
import {
  getUserAppIdRolesForCdUser,
  listCdUsers,
  resolveAppIdSubjectByEmail,
  type CdUser,
} from "./appidManagement.js";
import { ensureProfile } from "./profileService.js";
import { mergeUserRoles, resolveAppRoles } from "./roleResolver.js";
import type { Role as AppRole } from "@assessment-os/shared";

export type AppIdSyncResult = {
  email: string;
  userId: string;
  roles: AppRole[];
  created: boolean;
};

export type AppIdSyncSummary = {
  synced: AppIdSyncResult[];
  skipped: { email: string; reason: string }[];
};

function primaryEmail(u: CdUser): string | null {
  const email = u.emails?.find((e) => e.primary)?.value ?? u.emails?.[0]?.value;
  return email?.trim().toLowerCase() || null;
}

/** Create or update a local User from an App ID Cloud Directory row (no login required). */
export async function syncCdUserToLocal(u: CdUser): Promise<AppIdSyncResult> {
  const email = primaryEmail(u);
  if (!email) {
    throw new Error("Cloud Directory user has no email");
  }

  const [appIdRoles, oidcSub] = await Promise.all([
    getUserAppIdRolesForCdUser(u),
    resolveAppIdSubjectByEmail(email),
  ]);

  const fromLogin = resolveAppRoles(email, oidcSub ?? undefined, appIdRoles);
  const name = u.displayName?.trim() || u.userName?.trim() || email.split("@")[0];

  const existing = await prisma.user.findUnique({ where: { email } });
  const roles = mergeUserRoles(existing?.roles as AppRole[] | undefined, fromLogin);
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          name,
          roles,
          ...(oidcSub ? { oidcSub } : {}),
        },
      })
    : await prisma.user.create({
        data: {
          email,
          name,
          roles,
          oidcSub: oidcSub ?? null,
        },
      });

  await ensureProfile(user.id);

  return {
    email,
    userId: user.id,
    roles: user.roles as AppRole[],
    created: !existing,
  };
}

/** Sync one or more users by email, or all Cloud Directory users when emails omitted. */
export async function syncAppIdUsersToLocal(opts?: {
  emails?: string[];
}): Promise<AppIdSyncSummary> {
  const summary: AppIdSyncSummary = { synced: [], skipped: [] };

  let users: CdUser[];
  if (opts?.emails?.length) {
    const unique = [...new Set(opts.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    users = [];
    for (const email of unique) {
      const list = await listCdUsers({ query: email, count: 5 });
      const match = list.Resources.find((u) => primaryEmail(u) === email);
      if (match) users.push(match);
      else summary.skipped.push({ email, reason: "Not found in App ID Cloud Directory" });
    }
  } else {
    const list = await listCdUsers({});
    users = list.Resources;
  }

  for (const u of users) {
    const email = primaryEmail(u);
    if (!email) {
      summary.skipped.push({ email: u.id, reason: "No email on Cloud Directory user" });
      continue;
    }
    try {
      summary.synced.push(await syncCdUserToLocal(u));
    } catch (e) {
      summary.skipped.push({
        email,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return summary;
}
