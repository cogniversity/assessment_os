import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const assessmentId = "da4425c0-140b-4cc0-a656-05403bf0d60a";

async function main() {
  const a = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: {
      attempts: { orderBy: { completedAt: "desc" }, include: { certificate: true } },
    },
  });
  if (!a) {
    console.log("not found");
    return;
  }
  console.log({
    passMark: a.passMark,
    issueCertificate: a.issueCertificate,
    certValidityDays: a.certValidityDays,
    status: a.status,
  });
  for (const att of a.attempts) {
    console.log("\nattempt", att.id.slice(0, 8), {
      score: att.score,
      completedAt: att.completedAt,
      status: att.status,
      passed: att.score != null && att.score >= a.passMark,
      cert: att.certificate?.certNumber ?? null,
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
