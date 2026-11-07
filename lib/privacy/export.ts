import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/** Everything Kindly stores about one person, for export (and to show what's remembered). */
export async function exportUserData(userId: string) {
  const byUser = <T extends { userId: unknown }>(table: T) => eq(table.userId as never, userId);
  const [user] = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName, timezone: schema.users.timezone, preferredLanguage: schema.users.preferredLanguage, phoneE164: schema.users.phoneE164, createdAt: schema.users.createdAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  const [goalSessions, conversationSummaries] = await Promise.all([
    db.select().from(schema.goalSessions).where(byUser(schema.goalSessions)),
    db.select().from(schema.conversationSummaries).where(byUser(schema.conversationSummaries)),
  ]);
  const [profile, consents, goals, habitEvents, reminders, callPreferences, callJobs, callSessions, agentEvents, wellbeingNotes, planProposals, reports] =
    await Promise.all([
      db.select().from(schema.patientProfiles).where(byUser(schema.patientProfiles)),
      db.select().from(schema.consents).where(byUser(schema.consents)),
      db.select().from(schema.goals).where(byUser(schema.goals)),
      db.select().from(schema.habitEvents).where(byUser(schema.habitEvents)),
      db.select().from(schema.reminders).where(byUser(schema.reminders)),
      db.select().from(schema.callPreferences).where(byUser(schema.callPreferences)),
      db
        .select({ id: schema.callJobs.id, kind: schema.callJobs.kind, dueAt: schema.callJobs.dueAt, status: schema.callJobs.status, attempts: schema.callJobs.attempts })
        .from(schema.callJobs)
        .where(byUser(schema.callJobs)),
      db
        .select({ id: schema.callSessions.id, channel: schema.callSessions.channel, activeAgent: schema.callSessions.activeAgent, startedAt: schema.callSessions.startedAt, endedAt: schema.callSessions.endedAt })
        .from(schema.callSessions)
        .where(byUser(schema.callSessions)),
      db.select().from(schema.agentEvents).where(byUser(schema.agentEvents)),
      db.select().from(schema.wellbeingNotes).where(byUser(schema.wellbeingNotes)),
      db.select().from(schema.planProposals).where(byUser(schema.planProposals)),
      db.select().from(schema.reports).where(eq(schema.reports.patientId, userId)),
    ]);
  const reportShares = reports.length
    ? await db.select().from(schema.reportShares).where(inArray(schema.reportShares.reportId, reports.map((report) => report.id)))
    : [];
  return {
    exportedAt: new Date().toISOString(),
    note: "Kindly never stores call audio or transcripts. Conversation summaries are only kept if you turned them on.",
    user,
    profile,
    consents,
    goals,
    goalSessions,
    conversationSummaries,
    habitEvents,
    reminders,
    callPreferences,
    callJobs,
    callSessions,
    agentEvents,
    wellbeingNotes,
    planProposals,
    reports,
    reportShares,
  };
}
