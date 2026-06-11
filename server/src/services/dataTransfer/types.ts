export const BUNDLE_VERSION = 1 as const;

export const EXPORT_SECTIONS = [
  "users",
  "taxonomy",
  "questions",
  "blueprints",
  "assignments",
  "results",
] as const;

export type ExportSection = (typeof EXPORT_SECTIONS)[number];

export type ExportBundle = {
  version: typeof BUNDLE_VERSION;
  exportedAt: string;
  sections: ExportSection[];
  /** Proctoring photos, resumes, and cert files are metadata-only (paths, not binary). */
  fileNote: string;
  data: Partial<ExportBundleData>;
};

export type ExportBundleData = {
  profileFieldDefinitions: Record<string, unknown>[];
  users: Record<string, unknown>[];
  candidateProfiles: Record<string, unknown>[];
  candidateSkillProficiencies: Record<string, unknown>[];
  externalCertificates: Record<string, unknown>[];
  candidateRemarks: Record<string, unknown>[];
  profileAuditLogs: Record<string, unknown>[];
  categories: Record<string, unknown>[];
  skills: Record<string, unknown>[];
  skillRoles: Record<string, unknown>[];
  concepts: Record<string, unknown>[];
  topics: Record<string, unknown>[];
  questions: Record<string, unknown>[];
  questionSkillRoles: Record<string, unknown>[];
  questionConcepts: Record<string, unknown>[];
  blueprints: Record<string, unknown>[];
  blueprintTopics: Record<string, unknown>[];
  assessments: Record<string, unknown>[];
  assessmentTopics: Record<string, unknown>[];
  reattemptRequests: Record<string, unknown>[];
  attempts: Record<string, unknown>[];
  attemptAnswers: Record<string, unknown>[];
  attemptPhotos: Record<string, unknown>[];
  proctoringEvents: Record<string, unknown>[];
  certificates: Record<string, unknown>[];
  capabilityReports: Record<string, unknown>[];
};

export type SectionCounts = Partial<Record<keyof ExportBundleData, number>>;

export type ImportPreview = {
  valid: boolean;
  bundleVersion: number;
  exportedAt: string | null;
  availableSections: ExportSection[];
  selectedSections: ExportSection[];
  counts: SectionCounts;
  warnings: string[];
  errors: string[];
};

export type ImportResult = {
  imported: SectionCounts;
  skipped: SectionCounts;
  warnings: string[];
};

export const SECTION_LABELS: Record<ExportSection, string> = {
  users: "Users & profiles",
  taxonomy: "Categories, skills, skill roles & topics",
  questions: "Questions",
  blueprints: "Blueprints",
  assignments: "Assignments / assessments",
  results: "Results (attempts, scores, certificates, proctoring)",
};

export const SECTION_DEPENDENCIES: Partial<Record<ExportSection, ExportSection[]>> = {
  questions: ["taxonomy"],
  blueprints: ["taxonomy"],
  assignments: ["users", "taxonomy", "blueprints"],
  results: ["assignments"],
};
