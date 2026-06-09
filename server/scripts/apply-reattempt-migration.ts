import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const statements = [
  `CREATE TYPE "ReattemptRequestStatus" AS ENUM ('pending', 'approved', 'rejected')`,
  `CREATE TABLE "ReattemptRequest" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "message" TEXT,
    "status" "ReattemptRequestStatus" NOT NULL DEFAULT 'pending',
    "managerNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReattemptRequest_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX "ReattemptRequest_assessmentId_status_idx" ON "ReattemptRequest"("assessmentId", "status")`,
  `CREATE INDEX "ReattemptRequest_candidateId_idx" ON "ReattemptRequest"("candidateId")`,
  `CREATE INDEX "ReattemptRequest_status_createdAt_idx" ON "ReattemptRequest"("status", "createdAt")`,
  `ALTER TABLE "ReattemptRequest" ADD CONSTRAINT "ReattemptRequest_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "ReattemptRequest" ADD CONSTRAINT "ReattemptRequest_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "ReattemptRequest" ADD CONSTRAINT "ReattemptRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
];

async function main() {
  const exists = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'ReattemptRequest'
    ) AS "exists"
  `;
  if (exists[0]?.exists) {
    console.log("ReattemptRequest table already exists");
  } else {
    for (const stmt of statements) {
      try {
        await prisma.$executeRawUnsafe(stmt);
        console.log("OK:", stmt.slice(0, 60) + "...");
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes("already exists")) {
          console.log("Skip (exists):", stmt.slice(0, 50));
        } else {
          throw e;
        }
      }
    }
    console.log("ReattemptRequest migration applied");
  }

  const applied = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM "_prisma_migrations"
    WHERE migration_name = '20260603140000_reattempt_requests'
  `;
  if (applied.length === 0) {
    await prisma.$executeRaw`
      INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES (
        gen_random_uuid()::text,
        '',
        NOW(),
        '20260603140000_reattempt_requests',
        NULL,
        NULL,
        NOW(),
        1
      )
    `;
    console.log("Recorded migration 20260603140000_reattempt_requests");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
