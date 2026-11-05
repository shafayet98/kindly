import type { AgentKey } from "@/lib/agents/directory";
import { FOCUS_AREAS, type FocusAreaKey } from "./focus-areas";

export type QuickAction = { key: string; label: string; href: string; area: FocusAreaKey | null };

// "What do you need today?" shortcuts. Always all shown; focus areas only change the order.
const QUICK_ACTIONS: QuickAction[] = [
  { key: "unwell", label: "I'm feeling unwell", href: "/check-in/unwell", area: "feeling_unwell" },
  { key: "plan", label: "Plan my day", href: "/call?agent=natalie&topic=plan", area: "daily_planning" },
  { key: "feelings", label: "Talk about how I'm feeling", href: "/call?agent=sarah", area: "emotional_wellbeing" },
  { key: "habit", label: "Log a habit", href: "/habits", area: "health_habits" },
  { key: "reminder", label: "Add a reminder", href: "/schedule", area: "reminders_routines" },
  { key: "progress", label: "How am I doing?", href: "/progress", area: "track_progress" },
];

const LIVE_AGENT_ORDER: AgentKey[] = ["natalie", "milo", "sarah"];

export type GoalSuggestion = { type: "activity" | "nutrition" | "sleep" | "smoking" | "wellbeing"; title: string; target: Record<string, number> };

const GOAL_SUGGESTIONS: Partial<Record<FocusAreaKey, GoalSuggestion[]>> = {
  health_habits: [
    { type: "activity", title: "Walk three times a week", target: { timesPerWeek: 3, minutes: 20 } },
    { type: "sleep", title: "In bed by 10:30 on weeknights", target: { nightsPerWeek: 5 } },
    { type: "nutrition", title: "Eat vegetables with dinner", target: { daysPerWeek: 5 } },
  ],
  daily_planning: [{ type: "activity", title: "A 10-minute stretch each morning", target: { timesPerWeek: 5, minutes: 10 } }],
  emotional_wellbeing: [{ type: "wellbeing", title: "Five quiet minutes for myself each day", target: { timesPerWeek: 7, minutes: 5 } }],
};

const DEFAULT_GOALS: GoalSuggestion[] = [{ type: "activity", title: "Walk three times a week", target: { timesPerWeek: 3, minutes: 20 } }];

/** Stable sort: items tied to a selected area come first, otherwise the original order is kept. */
function rankBy<T>(items: T[], isPreferred: (item: T) => boolean): T[] {
  return [...items.filter(isPreferred), ...items.filter((item) => !isPreferred(item))];
}

export function rankQuickActions(areas: FocusAreaKey[]): QuickAction[] {
  const selected = new Set(areas);
  return rankBy(QUICK_ACTIONS, (action) => action.area !== null && selected.has(action.area));
}

/** Suggested first companion for "Talk now". A spoken request always overrides this. */
export function suggestedAgents(areas: FocusAreaKey[]): AgentKey[] {
  const preferred = new Set(FOCUS_AREAS.filter((area) => areas.includes(area.key)).flatMap((area) => area.agents));
  return rankBy(LIVE_AGENT_ORDER, (agent) => preferred.has(agent));
}

export function goalSuggestions(areas: FocusAreaKey[]): GoalSuggestion[] {
  const fromAreas = areas.flatMap((area) => GOAL_SUGGESTIONS[area] ?? []);
  const unique = new Map([...fromAreas, ...DEFAULT_GOALS].map((goal) => [goal.title, goal]));
  return [...unique.values()].slice(0, 3);
}
