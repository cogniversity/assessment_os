import {
  normalizeSelectedIndices,
  scoreQuestion,
  type MultiSelectScoringMode,
  type QuestionType,
} from "@assessment-os/shared";
import type { Question } from "@prisma/client";
import { prisma } from "../db.js";
import { uniqueQuestionOrder } from "./questionSelector.js";

type AttemptForReview = {
  questionOrder: unknown;
  currentAnswers: unknown;
  assessment: { multiSelectScoringMode: MultiSelectScoringMode };
  answers: {
    questionId: string;
    selectedIndices: number[];
    pointsEarned: number;
    isFullyCorrect: boolean;
  }[];
};

export async function buildAttemptReviewQuestions(attempt: AttemptForReview) {
  const orderIds = uniqueQuestionOrder(attempt.questionOrder as string[]);
  const answerByQ = new Map(attempt.answers.map((a) => [a.questionId, a]));
  const current = (attempt.currentAnswers as Record<string, number | number[]>) || {};
  const questions = await prisma.question.findMany({ where: { id: { in: orderIds } } });
  const qMap = new Map(questions.map((q) => [q.id, q]));
  const mode = attempt.assessment.multiSelectScoringMode;

  return orderIds
    .map((qId) => {
      const q = qMap.get(qId);
      if (!q) return null;
      const stored = answerByQ.get(qId);
      const selectedIndices = stored
        ? stored.selectedIndices
        : normalizeSelectedIndices(current[qId]);
      const scored = scoreQuestion(
        q.questionType as QuestionType,
        q.correctIndices,
        selectedIndices,
        mode
      );
      return {
        ...q,
        selectedIndices,
        pointsEarned: scored.points,
        isFullyCorrect: scored.isFullyCorrect,
      };
    })
    .filter((row): row is Question & {
      selectedIndices: number[];
      pointsEarned: number;
      isFullyCorrect: boolean;
    } => row != null);
}

export function scorePercentFromReview(
  questions: { pointsEarned: number }[]
): number | null {
  if (questions.length === 0) return null;
  const earned = questions.reduce((s, q) => s + q.pointsEarned, 0);
  return Math.round((earned / questions.length) * 100);
}

/** Re-score a finished attempt from stored selections and persist score + per-answer points. */
export async function recalculateAndPersistAttemptScore(attemptId: string): Promise<number | null> {
  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: {
      assessment: true,
      answers: true,
    },
  });
  if (!attempt || !["completed", "timed_out"].includes(attempt.status)) return null;

  const review = await buildAttemptReviewQuestions(attempt);
  const score = scorePercentFromReview(review);
  if (score === null) return null;

  await prisma.$transaction(async (tx) => {
    for (const q of review) {
      await tx.attemptAnswer.updateMany({
        where: { attemptId, questionId: q.id },
        data: { pointsEarned: q.pointsEarned, isFullyCorrect: q.isFullyCorrect },
      });
    }
    await tx.assessmentAttempt.update({
      where: { id: attemptId },
      data: { score },
    });
  });

  return score;
}
