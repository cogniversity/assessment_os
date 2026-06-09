import { z } from "zod";
import {
  Difficulty,
  MultiSelectScoringMode,
  Proficiency,
  QuestionStatus,
  QuestionType,
  RemarkVisibility,
} from "./enums.js";

export const loginSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
});

export const categorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export const skillSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1),
  description: z.string().optional(),
});

/** Partial update — e.g. change skill code (Skill ID); FKs use UUID id, so code change needs no row propagation */
export const skillUpdateSchema = skillSchema.partial();

// Skill role — competency band defined per skill (not a global enum)
export const skillRoleSchema = z.object({
  skillId: z.string().uuid(),
  code: z.string().min(1).max(50).regex(/^[A-Z0-9_]+$/, "Code must be uppercase letters, digits, or underscores"),
  name: z.string().min(1),
  description: z.string().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  defaultEasyCount: z.number().int().min(0).optional().nullable(),
  defaultMediumCount: z.number().int().min(0).optional().nullable(),
  defaultHardCount: z.number().int().min(0).optional().nullable(),
});

export const topicSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  revealAnswersAfterTest: z.boolean().default(false),
  passMark: z.number().int().min(0).max(100).default(60),
  issueCertificate: z.boolean().default(false),
  showProficiencyOnCert: z.boolean().default(false),
  certValidityDays: z.number().int().min(0).default(0),
  proficiencyThresholds: z.array(z.number()).optional(),
});

export const questionSchema = z.object({
  topicId: z.string().uuid(),
  skillId: z.string().uuid(),
  skillRoleIds: z.array(z.string().uuid()).min(1),
  questionType: z.enum([QuestionType.SINGLE, QuestionType.MULTI]).default(QuestionType.SINGLE),
  difficulty: z.enum([Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD]),
  stem: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(5),
  correctIndices: z.array(z.number().int().min(0)).min(1),
  explanation: z.string().optional(),
  status: z.enum([QuestionStatus.DRAFT, QuestionStatus.PUBLISHED]).default(QuestionStatus.DRAFT),
}).superRefine((d, ctx) => {
  if (d.correctIndices.some((i) => i >= d.options.length)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "correctIndices must be within options range" });
  }
  if (d.questionType === QuestionType.SINGLE && d.correctIndices.length !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Single-select questions must have exactly one correct index" });
  }
  if (d.questionType === QuestionType.MULTI && d.correctIndices.length < 2) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Multi-select questions must have at least two correct indices" });
  }
});

// Certificate / pass-mark fields shared by both blueprint and assignment schemas
const certPassFields = {
  passMark:               z.number().int().min(0).max(100).default(60),
  issueCertificate:       z.boolean().default(false),
  showProficiencyOnCert:  z.boolean().default(false),
  certValidityDays:       z.number().int().min(0).default(0),
  revealAnswersAfterTest: z.boolean().default(false),
  proficiencyThresholds:  z.array(z.number()).optional(),
  multiSelectScoringMode: z.enum([
    MultiSelectScoringMode.ALL_OR_NOTHING,
    MultiSelectScoringMode.PARTIAL_CREDIT,
  ]).default(MultiSelectScoringMode.ALL_OR_NOTHING),
  proctoringPhotoIntervalMinutes: z.number().int().min(0).default(5),
  proctoringInstructions: z.string().optional().nullable(),
};

// Named reusable blueprint:
//   Name + Skill + Topic(s) + Skill Role + Difficulty Mix + Pass mark + Timer
// Certificate/pass settings live on the blueprint, not on individual topics.
export const blueprintSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  skillId: z.string().uuid(),
  topicIds: z.array(z.string().uuid()).min(1, "At least one topic required"),
  skillRoleId: z.string().uuid(),
  easyCount: z.number().int().min(0),
  mediumCount: z.number().int().min(0),
  hardCount: z.number().int().min(0),
  timeLimitMinutes: z.number().int().min(0).default(0),
  ...certPassFields,
}).refine(
  (d) => d.easyCount + d.mediumCount + d.hardCount > 0,
  { message: "At least one question must be specified across easy/medium/hard" }
);

