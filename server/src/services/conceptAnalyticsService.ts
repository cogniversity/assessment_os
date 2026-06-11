import type { ConceptBreakdown } from "@assessment-os/shared";
import { prisma } from "../db.js";

export type ConceptTrendRow = {
  conceptId: string;
  conceptCode: string;
  conceptName: string;
  skillCode: string;
  attempts: number;
  gapCount: number;
  strengthCount: number;
  gapRate: number;
  strengthRate: number;
  avgAccuracy: number;
};

type AttemptScope = {
  assessmentFilter: object;
  completedAt?: { gte?: Date; lte?: Date };
};

export async function aggregateConceptTrends(
  scope: AttemptScope,
  skillId?: string
): Promise<ConceptTrendRow[]> {
  const reports = await prisma.capabilityReport.findMany({
    where: {
      attempt: {
        status: { in: ["completed", "timed_out"] },
        ...(scope.completedAt ? { completedAt: scope.completedAt } : {}),
        assessment: {
          ...scope.assessmentFilter,
          ...(skillId ? { skillId } : {}),
        },
      },
    },
    include: {
      attempt: {
        include: {
          assessment: { include: { skill: true } },
        },
      },
    },
  });

  const byConcept = new Map<
    string,
    {
      conceptId: string;
      conceptCode: string;
      conceptName: string;
      skillCode: string;
      attempts: number;
      gapCount: number;
      strengthCount: number;
      accuracySum: number;
    }
  >();

  for (const report of reports) {
    const skillCode = report.attempt.assessment.skill.code;
    const concepts = report.concepts as ConceptBreakdown[];
    for (const c of concepts) {
      const cur = byConcept.get(c.conceptId) ?? {
        conceptId: c.conceptId,
        conceptCode: c.code,
        conceptName: c.name,
        skillCode,
        attempts: 0,
        gapCount: 0,
        strengthCount: 0,
        accuracySum: 0,
      };
      cur.attempts++;
      cur.accuracySum += c.accuracy;
      if (c.status === "gap") cur.gapCount++;
      if (c.status === "strength") cur.strengthCount++;
      byConcept.set(c.conceptId, cur);
    }
  }

  return [...byConcept.values()]
    .map((row) => ({
      conceptId: row.conceptId,
      conceptCode: row.conceptCode,
      conceptName: row.conceptName,
      skillCode: row.skillCode,
      attempts: row.attempts,
      gapCount: row.gapCount,
      strengthCount: row.strengthCount,
      gapRate: row.attempts ? Math.round((row.gapCount / row.attempts) * 100) : 0,
      strengthRate: row.attempts ? Math.round((row.strengthCount / row.attempts) * 100) : 0,
      avgAccuracy: row.attempts ? Math.round(row.accuracySum / row.attempts) : 0,
    }))
    .sort((a, b) => b.gapRate - a.gapRate || a.conceptName.localeCompare(b.conceptName));
}
