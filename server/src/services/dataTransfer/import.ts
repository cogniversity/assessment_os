import { randomUUID } from "crypto";
import { prisma } from "../../db.js";
import {
  BUNDLE_VERSION,
  EXPORT_SECTIONS,
  SECTION_DEPENDENCIES,
  SECTION_LABELS,
  type ExportBundle,
  type ExportBundleData,
  type ExportSection,
  type ImportPreview,
  type ImportResult,
  type SectionCounts,
} from "./types.js";

function userRolesFromImport(r: Record<string, unknown>): ("admin" | "capability_manager" | "candidate")[] {
  if (Array.isArray(r.roles) && r.roles.length > 0) {
    return r.roles.map(String) as ("admin" | "capability_manager" | "candidate")[];
  }
  if (r.role) return [String(r.role) as "admin" | "capability_manager" | "candidate"];
  return ["candidate"];
}

class IdMap {
  private maps = new Map<string, Map<string, string>>();

  set(entity: string, oldId: string, newId: string) {
    if (!this.maps.has(entity)) this.maps.set(entity, new Map());
    this.maps.get(entity)!.set(oldId, newId);
  }

  get(entity: string, oldId: string | null | undefined): string | undefined {
    if (!oldId) return undefined;
    return this.maps.get(entity)?.get(oldId);
  }

  resolve(entity: string, oldId: string | null | undefined): string | null {
    if (!oldId) return null;
    return this.get(entity, oldId) ?? null;
  }
}

function countRows(data: Partial<ExportBundleData>): SectionCounts {
  const counts: SectionCounts = {};
  for (const [key, rows] of Object.entries(data)) {
    if (Array.isArray(rows)) counts[key as keyof ExportBundleData] = rows.length;
  }
  return counts;
}

function parseSections(raw: unknown): ExportSection[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is ExportSection =>
    EXPORT_SECTIONS.includes(s as ExportSection)
  );
}

