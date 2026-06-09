import { prisma } from "../db.js";

/**
 * Returns the skill IDs assigned to a Capability Manager.
 * Returns [] for managers with no assigned skills (triggers read-only fallback everywhere).
 */
export async function getManagerSkillIds(userId: string): Promise<string[]> {
  const rows = await prisma.managerSkill.findMany({ where: { userId } });
  return rows.map((r) => r.skillId);
}
