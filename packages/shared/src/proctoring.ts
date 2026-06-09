import { ProctoringEventType } from "./enums.js";

export const DEFAULT_PROCTORING_INSTRUCTIONS: string[] = [
  "You will be photographed at the start of the test. Periodic photos may be taken throughout.",
  "Your camera feed is visible on-screen during the entire test as a monitoring indicator.",
  "You must remain in fullscreen mode for the duration of the test.",
  "Switching browser tabs or windows will be detected and logged.",
  "Moving away from the browser window will be detected and logged.",
  "Copying or pasting text is blocked and logged.",
  "Right-clicking is disabled during the test.",
  "All proctoring events are recorded and reviewed by your assessor.",
  "Any suspicious activity may result in your assessment being flagged.",
];

export const PROCTORING_EVENT_LABELS: Record<string, { label: string; severity: "info" | "warn" | "critical" }> = {
  [ProctoringEventType.TAB_SWITCH]:      { label: "Tab switched away",       severity: "critical" },
  [ProctoringEventType.FOCUS_LOSS]:      { label: "Window focus lost",        severity: "warn" },
  [ProctoringEventType.FOCUS_RETURN]:    { label: "Window focus returned",    severity: "info" },
  [ProctoringEventType.FULLSCREEN_EXIT]: { label: "Exited fullscreen",        severity: "critical" },
  [ProctoringEventType.COPY_ATTEMPT]:    { label: "Copy attempt blocked",     severity: "warn" },
  [ProctoringEventType.PASTE_ATTEMPT]:   { label: "Paste attempt blocked",    severity: "warn" },
  [ProctoringEventType.CONTEXT_MENU]:    { label: "Right-click attempt blocked", severity: "warn" },
};
