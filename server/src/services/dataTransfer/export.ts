import { prisma } from "../../db.js";
import {
  BUNDLE_VERSION,
  type ExportBundle,
  type ExportBundleData,
  type ExportSection,
} from "./types.js";

const FILE_NOTE =
  "Proctoring photos, resume uploads, and external certificate files are exported as path metadata only. Copy files separately if needed.";

function row<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
}

export async function buildExportBundle(sections: ExportSection[]): Promise<ExportBundle> {
  const data: Partial<ExportBundleData> = {};
  const set = new Set(sections);

  if (set.has("users")) {
    data.profileFieldDefinitions = (await prisma.profileFieldDefinition.findMany()).map(row);
    data.users = (await prisma.user.findMany()).map(row);
    data.candidateProfiles = (await prisma.candidateProfile.findMany()).map(row);
    data.candidateSkillProficiencies = (await prisma.candidateSkillProficiency.findMany()).map(row);
    data.externalCertificates = (await prisma.externalCertificate.findMany()).map(row);
    data.candidateRemarks = (await prisma.candidateRemark.findMany()).map(row);
    data.profileAuditLogs = (await prisma.profileAuditLog.findMany()).map(row);
  }

  if (set.has("taxonomy")) {
    data.categories = (await prisma.category.findMany()).map(row);
    data.skills = (await prisma.skill.findMany()).map(row);
    data.skillRoles = (await prisma.skillRole.findMany()).map(row);
    data.concepts = (await prisma.concept.findMany()).map(row);
    data.topics = (await prisma.topic.findMany()).map(row);
  }

  if (set.has("questions")) {
    data.questions = (await prisma.question.findMany()).map(row);
    data.questionSkillRoles = (await prisma.questionSkillRole.findMany()).map(row);
    data.questionConcepts = (await prisma.questionConcept.findMany()).map(row);
  }

  if (set.has("blueprints")) {
    data.blueprints = (await prisma.assessmentBlueprint.findMany()).map(row);
    data.blueprintTopics = (await prisma.blueprintTopic.findMany()).map(row);
  }

  if (set.has("assignments")) {
    data.assessments = (await prisma.assessment.findMany()).map(row);
    data.assessmentTopics = (await prisma.assessmentTopic.findMany()).map(row);
    data.reattemptRequests = (await prisma.reattemptRequest.findMany()).map(row);
  }

  if (set.has("results")) {
    data.attempts = (await prisma.assessmentAttempt.findMany()).map(row);
    data.attemptAnswers = (await prisma.attemptAnswer.findMany()).map(row);
    data.attemptPhotos = (await prisma.attemptPhoto.findMany()).map(row);
    data.proctoringEvents = (await prisma.proctoringEvent.findMany()).map(row);
    data.certificates = (await prisma.certificate.findMany()).map(row);
    data.capabilityReports = (await prisma.capabilityReport.findMany()).map(row);
  }

  return {
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    sections: [...sections],
    fileNote: FILE_NOTE,
    data,
  };
}
