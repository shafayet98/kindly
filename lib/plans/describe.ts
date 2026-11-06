import { formatTime12h } from "@/lib/scheduling/occurrences";

// Pure helpers for describing and applying goal changes (no database access).

export type PlanChange = { timesPerWeek?: number; minutes?: number; time?: string; title?: string };

/** "10:30" or "10:30 PM" style mentions of the old time in a title, replaced by the new time. */
export function retitleForTime(title: string, oldTime: string | undefined, newTime: string) {
  if (!oldTime) return title;
  const [oldHours, oldMinutes] = oldTime.split(":").map(Number);
  const old12 = `${((oldHours + 11) % 12) + 1}:${String(oldMinutes).padStart(2, "0")}`;
  const new12 = formatTime12h(newTime).split(" ")[0];
  const pattern = new RegExp(`\\b(${oldTime.replace(":", "\\:")}|${old12.replace(":", "\\:")})\\b`);
  return pattern.test(title) ? title.replace(pattern, new12) : title;
}

export function describePlanChange(goal: { title: string; target: Record<string, unknown> }, change: PlanChange) {
  const parts: string[] = [];
  if (change.title && change.title !== goal.title) parts.push(`rename to “${change.title}”`);
  if (change.time !== undefined && change.time !== goal.target.time) {
    const before = typeof goal.target.time === "string" ? formatTime12h(goal.target.time) : "no set time";
    parts.push(`time ${before} → ${formatTime12h(change.time)}`);
  }
  if (change.timesPerWeek !== undefined && change.timesPerWeek !== goal.target.timesPerWeek) parts.push(`${goal.target.timesPerWeek ?? "?"} → ${change.timesPerWeek} times a week`);
  if (change.minutes !== undefined && change.minutes !== goal.target.minutes) parts.push(`${goal.target.minutes ?? "?"} → ${change.minutes} minutes each time`);
  return parts.length ? parts.join(", ") : "no change";
}
