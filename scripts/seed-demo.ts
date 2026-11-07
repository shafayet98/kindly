// Recreates the fictional demo accounts and 5 weeks of synthetic history. Safe to re-run.
// Usage: pnpm demo:reset
import "./load-env";
import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { scheduleNextJob } from "@/lib/scheduling/jobs";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addDays, dayOfWeek, localDate, weekStartOf, zonedTimeToUtc } from "@/lib/time";

const TZ = "Australia/Adelaide";

export const DEMO_ACCOUNTS = {
  alex: { email: "demo.patient@example.com", name: "Alex Rivera" },
  priya: { email: "demo.patient2@example.com", name: "Priya Shah" },
  clinician: { email: "demo.clinician@example.com", name: "Dr Sam Taylor" },
} as const;

// Deterministic pseudo-random numbers, so the demo history is identical on every reset.
function seededRandom(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function demoPassword() {
  if (process.env.DEMO_PASSWORD) return process.env.DEMO_PASSWORD;
  const password = `Kindly-${randomBytes(9).toString("base64url")}1`;
  appendFileSync(".env", `\n# Shared password for the fictional demo accounts (pnpm demo:reset)\nDEMO_PASSWORD=${password}\n`);
  console.log("Generated DEMO_PASSWORD and saved it to .env");
  return password;
}

async function main() {
  const admin = createSupabaseAdminClient();
  const password = demoPassword();
  const emails = Object.values(DEMO_ACCOUNTS).map((account) => account.email);

  // Remove previous demo identities; app rows cascade from auth.users.
  const existing = await db.execute<{ id: string }>(sql`select id from auth.users where lower(email) in ${emails}`);
  for (const row of existing) {
    const { error } = await admin.auth.admin.deleteUser(row.id);
    if (error) throw new Error(`Could not remove previous demo account ${row.id}: ${error.message}`);
  }
  await db.delete(schema.clinicianInvitations).where(sql`lower(${schema.clinicianInvitations.invitedEmail}) in ${emails}`);

  const ids: Record<keyof typeof DEMO_ACCOUNTS, string> = { alex: "", priya: "", clinician: "" };
  for (const [key, account] of Object.entries(DEMO_ACCOUNTS) as [keyof typeof DEMO_ACCOUNTS, (typeof DEMO_ACCOUNTS)[keyof typeof DEMO_ACCOUNTS]][]) {
    const { data, error } = await admin.auth.admin.createUser({ email: account.email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`Could not create ${account.email}: ${error?.message}`);
    const [user] = await db
      .insert(schema.users)
      .values({ authUserId: data.user.id, displayName: account.name, timezone: TZ })
      .returning({ id: schema.users.id });
    ids[key] = user.id;
  }

  const now = new Date();
  const today = localDate(now, TZ);
  const thisWeek = weekStartOf(today);
  const stressWeek = addDays(thisWeek, -14); // the week the evening shifts changed
  const lastWeek = addDays(thisWeek, -7);
  const firstDay = addDays(thisWeek, -28);
  const random = seededRandom(42);
  const pastDays = (from: string) => {
    const days: string[] = [];
    for (let date = from; date < today; date = addDays(date, 1)) days.push(date);
    return days;
  };
  const sessionRows: (typeof schema.goalSessions.$inferInsert)[] = [];
  const done = (userId: string, goalId: string, date: string, slotTime: string, extra: Partial<typeof schema.goalSessions.$inferInsert> = {}) =>
    sessionRows.push({ userId, goalId, scheduledDate: date, slotTime, status: "done", completedAt: zonedTimeToUtc(date, slotTime.includes(":") && !slotTime.startsWith("extra") ? slotTime : "18:00", TZ), ...extra });

  // --- Alex: walks, bedtime, tablets, push-ups and a monthly recipe goal, with a stressful week.
  await db.update(schema.users).set({ countryCode: "AU", timezoneSource: "location" }).where(sql`${schema.users.id} = ${ids.alex}`);
  await db.insert(schema.patientProfiles).values({ userId: ids.alex, nickname: "Alex", onboardingStep: null, onboardingCompletedAt: now });
  const consentRows = await db
    .insert(schema.consents)
    .values((["health_data_processing", "browser_voice", "outbound_calls", "conversation_summaries"] as const).map((purpose) => ({ userId: ids.alex, purpose })))
    .returning({ id: schema.consents.id, purpose: schema.consents.purpose });
  await db.insert(schema.callPreferences).values({ userId: ids.alex, callsEnabled: true, maxCallsPerDay: 3 });
  if (process.env.DEMO_CALL_TO_NUMBER) {
    await db.update(schema.users).set({ phoneE164: process.env.DEMO_CALL_TO_NUMBER, phoneConfirmedAt: now }).where(sql`${schema.users.id} = ${ids.alex}`);
  }

  // Two past conversations, so progress can say where things came from.
  const talkWed = addDays(stressWeek, 2);
  const talkSun = addDays(stressWeek, 6);
  const [wednesdayTalk] = await db
    .insert(schema.callSessions)
    .values({ userId: ids.alex, channel: "browser", activeAgent: "natalie", state: "ended", startedAt: zonedTimeToUtc(talkWed, "19:00", TZ), endedAt: zonedTimeToUtc(talkWed, "19:06", TZ) })
    .returning({ id: schema.callSessions.id });
  const [sundayTalk] = await db
    .insert(schema.callSessions)
    .values({ userId: ids.alex, channel: "phone", activeAgent: "natalie", state: "ended", startedAt: zonedTimeToUtc(talkSun, "14:00", TZ), endedAt: zonedTimeToUtc(talkSun, "14:09", TZ) })
    .returning({ id: schema.callSessions.id });
  const event = (sessionId: string, date: string, time: string, agent: "natalie" | "milo" | "theo", eventType: string, payload: Record<string, unknown> = {}) => ({
    sessionId,
    userId: ids.alex,
    agent,
    eventType,
    structuredPayload: payload,
    at: zonedTimeToUtc(date, time, TZ),
  });
  await db.insert(schema.agentEvents).values([
    event(wednesdayTalk.id, talkWed, "19:00", "natalie", "session_started", { channel: "browser" }),
    event(wednesdayTalk.id, talkWed, "19:03", "natalie", "tool_call", { tool: "log_habit", ok: true }),
    event(wednesdayTalk.id, talkWed, "19:06", "natalie", "session_ended"),
    event(sundayTalk.id, talkSun, "14:00", "milo", "session_started", { channel: "phone" }),
    event(sundayTalk.id, talkSun, "14:01", "natalie", "handoff", { from: "milo", to: "natalie", via: "voice" }),
    event(sundayTalk.id, talkSun, "14:05", "natalie", "delegation", { from: "natalie", to: "theo", task: "plan.adjust" }),
    event(sundayTalk.id, talkSun, "14:06", "theo", "action_executed", { kind: "plan.adjust", requestedBy: "natalie" }),
    event(sundayTalk.id, talkSun, "14:09", "natalie", "session_ended"),
  ]);
  await db.insert(schema.conversationSummaries).values([
    {
      userId: ids.alex,
      sessionId: wednesdayTalk.id,
      summary: "- You told Natalie you were stressed after your roster changed and skipped your walk.\n- Natalie saved how you were feeling as a check-in.",
    },
    {
      userId: ids.alex,
      sessionId: sundayTalk.id,
      summary: "- Milo called and you asked for Natalie.\n- You said the new evening shifts leave you wiped out.\n- You agreed to shorter walks: 20 minutes instead of 30.",
    },
  ]);

  const goal = (values: Omit<typeof schema.goals.$inferInsert, "userId" | "startsOn">) =>
    db.insert(schema.goals).values({ userId: ids.alex, startsOn: firstDay, ...values }).returning({ id: schema.goals.id }).then(([row]) => row.id);
  const walkId = await goal({ title: "Morning walk", category: "walk", cadence: "weekly", targetCount: 3, daysOfWeek: [1, 3, 5], times: ["08:00"], durationMinutes: 20, planVersion: 2 });
  const bedId = await goal({ title: "In bed by 10:30 on weeknights", category: "sleep", cadence: "daily", targetCount: 1, daysOfWeek: [1, 2, 3, 4, 5], times: ["22:30"] });
  const tabletId = await goal({ title: "Take blood pressure tablet", category: "medication", cadence: "daily", targetCount: 1, daysOfWeek: null, times: ["08:00"], notes: "As prescribed by my GP" });
  const pushupsId = await goal({ title: "30 push-ups", category: "workout", cadence: "weekly", targetCount: 2, daysOfWeek: null, times: [], createdByAgent: "natalie", createdInSessionId: sundayTalk.id });
  const recipeId = await goal({ title: "Try a new healthy recipe", category: "food_drink", cadence: "monthly", targetCount: 2, daysOfWeek: null, times: [] });

  await db.insert(schema.planProposals).values({
    userId: ids.alex,
    goalId: walkId,
    proposal: { kind: "change", summary: "30 min → 20 min", beforeTitle: "Morning walk", after: {} },
    rationale: "my evening shifts changed and I'm wiped out",
    requestedByAgent: "natalie",
    sessionId: sundayTalk.id,
    status: "executed",
    confirmedAt: zonedTimeToUtc(talkSun, "14:06", TZ),
    executedAt: zonedTimeToUtc(talkSun, "14:06", TZ),
    createdAt: zonedTimeToUtc(talkSun, "14:05", TZ),
  });

  const [walkReminder] = await db
    .insert(schema.reminders)
    .values({ userId: ids.alex, goalId: walkId, title: "Morning walk", localTime: "08:00", daysOfWeek: [1, 3, 5], timezone: TZ, channel: "phone" })
    .returning({ id: schema.reminders.id });
  await db.insert(schema.reminders).values({ userId: ids.alex, goalId: tabletId, title: "Take blood pressure tablet", localTime: "08:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timezone: TZ, channel: "in_app" });
  await scheduleNextJob(walkReminder.id);

  for (const date of pastDays(firstDay)) {
    const weekday = dayOfWeek(date);
    const inStressWeek = date >= stressWeek && date < lastWeek;
    // Walks: missed on Mon and Wed of the stressful week; last Wednesday's moved to Thursday evening.
    if ([1, 3, 5].includes(weekday)) {
      const minutes = date < talkSun ? "30" : "20";
      if (inStressWeek && weekday !== 5) {
        // not done
      } else if (date === addDays(lastWeek, 2)) {
        sessionRows.push({ userId: ids.alex, goalId: walkId, scheduledDate: date, slotTime: "08:00", status: "postponed", movedToDate: addDays(date, 1), movedToTime: "17:00", recordedByAgent: "milo" });
        done(ids.alex, walkId, addDays(date, 1), "17:00", { movedFromDate: date, movedFromTime: "08:00", value: minutes, unit: "minutes" });
      } else if (random() < 0.9) {
        done(ids.alex, walkId, date, "08:00", { value: minutes, unit: "minutes" });
      }
    }
    if (weekday >= 1 && weekday <= 5 && random() < (inStressWeek ? 0.3 : 0.75)) done(ids.alex, bedId, date, "22:30");
    if (random() < 0.95) done(ids.alex, tabletId, date, "08:00");
  }
  for (let week = firstDay; week <= thisWeek; week = addDays(week, 7)) {
    const count = week === stressWeek ? 0 : 1 + Math.round(random());
    for (let n = 1; n <= count; n++) {
      const date = addDays(week, 1 + n * 2);
      if (date < today) done(ids.alex, pushupsId, date, `extra:${n}`, { value: "30", unit: "reps" });
    }
  }
  const monthStart = `${today.slice(0, 7)}-01`;
  if (addDays(monthStart, 2) < today) done(ids.alex, recipeId, addDays(monthStart, 2), "extra:1", { note: "Lentil soup" });
  done(ids.alex, recipeId, addDays(monthStart, -10), "extra:1");
  done(ids.alex, recipeId, addDays(monthStart, -20), "extra:1");

  // Check-ins that aren't goals: sleep estimates, and how Alex felt in the stressful week.
  const habitRows: (typeof schema.habitEvents.$inferInsert)[] = [];
  for (const date of pastDays(firstDay)) {
    const weekday = dayOfWeek(date);
    if (weekday < 1 || weekday > 5) continue;
    const inStressWeek = date >= stressWeek && date < lastWeek;
    const hours = inStressWeek ? 5 + random() * 1.2 : 6.5 + random() * 1.5;
    habitRows.push({ userId: ids.alex, kind: "sleep", value: hours.toFixed(1), unit: "hours", occurredAt: zonedTimeToUtc(date, "07:00", TZ), certainty: "low" });
  }
  habitRows.push({
    userId: ids.alex,
    kind: "mood",
    description: "Stressed after the roster change; skipped the walk",
    occurredAt: zonedTimeToUtc(talkWed, "19:03", TZ),
    recordedByAgent: "natalie",
    sessionId: wednesdayTalk.id,
  });
  const inserted = await db.insert(schema.habitEvents).values(habitRows).returning({ id: schema.habitEvents.id, kind: schema.habitEvents.kind, occurredAt: schema.habitEvents.occurredAt });
  // A corrected entry: "Actually I slept 6.5 hours, not 6."
  const lastSleep = inserted.filter((row) => row.kind === "sleep").at(-1)!;
  await db.update(schema.habitEvents).set({ value: "6.0", supersededAt: now }).where(sql`${schema.habitEvents.id} = ${lastSleep.id}`);
  await db.insert(schema.habitEvents).values({ userId: ids.alex, kind: "sleep", value: "6.5", unit: "hours", occurredAt: lastSleep.occurredAt, correctedFrom: lastSleep.id, certainty: "high" });

  // --- Priya: cutting down smoking, no phone calls.
  await db.update(schema.users).set({ countryCode: "AU", timezoneSource: "device" }).where(sql`${schema.users.id} = ${ids.priya}`);
  await db.insert(schema.patientProfiles).values({ userId: ids.priya, nickname: "Priya", onboardingStep: null, onboardingCompletedAt: now });
  await db.insert(schema.consents).values({ userId: ids.priya, purpose: "health_data_processing" });
  await db.insert(schema.callPreferences).values({ userId: ids.priya });
  const [smokeGoal] = await db
    .insert(schema.goals)
    .values({ userId: ids.priya, title: "No more than 5 cigarettes a day", category: "smoking", cadence: "daily", targetCount: 1, daysOfWeek: null, times: [], startsOn: firstDay })
    .returning({ id: schema.goals.id });
  const priyaRows: (typeof schema.habitEvents.$inferInsert)[] = [];
  pastDays(firstDay).forEach((date, index) => {
    if (random() < 0.2) return; // days without a report stay unknown
    const count = Math.max(3, 11 - Math.floor(index / 4)) + Math.round(random() * 2);
    priyaRows.push({ userId: ids.priya, kind: "smoking", value: String(count), unit: "cigarettes", occurredAt: zonedTimeToUtc(date, "21:00", TZ), recordedByAgent: "natalie" });
    if (count <= 5) done(ids.priya, smokeGoal.id, date, "", { value: String(count), unit: "cigarettes" });
  });
  await db.insert(schema.habitEvents).values(priyaRows);
  await db.insert(schema.goalSessions).values(sessionRows);

  // --- Fictional clinician: invited, approved, assigned to Alex. Sees nothing until Alex shares a report.
  await db.update(schema.users).set({ role: "clinician" }).where(sql`${schema.users.id} = ${ids.clinician}`);
  await db.insert(schema.clinicianInvitations).values({
    invitedEmail: DEMO_ACCOUNTS.clinician.email,
    status: "approved",
    approvedBy: "seed-script (fictional demo clinician)",
    credentialVerifiedAt: now,
    approvedAt: now,
    expiresAt: new Date(now.getTime() + 365 * 86_400_000),
    acceptedUserId: ids.clinician,
  });
  await db.insert(schema.clinicianRelationships).values({ patientId: ids.alex, clinicianId: ids.clinician, status: "active" });

  console.log(`Seeded ${sessionRows.length} goal sessions, ${habitRows.length + priyaRows.length + 1} check-ins, consents for: ${consentRows.map((row) => row.purpose).join(", ")}`);
  console.log("Demo accounts (password is DEMO_PASSWORD in .env):");
  for (const account of Object.values(DEMO_ACCOUNTS)) console.log(`  ${account.email}  (${account.name})`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
