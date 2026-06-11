import {
  MultiSelectScoringMode,
  QuestionType,
} from "./enums.js";

export function normalizeSelectedIndices(value: number | number[] | null | undefined): number[] {
  if (value === null || value === undefined) return [];
  const arr = Array.isArray(value) ? value : [value];
  return [...new Set(arr)].sort((a, b) => a - b);
}

interface QuestionScoreResult {
  points: number;
  maxPoints: number;
  isFullyCorrect: boolean;
}

/** Score one question. Single-select ignores multiSelectScoringMode. */
export function scoreQuestion(
  questionType: QuestionType,
  correctIndices: number[],
  selectedIndices: number[],
  multiSelectScoringMode: MultiSelectScoringMode
): QuestionScoreResult {
  const correct = normalizeSelectedIndices(correctIndices);
  const selected = normalizeSelectedIndices(selectedIndices);
  const maxPoints = 1;

  if (questionType === QuestionType.SINGLE) {
    const ok = selected.length === 1 && selected[0] === correct[0];
    return { points: ok ? 1 : 0, maxPoints, isFullyCorrect: ok };
  }

  const setsEqual =
    correct.length === selected.length && correct.every((v, i) => v === selected[i]);

  if (multiSelectScoringMode === MultiSelectScoringMode.ALL_OR_NOTHING) {
    return { points: setsEqual ? 1 : 0, maxPoints, isFullyCorrect: setsEqual };
  }

  // Partial credit: +1 per correct pick, -1 per wrong pick, normalized by |correct|
  const correctSet = new Set(correct);
  const correctSelected = selected.filter((i) => correctSet.has(i)).length;
  const wrongSelected = selected.filter((i) => !correctSet.has(i)).length;
  const raw = (correctSelected - wrongSelected) / correct.length;
  const points = Math.max(0, Math.min(1, raw));
  return { points, maxPoints, isFullyCorrect: points >= 1 };
}

interface AttemptQuestionResult {
  questionId: string;
  selectedIndices: number[];
  points: number;
  maxPoints: number;
  isFullyCorrect: boolean;
}

export function scoreAttemptQuestions(
  questionOrder: string[],
  currentAnswers: Record<string, number | number[]>,
  questions: { id: string; questionType: QuestionType; correctIndices: number[] }[],
  multiSelectScoringMode: MultiSelectScoringMode
): { score: number; results: AttemptQuestionResult[] } {
  const qMap = new Map(questions.map((q) => [q.id, q]));
  let earned = 0;
  let total = 0;
  const results: AttemptQuestionResult[] = [];

  for (const qId of questionOrder) {
    const q = qMap.get(qId);
    if (!q) continue;
    const selected = normalizeSelectedIndices(currentAnswers[qId]);
    const { points, maxPoints, isFullyCorrect } = scoreQuestion(
      q.questionType,
      q.correctIndices,
      selected,
      multiSelectScoringMode
    );
    earned += points;
    total += maxPoints;
    results.push({ questionId: qId, selectedIndices: selected, points, maxPoints, isFullyCorrect });
  }

  const score = total > 0 ? Math.round((earned / total) * 100) : 0;
  return { score, results };
}
