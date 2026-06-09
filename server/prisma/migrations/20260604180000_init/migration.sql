-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'capability_manager', 'candidate');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('easy', 'medium', 'hard');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('assigned', 'in_progress', 'completed', 'expired', 'abandoned');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('in_progress', 'completed', 'timed_out', 'abandoned');

-- CreateEnum
CREATE TYPE "Proficiency" AS ENUM ('novice', 'advanced_beginner', 'competent', 'proficient', 'expert');

-- CreateEnum
CREATE TYPE "RemarkVisibility" AS ENUM ('normal', 'confidential');

-- CreateEnum
CREATE TYPE "ProctoringEventType" AS ENUM ('tab_switch', 'focus_loss', 'focus_return', 'fullscreen_exit', 'copy_attempt', 'paste_attempt', 'context_menu');

-- CreateEnum
CREATE TYPE "PhotoKind" AS ENUM ('start', 'periodic');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('single', 'multi');

-- CreateEnum
CREATE TYPE "MultiSelectScoringMode" AS ENUM ('all_or_nothing', 'partial_credit');

-- CreateEnum
CREATE TYPE "ReattemptRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'candidate',
    "oidcSub" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillRole" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "defaultEasyCount" INTEGER,
    "defaultMediumCount" INTEGER,
    "defaultHardCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "revealAnswersAfterTest" BOOLEAN NOT NULL DEFAULT false,
    "passMark" INTEGER NOT NULL DEFAULT 60,
    "issueCertificate" BOOLEAN NOT NULL DEFAULT false,
    "showProficiencyOnCert" BOOLEAN NOT NULL DEFAULT false,
    "certValidityDays" INTEGER NOT NULL DEFAULT 0,
    "proficiencyThresholds" JSONB NOT NULL DEFAULT '[40,60,75,90]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "questionType" "QuestionType" NOT NULL DEFAULT 'single',
    "difficulty" "Difficulty" NOT NULL,
    "status" "QuestionStatus" NOT NULL DEFAULT 'draft',
    "stem" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctIndices" INTEGER[],
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionSkillRole" (
    "questionId" TEXT NOT NULL,
    "skillRoleId" TEXT NOT NULL,

    CONSTRAINT "QuestionSkillRole_pkey" PRIMARY KEY ("questionId","skillRoleId")
);

-- CreateTable
CREATE TABLE "AssessmentBlueprint" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "skillId" TEXT NOT NULL,
    "skillRoleId" TEXT NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "easyCount" INTEGER NOT NULL,
    "mediumCount" INTEGER NOT NULL,
    "hardCount" INTEGER NOT NULL,
    "timeLimitMinutes" INTEGER NOT NULL DEFAULT 0,
    "passMark" INTEGER NOT NULL DEFAULT 60,
    "issueCertificate" BOOLEAN NOT NULL DEFAULT false,
    "showProficiencyOnCert" BOOLEAN NOT NULL DEFAULT false,
    "certValidityDays" INTEGER NOT NULL DEFAULT 0,
    "revealAnswersAfterTest" BOOLEAN NOT NULL DEFAULT false,
    "proficiencyThresholds" JSONB NOT NULL DEFAULT '[40,60,75,90]',
    "multiSelectScoringMode" "MultiSelectScoringMode" NOT NULL DEFAULT 'all_or_nothing',
    "proctoringPhotoIntervalMinutes" INTEGER NOT NULL DEFAULT 5,
    "proctoringInstructions" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentBlueprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlueprintTopic" (
    "blueprintId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,

    CONSTRAINT "BlueprintTopic_pkey" PRIMARY KEY ("blueprintId","topicId")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "skillRoleId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "blueprintId" TEXT,
    "displayName" TEXT,
    "questionCount" INTEGER NOT NULL,
    "easyCount" INTEGER NOT NULL,
    "mediumCount" INTEGER NOT NULL,
    "hardCount" INTEGER NOT NULL,
    "timeLimitMinutes" INTEGER NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3),
    "status" "AssessmentStatus" NOT NULL DEFAULT 'assigned',
    "passMark" INTEGER NOT NULL DEFAULT 60,
    "issueCertificate" BOOLEAN NOT NULL DEFAULT false,
    "showProficiencyOnCert" BOOLEAN NOT NULL DEFAULT false,
    "certValidityDays" INTEGER NOT NULL DEFAULT 0,
    "revealAnswersAfterTest" BOOLEAN NOT NULL DEFAULT false,
    "proficiencyThresholds" JSONB NOT NULL DEFAULT '[40,60,75,90]',
    "multiSelectScoringMode" "MultiSelectScoringMode" NOT NULL DEFAULT 'all_or_nothing',
    "proctoringPhotoIntervalMinutes" INTEGER NOT NULL DEFAULT 5,
    "proctoringInstructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReattemptRequest" (
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
);

-- CreateTable
CREATE TABLE "AssessmentTopic" (
    "assessmentId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,

    CONSTRAINT "AssessmentTopic_pkey" PRIMARY KEY ("assessmentId","topicId")
);