function parseOptionalDate(value: unknown): Date | undefined {
  if (value == null || value === "") return undefined;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function optionalDateFields(row: Record<string, unknown>, keys: readonly string[]): Record<string, Date> {
  const out: Record<string, Date> = {};
  for (const key of keys) {
    const d = parseOptionalDate(row[key]);
    if (d !== undefined) out[key] = d;
  }
  return out;
}

export function parseExportBundle(raw: unknown): ExportBundle {
  if (!raw || typeof raw !== "object") throw new Error("Invalid bundle: not an object");
  const b = raw as ExportBundle;
  if (b.version !== BUNDLE_VERSION) {
    throw new Error(`Unsupported bundle version: ${String((b as { version?: unknown }).version)}`);
  }
  if (!b.data || typeof b.data !== "object") throw new Error("Invalid bundle: missing data");
  return b;
}

export function previewImport(
  bundle: ExportBundle,
  selectedSections: ExportSection[]
): ImportPreview {
  const warnings: string[] = [];
  const errors: string[] = [];
  const availableSections = (bundle.sections ?? []) as ExportSection[];
  const counts = countRows(bundle.data);

  if (selectedSections.length === 0) {
    errors.push("Select at least one section to import");
  }

  for (const section of selectedSections) {
    const deps = SECTION_DEPENDENCIES[section] ?? [];
    for (const dep of deps) {
      const inBundle = availableSections.includes(dep);
      const alsoImporting = selectedSections.includes(dep);
      if (!inBundle && !alsoImporting) {
        warnings.push(
          `${SECTION_LABELS[section]} requires ${SECTION_LABELS[dep]} — ensure it already exists in this environment or include it in the import.`
        );
      }
    }
  }

  if (selectedSections.includes("results") && (counts.attemptPhotos ?? 0) > 0) {
    warnings.push(
      "Proctoring photo files are not included in the bundle — only metadata paths will be imported."
    );
  }

  return {
    valid: errors.length === 0,
    bundleVersion: bundle.version,
    exportedAt: bundle.exportedAt ?? null,
    availableSections,
    selectedSections,
    counts,
    warnings,
    errors,
  };
}

let imported: SectionCounts = {};
let skipped: SectionCounts = {};

function inc(key: keyof ExportBundleData, field: "imported" | "skipped") {
  const target = field === "imported" ? imported : skipped;
  target[key] = (target[key] ?? 0) + 1;
}

async function importUsers(data: Partial<ExportBundleData>, ids: IdMap, selected: Set<ExportSection>) {
  if (!selected.has("users")) return;

  for (const r of data.profileFieldDefinitions ?? []) {
    const key = String(r.key);
    const existing = await prisma.profileFieldDefinition.findUnique({ where: { key } });
    if (existing) {
      ids.set("profileFieldDefinition", String(r.id), existing.id);
      inc("profileFieldDefinitions", "skipped");
      continue;
    }
    const created = await prisma.profileFieldDefinition.create({
      data: {
        id: String(r.id),
        key,
        label: String(r.label),
        type: String(r.type),
        required: Boolean(r.required),
        options: r.options ?? undefined,
        validationRegex: r.validationRegex != null ? String(r.validationRegex) : null,
        displayOrder: Number(r.displayOrder ?? 0),
        active: Boolean(r.active ?? true),
        ...optionalDateFields(r, ["createdAt", "updatedAt"]),
      },
    });
    ids.set("profileFieldDefinition", String(r.id), created.id);
    inc("profileFieldDefinitions", "imported");
  }

  for (const r of data.users ?? []) {
    const email = String(r.email).toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      ids.set("user", String(r.id), existing.id);
      inc("users", "skipped");
      continue;
    }
    try {
      const created = await prisma.user.create({
        data: {
          id: String(r.id),
          email,
          name: String(r.name),
          roles: userRolesFromImport(r),
          oidcSub: r.oidcSub != null ? String(r.oidcSub) : null,
          ...optionalDateFields(r, ["createdAt", "updatedAt"]),
        },
      });
      ids.set("user", String(r.id), created.id);
      inc("users", "imported");
    } catch {
      const newId = randomUUID();
      const created = await prisma.user.create({
        data: {
          id: newId,
          email,
          name: String(r.name),
          roles: userRolesFromImport(r),
          oidcSub: r.oidcSub != null ? String(r.oidcSub) : null,
          ...optionalDateFields(r, ["createdAt", "updatedAt"]),
        },
      });
      ids.set("user", String(r.id), created.id);
      inc("users", "imported");
    }
  }

  for (const r of data.candidateProfiles ?? []) {
    const userId = ids.resolve("user", String(r.userId));
    if (!userId) continue;
    const existing = await prisma.candidateProfile.findUnique({ where: { userId } });
    if (existing) {
      ids.set("candidateProfile", String(r.id), existing.id);
      inc("candidateProfiles", "skipped");
      continue;
    }
    const created = await prisma.candidateProfile.create({
      data: {
        id: String(r.id),
        userId,
        country: r.country != null ? String(r.country) : null,
        employeeId: r.employeeId != null ? String(r.employeeId) : null,
        employeeName: r.employeeName != null ? String(r.employeeName) : null,
        band: r.band != null ? String(r.band) : null,
        subBand: r.subBand != null ? String(r.subBand) : null,
        reportingManagerCode: r.reportingManagerCode != null ? String(r.reportingManagerCode) : null,
        reportingManagerName: r.reportingManagerName != null ? String(r.reportingManagerName) : null,
        joiningDate: r.joiningDate ? new Date(String(r.joiningDate)) : null,
        projectCode: r.projectCode != null ? String(r.projectCode) : null,
        projectName: r.projectName != null ? String(r.projectName) : null,
        lastProjectCode: r.lastProjectCode != null ? String(r.lastProjectCode) : null,
        lastProjectName: r.lastProjectName != null ? String(r.lastProjectName) : null,
        customerCode: r.customerCode != null ? String(r.customerCode) : null,
        customerName: r.customerName != null ? String(r.customerName) : null,
        assignFromDate: r.assignFromDate ? new Date(String(r.assignFromDate)) : null,
        assignToDate: r.assignToDate ? new Date(String(r.assignToDate)) : null,
        allocationPercentage: r.allocationPercentage != null ? Number(r.allocationPercentage) : null,
        fte: r.fte != null ? Number(r.fte) : null,
        status: r.status != null ? String(r.status) : null,
        customFields: r.customFields ?? {},
        resumeFilePath: r.resumeFilePath != null ? String(r.resumeFilePath) : null,
        ...optionalDateFields(r, ["createdAt", "updatedAt"]),
      },
    });
    ids.set("candidateProfile", String(r.id), created.id);
    inc("candidateProfiles", "imported");
  }

  for (const r of data.externalCertificates ?? []) {
    const userId = ids.resolve("user", String(r.userId));
    if (!userId) continue;
    const existing = await prisma.externalCertificate.findFirst({
      where: { userId, title: String(r.title), filePath: String(r.filePath) },
    });
    if (existing) {
      inc("externalCertificates", "skipped");
      continue;
    }
    await prisma.externalCertificate.create({
      data: {
        id: String(r.id),
        userId,
        title: String(r.title),
        issuer: r.issuer != null ? String(r.issuer) : null,
        filePath: String(r.filePath),
        certificateNumber: r.certificateNumber != null ? String(r.certificateNumber) : null,
        issueDate: r.issueDate ? new Date(String(r.issueDate)) : null,
        expiryDate: r.expiryDate ? new Date(String(r.expiryDate)) : null,
        verifiedByAdmin: Boolean(r.verifiedByAdmin),
        ...optionalDateFields(r, ["createdAt"]),
      },
    });
    inc("externalCertificates", "imported");
  }

  for (const r of data.candidateRemarks ?? []) {
    const candidateUserId = ids.resolve("user", String(r.candidateUserId));
    const authorUserId = ids.resolve("user", String(r.authorUserId));
    if (!candidateUserId || !authorUserId) continue;
    await prisma.candidateRemark.create({
      data: {
        id: String(r.id),
        candidateUserId,
        authorUserId,
        visibility: r.visibility as never,
        comment: String(r.comment),
        ...optionalDateFields(r, ["createdAt"]),
      },
    });
    inc("candidateRemarks", "imported");
  }

  for (const r of data.profileAuditLogs ?? []) {
    const candidateUserId = ids.resolve("user", String(r.candidateUserId));
    const actorUserId = ids.resolve("user", String(r.actorUserId));
    if (!candidateUserId || !actorUserId) continue;
    await prisma.profileAuditLog.create({
      data: {
        id: String(r.id),
        candidateUserId,
        actorUserId,
        fieldName: String(r.fieldName),
        oldValue: r.oldValue ?? undefined,
        newValue: r.newValue ?? undefined,
        changeReason: r.changeReason != null ? String(r.changeReason) : null,
        changedAt: new Date(String(r.changedAt)),
      },
    });
    inc("profileAuditLogs", "imported");
  }
}

