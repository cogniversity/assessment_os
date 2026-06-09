import { PrismaClient } from "@prisma/client";
import { normalizeSelectedIndices, scoreQuestion } from "@assessment-os/shared";
import { uniqueQuestionOrder } from "../src/services/questionSelector.js";

const prisma = new PrismaClient();
const assessmentId = process.argv[2] ?? "da4425c0-140b-4cc0-a656-05403bf0d60a";

async function main() {
  const attempt = await prisma.assessmentAttempt.findFirst({
    where: { assessmentId, status: { in: ["completed", "timed_out"] } },
    orderBy: { completedAt: "desc" },
    include: {
      assessment: true,
      answers: { include: { question: true } },
    },
  });
  if (!attempt) {
    console.log("No completed attempt");
    return;
  }
  console.log("Attempt", attempt.id, "score:", attempt.score);
  console.log("multiSelectScoringMode:", attempt.assessment.multiSelectScoringMode);

  const order = uniqueQuestionOrder(attempt.questionOrder as string[]);
  const current = (attempt.currentAnswers as Record<string, number | number[]>) || {};
  const qs = await prisma.question.findMany({ where: { id: { in: order } } });
  const qMap = new Map(qs.map((q) => [q.id, q]));

  let earned = 0;
  let total = 0;
  for (const qId of order) {
    const q = qMap.get(qId);
    if (!q) {
      console.log("\nMISSING question", qId);
      continue;
    }
    const stored = attempt.answers.find((a) => a.questionId === qId);
    const selected = stored
      ? stored.selectedIndices
      : normalizeSelectedIndices(current[qId]);
    const scored = scoreQuestion(
      q.questionType as "single" | "multi",
      q.correctIndices,
      selected,
      attempt.assessment.multiSelectScoringMode as "all_or_nothing" | "partial_credit"
    );
    const opts = q.options as string[];
    console.log("\n---", q.stem.slice(0, 55));
    console.log("type:", q.questionType, "correct:", q.correctIndices.map((i) => opts[i]));
    console.log("selected:", selected.map((i) => opts[i]));
    console.log("points:", scored.points, "full:", scored.isFullyCorrect);
    earned += scored.points;
    total += scored.maxPoints;
  }
  console.log("\nComputed:", earned, "/", total, "=", total > 0 ? Math.round((earned / total) * 100) : 0, "%");
  console.log("Stored score:", attempt.score);
  console.log("attemptAnswer rows:", attempt.answers.length);
  for (const a of attempt.answers) {
    console.log(" ", a.questionId.slice(0, 8), "pts", a.pointsEarned, "selected", a.selectedIndices);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
