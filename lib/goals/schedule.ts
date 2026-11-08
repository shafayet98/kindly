import { addDays, dayOfWeek } from "@/lib/time";
import type { GoalCategory } from "./categories";

// Pure scheduling logic for goals: which sessions are planned on which days, and their status.
// Planned sessions are computed from each goal's schedule; stored rows only record what happened.

export type Cadence = "daily" | "weekly" | "monthly";

export type GoalPlan = {
  id: string;
  title: string;
  category: GoalCategory;
  cadence: Cadence;
  targetCount: number;
  daysOfWeek: number[] | null;
  times: string[];
  durationMinutes: number | null;
  notes: string | null;
  startsOn: string;
  endsOn: string | null;
  status: string;
};

export type SessionRow = {
  goalId: string;
  scheduledDate: string;
  slotTime: string;
  status: "planned" | "done" | "postponed";
  movedToDate: string | null;
  movedToTime: string | null;
  movedFromDate: string | null;
  movedFromTime: string | null;
  value: string | null;
  unit: string | null;
  note: string | null;
};

export type ItemStatus = "done" | "not_done" | "postponed" | "planned";

export type CalendarItem = {
  key: string;
  goalId: string;
  title: string;
  category: GoalCategory;
  cadence: Cadence;
  date: string;
  slotTime: string;
  time: string | null;
  status: ItemStatus;
  movedTo: { date: string; time: string | null } | null;
  movedFrom: { date: string; time: string | null } | null;
  amount: string | null;
  note: string | null;
};

export type CountProgress = { goalId: string; title: string; category: GoalCategory; period: "week" | "month"; done: number; target: number };

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const isTime = (slot: string) => /^\d{2}:\d{2}$/.test(slot);

/**
 * A flexible weekly goal ("3 times a week, any days") whose reminder is set for exactly that many
 * days takes those days: the person has picked their days, so the calendar shows those sessions.
 */
export function takesReminderDays(goal: Pick<GoalPlan, "cadence" | "daysOfWeek" | "targetCount" | "times">, reminderDays: number[]) {
  const days = new Set(reminderDays);
  return goal.cadence === "weekly" && !goal.daysOfWeek?.length && goal.times.length <= 1 && days.size > 0 && days.size < 7 && days.size === goal.targetCount;
}

/** Goals with fixed sessions appear in day slots; flexible weekly and monthly goals are counted instead. */
export function hasFixedSessions(goal: Pick<GoalPlan, "cadence" | "daysOfWeek">) {
  return goal.cadence === "daily" || (goal.cadence === "weekly" && Array.isArray(goal.daysOfWeek) && goal.daysOfWeek.length > 0);
}

function activeOn(goal: GoalPlan, date: string) {
  return date >= goal.startsOn && (!goal.endsOn || date <= goal.endsOn);
}

/** Planned (date, slot) pairs for a goal with fixed sessions, within [from, to]. */
export function plannedSlots(goal: GoalPlan, from: string, to: string): { date: string; slotTime: string }[] {
  if (!hasFixedSessions(goal)) return [];
  const days = goal.cadence === "daily" ? (goal.daysOfWeek?.length ? goal.daysOfWeek : ALL_DAYS) : goal.daysOfWeek!;
  const slots = goal.times.length ? [...goal.times].sort() : [""];
  const result: { date: string; slotTime: string }[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (!activeOn(goal, date) || !days.includes(dayOfWeek(date))) continue;
    for (const slotTime of slots) result.push({ date, slotTime });
  }
  return result;
}

const keyOf = (goalId: string, date: string, slotTime: string) => `${goalId}|${date}|${slotTime}`;

/** Parses an item key ("goalId|date|slot") back into its parts. */
export function parseItemKey(key: string) {
  const [goalId, date, slotTime = ""] = key.split("|");
  if (!goalId || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return null;
  return { goalId, date, slotTime };
}

function amountOf(row: SessionRow | undefined) {
  if (!row?.value) return null;
  return `${Number(row.value)}${row.unit ? ` ${row.unit}` : ""}`;
}

/**
 * Every session between `from` and `to` with its status. A planned session that's past and wasn't
 * marked done counts as not done; today's sessions stay planned until the day is over.
 */
export function buildItems(goals: GoalPlan[], rows: SessionRow[], from: string, to: string, today: string): CalendarItem[] {
  const byGoal = new Map(goals.map((goal) => [goal.id, goal]));
  const rowByKey = new Map(rows.map((row) => [keyOf(row.goalId, row.scheduledDate, row.slotTime), row]));
  const items: CalendarItem[] = [];
  const seen = new Set<string>();

  const push = (goal: GoalPlan, date: string, slotTime: string, row: SessionRow | undefined) => {
    const key = keyOf(goal.id, date, slotTime);
    seen.add(key);
    let status: ItemStatus;
    if (row?.status === "done") status = "done";
    else if (row?.status === "postponed") status = "postponed";
    else status = date < today ? "not_done" : "planned";
    items.push({
      key,
      goalId: goal.id,
      title: goal.title,
      category: goal.category,
      cadence: goal.cadence,
      date,
      slotTime,
      time: isTime(slotTime) ? slotTime : null,
      status,
      movedTo: row?.movedToDate ? { date: row.movedToDate, time: row.movedToTime } : null,
      movedFrom: row?.movedFromDate ? { date: row.movedFromDate, time: row.movedFromTime } : null,
      amount: amountOf(row),
      note: row?.note ?? null,
    });
  };

  for (const goal of goals) {
    for (const slot of plannedSlots(goal, from, to)) push(goal, slot.date, slot.slotTime, rowByKey.get(keyOf(goal.id, slot.date, slot.slotTime)));
  }
  // Sessions moved in from another day, and entries for flexible goals.
  for (const row of rows) {
    const goal = byGoal.get(row.goalId);
    if (!goal || row.scheduledDate < from || row.scheduledDate > to) continue;
    if (seen.has(keyOf(row.goalId, row.scheduledDate, row.slotTime))) continue;
    if (row.status === "postponed" && !hasFixedSessions(goal)) continue;
    push(goal, row.scheduledDate, row.slotTime, row);
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99").localeCompare(b.time ?? "99") || a.title.localeCompare(b.title));
}

/** First day of the month containing a date. */
export function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}

/** Last day of the month containing a date. */
export function monthEnd(date: string) {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** Progress for goals counted per period (flexible weekly, and monthly). */
export function countProgress(goals: GoalPlan[], rows: SessionRow[], weekStart: string): CountProgress[] {
  const weekEnd = addDays(weekStart, 6);
  const month = monthStart(addDays(weekStart, 3));
  const result: CountProgress[] = [];
  for (const goal of goals) {
    if (hasFixedSessions(goal)) continue;
    const period = goal.cadence === "monthly" ? "month" : "week";
    const [from, to] = period === "month" ? [month, monthEnd(month)] : [weekStart, weekEnd];
    if (goal.endsOn && goal.endsOn < from) continue;
    if (goal.startsOn > to) continue;
    const done = rows.filter((row) => row.goalId === goal.id && row.status === "done" && row.scheduledDate >= from && row.scheduledDate <= to).length;
    result.push({ goalId: goal.id, title: goal.title, category: goal.category, period, done, target: goal.targetCount });
  }
  return result;
}