async function importTaxonomy(data: Partial<ExportBundleData>, ids: IdMap, selected: Set<ExportSection>) {
  if (!selected.has("taxonomy")) return;

  for (const r of data.categories ?? []) {
    const name = String(r.name);
    const existing = await prisma.category.findUnique({ where: { name } });
    if (existing) {
      ids.set("category", String(r.id), existing.id);
      inc("categories", "skipped");
      continue;
    }
    const created = await prisma.category.create({
      data: {
        id: String(r.id),
        name,
        description: r.description != null ? String(r.description) : null,
        ...optionalDateFields(r, ["createdAt", "updatedAt"]),
      },
    });
    ids.set("category", String(r.id), created.id);
    inc("categories", "imported");
  }

  for (const r of data.skills ?? []) {
    const code = String(r.code);
    const existing = await prisma.skill.findUnique({ where: { code } });
    if (existing) {
      ids.set("skill", String(r.id), existing.id);
      inc("skills", "skipped");
      continue;
    }
    const created = await prisma.skill.create({
      data: {
        id: String(r.id),
        code,
        name: String(r.name),
        description: r.description != null ? String(r.description) : null,
        ...optionalDateFields(r, ["createdAt", "updatedAt"]),
      },
    });
    ids.set("skill", String(r.id), created.id);
    inc("skills", "imported");
  }

  for (const r of data.skillRoles ?? []) {
    const skillId = ids.resolve("skill", String(r.skillId)) ?? String(r.skillId);
    const code = String(r.code);
    const existing = await prisma.skillRole.findUnique({
      where: { skillId_code: { skillId, code } },
    });
    if (existing) {
      ids.set("skillRole", String(r.id), existing.id);
      inc("skillRoles", "skipped");
      continue;
    }
    const created = await prisma.skillRole.create({
      data: {
        id: String(r.id),
        skillId,
        code,
        name: String(r.name),
        description: r.description != null ? String(r.description) : null,
        sortOrder: Number(r.sortOrder ?? 0),
        isActive: Boolean(r.isActive ?? true),
        defaultEasyCount: r.defaultEasyCount != null ? Number(r.defaultEasyCount) : null,
        defaultMediumCount: r.defaultMediumCount != null ? Number(r.defaultMediumCount) : null,
        defaultHardCount: r.defaultHardCount != null ? Number(r.defaultHardCount) : null,
        ...optionalDateFields(r, ["createdAt", "updatedAt"]),
      },
    });
    ids.set("skillRole", String(r.id), created.id);
    inc("skillRoles", "imported");
  }

  for (const r of data.concepts ?? []) {
    const skillId = ids.resolve("skill", String(r.skillId)) ?? String(r.skillId);
    const code = String(r.code);
    const existing = await prisma.concept.findUnique({
      where: { skillId_code: { skillId, code } },
    });
    if (existing) {
      ids.set("concept", String(r.id), existing.id);
      inc("concepts", "skipped");
      continue;
    }
    const created = await prisma.concept.create({
      data: {
        id: String(r.id),
        skillId,
        code,
        name: String(r.name),
        description: r.description != null ? String(r.description) : null,
        sortOrder: Number(r.sortOrder ?? 0),
        isActive: Boolean(r.isActive ?? true),
        ...optionalDateFields(r, ["createdAt", "updatedAt"]),
      },
    });
    ids.set("concept", String(r.id), created.id);
    inc("concepts", "imported");
  }

  for (const r of data.topics ?? []) {
    const categoryId = ids.resolve("category", String(r.categoryId)) ?? String(r.categoryId);
    const name = String(r.name);
    const existing = await prisma.topic.findFirst({ where: { categoryId, name } });
    if (existing) {
      ids.set("topic", String(r.id), existing.id);
      inc("topics", "skipped");
      continue;
    }
    const created = await prisma.topic.create({
      data: {
        id: String(r.id),
        categoryId,
        name,
        description: r.description != null ? String(r.description) : null,
        revealAnswersAfterTest: Boolean(r.revealAnswersAfterTest),
        passMark: Number(r.passMark ?? 60),
        issueCertificate: Boolean(r.issueCertificate),
        showProficiencyOnCert: Boolean(r.showProficiencyOnCert),
        certValidityDays: Number(r.certValidityDays ?? 0),
        proficiencyThresholds: r.proficiencyThresholds ?? [40, 55, 70, 85, 95],
        ...optionalDateFields(r, ["createdAt", "updatedAt"]),
      },
    });
    ids.set("topic", String(r.id), created.id);
    inc("topics", "imported");
  }
}

