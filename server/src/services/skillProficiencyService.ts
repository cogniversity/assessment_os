import type { Proficiency } from "@prisma/client";
import { prisma } from "../db.js";
import { mapScoreToProficiency } from "./scoring.js";
import { logProfileChange } from "./auditService.js";

export async function listSkillProficienciesForUser(userId: string) {
  return prisma.candidateSkillProficiency.findMany({
    where: { userId },
    include: {
      skill: { select: { id: true, code: true, name: true } },
      skillRole: { select: { id: true, code: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ skill: { name: "asc" } }, { skillRole: { sortOrder: "asc" } }],
  });
}

export async function upsertSkillProficiencyFromAttempt(attemptId: string) {
  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: { assessment: true },
  });
  if (!attempt || attempt.score === null) return null;

  const { assessment } = attempt;
  if (attempt.score < assessment.passMark) return null;

  const existing = await prisma.candidateSkillProficiency.findUnique({
    where: {
      userId_skillId_skillRoleId: {
        userId: assessment.userId,
        skillId: assessment.skillId,
        skillRoleId: assessment.skillRoleId,
      },
    },
  });
  if (existing?.proficiencyOverridden) return existing;

  const thresholds = (assessment.proficiencyThresholds as number[]) || [40, 55, 70, 85, 95];
  const proficiency = mapScoreToProficiency(attempt.score, thresholds) as Proficiency;

  return prisma.candidateSkillProficiency.upsert({
    where: {
      userId_skillId_skillRoleId: {
        userId: assessment.userId,
        skillId: assessment.skillId,
        skillRoleId: assessment.skillRoleId,
      },
    },
    create: {
      userId: assessment.userId,
      skillId: assessment.skillId,
      skillRoleId: assessment.skillRoleId,
      proficiency,
      sourceAttemptId: attemptId,
      updatedAt: new Date(),
    },
    update: {
      proficiency,
      sourceAttemptId: attemptId,
      updatedAt: new Date(),
    },
    include: {
      skill: { select: { code: true, name: true } },
      skillRole: { select: { code: true, name: true } },
    },
  });
}

export async function overrideSkillProficiency(
  userId: string,
  skillId: string,
  skillRoleId: string,
  actorId: string,
  proficiency: Proficiency,
  changeReason: string
) {
  const role = await prisma.skillRole.findFirst({ where: { id: skillRoleId, skillId } });
  if (!role) throw new Error("Skill role not found for skill");

  const existing = await prisma.candidateSkillProficiency.findUnique({
    where: { userId_skillId_skillRoleId: { userId, skillId, skillRoleId } },
  });

  await logProfileChange({
    candidateUserId: userId,
    actorUserId: actorId,
    fieldName: `skillProficiency:${skillId}:${skillRoleId}`,
    oldValue: existing?.proficiency ?? null,
    newValue: proficiency,
    changeReason,
  });

  return prisma.candidateSkillProficiency.upsert({
    where: { userId_skillId_skillRoleId: { userId, skillId, skillRoleId } },
    create: {
      userId,
      skillId,
      skillRoleId,
      proficiency,
      proficiencyOverridden: true,
      updatedById: actorId,
      updatedAt: new Date(),
    },
    update: {
      proficiency,
      proficiencyOverridden: true,
      updatedById: actorId,
      updatedAt: new Date(),
    },
    include: {
      skill: { select: { id: true, code: true, name: true } },
      skillRole: { select: { id: true, code: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
    },
  });
}
