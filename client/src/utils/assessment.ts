/** Display label for an assessment (blueprint name or joined topic names). */
export function assessmentTopicLabel(a: {
  displayName?: string | null;
  topics?: { topic: { name: string } }[];
}): string {
  if (a.displayName?.trim()) return a.displayName.trim();
  const names = a.topics?.map((t) => t.topic.name) ?? [];
  return names.length ? names.join(", ") : "Assessment";
}
