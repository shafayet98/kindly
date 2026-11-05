import { and, asc, eq, inArray } from "drizzle-orm";
import { getCallSettings } from "@/lib/calls/settings";
import { db, schema } from "@/lib/db";
import { describeReminder, getOwnedReminder } from "@/lib/reminders/service";
import { formatDays, formatTime12h } from "@/lib/scheduling/occurrences";
import { executeAction, proposeAction } from "../confirmations";
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