-- CreateTable
CREATE TABLE "AssessmentAttempt" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "questionOrder" JSONB NOT NULL,
    "currentAnswers" JSONB NOT NULL DEFAULT '{}',
    "score" INTEGER,
    "status" "AttemptStatus" NOT NULL DEFAULT 'in_progress',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "autoSubmittedAt" TIMESTAMP(3),

    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttemptAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedIndices" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "pointsEarned" DOUBLE PRECISION,
    "isFullyCorrect" BOOLEAN,

    CONSTRAINT "AttemptAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttemptPhoto" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "kind" "PhotoKind" NOT NULL DEFAULT 'start',
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttemptPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProctoringEvent" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "eventType" "ProctoringEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "ProctoringEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "certNumber" TEXT NOT NULL,
    "proficiency" "Proficiency" NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "country" TEXT,
    "employeeId" TEXT,
    "employeeName" TEXT,
    "band" TEXT,
    "subBand" TEXT,
    "reportingManagerCode" TEXT,
    "reportingManagerName" TEXT,
    "joiningDate" TIMESTAMP(3),
    "projectCode" TEXT,
    "projectName" TEXT,
    "lastProjectCode" TEXT,
    "lastProjectName" TEXT,
    "customerCode" TEXT,
    "customerName" TEXT,
    "assignFromDate" TIMESTAMP(3),
    "assignToDate" TIMESTAMP(3),
    "allocationPercentage" DOUBLE PRECISION,
    "fte" DOUBLE PRECISION,
    "status" TEXT,
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "resumeFilePath" TEXT,
    "currentProficiency" "Proficiency",
    "proficiencyOverridden" BOOLEAN NOT NULL DEFAULT false,
    "proficiencyUpdatedById" TEXT,
    "proficiencyUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalCertificate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issuer" TEXT,
    "filePath" TEXT NOT NULL,
    "certificateNumber" TEXT,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "verifiedByAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateRemark" (
    "id" TEXT NOT NULL,
    "candidateUserId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "visibility" "RemarkVisibility" NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateRemark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileAuditLog" (
    "id" TEXT NOT NULL,
    "candidateUserId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "changeReason" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileFieldDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "validationRegex" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionImportJob" (
    "id" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "importedRowCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedRowCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_oidcSub_key" ON "User"("oidcSub");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_code_key" ON "Skill"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_name_key" ON "Skill"("name");

-- CreateIndex
CREATE INDEX "SkillRole_skillId_isActive_idx" ON "SkillRole"("skillId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SkillRole_skillId_code_key" ON "SkillRole"("skillId", "code");

-- CreateIndex
CREATE INDEX "Question_skillId_topicId_status_idx" ON "Question"("skillId", "topicId", "status");

-- CreateIndex
CREATE INDEX "Question_skillId_topicId_difficulty_status_idx" ON "Question"("skillId", "topicId", "difficulty", "status");

-- CreateIndex
CREATE INDEX "QuestionSkillRole_skillRoleId_idx" ON "QuestionSkillRole"("skillRoleId");

-- CreateIndex
CREATE INDEX "BlueprintTopic_topicId_idx" ON "BlueprintTopic"("topicId");

-- CreateIndex
CREATE INDEX "ReattemptRequest_assessmentId_status_idx" ON "ReattemptRequest"("assessmentId", "status");

-- CreateIndex
CREATE INDEX "ReattemptRequest_candidateId_idx" ON "ReattemptRequest"("candidateId");

-- CreateIndex
CREATE INDEX "ReattemptRequest_status_createdAt_idx" ON "ReattemptRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AssessmentTopic_topicId_idx" ON "AssessmentTopic"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_attemptId_key" ON "Certificate"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_certNumber_key" ON "Certificate"("certNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateProfile_userId_key" ON "CandidateProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileFieldDefinition_key_key" ON "ProfileFieldDefinition"("key");

-- AddForeignKey
ALTER TABLE "SkillRole" ADD CONSTRAINT "SkillRole_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionSkillRole" ADD CONSTRAINT "QuestionSkillRole_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionSkillRole" ADD CONSTRAINT "QuestionSkillRole_skillRoleId_fkey" FOREIGN KEY ("skillRoleId") REFERENCES "SkillRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentBlueprint" ADD CONSTRAINT "AssessmentBlueprint_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentBlueprint" ADD CONSTRAINT "AssessmentBlueprint_skillRoleId_fkey" FOREIGN KEY ("skillRoleId") REFERENCES "SkillRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentBlueprint" ADD CONSTRAINT "AssessmentBlueprint_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlueprintTopic" ADD CONSTRAINT "BlueprintTopic_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "AssessmentBlueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlueprintTopic" ADD CONSTRAINT "BlueprintTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_skillRoleId_fkey" FOREIGN KEY ("skillRoleId") REFERENCES "SkillRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "AssessmentBlueprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReattemptRequest" ADD CONSTRAINT "ReattemptRequest_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReattemptRequest" ADD CONSTRAINT "ReattemptRequest_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReattemptRequest" ADD CONSTRAINT "ReattemptRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentTopic" ADD CONSTRAINT "AssessmentTopic_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentTopic" ADD CONSTRAINT "AssessmentTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptPhoto" ADD CONSTRAINT "AttemptPhoto_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProctoringEvent" ADD CONSTRAINT "ProctoringEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateProfile" ADD CONSTRAINT "CandidateProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateProfile" ADD CONSTRAINT "CandidateProfile_proficiencyUpdatedById_fkey" FOREIGN KEY ("proficiencyUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalCertificate" ADD CONSTRAINT "ExternalCertificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateRemark" ADD CONSTRAINT "CandidateRemark_candidateUserId_fkey" FOREIGN KEY ("candidateUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateRemark" ADD CONSTRAINT "CandidateRemark_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileAuditLog" ADD CONSTRAINT "ProfileAuditLog_candidateUserId_fkey" FOREIGN KEY ("candidateUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileAuditLog" ADD CONSTRAINT "ProfileAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

