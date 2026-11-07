import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAgentEvent } from "@/lib/voice/sessions";
import {
  createReminder,
  describeReminder,
  ReminderError,
  rescheduleReminder,
  setReminderStatus,
  type ReminderFields,
} from "@/lib/reminders/service";
import { applyPlanProposal, PlanError, rejectPlanProposal } from "@/lib/plans/service";
import { GoalError, postponeSession } from "@/lib/goals/service";
import type { ToolContext } from "./tools/types";

const CONFIRMATION_TTL_MS = 10 * 60_000;

type Action =
  | { kind: "reminder.reschedule"; payload: { reminderId: string; localTime?: string; daysOfWeek?: number[] } }
  | { kind: "reminder.status"; payload: { reminderId: string; status: "active" | "paused" | "cancelled" } }
  | { kind: "reminder.create"; payload: ReminderFields }
  | { kind: "plan.adjust"; payload: { proposalId: string } }
  | { kind: "session.postpone"; payload: { goalId: string; date: string; slotTime: string; toDate: string; toTime: string | null } };

/** Stores a proposed high-impact action. Nothing changes until it is confirmed. */
export async function proposeAction(ctx: ToolContext, action: Action, summary: string) {
  const [row] = await db
    .insert(schema.actionConfirmations)
    .values({
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      proposedBy: ctx.agent,
      kind: action.kind,
      payload: action.payload,
      summary,
      expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS),
    })
    .returning({ id: schema.actionConfirmations.id });
  // Reminder work belongs to Milo and plan changes to Theo. When another companion asks, record
  // it as a delegation.
  const owner = action.kind.startsWith("plan.") ? "theo" : "milo";
  if (ctx.agent !== owner) {
    await recordAgentEvent({
      sessionId: ctx.sessionId,
      userId: ctx.userId,
      agent: ctx.agent,
      eventType: "delegation",
      payload: { from: ctx.agent, to: owner, task: action.kind, confirmationId: row.id },
    });
  }
  return row.id;
}

/**
 * Runs a confirmed action exactly once. The claim is a single conditional UPDATE, so a repeated or
 * concurrent confirmation can never apply the change twice (AC-04, AC-39).
 */
export async function executeAction(ctx: ToolContext, confirmationId: string) {
  const [claimed] = await db
    .update(schema.actionConfirmations)
    .set({ status: "executed", executedAt: new Date() })
    .where(
      and(
        eq(schema.actionConfirmations.id, confirmationId),
        eq(schema.actionConfirmations.userId, ctx.userId),
        eq(schema.actionConfirmations.status, "pending"),
        gt(schema.actionConfirmations.expiresAt, new Date()),
        ctx.sessionId ? or(eq(schema.actionConfirmations.sessionId, ctx.sessionId), isNull(schema.actionConfirmations.sessionId)) : isNull(schema.actionConfirmations.sessionId),
      ),
    )
    .returning();
  if (!claimed) return { ok: false as const, error: "That change has already been made, has expired, or wasn't found. Nothing new was changed." };

  const action = { kind: claimed.kind, payload: claimed.payload } as Action;
  try {
    const milo = { type: "agent" as const, agent: "milo" as const, sessionId: ctx.sessionId };
    let summary: string;
    let nextDue: Date | null;
    switch (action.kind) {
      case "reminder.reschedule": {
        const result = await rescheduleReminder(ctx.userId, action.payload.reminderId, action.payload, milo);
        summary = `Saved: ${describeReminder(result.after)}.`;
        nextDue = result.nextDue;
        break;
      }
      case "reminder.status": {
        const result = await setReminderStatus(ctx.userId, action.payload.reminderId, action.payload.status, milo);
        summary = `Saved: “${result.after.title}” is now ${action.payload.status}.`;
        nextDue = result.nextDue;
        break;
      }
      case "reminder.create": {
        const result = await createReminder(ctx.userId, action.payload, milo);
        summary = `Saved: ${describeReminder(result.reminder)}.`;
        nextDue = result.nextDue;
        break;
      }
      case "session.postpone": {
        const { goalId, date, slotTime, toDate, toTime } = action.payload;
        await postponeSession(ctx.userId, { goalId, date, slotTime }, { date: toDate, time: toTime }, { type: "agent", agent: "milo", sessionId: ctx.sessionId });
        summary = `Saved: ${claimed.summary}`;
        nextDue = null;
        break;
      }
      case "plan.adjust": {
        const result = await applyPlanProposal(ctx.userId, action.payload.proposalId, ctx.sessionId);
        summary = `Saved: ${result.summary}`;
        nextDue = null;
        break;
      }
    }
    const executor = action.kind.startsWith("plan.") ? "theo" : "milo";
    await recordAgentEvent({ sessionId: ctx.sessionId, userId: ctx.userId, agent: executor, eventType: "action_executed", payload: { kind: action.kind, confirmationId, requestedBy: ctx.agent } });
    return { ok: true as const, summary, nextDue };
  } catch (error) {
    // Release the claim so the person can try again; nothing was saved.
    await db.update(schema.actionConfirmations).set({ status: "pending", executedAt: null }).where(eq(schema.actionConfirmations.id, confirmationId));
    if (error instanceof ReminderError || error instanceof PlanError || error instanceof GoalError) return { ok: false as const, error: error.message };
    throw error;
  }
}

/** The person said no. Records the decision so it can't be confirmed later. */
export async function declineAction(ctx: ToolContext, confirmationId: string) {
  const [declined] = await db
    .update(schema.actionConfirmations)
    .set({ status: "rejected" })
    .where(and(eq(schema.actionConfirmations.id, confirmationId), eq(schema.actionConfirmations.userId, ctx.userId), eq(schema.actionConfirmations.status, "pending")))
    .returning({ kind: schema.actionConfirmations.kind, payload: schema.actionConfirmations.payload });
  if (declined?.kind === "plan.adjust") await rejectPlanProposal(ctx.userId, String(declined.payload.proposalId));
  return Boolean(declined);
}
