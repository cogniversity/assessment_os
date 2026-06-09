import { PrismaClient } from "@prisma/client";
import {
  dedupeQuestionsByStem,
  normalizeQuestionStem,
  selectQuestions,
} from "../src/services/questionSelector.js";

const prisma = new PrismaClient();
const assessmentId = process.argv[2] ?? "4a07ca3d-ea61-4afc-a4f0-989ac2c7468a";

async function main() {
  const a = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: { topics: true, attempts: { orderBy: { startedAt: "desc" }, take: 5 } },
  });
  if (!a) {
    console.log("Assessment not found");
    return;
  }
  const total = a.easyCount + a.mediumCount + a.hardCount;
  console.log("Counts:", { easy: a.easyCount, medium: a.mediumCount, hard: a.hardCount, total });

  const topicIds = a.topics.map((t) => t.topicId);
  const pool = await prisma.question.findMany({
    where: {
      skillId: a.skillId,
      topicId: { in: topicIds },
      status: "published",
      skillRoles: { some: { skillRoleId: a.skillRoleId } },
    },
  });
  console.log("Pool:", pool.length, "questions");

  const stemMap = new Map<string, string[]>();
  for (const q of pool) {
    const key = q.stem.trim();
    const ids = stemMap.get(key) ?? [];
    ids.push(q.id);
    stemMap.set(key, ids);
  }
  const dupStemsInPool = [...stemMap.entries()].filter(([, ids]) => ids.length > 1);
  console.log("Duplicate stems in pool:", dupStemsInPool.length);
  dupStemsInPool.slice(0, 8).forEach(([stem, ids]) => {
    console.log(`  [${ids.length}x] ${stem.slice(0, 70)}`);
  });

  const poolDeduped = dedupeQuestionsByStem(pool);
  console.log("Pool after stem dedupe:", poolDeduped.length);

  const selected = selectQuestions(poolDeduped, {
    easy: a.easyCount,
    medium: a.mediumCount,
    hard: a.hardCount,
  });
  const selIds = selected.map((q) => q.id);
  const selStems = selected.map((q) => normalizeQuestionStem(q.stem));
  console.log("\nselectQuestions output:", selIds.length, "unique ids:", new Set(selIds).size, "unique stems:", new Set(selStems).size);
  if (selIds.length !== new Set(selIds).size) {
    console.log("BUG: duplicate IDs in selectQuestions");
  }

  for (const att of a.attempts) {
    const order = att.questionOrder as string[];
    const uniq = new Set(order);
    console.log(`\nAttempt ${att.id.slice(0, 8)} ${att.status}: order=${order.length} unique=${uniq.size}`);
    if (order.length !== uniq.size) {
      const seen = new Set<string>();
      const dups: string[] = [];
      for (const id of order) {
        if (seen.has(id)) dups.push(id);
        seen.add(id);
      }
      console.log("  DUPLICATE IDs in stored order:", dups);
    }
    const qs = await prisma.question.findMany({
      where: { id: { in: order } },
      select: { id: true, stem: true },
    });
    const stems = order.map((qid) => {
      const stem = qs.find((q) => q.id === qid)?.stem;
      return stem ? normalizeQuestionStem(stem) : "";
    });
    const dupStems = stems.filter((s, i) => s && stems.indexOf(s) !== i);
    if (dupStems.length) {
      console.log("  DUPLICATE STEMS in attempt:", [...new Set(dupStems)]);
    } else {
      console.log("  stems ok:", stems.map((s) => s.slice(0, 40)).join(" | "));
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
