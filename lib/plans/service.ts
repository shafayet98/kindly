import { and, eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";

// Theo: turns an agreed intention into a concrete goal change. A proposal is stored first and
// only applied after the person confirms. Clinician-approved plans are never changed here.

export class PlanError extends Error {}

export type PlanChange = { timesPerWeek?: number; minutes?: number; title?: string };

export function describePlanChange(goal: { title: string; target: Record<string, unknown> }, change: PlanChange) {
  const parts: string[] = [];
  if (change.title && change.title !== goal.title) parts.push(`rename to “${change.title}”`);
  if (change.timesPerWeek !== undefined && change.timesPerWeek !== goal.target.timesPerWeek) parts.push(`${goal.target.timesPerWeek ?? "?"} → ${change.timesPerWeek} times a week`);
  if (change.minutes !== undefined && change.minutes !== goal.target.minutes) parts.push(`${goal.target.minutes ?? "?"} → ${change.minutes} minutes each time`);
  return parts.length ? parts.join(", ") : "no change";
}

export async function createPlanProposal(userId: string, goalId: string, change: PlanChange, rationale: string) {
  const [goal] = await db.select().from(schema.goals).where(and(eq(schema.goals.id, goalId), eq(schema.goals.userId, userId)));
  if (!goal || goal.status === "archived") throw new PlanError("That goal wasn't found.");
  if (goal.approvedBy) throw new PlanError("This goal is part of a clinician-approved plan, so only the clinician can change it.");
  const summary = describePlanChange(goal, change);
  if (summary === "no change") throw new PlanError("That would not change the goal.");
  const [proposal] = await db
    .insert(schema.planProposals)
    .values({ userId, goalId, proposal: { change, summary, before: goal.target, beforeTitle: goal.title }, rationale: rationale.slice(0, 500), proposedByAgent: "theo" })
    .returning({ id: schema.planProposals.id });
  return { proposalId: proposal.id, summary: `“${goal.title}”: ${summary}.` };
}

export async function applyPlanProposal(userId: string, proposalId: string) {
  return db.transaction(async (tx) => {
    const [proposal] = await tx
      .update(schema.planProposals)
      .set({ status: "executed", confirmedAt: new Date(), executedAt: new Date() })
      .where(and(eq(schema.planProposals.id, proposalId), eq(schema.planProposals.userId, userId), eq(schema.planProposals.status, "proposed")))
      .returning();
    if (!proposal?.goalId) throw new PlanError("That plan change wasn't found or was already handled.");
    const change = (proposal.proposal as { change: PlanChange }).change;
    const [goal] = await tx.select().from(schema.goals).where(and(eq(schema.goals.id, proposal.goalId), eq(schema.goals.userId, userId)));
    if (!goal || goal.approvedBy) throw new PlanError("This goal can't be changed here.");
    const target = { ...goal.target };
    if (change.timesPerWeek !== undefined) target.timesPerWeek = change.timesPerWeek;
    if (change.minutes !== undefined) target.minutes = change.minutes;
    const [updated] = await tx
      .update(schema.goals)
      .set({ target, title: change.title ?? goal.title, planVersion: goal.planVersion + 1 })
      .where(eq(schema.goals.id, goal.id))
      .returning();
    await audit({ actorUserId: userId, actorType: "agent", actorLabel: "theo", resourceType: "goal", resourceId: goal.id, action: "plan.adjusted", result: "success", metadata: { proposalId } }, tx);
    return { goal: updated, summary: (proposal.proposal as { summary: string }).summary };
  });
}

export async function rejectPlanProposal(userId: string, proposalId: string) {
  await db
    .update(schema.planProposals)
    .set({ status: "rejected" })
    .where(and(eq(schema.planProposals.id, proposalId), eq(schema.planProposals.userId, userId), eq(schema.planProposals.status, "proposed")));
}
