import { prisma } from "../db.js";
import {
  isAppIdConfigured,
  listCdUsersEnriched,
  type CdUser,
} from "./appidManagement.js";

export type AssignmentCandidate = {
  /** Stable id for UI selection: local user id or `email:<normalized>` */
  key: string;
  userId: string | null;
  email: string;
  name: string;
  employeeId?: string | null;
  employeeName?: string | null;
  sources: ("local" | "appid")[];
  linked: boolean;
  needsProvision: boolean;
  appIdRoles?: string[];
  cdUserId?: string;
};

function primaryEmail(u: CdUser): string {
  return (
    u.emails.find((e) => e.primary)?.value ??
    u.emails[0]?.value ??
    ""
  )
    .trim()
    .toLowerCase();
}

function cdDisplayName(u: CdUser): string {
  const email = primaryEmail(u);
  return (u.displayName ?? u.userName ?? (email.split("@")[0] || email)).trim();
}

function cdUserMatchesQuery(
  u: CdUser,
  q: string,
  profile?: { employeeId?: string | null; employeeName?: string | null }
): boolean {
  const lq = q.trim().toLowerCase();
  if (!lq) return true;
  const email = primaryEmail(u);
  if (email.includes(lq)) return true;
  if (u.displayName?.toLowerCase().includes(lq)) return true;
  if (u.userName?.toLowerCase().includes(lq)) return true;
  if (profile?.employeeId?.toLowerCase().includes(lq)) return true;
  if (profile?.employeeName?.toLowerCase().includes(lq)) return true;
  return false;
}

function localSearchWhere(q: string) {
  return {
    OR: [
      { email: { contains: q, mode: "insensitive" as const } },
      { name: { contains: q, mode: "insensitive" as const } },
      { profile: { employeeId: { contains: q, mode: "insensitive" as const } } },
      { profile: { employeeName: { contains: q, mode: "insensitive" as const } } },
      { profile: { country: { contains: q, mode: "insensitive" as const } } },
      { profile: { projectName: { contains: q, mode: "insensitive" as const } } },
      { profile: { customerName: { contains: q, mode: "insensitive" as const } } },
    ],
  };
}

/**
 * Candidates for assessment assignment: local DB (role=candidate) merged with
 * IBM Cloud Directory users (deduped by email). App ID-only rows need provision on assign.
 */
export async function listAssignmentCandidates(opts: { q?: string }): Promise<{
  candidates: AssignmentCandidate[];
  appIdConfigured: boolean;
  listMode?: string;
}> {
  const q = opts.q?.trim() ?? "";
  const appIdConfigured = isAppIdConfigured();

  const localUsers = await prisma.user.findMany({
    where: {
      role: "candidate",
      ...(q ? localSearchWhere(q) : {}),
    },
    include: { profile: true },
    orderBy: { name: "asc" },
  });

  const byEmail = new Map<string, AssignmentCandidate>();

  for (const u of localUsers) {
    const email = u.email.trim().toLowerCase();
    byEmail.set(email, {
      key: u.id,
      userId: u.id,
      email,
      name: u.name,
      employeeId: u.profile?.employeeId ?? null,
      employeeName: u.profile?.employeeName ?? null,
      sources: ["local"],
      linked: false,
      needsProvision: false,
    });
  }

  let listMode: string | undefined;
  if (appIdConfigured) {
    try {
      const cd = await listCdUsersEnriched({
        ...(q ? { query: q, count: 100 } : { count: 500 }),
      });
      listMode = cd.listMode;

      for (const u of cd.Resources) {
        const email = primaryEmail(u);
        if (!email) continue;

        if (u.appRole && u.appRole !== "candidate") continue;

        const profile = byEmail.get(email);
        if (!q || cd.listMode === "search" || cdUserMatchesQuery(u, q, profile)) {
          const row = byEmail.get(email);
          if (row) {
            if (!row.sources.includes("appid")) row.sources.push("appid");
            row.linked = true;
            row.appIdRoles = u.appIdRoles;
            row.cdUserId = u.id;
            if (u.appUserId && !row.userId) {
              row.userId = u.appUserId;
              row.key = u.appUserId;
              row.needsProvision = false;
            }
            continue;
          }

          const linkedLocal = Boolean(u.appUserId && u.appRole === "candidate");
          byEmail.set(email, {
            key: u.appUserId ?? `email:${email}`,
            userId: linkedLocal ? u.appUserId! : null,
            email,
            name: cdDisplayName(u),
            employeeId: null,
            employeeName: null,
            sources: ["appid"],
            linked: linkedLocal,
            needsProvision: !linkedLocal,
            appIdRoles: u.appIdRoles,
            cdUserId: u.id,
          });
        }
      }
    } catch (e) {
      console.warn("Assignment candidates: App ID list failed", e);
    }
  }

  const candidates = [...byEmail.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );

  return { candidates, appIdConfigured, listMode };
}
