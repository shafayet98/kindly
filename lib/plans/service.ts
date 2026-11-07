import { and, eq } from "drizzle-orm";
import type { AgentKey } from "@/lib/agents/directory";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import { describeGoal } from "@/lib/goals/describe";
import { createGoal, GoalError, previewGoalChange, updateGoal, type GoalInput } from "@/lib/goals/service";

// Theo: the planning service. Goal additions and changes are stored as proposals and applied only
// after the person confirms. Each record keeps who asked, in which conversation, and why (in the
// person's words), so "Plan changes you approved" can say where a change came from.

export class PlanError extends Error {}

type Origin = { requestedByAgent: AgentKey | null; sessionId: string | null; reason: string | null };

export type PlanRecord = { kind: "create"; goal: GoalInput; summary: string } | { kind: "change"; after: GoalInput; summary: string; beforeTitle: string };

function wrap<T>(fn: () => Promise<T>) {
  return fn().catch((error) => {
    if (error instanceof GoalError) throw new PlanError(error.message);
    throw error;
  });
}

export async function proposeGoalChange(userId: string, goalId: string, change: Partial<GoalInput>, origin: Origin) {
  return wrap(async () => {
    const { goal, after, summary } = await previewGoalChange(userId, goalId, change);
    const record: PlanRecord = { kind: "change", after, summary, beforeTitle: goal.title };
    const [proposal] = await db
      .insert(schema.planProposals)
      .values({ userId, goalId, proposal: record, rationale: origin.reason?.slice(0, 500) ?? null, requestedByAgent: origin.requestedByAgent, sessionId: origin.sessionId })
      .returning({ id: schema.planProposals.id });
    return { proposalId: proposal.id, summary: `“${goal.title}”: ${summary}.` };
  });
}

export async function proposeNewGoal(userId: string, goal: GoalInput, origin: Origin) {
  const summary = `Add ${describeGoal(goal)}`;
  const record: PlanRecord = { kind: "create", goal, summary };
  const [proposal] = await db
    .insert(schema.planProposals)
    .values({ userId, proposal: record, rationale: origin.reason?.slice(0, 500) ?? null, requestedByAgent: origin.requestedByAgent, sessionId: origin.sessionId })
    .returning({ id: schema.planProposals.id });
  return { proposalId: proposal.id, summary: `${summary}.` };
}

/** Applies a confirmed proposal exactly once. */
export async function applyPlanProposal(userId: string, proposalId: string, sessionId: string | null) {
  const [claimed] = await db
    .update(schema.planProposals)
    .set({ status: "executed", confirmedAt: new Date(), executedAt: new Date() })
    .where(and(eq(schema.planProposals.id, proposalId), eq(schema.planProposals.userId, userId), eq(schema.planProposals.status, "proposed")))
    .returning();
  if (!claimed) throw new PlanError("That plan change wasn't found or was already handled.");
  const record = claimed.proposal as PlanRecord;
  const actor = { type: "agent" as const, agent: "theo" as const, sessionId };
  try {
    if (record.kind === "create") {
      const goal = await createGoal(userId, record.goal, { ...actor, agent: claimed.requestedByAgent ?? "theo" });
      await db.update(schema.planProposals).set({ goalId: goal.id }).where(eq(schema.planProposals.id, proposalId));
      return { goal, summary: record.summary };
    }
    const { after } = await updateGoal(userId, claimed.goalId!, record.after, actor);
    await audit({ actorUserId: userId, actorType: "agent", actorLabel: "theo", resourceType: "goal", resourceId: after.id, action: "plan.adjusted", result: "success", metadata: { proposalId } });
    return { goal: after, summary: `“${record.beforeTitle}”: ${record.summary}` };
  } catch (error) {
    await db.update(schema.planProposals).set({ status: "proposed", confirmedAt: null, executedAt: null }).where(eq(schema.planProposals.id, proposalId));
    if (error instanceof GoalError) throw new PlanError(error.message);
    throw error;
  }
}

export async function rejectPlanProposal(userId: string, proposalId: string) {
  await db
    .update(schema.planProposals)
    .set({ status: "rejected" })
    .where(and(eq(schema.planProposals.id, proposalId), eq(schema.planProposals.userId, userId), eq(schema.planProposals.status, "proposed")));
}

/** Records a change the person made themselves in the app (already confirmed by the form). */
export async function recordAppChange(userId: string, goalId: string, record: PlanRecord) {
  await db.insert(schema.planProposals).values({
    userId,
    goalId,
    proposal: record,
    status: "executed",
    confirmedAt: new Date(),
    executedAt: new Date(),
    proposedByAgent: "theo",
    requestedByAgent: null,
  });
}
