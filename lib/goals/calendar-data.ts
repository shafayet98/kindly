import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { CalendarReminder, GoalInfo } from "@/components/goals/week-calendar";
import { AGENTS } from "@/lib/agents/directory";
import { db, schema } from "@/lib/db";
import { formatDays, formatTime12h } from "@/lib/scheduling/occurrences";
import { addDays, localDate, weekStartOf } from "@/lib/time";
import { describeSchedule } from "./describe";
import { hasFixedSessions } from "./schedule";
import { loadWeek } from "./service";

/** A valid Monday from a ?week= parameter, or this week's Monday. */
export function resolveWeek(param: unknown, timezone: string) {
  const today = localDate(new Date(), timezone);
  if (typeof param === "string" && /^\d{4}-\d{2}-\d{2}$/.test(param) && !Number.isNaN(Date.parse(`${param}T00:00:00Z`))) return weekStartOf(param);
  return weekStartOf(today);
}

/** Everything the weekly calendar needs, for one user and week. */
export async function loadCalendar(userId: string, timezone: string, weekStart: string) {
  const week = await loadWeek(userId, weekStart);
  const goalIds = [...new Set([...week.items.map((item) => item.goalId), ...week.counted.map((goal) => goal.goalId)])];

  const [goals, reminders] = await Promise.all([
    goalIds.length ? db.select().from(schema.goals).where(and(eq(schema.goals.userId, userId), inArray(schema.goals.id, goalIds))) : [],
    db
      .select()
      .from(schema.reminders)
      .where(and(eq(schema.reminders.userId, userId), eq(schema.reminders.status, "active"))),
  ]);
  const sessionIds = goals.map((goal) => goal.createdInSessionId).filter((id): id is string => Boolean(id));
  const sessions = sessionIds.length
    ? await db.select({ id: schema.callSessions.id, startedAt: schema.callSessions.startedAt }).from(schema.callSessions).where(inArray(schema.callSessions.id, sessionIds))
    : [];
  const when = (date: Date) => new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: timezone }).format(date);
  const day = (date: string) => new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

  // Goal versions share reminders through the latest version, so look reminders up by any id in the chain.
  const remindersByGoal = new Map<string, typeof reminders>();
  for (const reminder of reminders) if (reminder.goalId) remindersByGoal.set(reminder.goalId, [...(remindersByGoal.get(reminder.goalId) ?? []), reminder]);

  const goalInfo: Record<string, GoalInfo> = {};
  for (const goal of goals) {
    const session = sessions.find((s) => s.id === goal.createdInSessionId);
    const origin = goal.createdByAgent
      ? `By ${AGENTS[goal.createdByAgent].name}${session ? ` in a conversation on ${when(session.startedAt)}` : ""}`
      : `By you, ${day(goal.startsOn)}`;
    const linked = remindersByGoal.get(goal.id) ?? [];
    goalInfo[goal.id] = {
      schedule: describeSchedule(goal),
      notes: goal.notes,
      origin,
      // A flexible goal has no set days, so say which days its reminder rings.
      reminder: linked.length
        ? linked
            .map((r) => `${r.channel === "phone" ? "Phone call from Milo" : "In the app"} at ${formatTime12h(r.localTime)}${hasFixedSessions(goal) ? "" : ` · ${formatDays(r.daysOfWeek)}`}`)
            .join("; ")
        : null,
    };
  }

  // A goal with set days already shows its reminder on its sessions; a flexible goal has no
  // sessions to show, so its reminder appears on the days it rings.
  const standalone: CalendarReminder[] = reminders
    .filter((reminder) => {
      const goal = reminder.goalId ? goals.find((candidate) => candidate.id === reminder.goalId) : undefined;
      return !goal || !hasFixedSessions(goal);
    })
    .map((reminder) => ({ id: reminder.id, title: reminder.title, time: reminder.localTime, days: reminder.daysOfWeek, channel: reminder.channel }));

  const thisWeek = weekStartOf(week.today);
  return {
    ...week,
    reminders: standalone,
    goalInfo,
    prevHref: `?week=${addDays(weekStart, -7)}`,
    nextHref: `?week=${addDays(weekStart, 7)}`,
    thisWeekHref: "?week=",
    isThisWeek: weekStart === thisWeek,
  };
}

/** Whether the person has any current goal (to show an empty state). */
export async function hasGoals(userId: string) {
  const [goal] = await db
    .select({ id: schema.goals.id })
    .from(schema.goals)
    .where(and(eq(schema.goals.userId, userId), eq(schema.goals.status, "active"), isNull(schema.goals.endsOn)))
    .limit(1);
  return Boolean(goal);
}
