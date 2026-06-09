import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const assessmentId = "4a07ca3d-ea61-4afc-a4f0-989ac2c7468a";

async function main() {
  const attempts = await prisma.assessmentAttempt.findMany({
    where: { assessmentId, status: { in: ["completed", "timed_out"] } },
    orderBy: { completedAt: "desc" },
    include: { answers: { include: { question: true } } },
  });
  console.log("attempts:", attempts.length);
  for (const att of attempts) {
    console.log("\n===", att.id.slice(0, 8), "answers", att.answers.length, "score", att.score);
  }
  const attempt = attempts[0];
  if (!attempt) {
    console.log("no attempt");
    return;
  }
  console.log("attempt", attempt.id, "answers:", attempt.answers.length);
  console.log("questionOrder", attempt.questionOrder);
  const stems = ["typeof null", "===", "push", "block-scoped", "falsy"];
  const byStem = await prisma.question.findMany({
    where: { OR: stems.map((s) => ({ stem: { contains: s, mode: "insensitive" } })) },
    select: { id: true, stem: true, questionType: true, correctIndices: true, options: true },
    take: 20,
  });
  console.log("\nQuestions by stem in bank:");
  for (const q of byStem) {
    const opts = q.options as string[];
    console.log(q.questionType, q.correctIndices, "->", q.correctIndices.map((i) => opts[i]));
    console.log(" ", q.stem.slice(0, 60));
  }

  const order = attempt.questionOrder as string[];
  const qs = await prisma.question.findMany({ where: { id: { in: order } } });
  const current = attempt.currentAnswers as Record<string, number | number[]>;
  console.log("\nAll questions in order (found", qs.length, "of", order.length, "):");
  for (const id of order) {
    const q = qs.find((x) => x.id === id);
    if (!q) {
      console.log("\n--- MISSING", id);
      continue;
    }
    const opts = q.options as string[];
    const sel = current[id];
    const selArr = Array.isArray(sel) ? sel : sel != null ? [sel] : [];
    console.log("\n---", q.stem.slice(0, 55));
    console.log("type:", q.questionType, "correctIndices:", q.correctIndices);
    console.log("currentAnswers:", selArr, "->", selArr.map((i) => opts[i]));
    const ans = attempt.answers.find((a) => a.questionId === id);
    console.log("attemptAnswer row:", ans ? ans.selectedIndices : "MISSING");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
