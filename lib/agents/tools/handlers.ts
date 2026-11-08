import { and, asc, eq, inArray } from "drizzle-orm";
import { getCallSettings } from "@/lib/calls/settings";
import { db, schema } from "@/lib/db";
import { describeReminder, getOwnedReminder, PHONE_CALLS_OFF, phoneCallsAllowed } from "@/lib/reminders/service";
import { formatDays, formatTime12h } from "@/lib/scheduling/occurrences";
import { HabitError, correctHabitEvent, logHabitEvent, recentHabitEvents } from "@/lib/habits/service";
import { loadInsights } from "@/lib/insights/load";
import { GOAL_CATEGORIES } from "@/lib/goals/categories";
import { describeSchedule } from "@/lib/goals/describe";
import { countProgress, hasFixedSessions, parseItemKey, takesReminderDays } from "@/lib/goals/schedule";
import { activeGoals, getOwnedGoal, GoalError, loadSessions, markSessionDone, normaliseGoal, type GoalInput } from "@/lib/goals/service";
import { weekStartOf } from "@/lib/insights/iris";
import { PlanError, proposeGoalChange, proposeNewGoal } from "@/lib/plans/service";
import { addDays, localDate, zonedTimeToUtc } from "@/lib/time";
import { recordAgentEvent } from "@/lib/voice/sessions";
import { listWellbeingNotes, saveWellbeingNote, WellbeingNoteError } from "@/lib/wellbeing/notes";
import { declineAction, executeAction, proposeAction } from "../confirmations";
import { SAFETY_MESSAGES } from "@/lib/safety/messages";
import type { ToolContext, ToolHandlers } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ASK = "Read this summary to the person and ask them to confirm. Call confirm_action only if they clearly say yes.";

