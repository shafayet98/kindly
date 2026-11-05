import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { addDays, localDate, zonedTimeToUtc } from "@/lib/time";
import { computeInsights, weekStartOf } from "./iris";

/** Loads a user's records and computes Iris insights for the last `weeks` whole weeks up to today. */
export async function loadInsights(userId: string, timezone: string, weeks = 4) {
  const today = localDate(new Date(), timezone);
  const from = addDays(weekStartOf(today), -7 * (weeks - 1));
  const since = zonedTimeToUtc(from, "00:00", timezone);

  const [events, goals, plans] = await Promise.all([
    db
      .select()
      .from(schema.habitEvents)
      .where(and(eq(schema.habitEvents.userId, userId), isNull(schema.habitEvents.supersededAt), gte(schema.habitEvents.occurredAt, since))),
    db
      .select({ id: schema.goals.id, title: schema.goals.title, type: schema.goals.type, target: schema.goals.target })
      .from(schema.goals)
      .where(and(eq(schema.goals.userId, userId), inArray(schema.goals.status, ["active", "paused"]))),
    db
      .select({ id: schema.planProposals.id, goalTitle: schema.goals.title, proposal: schema.planProposals.proposal, executedAt: schema.planProposals.executedAt })
      .from(schema.planProposals)
      .innerJoin(schema.goals, eq(schema.goals.id, schema.planProposals.goalId))
      .where(and(eq(schema.planProposals.userId, userId), eq(schema.planProposals.status, "executed"), gte(schema.planProposals.executedAt, since))),
  ]);

  return computeInsights({
    from,
    to: today,
    timezone,
    goals,
    events: events.map((event) => ({ ...event, value: event.value === null ? null : Number(event.value) })),
    planChanges: plans.map((plan) => ({
      id: plan.id,
      goalTitle: plan.goalTitle,
      summary: String((plan.proposal as { summary?: string }).summary ?? "changed"),
      executedAt: plan.executedAt!,
    })),
  });
}
