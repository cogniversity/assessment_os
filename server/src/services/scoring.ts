import { scoreAttemptQuestions, scoreToProficiency } from "@assessment-os/shared";
import type { MultiSelectScoringMode, QuestionType } from "@assessment-os/shared";
import type { Question } from "@prisma/client";

export function scoreAttempt(
  questionOrder: string[],
  currentAnswers: Record<string, number | number[]>,
  questions: Question[],
  multiSelectScoringMode: MultiSelectScoringMode
) {
  return scoreAttemptQuestions(
    questionOrder,
    currentAnswers,
    questions.map((q) => ({
      id: q.id,
      questionType: q.questionType as QuestionType,
      correctIndices: q.correctIndices,
    })),
    multiSelectScoringMode
  );
}

export function mapScoreToProficiency(score: number, thresholds?: number[]) {
  return scoreToProficiency(score, thresholds);
}