async function importQuestions(data: Partial<ExportBundleData>, ids: IdMap, selected: Set<ExportSection>) {
  if (!selected.has("questions")) return;

  for (const r of data.questions ?? []) {
    const topicId = ids.resolve("topic", String(r.topicId)) ?? String(r.topicId);
    const skillId = ids.resolve("skill", String(r.skillId)) ?? String(r.skillId);
    const existing = await prisma.question.findUnique({ where: { id: String(r.id) } });
    if (existing) {
      ids.set("question", String(r.id), existing.id);
      inc("questions", "skipped");
      continue;
    }
    const created = await prisma.question.create({
      data: {
        id: String(r.id),
        topicId,
        skillId,
        questionType: r.questionType as never,
        difficulty: r.difficulty as never,
        status: r.status as never,
        stem: String(r.stem),
        options: r.options as never,
        correctIndices: r.correctIndices as number[],
        explanation: r.explanation != null ? String(r.explanation) : null,
        ...optionalDateFields(r, ["createdAt", "updatedAt"]),
      },
    });
    ids.set("question", String(r.id), created.id);
    inc("questions", "imported");
  }

  for (const r of data.questionSkillRoles ?? []) {
    const questionId = ids.resolve("question", String(r.questionId));
    const skillRoleId = ids.resolve("skillRole", String(r.skillRoleId));
    if (!questionId || !skillRoleId) continue;
    await prisma.questionSkillRole.upsert({
      where: { questionId_skillRoleId: { questionId, skillRoleId } },
      create: { questionId, skillRoleId },
      update: {},
    });
    inc("questionSkillRoles", "imported");
  }

  for (const r of data.questionConcepts ?? []) {
    const questionId = ids.resolve("question", String(r.questionId));
    const conceptId = ids.resolve("concept", String(r.conceptId));
    if (!questionId || !conceptId) continue;
    await prisma.questionConcept.upsert({
      where: { questionId_conceptId: { questionId, conceptId } },
      create: { questionId, conceptId },
      update: {},
    });
    inc("questionConcepts", "imported");
  }
}

