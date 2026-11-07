import { AGENTS, type AgentKey } from "@/lib/agents/directory";
import { GOAL_CATEGORIES, type GoalCategory } from "@/lib/goals/categories";
import type { CalendarItem, CountProgress } from "@/lib/goals/schedule";
import { addDays, localDate, weekStartOf } from "@/lib/time";

export { weekStartOf };

// Iris: factual progress computed from structured records. No language model is involved, so
// nothing is invented. Each statement says what it's based on (which conversation, or which
// check-ins), and patterns are labelled as things to discuss, never causes or diagnoses.

export type InsightEvent = {
  id: string;
  kind: "activity" | "food" | "smoking" | "sleep" | "mood" | "other";
  value: number | null;
  unit: string | null;
  description: string | null;
  occurredAt: Date;
  correctedFrom: string | null;
  sessionId: string | null;
  recordedByAgent: AgentKey | null;
};
export type Conversation = { id: string; startedAt: Date };
export type PlanChange = {
  id: string;
  summary: string;
  executedAt: Date;
  requestedByAgent: AgentKey | null;
  sessionId: string | null;
  reason: string | null;
};

export type Statement = { text: string; sources: string[]; basis: string };
export type PlanChangeStatement = Statement & { quote: string | null };

export type WeekSummary = {
  weekStart: string;
  totals: { done: number; notDone: number; postponed: number; planned: number };
  categories: { category: GoalCategory; label: string; items: CalendarItem[] }[];
  counted: CountProgress[];
};

export type Insights = {
  period: { from: string; to: string; timezone: string };
  weeks: WeekSummary[];
  goalStatements: Statement[];
  observations: Statement[];
  hypotheses: Statement[];
  planChanges: PlanChangeStatement[];
};

const round1 = (value: number) => Math.round(value * 10) / 10;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function whenLabel(instant: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-AU", { weekday: "long", hour: "numeric", minute: "2-digit", timeZone: timezone }).format(instant);
}
function dayLabel(date: string) {
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)).replace(",", "");
}

/** "Based on the conversation with Natalie on Sunday 2:00 pm", or the check-in dates. */
export function describeBasis(
  events: Pick<InsightEvent, "occurredAt" | "sessionId" | "recordedByAgent">[],
  conversations: Map<string, Conversation>,
  timezone: string,
) {
  const talks = new Map<string, string>();
  const days = new Set<string>();
  for (const event of events) {
    const conversation = event.sessionId ? conversations.get(event.sessionId) : undefined;
    if (conversation && event.recordedByAgent) {
      talks.set(conversation.id, `${AGENTS[event.recordedByAgent].name} on ${whenLabel(conversation.startedAt, timezone)}`);
    } else {
      days.add(localDate(event.occurredAt, timezone));
    }
  }
  const parts: string[] = [];
  if (talks.size) parts.push(`the ${talks.size === 1 ? "conversation" : "conversations"} with ${[...talks.values()].join(" and ")}`);
  if (days.size) parts.push(`check-ins added on ${[...days].sort().map(dayLabel).join(", ")}`);
  return parts.length ? `Based on ${parts.join(", and ")}` : "Based on goal check-offs";
}

