import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export type QuestionBankGrant = { skillId: string; topicId: string };

export async function getManagerQuestionBankGrants(userId: string): Promise<QuestionBankGrant[]> {
  const rows = await prisma.managerQuestionBank.findMany({
    where: { userId },
    select: { skillId: true, topicId: true },
  });
  return rows;
}

export async function hasQuestionBankAccess(
  userId: string,
  skillId: string,
  topicId: string
): Promise<boolean> {
  const row = await prisma.managerQuestionBank.findUnique({
    where: { userId_skillId_topicId: { userId, skillId, topicId } },
  });
  return !!row;
}

export function questionBankWhereClause(grants: QuestionBankGrant[]): Prisma.QuestionWhereInput {
  if (grants.length === 0) return { id: { in: [] } };
  return { OR: grants.map((g) => ({ skillId: g.skillId, topicId: g.topicId })) };
}