async function importBlueprints(data: Partial<ExportBundleData>, ids: IdMap, selected: Set<ExportSection>) {
  if (!selected.has("blueprints")) return;

  for (const r of data.blueprints ?? []) {
    const skillId = ids.resolve("skill", String(r.skillId)) ?? String(r.skillId);
    const skillRoleId = ids.resolve("skillRole", String(r.skillRoleId)) ?? String(r.skillRoleId);
    const createdById = ids.resolve("user", r.createdById as string | undefined);
    const existing = await prisma.assessmentBlueprint.findUnique({ where: { id: String(r.id) } });
    if (existing) {
      ids.set("blueprint", String(r.id), existing.id);
      inc("blueprints", "skipped");
      continue;
    }
    const created = await prisma.assessmentBlueprint.create({
      data: {
        id: String(r.id),
        name: String(r.name),
        description: r.description != null ? String(r.description) : null,
        skillId,
        skillRoleId,
        questionCount: Number(r.questionCount),
        easyCount: Number(r.easyCount),
        mediumCount: Number(r.mediumCount),
        hardCount: Number(r.hardCount),
        timeLimitMinutes: Number(r.timeLimitMinutes ?? 0),
        passMark: Number(r.passMark ?? 60),
        issueCertificate: Boolean(r.issueCertificate),
        showProficiencyOnCert: Boolean(r.showProficiencyOnCert),
        certValidityDays: Number(r.certValidityDays ?? 0),
        revealAnswersAfterTest: Boolean(r.revealAnswersAfterTest),
        proficiencyThresholds: r.proficiencyThresholds ?? [40, 55, 70, 85, 95],
        multiSelectScoringMode: r.multiSelectScoringMode as never,
        proctoringPhotoIntervalMinutes: Number(r.proctoringPhotoIntervalMinutes ?? 5),
        proctoringInstructions: r.proctoringInstructions != null ? String(r.proctoringInstructions) : null,
        issueCapabilityReport: Boolean(r.issueCapabilityReport ?? false),
        shareCapabilityWithCandidate: Boolean(r.shareCapabilityWithCandidate ?? false),
        capabilityStrengthThreshold: Number(r.capabilityStrengthThreshold ?? 70),
        capabilityGapThreshold: Number(r.capabilityGapThreshold ?? 40),
        createdById,
        ...optionalDateFields(r, ["createdAt", "updatedAt"]),
      },
    });
    ids.set("blueprint", String(r.id), created.id);
    inc("blueprints", "imported");
  }

  for (const r of data.blueprintTopics ?? []) {
    const blueprintId = ids.resolve("blueprint", String(r.blueprintId));
    const topicId = ids.resolve("topic", String(r.topicId));
    if (!blueprintId || !topicId) continue;
    await prisma.blueprintTopic.upsert({
      where: { blueprintId_topicId: { blueprintId, topicId } },
      create: { blueprintId, topicId },
      update: {},
    });
    inc("blueprintTopics", "imported");
  }
}

