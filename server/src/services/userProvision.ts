import { prisma } from "../db.js";
import { ensureProfile } from "./profileService.js";

/** Create or update a local candidate account (before or without IBM login). */
export async function provisionCandidateUser(opts: {
  email: string;
  name?: string;
  /** When true, existing non-candidate users are rejected. */
  assignOnly?: boolean;
}) {
  const normalized = opts.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing && existing.role !== "candidate") {
    if (opts.assignOnly) {
      if (existing.role === "capability_manager") {
        await ensureProfile(existing.id);
        return existing;
      }
      throw new Error(
        `User ${normalized} is registered as ${existing.role.replace("_", " ")} and cannot receive assessments as a candidate.`
      );
    }
  }

  const user = await prisma.user.upsert({
    where: { email: normalized },
    create: {
      email: normalized,
      name: opts.name?.trim() || normalized.split("@")[0],
      role: "candidate",
    },
    update: {
      ...(opts.name?.trim() ? { name: opts.name.trim() } : {}),
      ...(!existing || existing.role === "candidate" ? { role: "candidate" as const } : {}),
    },
  });
  await ensureProfile(user.id);
  return user;
}
