import { formatDays, formatTime12h } from "@/lib/scheduling/occurrences";
import type { Cadence } from "./schedule";

// Plain-language descriptions of goal schedules and changes, used in the UI and read aloud by agents.

export type GoalShape = {
  title: string;
  cadence: Cadence;
  targetCount: number;
  daysOfWeek: number[] | null;
  times: string[];
  durationMinutes: number | null;
};

const times = (count: number) => (count === 1 ? "once" : count === 2 ? "twice" : `${count} times`);

export function describeSchedule(goal: Omit<GoalShape, "title">) {
  const parts: string[] = [];
  if (goal.cadence === "daily") {
    const days = goal.daysOfWeek?.length && goal.daysOfWeek.length < 7 ? formatDays(goal.daysOfWeek) : "Every day";
    parts.push(goal.targetCount > 1 && !goal.times.length ? `${days}, ${goal.targetCount} a day` : days);
  } else if (goal.cadence === "weekly") {
    parts.push(goal.daysOfWeek?.length ? formatDays(goal.daysOfWeek) : `${times(goal.targetCount)} a week, any days`);
  } else {
    parts.push(`${times(goal.targetCount)} a month`);
  }
  if (goal.times.length) parts.push([...goal.times].sort().map(formatTime12h).join(" & "));
  if (goal.durationMinutes) parts.push(`${goal.durationMinutes} min`);
  return parts.join(" · ");
}

export function describeGoal(goal: GoalShape) {
  return `“${goal.title}” (${describeSchedule(goal)})`;
}

/** "10:30" in a title follows the goal's new time, e.g. "In bed by 10:30" -> "In bed by 10:00". */
export function retitleForTime(title: string, oldTime: string | undefined, newTime: string) {
  if (!oldTime) return title;
  const [oldHours, oldMinutes] = oldTime.split(":").map(Number);
  const old12 = `${((oldHours + 11) % 12) + 1}:${String(oldMinutes).padStart(2, "0")}`;
  const new12 = formatTime12h(newTime).split(" ")[0];
  const pattern = new RegExp(`\\b(${oldTime.replace(":", "\\:")}|${old12.replace(":", "\\:")})\\b`);
  return pattern.test(title) ? title.replace(pattern, new12) : title;
}

/** What a change does, e.g. `Mon, Wed, Fri → Tue, Thu · 8:00 AM → 5:00 PM`. Empty if nothing changes. */
export function describeGoalChange(before: GoalShape & { category?: string }, after: GoalShape & { category?: string }) {
  const parts: string[] = [];
  if (after.title !== before.title) parts.push(`rename to “${after.title}”`);
  const scheduleBefore = describeSchedule({ ...before, durationMinutes: null, times: [] });
  const scheduleAfter = describeSchedule({ ...after, durationMinutes: null, times: [] });
  if (scheduleBefore !== scheduleAfter) parts.push(`${scheduleBefore} → ${scheduleAfter}`);
  const timesBefore = [...before.times].sort().map(formatTime12h).join(" & ") || "any time";
  const timesAfter = [...after.times].sort().map(formatTime12h).join(" & ") || "any time";
  if (timesBefore !== timesAfter) parts.push(`${timesBefore} → ${timesAfter}`);
  if ((before.durationMinutes ?? null) !== (after.durationMinutes ?? null)) {
    parts.push(`${before.durationMinutes ? `${before.durationMinutes} min` : "no set length"} → ${after.durationMinutes ? `${after.durationMinutes} min` : "no set length"}`);
  }
  if (after.category && before.category && after.category !== before.category) parts.push(`category → ${after.category}`);
  return parts.join(", ");
}
