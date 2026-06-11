import { v4 as uuidv4 } from "uuid";
import type { CapabilitySummary, ConceptBreakdown } from "@assessment-os/shared";
import { prisma } from "../db.js";

export type { CapabilitySummary, ConceptBreakdown };

function classifyConcept(
  accuracy: number,
  strengthThreshold: number,
  gapThreshold: number
): "strength" | "neutral" | "gap" {
  if (accuracy >= strengthThreshold) return "strength";
  if (accuracy < gapThreshold) return "gap";
  return "neutral";
}

export async function issueCapabilityReportIfEligible(attemptId: string) {
  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: {
      assessment: { include: { skill: true, skillRole: true } },
      answers: true,
      capabilityReport: true,
    },
  });
  if (!attempt || attempt.capabilityReport || attempt.score === null) return null;
  if (attempt.status !== "completed" && attempt.status !== "timed_out") return null;

  const a = attempt.assessment;
  if (!a.issueCapabilityReport) return null;

  const orderIds = Array.isArray(attempt.questionOrder)
    ? (attempt.questionOrder as string[])
    : [];
  const questionIds = [...new Set(orderIds)];

  const questions = await prisma.question.findMany({
    where: { id: { in: questionIds } },
    include: { concepts: { include: { concept: true } } },
  });
  const qMap = new Map(questions.map((q) => [q.id, q]));
  const answerMap = new Map(attempt.answers.map((ans) => [ans.questionId, ans]));

  const conceptStats = new Map<
    string,
    { conceptId: string; code: string; name: string; questionCount: number; correctCount: number }
  >();
  let untaggedQuestionCount = 0;

  for (const qId of orderIds) {
    const q = qMap.get(qId);
    if (!q) continue;
    const ans = answerMap.get(qId);
    const isCorrect = ans?.isFullyCorrect === true;

    const tags = q.concepts.map((c) => c.concept).filter((c) => c.isActive);
    if (tags.length === 0) {
      untaggedQuestionCount++;
      continue;
    }

    for (const concept of tags) {
      const cur = conceptStats.get(concept.id) ?? {
        conceptId: concept.id,
        code: concept.code,
        name: concept.name,
        questionCount: 0,
        correctCount: 0,
      };
      cur.questionCount++;
      if (isCorrect) cur.correctCount++;
      conceptStats.set(concept.id, cur);
    }
  }

  const strengthThreshold = a.capabilityStrengthThreshold;
  const gapThreshold = a.capabilityGapThreshold;

  const concepts: ConceptBreakdown[] = [...conceptStats.values()]
    .map((c) => {
      const accuracy =
        c.questionCount > 0 ? Math.round((c.correctCount / c.questionCount) * 100) : 0;
      return {
        conceptId: c.conceptId,
        code: c.code,
        name: c.name,
        questionCount: c.questionCount,
        correctCount: c.correctCount,
        accuracy,
        status: classifyConcept(accuracy, strengthThreshold, gapThreshold),
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name));

  const summary: CapabilitySummary = {
    overallScore: attempt.score,
    passMark: a.passMark,
    passed: attempt.score >= a.passMark,
    skillCode: a.skill.code,
    skillName: a.skill.name,
    skillRoleCode: a.skillRole.code,
    skillRoleName: a.skillRole.name,
    untaggedQuestionCount,
    strengthThreshold,
    gapThreshold,
  };

  const reportNumber = `CAP-${uuidv4().slice(0, 8).toUpperCase()}`;

  return prisma.capabilityReport.create({
    data: {
      attemptId,
      reportNumber,
      summary,
      concepts,
    },
  });
}

export async function getCapabilityReportForAttempt(attemptId: string) {
  return prisma.capabilityReport.findUnique({
    where: { attemptId },
    include: {
      attempt: {
        include: {
          assessment: {
            include: { skill: true, skillRole: true, user: { select: { id: true, name: true, email: true } } },
          },
        },
      },
    },
  });
}
