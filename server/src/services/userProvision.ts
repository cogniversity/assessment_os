import { prisma } from "../db.js";
import { Role, mergeRoles, type Role as AppRole } from "@assessment-os/shared";
import { ensureProfile } from "./profileService.js";

function hasCandidateRole(roles: AppRole[]): boolean {
  return roles.includes(Role.CANDIDATE);
}

function isAdminOnly(roles: AppRole[]): boolean {
  return roles.includes(Role.ADMIN) && !hasCandidateRole(roles) && !roles.includes(Role.CAPABILITY_MANAGER);
}

/** Create or update a local candidate account (before or without IBM login). */
export async function provisionCandidateUser(opts: {
  email: string;
  name?: string;
  /** When true, existing non-candidate users are rejected. */
  assignOnly?: boolean;
}) {
  const normalized = opts.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  const existingRoles = (existing?.roles ?? []) as AppRole[];

  if (existing && !hasCandidateRole(existingRoles)) {
    if (opts.assignOnly) {
      if (existingRoles.includes(Role.CAPABILITY_MANAGER)) {
        await ensureProfile(existing.id);
        return existing;
      }
      const label = existingRoles.map((r) => r.replace("_", " ")).join(", ");
      throw new Error(
        `User ${normalized} is registered as ${label} and cannot receive assessments as a candidate.`
      );
    }
  }

  const roles = existing
    ? mergeRoles(existingRoles, [Role.CANDIDATE])
    : [Role.CANDIDATE];

  const user = await prisma.user.upsert({
    where: { email: normalized },
    create: {
      email: normalized,
      name: opts.name?.trim() || normalized.split("@")[0],
      roles,
    },
    update: {
      ...(opts.name?.trim() ? { name: opts.name.trim() } : {}),
      ...(!existing || !isAdminOnly(existingRoles) ? { roles } : {}),
    },
  });
  await ensureProfile(user.id);
  return user;
}
