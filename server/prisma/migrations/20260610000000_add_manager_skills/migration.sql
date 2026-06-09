-- CreateTable
CREATE TABLE "ManagerSkill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerSkill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManagerSkill_skillId_idx" ON "ManagerSkill"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerSkill_userId_skillId_key" ON "ManagerSkill"("userId", "skillId");

-- AddForeignKey
ALTER TABLE "ManagerSkill" ADD CONSTRAINT "ManagerSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerSkill" ADD CONSTRAINT "ManagerSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
