-- Concept catalog per skill
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestionConcept" (
    "questionId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,

    CONSTRAINT "QuestionConcept_pkey" PRIMARY KEY ("questionId","conceptId")
);

-- Capability report per attempt
CREATE TABLE "CapabilityReport" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "reportNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" JSONB NOT NULL,
    "concepts" JSONB NOT NULL,

    CONSTRAINT "CapabilityReport_pkey" PRIMARY KEY ("id")
);

-- Per skill + skill role proficiency
CREATE TABLE "CandidateSkillProficiency" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "skillRoleId" TEXT NOT NULL,
    "proficiency" "Proficiency",
    "sourceAttemptId" TEXT,
    "proficiencyOverridden" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateSkillProficiency_pkey" PRIMARY KEY ("id")
);

-- Blueprint / assessment capability flags
ALTER TABLE "AssessmentBlueprint" ADD COLUMN "issueCapabilityReport" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AssessmentBlueprint" ADD COLUMN "shareCapabilityWithCandidate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AssessmentBlueprint" ADD COLUMN "capabilityStrengthThreshold" INTEGER NOT NULL DEFAULT 70;
ALTER TABLE "AssessmentBlueprint" ADD COLUMN "capabilityGapThreshold" INTEGER NOT NULL DEFAULT 40;

ALTER TABLE "Assessment" ADD COLUMN "issueCapabilityReport" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Assessment" ADD COLUMN "shareCapabilityWithCandidate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Assessment" ADD COLUMN "capabilityStrengthThreshold" INTEGER NOT NULL DEFAULT 70;
ALTER TABLE "Assessment" ADD COLUMN "capabilityGapThreshold" INTEGER NOT NULL DEFAULT 40;

-- Remove global profile proficiency (replaced by CandidateSkillProficiency)
ALTER TABLE "CandidateProfile" DROP COLUMN IF EXISTS "currentProficiency";
ALTER TABLE "CandidateProfile" DROP COLUMN IF EXISTS "proficiencyOverridden";
ALTER TABLE "CandidateProfile" DROP COLUMN IF EXISTS "proficiencyUpdatedById";
ALTER TABLE "CandidateProfile" DROP COLUMN IF EXISTS "proficiencyUpdatedAt";

-- Indexes and FKs
CREATE UNIQUE INDEX "Concept_skillId_code_key" ON "Concept"("skillId", "code");
CREATE INDEX "Concept_skillId_isActive_idx" ON "Concept"("skillId", "isActive");

CREATE INDEX "QuestionConcept_conceptId_idx" ON "QuestionConcept"("conceptId");

CREATE UNIQUE INDEX "CapabilityReport_attemptId_key" ON "CapabilityReport"("attemptId");
CREATE UNIQUE INDEX "CapabilityReport_reportNumber_key" ON "CapabilityReport"("reportNumber");

CREATE UNIQUE INDEX "CandidateSkillProficiency_userId_skillId_skillRoleId_key" ON "CandidateSkillProficiency"("userId", "skillId", "skillRoleId");
CREATE INDEX "CandidateSkillProficiency_userId_idx" ON "CandidateSkillProficiency"("userId");
CREATE INDEX "CandidateSkillProficiency_skillId_idx" ON "CandidateSkillProficiency"("skillId");

ALTER TABLE "Concept" ADD CONSTRAINT "Concept_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionConcept" ADD CONSTRAINT "QuestionConcept_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionConcept" ADD CONSTRAINT "QuestionConcept_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapabilityReport" ADD CONSTRAINT "CapabilityReport_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CandidateSkillProficiency" ADD CONSTRAINT "CandidateSkillProficiency_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateSkillProficiency" ADD CONSTRAINT "CandidateSkillProficiency_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateSkillProficiency" ADD CONSTRAINT "CandidateSkillProficiency_skillRoleId_fkey" FOREIGN KEY ("skillRoleId") REFERENCES "SkillRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateSkillProficiency" ADD CONSTRAINT "CandidateSkillProficiency_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill skill proficiencies from latest certificate per user/skill/skillRole
INSERT INTO "CandidateSkillProficiency" ("id", "userId", "skillId", "skillRoleId", "proficiency", "sourceAttemptId", "proficiencyOverridden", "updatedAt", "createdAt")
SELECT
    gen_random_uuid()::text,
    sub."userId",
    sub."skillId",
    sub."skillRoleId",
    sub."proficiency",
    sub."attemptId",
    false,
    sub."issuedAt",
    sub."issuedAt"
FROM (
    SELECT DISTINCT ON (a."userId", a."skillId", a."skillRoleId")
        a."userId",
        a."skillId",
        a."skillRoleId",
        c."proficiency",
        c."attemptId",
        c."issuedAt"
    FROM "Certificate" c
    JOIN "AssessmentAttempt" att ON att."id" = c."attemptId"
    JOIN "Assessment" a ON a."id" = att."assessmentId"
    ORDER BY a."userId", a."skillId", a."skillRoleId", c."issuedAt" DESC
) sub
ON CONFLICT ("userId", "skillId", "skillRoleId") DO NOTHING;