// Every query is scoped to ctx.userId, which comes from the authenticated session or the
// server-issued call token — never from model output.
export const handlers: ToolHandlers = {
  async get_reminders(ctx: ToolContext) {
    const rows = await db
      .select({
        id: schema.reminders.id,
        title: schema.reminders.title,
        localTime: schema.reminders.localTime,
        daysOfWeek: schema.reminders.daysOfWeek,
        channel: schema.reminders.channel,
        status: schema.reminders.status,
        timezone: schema.reminders.timezone,
      })
      .from(schema.reminders)
      .where(and(eq(schema.reminders.userId, ctx.userId), inArray(schema.reminders.status, ["active", "paused"])))
      .orderBy(asc(schema.reminders.localTime));
    return {
      reminders: rows.map((row) => ({
        id: row.id,
        title: row.title,
        time: row.localTime,
        time_spoken: formatTime12h(row.localTime),
        days: formatDays(row.daysOfWeek),
        delivery: row.channel === "phone" ? "phone call" : "in-app",
        status: row.status,
        timezone: row.timezone,
      })),
    };
  },

  async get_goals(ctx) {
    const goals = await activeGoals(ctx.userId);
    return {
      goals: goals.map((goal) => ({
        goal_id: goal.id,
        title: goal.title,
        category: GOAL_CATEGORIES[goal.category].label,
        schedule: describeSchedule(goal),
        cadence: goal.cadence,
        target_count: goal.targetCount,
        days_of_week: goal.daysOfWeek,
        times: goal.times,
        clinician_approved: Boolean(goal.approvedBy),
      })),
    };
  },

  async get_week_plan(ctx) {
    const today = localDate(new Date(), ctx.timezone);
    const { items } = await loadSessions(ctx.userId, addDays(today, -7), addDays(today, 7), today);
    const week = await loadSessions(ctx.userId, weekStartOf(today), addDays(weekStartOf(today), 6), today);
    const counted = countProgress(week.plans, week.rows, weekStartOf(today));
    return {
      today,
      sessions: items.map((item) => ({
        item_id: item.key,
        goal: item.title,
        date: item.date,
        time: item.time,
        status: item.status,
        moved_to: item.movedTo,
      })),
      counted_goals: counted.map((goal) => `${goal.title}: ${goal.done} of ${goal.target} this ${goal.period}`),
    };
  },

  async propose_new_goal(ctx, input) {
    const goal = normaliseGoal({
      title: input.title,
      category: input.category,
      cadence: input.cadence,
      targetCount: input.target_count,
      daysOfWeek: input.days_of_week,
      times: input.times,
      durationMinutes: input.duration_minutes,
      notes: input.notes,
    });
    const { proposalId, summary } = await proposeNewGoal(ctx.userId, goal, { requestedByAgent: ctx.agent, sessionId: ctx.sessionId, reason: input.reason_in_their_words });
    const confirmationId = await proposeAction(ctx, { kind: "plan.adjust", payload: { proposalId } }, summary);
    return { confirmation_id: confirmationId, summary, prepared_by: "Theo", next_step: ASK };
  },

  async mark_goal_done(ctx, input) {
    const today = localDate(new Date(), ctx.timezone);
    const ref = input.item_id ? parseItemKey(input.item_id) : input.goal_id ? { goalId: input.goal_id, date: addDays(today, -input.days_ago), slotTime: undefined } : null;
    if (!ref || !UUID.test(ref.goalId)) return { error: "Say which session: call get_week_plan for item ids." };
    try {
      const { goal } = await markSessionDone(ctx.userId, ref, { value: input.amount, unit: input.unit, note: input.note }, { type: "agent", agent: ctx.agent, sessionId: ctx.sessionId });
      return { saved: true, goal: goal.title, date: ref.date };
    } catch (error) {
      if (error instanceof GoalError) return { error: error.message };
      throw error;
    }
  },

  async propose_postpone_session(ctx, input) {
    const ref = parseItemKey(input.item_id);
    if (!ref || !UUID.test(ref.goalId)) return { error: "Unknown session. Call get_week_plan for item ids." };
    const goal = await getOwnedGoal(ctx.userId, ref.goalId);
    if (!goal) return { error: "Unknown session. Call get_week_plan for item ids." };
    const toDate = addDays(localDate(new Date(), ctx.timezone), input.days_from_today);
    const day = (date: string) => new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
    const at = (time: string | null) => (time ? ` at ${formatTime12h(time)}` : "");
    const summary = `Move “${goal.title}” from ${day(ref.date)}${at(ref.slotTime.includes(":") && !ref.slotTime.startsWith("extra") ? ref.slotTime : null)} to ${day(toDate)}${at(input.new_time)}, just this once.`;
    const confirmationId = await proposeAction(
      ctx,
      { kind: "session.postpone", payload: { goalId: ref.goalId, date: ref.date, slotTime: ref.slotTime, toDate, toTime: input.new_time } },
      summary,
    );
    return { confirmation_id: confirmationId, summary, next_step: ASK };
  },

  async propose_reminder_change(ctx, input) {
    const reminder = UUID.test(input.reminder_id) ? await getOwnedReminder(ctx.userId, input.reminder_id) : null;
    if (!reminder || reminder.status === "cancelled") return { error: "No such reminder. Call get_reminders to find the right one." };

    if (input.action === "reschedule") {
      if (!input.new_time && !input.days) return { error: "Say what should change: a new time, new days, or both." };
      const after = { ...reminder, localTime: input.new_time ?? reminder.localTime, daysOfWeek: input.days ?? reminder.daysOfWeek };
      const goal = reminder.goalId ? await getOwnedGoal(ctx.userId, reminder.goalId) : null;
      const goalNote = goal && !goal.endsOn && takesReminderDays(goal, after.daysOfWeek) ? ` “${goal.title}” will then be planned for those days, so it shows in the calendar.` : "";
      const summary = `Move ${describeReminder(reminder)} to ${formatTime12h(after.localTime)}, ${formatDays(after.daysOfWeek).toLowerCase()}.${goalNote}`;
      const confirmationId = await proposeAction(
        ctx,
        { kind: "reminder.reschedule", payload: { reminderId: reminder.id, localTime: after.localTime, daysOfWeek: after.daysOfWeek } },
        summary,
      );
      return { confirmation_id: confirmationId, summary, next_step: ASK };
    }

    const status = input.action === "pause" ? "paused" : input.action === "resume" ? "active" : "cancelled";
    const summary = `${input.action[0].toUpperCase()}${input.action.slice(1)} ${describeReminder(reminder)}.`;
    const confirmationId = await proposeAction(ctx, { kind: "reminder.status", payload: { reminderId: reminder.id, status } }, summary);
    return { confirmation_id: confirmationId, summary, next_step: ASK };
  },

  async propose_new_reminder(ctx, input) {
    // Checked now, so the person is never asked to agree to something that can't be saved.
    if (input.delivery === "phone" && !(await phoneCallsAllowed(ctx.userId))) return { error: `${PHONE_CALLS_OFF} Tell the person, and offer an in-app reminder instead.` };
    let goalNote = "";
    let fields = { title: input.title.trim(), localTime: input.time, daysOfWeek: [...new Set(input.days)].sort(), channel: input.delivery, goalId: null as string | null };
    if (input.goal_id) {
      const goal = UUID.test(input.goal_id) ? await getOwnedGoal(ctx.userId, input.goal_id) : null;
      if (!goal || goal.endsOn) return { error: "Unknown goal. Call get_goals first." };
      fields = { ...fields, goalId: goal.id };
      // Reminders for goals with a set schedule follow the goal's time and days.
      if (hasFixedSessions(goal) && goal.times.length === 1) {
        fields = { ...fields, localTime: goal.times[0], daysOfWeek: goal.daysOfWeek?.length ? goal.daysOfWeek : [0, 1, 2, 3, 4, 5, 6] };
      } else if (takesReminderDays(goal, fields.daysOfWeek)) {
        goalNote = ` “${goal.title}” will then be planned for ${formatDays(fields.daysOfWeek)} at ${formatTime12h(fields.localTime)}, so it shows in the calendar.`;
      }
    }
    const summary = `Create ${describeReminder(fields)}.${goalNote}`;
    const confirmationId = await proposeAction(ctx, { kind: "reminder.create", payload: fields }, summary);
    return { confirmation_id: confirmationId, summary, next_step: ASK };
  },

  async confirm_action(ctx, input) {
    if (!UUID.test(input.confirmation_id)) return { error: "Unknown confirmation id." };
    const outcome = await executeAction(ctx, input.confirmation_id);
    if (!outcome.ok) return { error: outcome.error };
    return { done: true, result: outcome.summary, next_reminder_due: outcome.nextDue?.toISOString() ?? null };
  },

  async decline_action(ctx, input) {
    if (!UUID.test(input.confirmation_id)) return { error: "Unknown confirmation id." };
    return (await declineAction(ctx, input.confirmation_id)) ? { declined: true, note: "Nothing was changed." } : { error: "Nothing pending with that id." };
  },

  async log_habit(ctx, input) {
    const date = addDays(localDate(new Date(), ctx.timezone), -input.days_ago);
    const now = new Date();
    const occurredAt = input.days_ago === 0 ? now : zonedTimeToUtc(date, "12:00", ctx.timezone);
    try {
      const event = await logHabitEvent(
        ctx.userId,
        { kind: input.kind, value: input.value, unit: input.value === null ? null : input.unit, description: input.description, occurredAt, certainty: input.certainty },
        { type: "agent", agent: ctx.agent },
      );
      return { saved: true, entry_id: event.id, note: "Saved as patient-reported." };
    } catch (error) {
      if (error instanceof HabitError) return { error: error.message };
      throw error;
    }
  },

  async correct_habit(ctx, input) {
    if (!UUID.test(input.entry_id)) return { error: "Unknown entry. Call get_recent_habits first." };
    try {
      const changes: { value?: number | null; description?: string | null } = {};
      if (input.value !== null) changes.value = input.value;
      if (input.description !== null) changes.description = input.description;
      const { corrected } = await correctHabitEvent(ctx.userId, input.entry_id, changes, { type: "agent", agent: ctx.agent });
      return { corrected: true, entry_id: corrected.id, value: corrected.value, description: corrected.description };
    } catch (error) {
      if (error instanceof HabitError) return { error: error.message };
      throw error;
    }
  },

  async get_recent_habits(ctx) {
    const events = await recentHabitEvents(ctx.userId, new Date(Date.now() - 14 * 86_400_000), 40);
    return {
      entries: events.map((event) => ({
        entry_id: event.id,
        kind: event.kind,
        date: localDate(event.occurredAt, ctx.timezone),
        value: event.value,
        unit: event.unit,
        description: event.description,
      })),
    };
  },

  async get_progress(ctx) {
    if (ctx.agent !== "iris") {
      await recordAgentEvent({ sessionId: ctx.sessionId, userId: ctx.userId, agent: ctx.agent, eventType: "delegation", payload: { from: ctx.agent, to: "iris", task: "progress_summary" } });
    }
    const insights = await loadInsights(ctx.userId, ctx.timezone, 4);
    return {
      prepared_by: "Iris",
      weeks: insights.weeks.map((week) => ({
        week_of: week.weekStart,
        done: week.totals.done,
        not_done: week.totals.notDone,
        postponed: week.totals.postponed,
        still_planned: week.totals.planned,
        counted: week.counted.map((goal) => `${goal.title}: ${goal.done}/${goal.target} this ${goal.period}`),
      })),
      patterns_to_ask_about_not_conclusions: insights.hypotheses.map((s) => s.text),
      recent_plan_changes: insights.planChanges.slice(0, 5).map((change) => change.text),
    };
  },

  async propose_plan_adjustment(ctx, input) {
    if (!UUID.test(input.goal_id)) return { error: "Unknown goal. Call get_goals first." };
    const change: Partial<GoalInput> = {};
    if (input.title !== null) change.title = input.title;
    if (input.category !== null) change.category = input.category;
    if (input.cadence !== null) change.cadence = input.cadence;
    if (input.target_count !== null) change.targetCount = input.target_count;
    if (input.days_of_week !== null) change.daysOfWeek = input.days_of_week;
    if (input.times !== null) change.times = input.times;
    if (input.duration_minutes !== null) change.durationMinutes = input.duration_minutes;
    try {
      const { proposalId, summary } = await proposeGoalChange(ctx.userId, input.goal_id, change, { requestedByAgent: ctx.agent, sessionId: ctx.sessionId, reason: input.reason_in_their_words });
      const confirmationId = await proposeAction(ctx, { kind: "plan.adjust", payload: { proposalId } }, summary);
      return { confirmation_id: confirmationId, summary, prepared_by: "Theo", next_step: ASK };
    } catch (error) {
      if (error instanceof PlanError) return { error: error.message };
      throw error;
    }
  },

  async save_wellbeing_note(ctx, input) {
    try {
      await saveWellbeingNote(ctx.userId, input.note);
      return { saved: true, note: "Kept privately for 30 days. Not shared with anyone." };
    } catch (error) {
      if (error instanceof WellbeingNoteError) return { error: error.message };
      throw error;
    }
  },

  async get_wellbeing_notes(ctx) {
    const notes = await listWellbeingNotes(ctx.userId);
    return { notes: notes.slice(0, 10).map((note) => ({ date: localDate(note.createdAt, ctx.timezone), note: note.content })) };
  },

  async get_call_preferences(ctx) {
    const settings = await getCallSettings(ctx.userId);
    return {
      phone_calls: settings?.callsEnabled ? (settings.pausedAt ? "paused" : "on") : "off",
      quiet_hours:
        settings?.quietHoursStart && settings.quietHoursEnd
          ? `${formatTime12h(settings.quietHoursStart)} to ${formatTime12h(settings.quietHoursEnd)}`
          : null,
      max_calls_per_day: settings?.maxCallsPerDay ?? null,
    };
  },

  async trigger_safety_response(_ctx, input) {
    return { say_exactly: SAFETY_MESSAGES[input.category], then: "Stay calm and supportive. Do not continue routine coaching." };
  },
};
