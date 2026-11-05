import { and, asc, eq, inArray } from "drizzle-orm";
import { getCallSettings } from "@/lib/calls/settings";
import { db, schema } from "@/lib/db";
import { describeReminder, getOwnedReminder } from "@/lib/reminders/service";
import { formatDays, formatTime12h } from "@/lib/scheduling/occurrences";
import { HabitError, correctHabitEvent, logHabitEvent, recentHabitEvents } from "@/lib/habits/service";
import { loadInsights } from "@/lib/insights/load";
import { createPlanProposal, PlanError } from "@/lib/plans/service";
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
    const rows = await db
      .select({ id: schema.goals.id, title: schema.goals.title, type: schema.goals.type, status: schema.goals.status, target: schema.goals.target })
      .from(schema.goals)
      .where(and(eq(schema.goals.userId, ctx.userId), inArray(schema.goals.status, ["active", "paused"])))
      .orderBy(asc(schema.goals.createdAt));
    return { goals: rows };
  },

  async propose_reminder_change(ctx, input) {
    const reminder = UUID.test(input.reminder_id) ? await getOwnedReminder(ctx.userId, input.reminder_id) : null;
    if (!reminder || reminder.status === "cancelled") return { error: "No such reminder. Call get_reminders to find the right one." };

    if (input.action === "reschedule") {
      if (!input.new_time && !input.days) return { error: "Say what should change: a new time, new days, or both." };
      const after = { ...reminder, localTime: input.new_time ?? reminder.localTime, daysOfWeek: input.days ?? reminder.daysOfWeek };
      const summary = `Move ${describeReminder(reminder)} to ${formatTime12h(after.localTime)}, ${formatDays(after.daysOfWeek).toLowerCase()}.`;
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
    const fields = { title: input.title.trim(), localTime: input.time, daysOfWeek: [...new Set(input.days)].sort(), channel: input.delivery };
    const summary = `Create ${describeReminder(fields)}.`;
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
      goals: insights.goals.map((goal) => ({ goal_id: goal.goalId, title: goal.title, summary: goal.statement.text, weeks: goal.weeks.map((w) => `${w.weekStart}: ${w.count}/${w.target}`) })),
      observations: insights.observations.map((s) => s.text),
      patterns_to_ask_about_not_conclusions: insights.hypotheses.map((s) => s.text),
      missing_data: insights.missingData.map((s) => s.text),
    };
  },

  async propose_plan_adjustment(ctx, input) {
    if (!UUID.test(input.goal_id)) return { error: "Unknown goal. Call get_goals first." };
    const change: { timesPerWeek?: number; minutes?: number; title?: string } = {};
    if (input.times_per_week !== null) change.timesPerWeek = input.times_per_week;
    if (input.minutes !== null) change.minutes = input.minutes;
    if (input.new_title !== null) change.title = input.new_title;
    try {
      const { proposalId, summary } = await createPlanProposal(ctx.userId, input.goal_id, change, `Barrier (patient's words): ${input.barrier_in_their_words}`);
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
