// Recreates the fictional demo accounts and 5 weeks of synthetic history. Safe to re-run.
// Usage: pnpm demo:reset
import "./load-env";
import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { scheduleNextJob } from "@/lib/scheduling/jobs";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addDays, dayOfWeek, localDate, zonedTimeToUtc } from "@/lib/time";

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

  // --- Alex: walking goal, morning reminder, 5 weeks of check-ins with a work-stress dip.
  await db.insert(schema.patientProfiles).values({ userId: ids.alex, nickname: "Alex", onboardingStep: null, onboardingCompletedAt: now });
  await db.insert(schema.userFocusAreas).values(
    (["health_habits", "daily_planning", "emotional_wellbeing"] as const).map((areaKey) => ({ userId: ids.alex, areaKey })),
  );
  const consentRows = await db
    .insert(schema.consents)
    .values(
      (["health_data_processing", "browser_voice", "outbound_calls"] as const).map((purpose) => ({ userId: ids.alex, purpose })),
    )
    .returning({ id: schema.consents.id, purpose: schema.consents.purpose });
  await db.insert(schema.callPreferences).values({ userId: ids.alex, callsEnabled: true, maxCallsPerDay: 3 });
  if (process.env.DEMO_CALL_TO_NUMBER) {
    await db.update(schema.users).set({ phoneE164: process.env.DEMO_CALL_TO_NUMBER, phoneConfirmedAt: now }).where(sql`${schema.users.id} = ${ids.alex}`);
  }

  const [walkGoal] = await db
    .insert(schema.goals)
    .values({ userId: ids.alex, type: "activity", title: "Walk three times a week", target: { timesPerWeek: 3, minutes: 20 } })
    .returning({ id: schema.goals.id });
  await db.insert(schema.goals).values({ userId: ids.alex, type: "sleep", title: "In bed by 10:30 on weeknights", target: { nightsPerWeek: 5 } });
  const [walkReminder] = await db.insert(schema.reminders).values({
    userId: ids.alex,
    goalId: walkGoal.id,
    title: "Morning walk",
    localTime: "08:00",
    daysOfWeek: [1, 3, 5],
    timezone: TZ,
    channel: "phone",
  }).returning({ id: schema.reminders.id });
  await scheduleNextJob(walkReminder.id);

  const random = seededRandom(42);
  const habitRows: (typeof schema.habitEvents.$inferInsert)[] = [];
  for (let offset = -35; offset < 0; offset++) {
    const date = addDays(today, offset);
    const weekday = dayOfWeek(date);
    const stressWeek = offset >= -14 && offset < -7; // evening shift change two weeks ago
    if ([1, 3, 5].includes(weekday) && !(stressWeek && weekday !== 5)) {
      habitRows.push({
        userId: ids.alex,
        goalId: walkGoal.id,
        kind: "activity",
        value: String(15 + Math.round(random() * 3) * 5),
        unit: "minutes",
        description: "walk",
        occurredAt: zonedTimeToUtc(date, "08:10", TZ),
        recordedByAgent: "natalie",
      });
    }
    if (weekday >= 1 && weekday <= 5) {
      const hours = stressWeek ? 5 + random() * 1.5 : 6.5 + random() * 1.5;
      habitRows.push({
        userId: ids.alex,
        kind: "sleep",
        value: hours.toFixed(1),
        unit: "hours",
        occurredAt: zonedTimeToUtc(date, "07:00", TZ),
        certainty: "low",
        recordedByAgent: "natalie",
      });
    }
    if (stressWeek && weekday === 3) {
      habitRows.push({
        userId: ids.alex,
        kind: "mood",
        description: "Stressed after the roster change; skipped the walk.",
        occurredAt: zonedTimeToUtc(date, "19:00", TZ),
        recordedByAgent: "natalie",
      });
    }
  }
  const inserted = await db.insert(schema.habitEvents).values(habitRows).returning({ id: schema.habitEvents.id, kind: schema.habitEvents.kind, occurredAt: schema.habitEvents.occurredAt });

  // A corrected entry: "Actually it was 20 minutes, not 30."
  const lastWalk = inserted.filter((row) => row.kind === "activity").at(-1)!;
  await db.update(schema.habitEvents).set({ value: "30", supersededAt: now }).where(sql`${schema.habitEvents.id} = ${lastWalk.id}`);
  await db.insert(schema.habitEvents).values({
    userId: ids.alex,
    goalId: walkGoal.id,
    kind: "activity",
    value: "20",
    unit: "minutes",
    description: "walk (corrected from 30 minutes)",
    occurredAt: lastWalk.occurredAt,
    correctedFrom: lastWalk.id,
    recordedByAgent: "natalie",
    certainty: "high",
  });

  // --- Priya: smoking reduction, no phone calls.
  await db.insert(schema.patientProfiles).values({ userId: ids.priya, nickname: "Priya", onboardingStep: null, onboardingCompletedAt: now });
  await db.insert(schema.userFocusAreas).values(
    (["health_habits", "track_progress"] as const).map((areaKey) => ({ userId: ids.priya, areaKey })),
  );
  await db.insert(schema.consents).values({ userId: ids.priya, purpose: "health_data_processing" });
  await db.insert(schema.callPreferences).values({ userId: ids.priya });
  const [smokeGoal] = await db
    .insert(schema.goals)
    .values({ userId: ids.priya, type: "smoking", title: "Cut down to 5 cigarettes a day", target: { maxPerDay: 5 } })
    .returning({ id: schema.goals.id });
  const priyaRows: (typeof schema.habitEvents.$inferInsert)[] = [];
  for (let offset = -35; offset < 0; offset++) {
    if (random() < 0.25) continue; // missing days stay missing
    const date = addDays(today, offset);
    const trend = Math.max(4, 12 - Math.floor((offset + 35) / 5));
    priyaRows.push({
      userId: ids.priya,
      goalId: smokeGoal.id,
      kind: "smoking",
      value: String(trend + Math.round(random() * 2)),
      unit: "cigarettes",
      occurredAt: zonedTimeToUtc(date, "21:00", TZ),
      recordedByAgent: "natalie",
    });
  }
  await db.insert(schema.habitEvents).values(priyaRows);

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

  console.log(`Seeded ${habitRows.length + priyaRows.length + 1} habit events, consents for: ${consentRows.map((row) => row.purpose).join(", ")}`);
  console.log("Demo accounts (password is DEMO_PASSWORD in .env):");
  for (const account of Object.values(DEMO_ACCOUNTS)) console.log(`  ${account.email}  (${account.name})`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
