import { z } from "zod";
import { MultiSelectScoringMode } from "@assessment-os/shared";

const certPassFields = {
  passMark: z.number().int().min(0).max(100).default(60),
  issueCertificate: z.boolean().default(false),
  showProficiencyOnCert: z.boolean().default(false),
  certValidityDays: z.number().int().min(0).default(0),
  revealAnswersAfterTest: z.boolean().default(false),
  proficiencyThresholds: z.array(z.number()).optional(),
  multiSelectScoringMode: z
    .enum([MultiSelectScoringMode.ALL_OR_NOTHING, MultiSelectScoringMode.PARTIAL_CREDIT])
    .default(MultiSelectScoringMode.ALL_OR_NOTHING),
  proctoringPhotoIntervalMinutes: z.number().int().min(0).default(5),
  proctoringInstructions: z.string().optional().nullable(),
  issueCapabilityReport: z.boolean().default(false),
  shareCapabilityWithCandidate: z.boolean().default(false),
  capabilityStrengthThreshold: z.number().int().min(0).max(100).default(70),
  capabilityGapThreshold: z.number().int().min(0).max(100).default(40),
};

/** Validated on the server route — supports App ID–only rows via provisionCandidates. */
export const createAssignmentSchema = z
  .object({
    userIds: z.array(z.string().uuid()).default([]),
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
  .refine((d) => d.easyCount + d.mediumCount + d.hardCount > 0, {
    message: "At least one question must be specified across easy/medium/hard",
  })
  .refine((d) => d.userIds.length > 0 || (d.provisionCandidates?.length ?? 0) > 0, {
    message: "Select at least one candidate",
  });

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
