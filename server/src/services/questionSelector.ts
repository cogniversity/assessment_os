import { Difficulty } from "@assessment-os/shared";
import type { Question } from "@prisma/client";

/** Normalize stem text for duplicate detection (seed reruns create duplicate rows). */
export function normalizeQuestionStem(stem: string): string {
  return stem.trim().replace(/\s+/g, " ").toLowerCase();
}

function questionDataQuality(q: { correctIndices?: number[] }): number {
  const n = q.correctIndices?.length ?? 0;
  return n > 0 ? 2 : 0;
}

/** Prefer rows with valid correctIndices, then oldest createdAt. */
export function pickBetterQuestion<
  T extends { id: string; stem: string; createdAt?: Date; correctIndices?: number[] },
>(a: T, b: T): T {
  const qa = questionDataQuality(a);
  const qb = questionDataQuality(b);
  if (qa !== qb) return qa > qb ? a : b;
  const aTime = a.createdAt?.getTime() ?? 0;
  const bTime = b.createdAt?.getTime() ?? 0;
  if (aTime !== bTime) return aTime < bTime ? a : b;
  return a.id < b.id ? a : b;
}

/**
 * Keep one question per stem. When duplicates exist, prefer a row with correctIndices set.
 */
export function dedupeQuestionsByStem<
  T extends { id: string; stem: string; createdAt?: Date; correctIndices?: number[] },
>(questions: T[]): T[] {
  const byStem = new Map<string, T>();
  for (const q of questions) {
    const key = normalizeQuestionStem(q.stem);
    const existing = byStem.get(key);
    byStem.set(key, existing ? pickBetterQuestion(existing, q) : q);
  }
  return [...byStem.values()];
}

/** Preserve order; drop duplicate IDs (legacy attempts). */
export function uniqueQuestionOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function assertUniqueQuestionSelection(questions: { id: string; stem: string }[]): void {
  const ids = questions.map((q) => q.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Question selection contains duplicate question IDs");
  }
  const stems = questions.map((q) => normalizeQuestionStem(q.stem));
  if (new Set(stems).size !== stems.length) {
    throw new Error("Question selection contains duplicate question stems");
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Select questions using explicit per-difficulty counts.
 * The pool is already filtered to the correct skill + topics + role by the caller.
 * If a difficulty bucket has fewer questions than requested, backfills from
 * the remaining pool so the total count is always met if possible.
 */
export function selectQuestions(
  questions: Question[],
  counts: { easy: number; medium: number; hard: number }
): Question[] {
  const easyPool   = questions.filter((q) => q.difficulty === Difficulty.EASY);
  const mediumPool = questions.filter((q) => q.difficulty === Difficulty.MEDIUM);
  const hardPool   = questions.filter((q) => q.difficulty === Difficulty.HARD);

  const pick = (pool: Question[], n: number) => shuffle(pool).slice(0, n);

  let selected = [
    ...pick(easyPool,   Math.min(counts.easy,   easyPool.length)),
    ...pick(mediumPool, Math.min(counts.medium, mediumPool.length)),
    ...pick(hardPool,   Math.min(counts.hard,   hardPool.length)),
  ];

  const total = counts.easy + counts.medium + counts.hard;
  if (selected.length < total) {
    const usedIds = new Set(selected.map((q) => q.id));
    const usedStems = new Set(selected.map((q) => normalizeQuestionStem(q.stem)));
    const remaining = shuffle(
      questions.filter(
        (q) => !usedIds.has(q.id) && !usedStems.has(normalizeQuestionStem(q.stem))
      )
    );
    selected = [...selected, ...remaining.slice(0, total - selected.length)];
  }

  selected = dedupeQuestionsByStem(selected);
  assertUniqueQuestionSelection(selected);
  return shuffle(selected).slice(0, total);
}

export interface PoolValidation {
  available: { total: number; easy: number; medium: number; hard: number };
  sufficient: boolean;
  shortfalls: string[];
  diagnostics: {
    publishedInTopics: number;
    publishedWithoutRoles: number;
  };
}

type PoolRow = {
  id: string;
  stem: string;
  difficulty: string;
  createdAt: Date;
  skillRoles: { skillRoleId: string }[];
};

type PrismaForPool = {
  question: {
    findMany: (args: {
      where: object;
      select: {
        stem: true;
        difficulty: true;
        id: true;
        createdAt: true;
        skillRoles?: { select: { skillRoleId: true } };
      };
    }) => Promise<PoolRow[]>;
  };
};

/**
 * Validate per-difficulty availability in the question bank for a given
 * skill + topics + skill role combination.
 *
 * topicIds accepts one or more topic IDs — questions are drawn from the union
 * of all listed topics (multi-topic blueprint support).
 *
 * Questions are filtered via the QuestionSkillRole junction:
 *   skillRoles: { some: { skillRoleId } }
 */
export async function validateQuestionPool(
  prisma: PrismaForPool,
  filters: { skillId: string; topicIds: string[]; skillRoleId: string },
  counts: { easy: number; medium: number; hard: number }
): Promise<PoolValidation> {
  const topicWhere = {
    skillId: filters.skillId,
    topicId: { in: filters.topicIds },
    status: "published" as const,
  };

  const allPublished = await prisma.question.findMany({
    where: topicWhere,
    select: {
      id: true,
      stem: true,
      difficulty: true,
      createdAt: true,
      skillRoles: { select: { skillRoleId: true } },
    },
  });
  const publishedInTopics = dedupeQuestionsByStem(allPublished).length;
  const publishedWithoutRoles = dedupeQuestionsByStem(
    allPublished.filter((q) => q.skillRoles.length === 0)
  ).length;

  const rows = allPublished.filter((q) =>
    q.skillRoles.some((r) => r.skillRoleId === filters.skillRoleId)
  );
  const unique = dedupeQuestionsByStem(rows);
  const easy = unique.filter((q) => q.difficulty === Difficulty.EASY).length;
  const medium = unique.filter((q) => q.difficulty === Difficulty.MEDIUM).length;
  const hard = unique.filter((q) => q.difficulty === Difficulty.HARD).length;

  const avail = { easy, medium, hard, total: easy + medium + hard };
  const shortfalls: string[] = [];
  if (easy   < counts.easy)   shortfalls.push(`need ${counts.easy} easy, have ${easy}`);
  if (medium < counts.medium) shortfalls.push(`need ${counts.medium} medium, have ${medium}`);
  if (hard   < counts.hard)   shortfalls.push(`need ${counts.hard} hard, have ${hard}`);

  return {
    available: avail,
    sufficient: shortfalls.length === 0,
    shortfalls,
    diagnostics: { publishedInTopics, publishedWithoutRoles },
  };
}
