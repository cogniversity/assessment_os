-- CreateTable
CREATE TABLE "ManagerQuestionBank" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerQuestionBank_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManagerQuestionBank_userId_idx" ON "ManagerQuestionBank"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerQuestionBank_userId_skillId_topicId_key" ON "ManagerQuestionBank"("userId", "skillId", "topicId");

-- AddForeignKey
ALTER TABLE "ManagerQuestionBank" ADD CONSTRAINT "ManagerQuestionBank_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerQuestionBank" ADD CONSTRAINT "ManagerQuestionBank_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerQuestionBank" ADD CONSTRAINT "ManagerQuestionBank_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
