export type ConceptBreakdown = {
  conceptId: string;
  code: string;
  name: string;
  questionCount: number;
  correctCount: number;
  accuracy: number;
  status: "strength" | "neutral" | "gap";
};

export type CapabilitySummary = {
  overallScore: number;
  passMark: number;
  passed: boolean;
  skillCode: string;
  skillName: string;
  skillRoleCode: string;
  skillRoleName: string;
  untaggedQuestionCount: number;
  strengthThreshold: number;
  gapThreshold: number;
};
