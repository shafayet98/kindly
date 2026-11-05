import type { AgentKey } from "@/lib/agents/directory";

// Focus areas rank suggestions. They are preferences, never consent and never an access boundary.

export const FOCUS_AREA_KEYS = [
  "health_habits",
  "daily_planning",
  "reminders_routines",
  "emotional_wellbeing",
  "feeling_unwell",
  "track_progress",
  "care_team_updates",
] as const;

export type FocusAreaKey = (typeof FOCUS_AREA_KEYS)[number];

export type FocusArea = { key: FocusAreaKey; title: string; description: string; agents: AgentKey[] };

export const FOCUS_AREAS: FocusArea[] = [
  { key: "health_habits", title: "Health & healthy habits", description: "Movement, food, sleep or smoking goals.", agents: ["natalie"] },
  { key: "daily_planning", title: "Daily activities & planning", description: "Fit healthy routines into a real week.", agents: ["theo", "milo"] },
  { key: "reminders_routines", title: "Reminders & routines", description: "Gentle nudges at times that suit you.", agents: ["milo"] },
  { key: "emotional_wellbeing", title: "Emotional wellbeing", description: "Someone calm to talk things through with.", agents: ["sarah"] },
  { key: "feeling_unwell", title: "I'm feeling unwell", description: "Describe how you feel and find the right care.", agents: ["natalie"] },
  { key: "track_progress", title: "Track my progress", description: "See how things are going over time.", agents: ["iris"] },
  { key: "care_team_updates", title: "Care-team updates", description: "Share summaries with your clinician, only if you choose.", agents: ["clara"] },
];

export function isFocusAreaKey(value: unknown): value is FocusAreaKey {
  return typeof value === "string" && (FOCUS_AREA_KEYS as readonly string[]).includes(value);
}

/** Keeps only known keys, without duplicates, in canonical order. */
export function normalizeFocusAreas(values: unknown[]): FocusAreaKey[] {
  const selected = new Set(values.filter(isFocusAreaKey));
  return FOCUS_AREA_KEYS.filter((key) => selected.has(key));
}
