import { addDays, dayOfWeek, localDate } from "@/lib/time";

// Iris: factual summaries computed from structured records. No language model is involved, so
// nothing is invented. Every statement lists the records it came from (provenance), and
// patterns are labelled as hypotheses to discuss, never causes or diagnoses.

export type InsightEvent = {
  id: string;
  kind: "activity" | "food" | "smoking" | "sleep" | "mood" | "other";
  goalId: string | null;
  value: number | null;
  unit: string | null;
  description: string | null;
  occurredAt: Date;
  correctedFrom: string | null;
};
export type InsightGoal = { id: string; title: string; type: string; target: Record<string, unknown> };
export type InsightPlanChange = { id: string; goalTitle: string; summary: string; executedAt: Date };

export type Statement = { text: string; sources: string[] };
export type GoalWeek = { weekStart: string; count: number; target: number; met: boolean; sources: string[] };
export type GoalSummary = { goalId: string; title: string; weeks: GoalWeek[]; statement: Statement };

export type Insights = {
  period: { from: string; to: string; timezone: string };
  goals: GoalSummary[];
  observations: Statement[];
  hypotheses: Statement[];
  planChanges: Statement[];
  missingData: Statement[];
};

/** Monday that starts the week containing a "YYYY-MM-DD" date. */
export function weekStartOf(date: string) {
  return addDays(date, -((dayOfWeek(date) + 6) % 7));
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function computeInsights(input: {
  events: InsightEvent[];
  goals: InsightGoal[];
  planChanges: InsightPlanChange[];
  from: string; // inclusive local date
  to: string; // inclusive local date
  timezone: string;
}): Insights {
  const { events, goals, timezone, from, to } = input;
  const local = (event: InsightEvent) => localDate(event.occurredAt, timezone);
  const inPeriod = events.filter((event) => local(event) >= from && local(event) <= to);

  const weekStarts: string[] = [];
  for (let week = weekStartOf(from); week <= to; week = addDays(week, 7)) weekStarts.push(week);

  // --- Goals: weekly counts against the person's own target.
  const goalSummaries: GoalSummary[] = [];
  for (const goal of goals) {
    const timesPerWeek = typeof goal.target.timesPerWeek === "number" ? goal.target.timesPerWeek : null;
    if (!timesPerWeek) continue;
    const goalEvents = inPeriod.filter((event) => event.goalId === goal.id);
    const weeks = weekStarts.map((weekStart) => {
      const inWeek = goalEvents.filter((event) => weekStartOf(local(event)) === weekStart);
      return { weekStart, count: inWeek.length, target: timesPerWeek, met: inWeek.length >= timesPerWeek, sources: inWeek.map((event) => event.id) };
    });
    const met = weeks.filter((week) => week.met).length;
    goalSummaries.push({
      goalId: goal.id,
      title: goal.title,
      weeks,
      statement: {
        text: `“${goal.title}”: target reached in ${met} of ${plural(weeks.length, "week")} (based on reported check-ins).`,
        sources: goalEvents.map((event) => event.id),
      },
    });
  }

  // --- Observations: what the person reported, summarised.
  const observations: Statement[] = [];
  const sleep = inPeriod.filter((event) => event.kind === "sleep" && event.value !== null);
  if (sleep.length) {
    const average = sleep.reduce((sum, event) => sum + (event.value ?? 0), 0) / sleep.length;
    observations.push({ text: `Reported sleep averaged ${round1(average)} hours across ${plural(sleep.length, "night")} (self-reported estimates).`, sources: sleep.map((event) => event.id) });
  }
  const smoking = inPeriod.filter((event) => event.kind === "smoking" && event.value !== null);
  if (smoking.length) {
    const firstWeek = smoking.filter((event) => weekStartOf(local(event)) === weekStarts[0]);
    const lastWeek = smoking.filter((event) => weekStartOf(local(event)) === weekStarts.at(-1));
    const avg = (list: InsightEvent[]) => list.reduce((sum, event) => sum + (event.value ?? 0), 0) / list.length;
    const trend = firstWeek.length && lastWeek.length && weekStarts.length > 1 ? ` (first week ${round1(avg(firstWeek))}/day, latest week ${round1(avg(lastWeek))}/day)` : "";
    observations.push({ text: `Reported cigarettes averaged ${round1(avg(smoking))} per reporting day${trend}.`, sources: smoking.map((event) => event.id) });
  }
  const corrections = inPeriod.filter((event) => event.correctedFrom);
  if (corrections.length) {
    observations.push({ text: `${plural(corrections.length, "entry")} corrected by the person; summaries use the corrected values.`, sources: corrections.map((event) => event.id) });
  }

  // --- Hypotheses: co-occurring reports worth discussing. Explicitly not causal.
  const hypotheses: Statement[] = [];
  for (const goal of goalSummaries) {
    for (const week of goal.weeks.filter((w) => !w.met)) {
      const weekSleep = sleep.filter((event) => weekStartOf(local(event)) === week.weekStart);
      const weekMood = inPeriod.filter((event) => event.kind === "mood" && weekStartOf(local(event)) === week.weekStart);
      if (weekSleep.length) {
        const average = weekSleep.reduce((sum, event) => sum + (event.value ?? 0), 0) / weekSleep.length;
        if (average < 6) {
          hypotheses.push({
            text: `In the week of ${week.weekStart}, “${goal.title}” was below target and reported sleep averaged ${round1(average)} hours. These were reported in the same week; this may be worth discussing, but it does not show one caused the other.`,
            sources: [...week.sources, ...weekSleep.map((event) => event.id)],
          });
        }
      }
      if (weekMood.length) {
        hypotheses.push({
          text: `In the week of ${week.weekStart}, “${goal.title}” was below target and the person noted how they were feeling (${plural(weekMood.length, "note")}). A possible barrier to ask about, not a conclusion.`,
          sources: [...week.sources, ...weekMood.map((event) => event.id)],
        });
      }
    }
  }

  // --- Plan changes the person approved.
  const planChanges = input.planChanges.map((change) => ({ text: `${change.goalTitle}: ${change.summary} (approved ${localDate(change.executedAt, timezone)}).`, sources: [change.id] }));

  // --- Missing data: days with no check-in at all.
  const daysWithData = new Set(inPeriod.map(local));
  let totalDays = 0;
  let missing = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) {
    totalDays++;
    if (!daysWithData.has(day)) missing++;
  }
  const missingData: Statement[] = missing ? [{ text: `No check-ins on ${missing} of ${totalDays} days. Missing days are unknown, not zero.`, sources: [] }] : [];

  return { period: { from, to, timezone }, goals: goalSummaries, observations, hypotheses, planChanges, missingData };
}
