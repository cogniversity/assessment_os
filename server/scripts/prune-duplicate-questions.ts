/**
 * Remove duplicate published questions (same stem + skill + topic + difficulty).
 * Keeps the oldest row; deletes newer duplicates and their junction rows.
 *
 * Usage: npx tsx scripts/prune-duplicate-questions.ts [--dry-run]
 */
import { PrismaClient } from "@prisma/client";
import { normalizeQuestionStem, pickBetterQuestion } from "../src/services/questionSelector.js";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const all = await prisma.question.findMany({
    where: { status: "published" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      stem: true,
      skillId: true,
      topicId: true,
      difficulty: true,
      createdAt: true,
      correctIndices: true,
    },
  });

  const keep = new Map<string, (typeof all)[0]>();
  const toDelete: string[] = [];

  for (const q of all) {
    const key = `${q.skillId}|${q.topicId}|${q.difficulty}|${normalizeQuestionStem(q.stem)}`;
    const prev = keep.get(key);
    if (!prev) {
      keep.set(key, q);
      continue;
    }
    const winner = pickBetterQuestion(prev, q);
    toDelete.push(winner.id === prev.id ? q.id : prev.id);
    keep.set(key, winner);
  }
  const keepIds = [...keep.values()].map((q) => q.id);

  console.log(`Published questions: ${all.length}`);
  console.log(`Duplicates to remove: ${toDelete.length}`);
  if (dryRun) {
    console.log("(dry run — no deletes)");
    return;
  }
  const wronglyMarked = toDelete.filter((id) => keepIds.includes(id));
  if (wronglyMarked.length) {
    console.error("Internal error: would delete kept rows", wronglyMarked);
    process.exit(1);
  }
  if (toDelete.length === 0) return;

  await prisma.$transaction([
    prisma.questionSkillRole.deleteMany({ where: { questionId: { in: toDelete } } }),
    prisma.attemptAnswer.deleteMany({ where: { questionId: { in: toDelete } } }),
    prisma.question.deleteMany({ where: { id: { in: toDelete } } }),
  ]);
  console.log("Deleted duplicate questions.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