export function computeInsights(input: {
  items: CalendarItem[];
  counted: (weekStart: string) => CountProgress[];
  events: InsightEvent[];
  planChanges: PlanChange[];
  conversations: Map<string, Conversation>;
  from: string;
  to: string;
  today: string;
  timezone: string;
  audience?: "patient" | "clinician";
}): Insights {
  const { items, events, timezone, from, to, today, conversations } = input;
  const clinician = input.audience === "clinician";
  const you = clinician ? "the patient" : "you";
  const You = clinician ? "The patient" : "You";
  const local = (event: InsightEvent) => localDate(event.occurredAt, timezone);
  const inPeriod = events.filter((event) => local(event) >= from && local(event) <= to);

  // --- Weeks: every session by category, newest week first.
  const weeks: WeekSummary[] = [];
  for (let week = weekStartOf(from); week <= to; week = addDays(week, 7)) {
    const inWeek = items.filter((item) => item.date >= week && item.date <= addDays(week, 6));
    const byCategory = new Map<GoalCategory, CalendarItem[]>();
    for (const item of inWeek) byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
    weeks.unshift({
      weekStart: week,
      totals: {
        done: inWeek.filter((item) => item.status === "done").length,
        notDone: inWeek.filter((item) => item.status === "not_done").length,
        postponed: inWeek.filter((item) => item.status === "postponed").length,
        planned: inWeek.filter((item) => item.status === "planned").length,
      },
      categories: [...byCategory.entries()].map(([category, list]) => ({ category, label: GOAL_CATEGORIES[category].label, items: list })),
      counted: input.counted(week),
    });
  }

  // --- Per-goal totals (used in clinician reports).
  const byTitle = new Map<string, CalendarItem[]>();
  for (const item of items.filter((i) => i.date <= today && i.status !== "planned")) byTitle.set(item.title, [...(byTitle.get(item.title) ?? []), item]);
  const goalStatements = [...byTitle.entries()].map(([title, list]) => {
    const done = list.filter((item) => item.status === "done").length;
    const postponed = list.filter((item) => item.status === "postponed").length;
    return {
      text: `“${title}”: ${done} of ${plural(list.length - postponed, "session")} done${postponed ? `, ${postponed} postponed` : ""} (as recorded by the person).`,
      sources: [],
      basis: "Based on goal check-offs",
    };
  });

  // --- Observations: reported averages (clinician reports).
  const observations: Statement[] = [];
  const sleep = inPeriod.filter((event) => event.kind === "sleep" && event.value !== null);
  if (sleep.length) {
    const average = sleep.reduce((sum, event) => sum + (event.value ?? 0), 0) / sleep.length;
    observations.push({ text: `Reported sleep averaged ${round1(average)} hours across ${plural(sleep.length, "night")} (self-reported estimates).`, sources: sleep.map((e) => e.id), basis: describeBasis(sleep, conversations, timezone) });
  }
  const smoking = inPeriod.filter((event) => event.kind === "smoking" && event.value !== null);
  if (smoking.length) {
    const average = smoking.reduce((sum, event) => sum + (event.value ?? 0), 0) / smoking.length;
    observations.push({ text: `Reported cigarettes averaged ${round1(average)} per reporting day.`, sources: smoking.map((e) => e.id), basis: describeBasis(smoking, conversations, timezone) });
  }
  const corrections = inPeriod.filter((event) => event.correctedFrom);
  if (corrections.length) {
    observations.push({ text: `${plural(corrections.length, "entry")} corrected by the person; summaries use the corrected values.`, sources: corrections.map((e) => e.id), basis: describeBasis(corrections, conversations, timezone) });
  }

  // --- Patterns to discuss: missed or postponed sessions in the same week as short sleep or a
  // note about how they felt. Explicitly not causal.
  const hypotheses: Statement[] = [];
  for (const week of weeks) {
    if (week.weekStart > today) continue;
    const weekEvents = inPeriod.filter((event) => weekStartOf(local(event)) === week.weekStart);
    const weekSleep = weekEvents.filter((event) => event.kind === "sleep" && event.value !== null);
    const averageSleep = weekSleep.length ? weekSleep.reduce((sum, event) => sum + (event.value ?? 0), 0) / weekSleep.length : null;
    const moods = weekEvents.filter((event) => event.kind === "mood");
    for (const group of week.categories) {
      const slipped = group.items.filter((item) => item.status === "not_done" || item.status === "postponed").length;
      if (slipped < 2) continue;
      const what = `${plural(slipped, `${group.label.toLowerCase()} session`)} ${slipped === 1 ? "was" : "were"} missed or moved`;
      if (moods.length) {
        const said = moods.map((mood) => mood.description).filter(Boolean)[0];
        hypotheses.push({
          text: `In the week of ${dayLabel(week.weekStart)}, ${what}, and ${you} mentioned how ${clinician ? "they were" : "you were"} feeling${said ? ` (“${said}”)` : ""}. Possibly worth talking about; it doesn't show one caused the other.`,
          sources: moods.map((e) => e.id),
          basis: describeBasis(moods, conversations, timezone),
        });
      } else if (averageSleep !== null && averageSleep < 6) {
        hypotheses.push({
          text: `In the week of ${dayLabel(week.weekStart)}, ${what}, and reported sleep averaged ${round1(averageSleep)} hours. Possibly worth talking about; it doesn't show one caused the other.`,
          sources: weekSleep.map((e) => e.id),
          basis: describeBasis(weekSleep, conversations, timezone),
        });
      }
    }
  }

  // --- Plan changes, with where they came from and the person's own reason.
  const planChanges = input.planChanges.map((change) => {
    const conversation = change.sessionId ? conversations.get(change.sessionId) : undefined;
    const basis =
      conversation && change.requestedByAgent
        ? `${You} asked ${AGENTS[change.requestedByAgent].name} on ${whenLabel(conversation.startedAt, timezone)}`
        : change.requestedByAgent
          ? `${You} asked ${AGENTS[change.requestedByAgent].name} on ${whenLabel(change.executedAt, timezone)}`
          : `${You} changed this in the app on ${whenLabel(change.executedAt, timezone)}`;
    const quote = change.reason?.replace(/^Reason \(patient's words\):\s*|^Barrier \(patient's words\):\s*/i, "").trim() || null;
    return { text: change.summary, sources: [change.id], basis, quote };
  });

  return { period: { from, to, timezone }, weeks, goalStatements, observations, hypotheses, planChanges };
}