export const assignmentSchema = z.object({
  userIds: z.array(z.string().uuid()).default([]),
  /** App ID / directory users not yet in the local DB — provisioned as candidate on assign */
  provisionCandidates: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().min(1).optional(),
      })
    )
    .optional(),
  topicIds: z.array(z.string().uuid()).min(1, "At least one topic required"),
  skillId: z.string().uuid(),
  skillRoleId: z.string().uuid(),
  easyCount: z.number().int().min(0),
  mediumCount: z.number().int().min(0),
  hardCount: z.number().int().min(0),
  timeLimitMinutes: z.number().int().min(0).default(0),
  deadline: z.string().datetime().optional().nullable(),
  blueprintId: z.string().uuid().optional().nullable(),
  displayName: z.string().optional(),
  ...certPassFields,
})
  .refine(
    (d) => d.easyCount + d.mediumCount + d.hardCount > 0,
    { message: "At least one question must be specified across easy/medium/hard" }
  )
  .refine(
    (d) =>
      d.userIds.length > 0 || (d.provisionCandidates?.length ?? 0) > 0,
    { message: "Select at least one candidate" }
  );

export const profileUpdateSchema = z.object({
  country: z.string().optional(),
  employeeId: z.string().optional(),
  employeeName: z.string().optional(),
  band: z.string().optional(),
  subBand: z.string().optional(),
  reportingManagerCode: z.string().optional(),
  reportingManagerName: z.string().optional(),
  joiningDate: z.string().optional().nullable(),
  projectCode: z.string().optional(),
  projectName: z.string().optional(),
  lastProjectCode: z.string().optional(),
  lastProjectName: z.string().optional(),
  customerCode: z.string().optional(),
  customerName: z.string().optional(),
  assignFromDate: z.string().optional().nullable(),
  assignToDate: z.string().optional().nullable(),
  allocationPercentage: z.preprocess(
    (val) => {
      if (val === "" || val === undefined || val === null) return undefined;
      const n = typeof val === "number" ? val : Number(val);
      return Number.isFinite(n) ? n : val;
    },
    z.number().min(0).max(100).optional()
  ),
  status: z.string().optional(),
  customFields: z.record(z.unknown()).optional(),
  changeReason: z.string().optional(),
});

export const proficiencyOverrideSchema = z.object({
  proficiency: z.enum([
    Proficiency.ENTRY,
    Proficiency.BEGINNER,
    Proficiency.ADVANCED_BEGINNER,
    Proficiency.COMPETENT,
    Proficiency.PROFICIENT,
    Proficiency.EXPERT,
  ]),
  changeReason: z.string().min(1),
});

export const remarkSchema = z.object({
  comment: z.string().min(1),
  visibility: z.enum([RemarkVisibility.NORMAL, RemarkVisibility.CONFIDENTIAL]),
});

export const profileFieldDefSchema = z.object({
  key: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1),
  type: z.enum(["text", "number", "date", "select", "textarea"]),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  validationRegex: z.string().optional(),
  displayOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});

export const reattemptRequestCreateSchema = z.object({
  message: z.string().max(2000).optional(),
});

export const reattemptRequestReviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  managerNote: z.string().max(2000).optional(),
});

/**
 * Maps a percentage score to a Proficiency level.
 * Thresholds is an array of 5 minimum-score breakpoints (one per boundary between 6 levels):
 *   [entry→beginner, beginner→adv_beginner, adv_beginner→competent, competent→proficient, proficient→expert]
 * Default: [40, 55, 70, 85, 95]
 */
export function scoreToProficiency(
  score: number,
  thresholds: number[] = [40, 55, 70, 85, 95]
): Proficiency {
  if (score < thresholds[0]) return Proficiency.ENTRY;
  if (score < thresholds[1]) return Proficiency.BEGINNER;
  if (score < thresholds[2]) return Proficiency.ADVANCED_BEGINNER;
  if (score < thresholds[3]) return Proficiency.COMPETENT;
  if (score < thresholds[4]) return Proficiency.PROFICIENT;
  return Proficiency.EXPERT;
}

export function computeFte(allocationPercentage: number): number {
  return Math.round((allocationPercentage / 100) * 100) / 100;
}
