// Report scope labels, safe to import in client components.
export const REPORT_SCOPES = {
  goals: "Goals and how often they were met",
  checkins: "Summaries of habit check-ins (sleep, smoking, corrections)",
  patterns: "Patterns worth discussing (clearly marked as not conclusions)",
  plan_changes: "Plan changes I approved",
} as const;
export type ReportScope = keyof typeof REPORT_SCOPES;
