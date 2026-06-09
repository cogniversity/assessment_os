import { PrismaClient } from "@prisma/client";
import { recalculateAndPersistAttemptScore } from "../src/services/attemptReview.js";

const prisma = new PrismaClient();

async function main() {
  const attempts = await prisma.assessmentAttempt.findMany({
    where: { status: { in: ["completed", "timed_out"] } },
    select: { id: true, score: true },
  });
  let updated = 0;
  for (const a of attempts) {
    const next = await recalculateAndPersistAttemptScore(a.id);
    if (next !== null && next !== a.score) {
      console.log(a.id.slice(0, 8), a.score, "->", next);
      updated++;
    }
  }
  console.log(`Done. Updated ${updated} of ${attempts.length} attempts.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
