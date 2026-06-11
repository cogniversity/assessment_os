export const Role = {
  ADMIN: "admin",
  CAPABILITY_MANAGER: "capability_manager",
  CANDIDATE: "candidate",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/** Privilege order: highest first (used for default active role). */
export const ROLE_PRIORITY = [Role.ADMIN, Role.CAPABILITY_MANAGER, Role.CANDIDATE] as const;

export function highestRole(roles: readonly Role[]): Role {
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return Role.CANDIDATE;
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  capability_manager: "Capability Manager",
  candidate: "Candidate",
};

export function mergeRoles(...lists: readonly (readonly Role[])[]): Role[] {
  return [...new Set(lists.flat())];
}

export const Difficulty = {
  EASY: "easy",
  MEDIUM: "medium",
  HARD: "hard",
} as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

export const QuestionStatus = {
  DRAFT: "draft",
  PUBLISHED: "published",
} as const;
export type QuestionStatus = (typeof QuestionStatus)[keyof typeof QuestionStatus];

export const Proficiency = {
  ENTRY: "entry",
  BEGINNER: "beginner",
  ADVANCED_BEGINNER: "advanced_beginner",
  COMPETENT: "competent",
  PROFICIENT: "proficient",
  EXPERT: "expert",
} as const;
export type Proficiency = (typeof Proficiency)[keyof typeof Proficiency];

/** Ordered list of all proficiency levels, from lowest to highest. */
export const PROFICIENCY_LEVELS = [
  "entry",
  "beginner",
  "advanced_beginner",
  "competent",
  "proficient",
  "expert",
] as const;

/** Human-readable label for each proficiency level. */
export const PROFICIENCY_LABELS: Record<string, string> = {
  entry:             "Entry",
  beginner:          "Beginner",
  advanced_beginner: "Advanced Beginner",
  competent:         "Competent",
  proficient:        "Proficient",
  expert:            "Expert",
};

export const RemarkVisibility = {
  NORMAL: "normal",
  CONFIDENTIAL: "confidential",
} as const;
export type RemarkVisibility = (typeof RemarkVisibility)[keyof typeof RemarkVisibility];

export const ProctoringEventType = {
  TAB_SWITCH: "tab_switch",
  FOCUS_LOSS: "focus_loss",
  FOCUS_RETURN: "focus_return",
  FULLSCREEN_EXIT: "fullscreen_exit",
  COPY_ATTEMPT: "copy_attempt",
  PASTE_ATTEMPT: "paste_attempt",
  CONTEXT_MENU: "context_menu",
} as const;
export type ProctoringEventType = (typeof ProctoringEventType)[keyof typeof ProctoringEventType];

export const QuestionType = {
  SINGLE: "single",
  MULTI: "multi",
} as const;
export type QuestionType = (typeof QuestionType)[keyof typeof QuestionType];

/** How multi-select questions are scored within an assessment blueprint. */
export const MultiSelectScoringMode = {
  ALL_OR_NOTHING: "all_or_nothing",
  PARTIAL_CREDIT: "partial_credit",
} as const;
export type MultiSelectScoringMode = (typeof MultiSelectScoringMode)[keyof typeof MultiSelectScoringMode];
