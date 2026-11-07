import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { countProgress } from "@/lib/goals/schedule";
import { loadSessions } from "@/lib/goals/service";
import { addDays, localDate, weekStartOf, zonedTimeToUtc } from "@/lib/time";
import type { PlanRecord } from "@/lib/plans/service";
import { computeInsights, type PlanChange } from "./iris";

function describeRecord(record: Partial<PlanRecord>) {
  if (record.kind === "change") return `“${record.beforeTitle}”: ${record.summary}`;
  return record.summary ?? "Plan changed";
}

/** Loads a user's records and computes Iris insights for the last `weeks` weeks, including this one. */
export async function loadInsights(userId: string, timezone: string, weeks = 4, audience: "patient" | "clinician" = "patient") {
  const today = localDate(new Date(), timezone);
  const from = addDays(weekStartOf(today), -7 * (weeks - 1));
  const to = addDays(weekStartOf(today), 6);
  const since = zonedTimeToUtc(from, "00:00", timezone);

  const [sessions, events, plans] = await Promise.all([
    loadSessions(userId, from, to, today),
    db
      .select()
      .from(schema.habitEvents)
      .where(and(eq(schema.habitEvents.userId, userId), isNull(schema.habitEvents.supersededAt), gte(schema.habitEvents.occurredAt, since))),
    db
      .select()
      .from(schema.planProposals)
      .where(and(eq(schema.planProposals.userId, userId), eq(schema.planProposals.status, "executed"), gte(schema.planProposals.executedAt, since))),
  ]);

  const sessionIds = [...new Set([...events.map((e) => e.sessionId), ...plans.map((p) => p.sessionId)].filter((id): id is string => Boolean(id)))];
  const conversations = sessionIds.length
    ? await db
        .select({ id: schema.callSessions.id, startedAt: schema.callSessions.startedAt })
        .from(schema.callSessions)
        .where(and(eq(schema.callSessions.userId, userId), inArray(schema.callSessions.id, sessionIds)))
    : [];

  const planChanges: PlanChange[] = plans
    .sort((a, b) => b.executedAt!.getTime() - a.executedAt!.getTime())
    .map((plan) => ({
      id: plan.id,
      summary: describeRecord(plan.proposal as Partial<PlanRecord>),
      executedAt: plan.executedAt!,
      requestedByAgent: plan.requestedByAgent,
      sessionId: plan.sessionId,
      reason: plan.rationale,
    }));

  return computeInsights({
    from,
    to,
    today,
    timezone,
    items: sessions.items,
    counted: (weekStart) => countProgress(sessions.plans, sessions.rows, weekStart),
    events: events.map((event) => ({ ...event, value: event.value === null ? null : Number(event.value) })),
    planChanges,
    conversations: new Map(conversations.map((c) => [c.id, c])),
    audience,
  });
}
