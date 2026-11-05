import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { SAFETY_MESSAGES } from "@/lib/safety/messages";
import type { ToolContext, ToolHandlers } from "./types";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
        days: row.daysOfWeek.length === 7 ? "every day" : row.daysOfWeek.map((day) => DAY_NAMES[day]).join(", "),
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

  async trigger_safety_response(_ctx, input) {
    return { say_exactly: SAFETY_MESSAGES[input.category], then: "Stay calm and supportive. Do not continue routine coaching." };
  },
};