async function importAssignments(data: Partial<ExportBundleData>, ids: IdMap, selected: Set<ExportSection>) {
  if (!selected.has("assignments")) return;

  for (const r of data.assessments ?? []) {
    const userId = ids.resolve("user", String(r.userId)) ?? String(r.userId);
    const skillId = ids.resolve("skill", String(r.skillId)) ?? String(r.skillId);
    const skillRoleId = ids.resolve("skillRole", String(r.skillRoleId)) ?? String(r.skillRoleId);
    const assignedById = ids.resolve("user", String(r.assignedById)) ?? String(r.assignedById);
    const blueprintId = ids.resolve("blueprint", r.blueprintId as string | undefined);
    const existing = await prisma.assessment.findUnique({ where: { id: String(r.id) } });
    if (existing) {
      ids.set("assessment", String(r.id), existing.id);
      inc("assessments", "skipped");
      continue;
    }
    const created = await prisma.assessment.create({
      data: {
        id: String(r.id),
        userId,
        skillId,
        skillRoleId,
        assignedById,
        blueprintId,
        displayName: r.displayName != null ? String(r.displayName) : null,
        questionCount: Number(r.questionCount),
        easyCount: Number(r.easyCount),
        mediumCount: Number(r.mediumCount),
        hardCount: Number(r.hardCount),
        timeLimitMinutes: Number(r.timeLimitMinutes ?? 0),
        deadline: r.deadline ? new Date(String(r.deadline)) : null,
        status: r.status as never,
        passMark: Number(r.passMark ?? 60),
        issueCertificate: Boolean(r.issueCertificate),
        showProficiencyOnCert: Boolean(r.showProficiencyOnCert),
        certValidityDays: Number(r.certValidityDays ?? 0),
        revealAnswersAfterTest: Boolean(r.revealAnswersAfterTest),
        proficiencyThresholds: r.proficiencyThresholds ?? [40, 55, 70, 85, 95],
        multiSelectScoringMode: r.multiSelectScoringMode as never,
        proctoringPhotoIntervalMinutes: Number(r.proctoringPhotoIntervalMinutes ?? 5),
        proctoringInstructions: r.proctoringInstructions != null ? String(r.proctoringInstructions) : null,
        issueCapabilityReport: Boolean(r.issueCapabilityReport ?? false),
        shareCapabilityWithCandidate: Boolean(r.shareCapabilityWithCandidate ?? false),
        capabilityStrengthThreshold: Number(r.capabilityStrengthThreshold ?? 70),
        capabilityGapThreshold: Number(r.capabilityGapThreshold ?? 40),
        ...optionalDateFields(r, ["createdAt", "updatedAt"]),
      },
    });
    ids.set("assessment", String(r.id), created.id);
    inc("assessments", "imported");
  }

  for (const r of data.assessmentTopics ?? []) {
    const assessmentId = ids.resolve("assessment", String(r.assessmentId));
    const topicId = ids.resolve("topic", String(r.topicId));
    if (!assessmentId || !topicId) continue;
    await prisma.assessmentTopic.upsert({
      where: { assessmentId_topicId: { assessmentId, topicId } },
      create: { assessmentId, topicId },
      update: {},
    });
    inc("assessmentTopics", "imported");
  }

  for (const r of data.reattemptRequests ?? []) {
    const assessmentId = ids.resolve("assessment", String(r.assessmentId));
    const candidateId = ids.resolve("user", String(r.candidateId));
    if (!assessmentId || !candidateId) continue;
    const reviewedById = ids.resolve("user", r.reviewedById as string | undefined);
    const existing = await prisma.reattemptRequest.findUnique({ where: { id: String(r.id) } });
    if (existing) {
      inc("reattemptRequests", "skipped");
      continue;
    }
    await prisma.reattemptRequest.create({
      data: {
        id: String(r.id),
        assessmentId,
        candidateId,
        message: r.message != null ? String(r.message) : null,
        status: r.status as never,
        managerNote: r.managerNote != null ? String(r.managerNote) : null,
        reviewedById,
        reviewedAt: r.reviewedAt ? new Date(String(r.reviewedAt)) : null,
        ...optionalDateFields(r, ["createdAt", "updatedAt"]),
      },
    });
    inc("reattemptRequests", "imported");
  }
}

