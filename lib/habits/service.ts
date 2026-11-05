import { and, desc, eq, gte, isNull } from "drizzle-orm";
import type { AgentKey } from "@/lib/agents/directory";
import { audit } from "@/lib/audit";
import { getConsentState } from "@/lib/consent/store";
import { db, schema } from "@/lib/db";

// Patient-reported habit records. A report is never treated as a measurement: values are only
// stored when the person gave one, and corrections create a new row linked to the original.

export type HabitKind = (typeof schema.habitKind.enumValues)[number];
export type HabitInput = {
  kind: HabitKind;
  value: number | null;
  unit: string | null;
  description: string | null;
  occurredAt: Date;
  certainty: "low" | "medium" | "high";
  goalId?: string | null;
};
export type Recorder = { type: "patient" } | { type: "agent"; agent: AgentKey };

export class HabitError extends Error {}

export async function assertHealthDataConsent(userId: string) {
  const consents = await getConsentState(userId);
  if (!consents.health_data_processing) {
    throw new HabitError("Saving habit check-ins needs permission first. The person can turn it on in Settings → Privacy & data.");
  }
}

export async function logHabitEvent(userId: string, input: HabitInput, recorder: Recorder) {
  await assertHealthDataConsent(userId);
  if (input.goalId) {
    const [goal] = await db.select({ id: schema.goals.id }).from(schema.goals).where(and(eq(schema.goals.id, input.goalId), eq(schema.goals.userId, userId)));
    if (!goal) throw new HabitError("That goal wasn't found.");
  }
  const [event] = await db
    .insert(schema.habitEvents)
    .values({
      userId,
      goalId: input.goalId ?? null,
      kind: input.kind,
      value: input.value === null ? null : String(input.value),
      unit: input.unit,
      description: input.description,
      occurredAt: input.occurredAt,
      source: "patient_reported",
      certainty: input.certainty,
      recordedByAgent: recorder.type === "agent" ? recorder.agent : null,
    })
    .returning();
  await audit({
    actorUserId: userId,
    actorType: recorder.type === "agent" ? "agent" : "patient",
    actorLabel: recorder.type === "agent" ? recorder.agent : undefined,
    resourceType: "habit_event",
    resourceId: event.id,
    action: "habit.logged",
    result: "success",
  });
  return event;
}

/** "Actually, 20 minutes, not 30." Supersedes the original and links the correction to it (AC-08). */
export async function correctHabitEvent(
  userId: string,
  eventId: string,
  changes: { value?: number | null; description?: string | null },
  recorder: Recorder,
) {
  await assertHealthDataConsent(userId);
  return db.transaction(async (tx) => {
    const [original] = await tx
      .update(schema.habitEvents)
      .set({ supersededAt: new Date() })
      .where(and(eq(schema.habitEvents.id, eventId), eq(schema.habitEvents.userId, userId), isNull(schema.habitEvents.supersededAt)))
      .returning();
    if (!original) throw new HabitError("That entry wasn't found, or it was already corrected.");
    const [corrected] = await tx
      .insert(schema.habitEvents)
      .values({
        userId,
        goalId: original.goalId,
        kind: original.kind,
        value: changes.value === undefined ? original.value : changes.value === null ? null : String(changes.value),
        unit: original.unit,
        description: changes.description === undefined ? original.description : changes.description,
        occurredAt: original.occurredAt,
        source: "patient_reported",
        certainty: "high",
        recordedByAgent: recorder.type === "agent" ? recorder.agent : null,
        correctedFrom: original.id,
      })
      .returning();
    await audit(
      { actorUserId: userId, actorType: recorder.type === "agent" ? "agent" : "patient", resourceType: "habit_event", resourceId: corrected.id, action: "habit.corrected", result: "success", metadata: { correctedFrom: original.id } },
      tx,
    );
    return { original, corrected };
  });
}

/** Current (not superseded) events since a date, newest first. */
export async function recentHabitEvents(userId: string, since: Date, limit = 200) {
  return db
    .select()
    .from(schema.habitEvents)
    .where(and(eq(schema.habitEvents.userId, userId), isNull(schema.habitEvents.supersededAt), gte(schema.habitEvents.occurredAt, since)))
    .orderBy(desc(schema.habitEvents.occurredAt))
    .limit(limit);
}