async function importResults(data: Partial<ExportBundleData>, ids: IdMap, selected: Set<ExportSection>) {
  if (!selected.has("results")) return;

  for (const r of data.attempts ?? []) {
    const assessmentId = ids.resolve("assessment", String(r.assessmentId)) ?? String(r.assessmentId);
    const existing = await prisma.assessmentAttempt.findUnique({ where: { id: String(r.id) } });
    if (existing) {
      ids.set("attempt", String(r.id), existing.id);
      inc("attempts", "skipped");
      continue;
    }
    const created = await prisma.assessmentAttempt.create({
      data: {
        id: String(r.id),
        assessmentId,
        questionOrder: r.questionOrder as never,
        currentAnswers: r.currentAnswers ?? {},
        score: r.score != null ? Number(r.score) : null,
        status: r.status as never,
        startedAt: new Date(String(r.startedAt)),
        completedAt: r.completedAt ? new Date(String(r.completedAt)) : null,
        autoSubmittedAt: r.autoSubmittedAt ? new Date(String(r.autoSubmittedAt)) : null,
      },
    });
    ids.set("attempt", String(r.id), created.id);
    inc("attempts", "imported");
  }

  for (const r of data.attemptAnswers ?? []) {
    const attemptId = ids.resolve("attempt", String(r.attemptId));
    const questionId = ids.resolve("question", String(r.questionId)) ?? String(r.questionId);
    if (!attemptId) continue;
    const existing = await prisma.attemptAnswer.findUnique({ where: { id: String(r.id) } });
    if (existing) {
      inc("attemptAnswers", "skipped");
      continue;
    }
    await prisma.attemptAnswer.create({
      data: {
        id: String(r.id),
        attemptId,
        questionId,
        selectedIndices: (r.selectedIndices as number[]) ?? [],
        pointsEarned: r.pointsEarned != null ? Number(r.pointsEarned) : null,
        isFullyCorrect: r.isFullyCorrect != null ? Boolean(r.isFullyCorrect) : null,
      },
    });
    inc("attemptAnswers", "imported");
  }

  for (const r of data.attemptPhotos ?? []) {
    const attemptId = ids.resolve("attempt", String(r.attemptId));
    if (!attemptId) continue;
    const existing = await prisma.attemptPhoto.findUnique({ where: { id: String(r.id) } });
    if (existing) {
      inc("attemptPhotos", "skipped");
      continue;
    }
    await prisma.attemptPhoto.create({
      data: {
        id: String(r.id),
        attemptId,
        filePath: String(r.filePath),
        kind: r.kind as never,
        capturedAt: new Date(String(r.capturedAt)),
      },
    });
    inc("attemptPhotos", "imported");
  }

  for (const r of data.proctoringEvents ?? []) {
    const attemptId = ids.resolve("attempt", String(r.attemptId));
    if (!attemptId) continue;
    const existing = await prisma.proctoringEvent.findUnique({ where: { id: String(r.id) } });
    if (existing) {
      inc("proctoringEvents", "skipped");
      continue;
    }
    await prisma.proctoringEvent.create({
      data: {
        id: String(r.id),
        attemptId,
        eventType: r.eventType as never,
        occurredAt: new Date(String(r.occurredAt)),
        metadata: r.metadata ?? undefined,
      },
    });
    inc("proctoringEvents", "imported");
  }

  for (const r of data.certificates ?? []) {
    const attemptId = ids.resolve("attempt", String(r.attemptId));
    if (!attemptId) continue;
    const certNumber = String(r.certNumber);
    const existing = await prisma.certificate.findFirst({
      where: { OR: [{ id: String(r.id) }, { certNumber }] },
    });
    if (existing) {
      inc("certificates", "skipped");
      continue;
    }
    await prisma.certificate.create({
      data: {
        id: String(r.id),
        attemptId,
        certNumber,
        proficiency: r.proficiency as never,
        issuedAt: new Date(String(r.issuedAt)),
        expiresAt: r.expiresAt ? new Date(String(r.expiresAt)) : null,
      },
    });
    inc("certificates", "imported");
  }

  for (const r of data.capabilityReports ?? []) {
    const attemptId = ids.resolve("attempt", String(r.attemptId));
    if (!attemptId) continue;
    const reportNumber = String(r.reportNumber);
    const existing = await prisma.capabilityReport.findFirst({
      where: { OR: [{ id: String(r.id) }, { reportNumber }] },
    });
    if (existing) {
      inc("capabilityReports", "skipped");
      continue;
    }
    await prisma.capabilityReport.create({
      data: {
        id: String(r.id),
        attemptId,
        reportNumber,
        summary: r.summary as never,
        concepts: r.concepts as never,
        issuedAt: new Date(String(r.issuedAt)),
      },
    });
    inc("capabilityReports", "imported");
  }

  for (const r of data.candidateSkillProficiencies ?? []) {
    const userId = ids.resolve("user", String(r.userId));
    const skillId = ids.resolve("skill", String(r.skillId));
    const skillRoleId = ids.resolve("skillRole", String(r.skillRoleId));
    if (!userId || !skillId || !skillRoleId) continue;
    const updatedById = ids.resolve("user", r.updatedById as string | undefined);
    await prisma.candidateSkillProficiency.upsert({
      where: { userId_skillId_skillRoleId: { userId, skillId, skillRoleId } },
      create: {
        id: String(r.id),
        userId,
        skillId,
        skillRoleId,
        proficiency: r.proficiency as never,
        sourceAttemptId: ids.resolve("attempt", r.sourceAttemptId as string | undefined),
        proficiencyOverridden: Boolean(r.proficiencyOverridden),
        updatedById,
        updatedAt: r.updatedAt ? new Date(String(r.updatedAt)) : null,
        ...optionalDateFields(r, ["createdAt"]),
      },
      update: {
        proficiency: r.proficiency as never,
        proficiencyOverridden: Boolean(r.proficiencyOverridden),
        updatedById,
        updatedAt: r.updatedAt ? new Date(String(r.updatedAt)) : null,
      },
    });
    inc("candidateSkillProficiencies", "imported");
  }
}

export async function commitImport(
  bundle: ExportBundle,
  selectedSections: ExportSection[]
): Promise<ImportResult> {
  imported = {};
  skipped = {};
  const selected = new Set(selectedSections);
  const ids = new IdMap();
  const warnings: string[] = [...previewImport(bundle, selectedSections).warnings];

  await importUsers(bundle.data, ids, selected);
  await importTaxonomy(bundle.data, ids, selected);
  await importQuestions(bundle.data, ids, selected);
  await importBlueprints(bundle.data, ids, selected);
  await importAssignments(bundle.data, ids, selected);
  await importResults(bundle.data, ids, selected);

  return { imported, skipped, warnings };
}

export { parseSections };
