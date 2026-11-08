// Exercises the call scheduler against the real database with a FAKE Twilio client: nothing is
// ever dialled. Uses a throwaway user that is deleted afterwards. Runs only against the test
// project (.env.test), so the live phone server can never pick up its jobs. Usage: pnpm scheduler:check
import "./load-env";
import { assertTestProject } from "@/lib/env-files";
import { eq, sql } from "drizzle-orm";
import pino from "pino";
import { db, schema } from "@/lib/db";
import { queueOnDemandCall, scheduleNextJob } from "@/lib/scheduling/jobs";
import { localClock } from "@/lib/scheduling/occurrences";
import { createGoal, postponeSession } from "@/lib/goals/service";
import { addDays, localDate, zonedTimeToUtc } from "@/lib/time";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createReminder } from "@/lib/reminders/service";
import { enablePhoneCalls, pauseCalls, resumeCalls } from "@/lib/calls/settings";
import { ensureAppUserForScript } from "./script-users";
import { applyCallStatus, runSchedulerOnce } from "../realtime-server/scheduler";

assertTestProject();

const log = pino({ level: "silent" });
const placed: string[] = [];
let failNext = false;
const fakeTwilio = {
  calls: {
    create: async (options: { to: string }) => {
      if (failNext) {
        failNext = false;
        throw Object.assign(new Error("The number is unverified."), { code: 21219 });
      }
      const sid = `CAfake${placed.length}${Date.now()}`;
      placed.push(options.to);
      return { sid, status: "queued" };
    },
  },
} as never;
const env = { TWILIO_PHONE_NUMBER: "+15550000000", PUBLIC_BASE_URL: "https://example.invalid", CALL_MAX_DURATION_SECONDS: 300, CALLS_MAX_PER_HOUR: 20 };
const deps = { env, twilio: fakeTwilio, log, allowFictionalNumbers: true } as never;

const results: [string, boolean][] = [];
const check = (name: string, ok: boolean) => {
  results.push([name, ok]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
};

const admin = createSupabaseAdminClient();
const { data } = await admin.auth.admin.createUser({ email: `scheduler.check.${Date.now()}@example.com`, password: `Check-${Date.now()}x`, email_confirm: true });
const authUserId = data.user!.id;

try {
  const userId = await ensureAppUserForScript(authUserId);
  await db.update(schema.patientProfiles).set({ onboardingCompletedAt: new Date() }).where(eq(schema.patientProfiles.userId, userId));
  const job = async (id: string) => (await db.select().from(schema.callJobs).where(eq(schema.callJobs.id, id)))[0];
  const makeDue = (id: string) => db.update(schema.callJobs).set({ dueAt: new Date(Date.now() - 1000) }).where(eq(schema.callJobs.id, id));
  // Quiet hours that never apply, unless a test sets them.
  const noQuietHours = () => db.update(schema.callPreferences).set({ quietHoursStart: "00:00", quietHoursEnd: "00:00", maxRetries: 1, retryDelayMinutes: 1, maxCallsPerDay: 5 }).where(eq(schema.callPreferences.userId, userId));

  // 1. Without call consent nothing is queued or dialled.
  const before = await queueOnDemandCall(userId);
  if (before.ok) await runSchedulerOnce(deps);
  check("no consent: on-demand call is skipped, not dialled", placed.length === 0 && (!before.ok || (await job(before.jobId)).lastError === "no_phone"));

  // 2. With consent, an on-demand call is dialled exactly once (rate limit allows 3/hour).
  await enablePhoneCalls(userId, "+61491570157");
  await noQuietHours();
  const queued = await queueOnDemandCall(userId);
  await Promise.all([runSchedulerOnce(deps), runSchedulerOnce(deps)]); // two schedulers racing
  const dialled = queued.ok ? await job(queued.jobId) : null;
  check("on-demand call dialled once even with two schedulers racing (AC-12)", placed.length === 1 && Boolean(dialled?.twilioCallSid) && dialled?.attempts === 1);

  // 3. Status callbacks move it along; a late duplicate callback can't reopen it.
  await applyCallStatus(dialled!.twilioCallSid!, "in-progress", log);
  await applyCallStatus(dialled!.twilioCallSid!, "completed", log);
  await applyCallStatus(dialled!.twilioCallSid!, "ringing", log);
  check("statuses applied in order and terminal state sticks", (await job(dialled!.id)).status === "completed");

  // 2b. A "call me now" left in the queue (server was down) expires instead of ringing later.
  const stale = await queueOnDemandCall(userId);
  if (stale.ok) await db.update(schema.callJobs).set({ dueAt: new Date(Date.now() - 10 * 60_000) }).where(eq(schema.callJobs.id, stale.jobId));
  await runSchedulerOnce(deps);
  check("stale on-demand request expires without dialling", stale.ok && (await job(stale.jobId)).lastError === "request expired" && placed.length === 1);

  // 4. A phone reminder: no answer -> one bounded retry on the same job -> final no_answer + next occurrence.
  const { reminder } = await createReminder(userId, { title: "Check walk", localTime: "08:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], channel: "phone" }, { type: "patient" });
  const [reminderJob] = await db.select().from(schema.callJobs).where(eq(schema.callJobs.reminderId, reminder.id));
  await makeDue(reminderJob.id);
  await runSchedulerOnce(deps);
  await applyCallStatus((await job(reminderJob.id)).twilioCallSid!, "no-answer", log);
  const afterFirst = await job(reminderJob.id);
  await makeDue(reminderJob.id);
  await runSchedulerOnce(deps);
  await applyCallStatus((await job(reminderJob.id)).twilioCallSid!, "no-answer", log);
  const afterSecond = await job(reminderJob.id);
  const next = await db.select().from(schema.callJobs).where(sql`${schema.callJobs.reminderId} = ${reminder.id} and ${schema.callJobs.status} = 'scheduled'`);
  check(
    "no answer retries once on the same job, then stops and schedules the next occurrence (AC-40)",
    afterFirst.status === "scheduled" && afterFirst.attempts === 1 && afterSecond.status === "no_answer" && afterSecond.attempts === 2 && next.length === 1 && placed.length === 3,
  );

  // 5. Pause cancels pending jobs; a job made due while paused is skipped, never dialled (AC-11).
  await pauseCalls(userId);
  const cancelled = await job(next[0].id);
  await db.update(schema.callJobs).set({ status: "scheduled", dueAt: new Date(Date.now() - 1000) }).where(eq(schema.callJobs.id, next[0].id));
  await runSchedulerOnce(deps);
  check("pause cancels pending jobs and nothing dials while paused (AC-11, AC-41)", cancelled.status === "cancelled" && (await job(next[0].id)).status === "skipped" && placed.length === 3);

  // 6. Resume re-creates the next job; quiet hours skip it.
  await resumeCalls(userId);
  const [resumed] = await db.select().from(schema.callJobs).where(sql`${schema.callJobs.reminderId} = ${reminder.id} and ${schema.callJobs.status} = 'scheduled'`);
  await db.update(schema.callPreferences).set({ quietHoursStart: "00:00", quietHoursEnd: "23:59" }).where(eq(schema.callPreferences.userId, userId));
  await makeDue(resumed.id);
  await runSchedulerOnce(deps);
  check("quiet hours skip a due reminder call (AC-41)", (await job(resumed.id)).lastError === "quiet hours" && placed.length === 3);

  // 7. A Twilio rejection is recorded honestly as failed (AC-18, AC-42).
  await noQuietHours();
  const [again] = await db.select().from(schema.callJobs).where(sql`${schema.callJobs.reminderId} = ${reminder.id} and ${schema.callJobs.status} = 'scheduled'`);
  await makeDue(again.id);
  failNext = true;
  await runSchedulerOnce(deps);
  const failed = await job(again.id);
  check("Twilio rejection is recorded as failed with its error code", failed.status === "failed" && (failed.lastError ?? "").includes("21219"));

  // 8. Moving one session of a goal moves that day's reminder call, and the regular schedule stays.
  await noQuietHours();
  const tz = "Australia/Adelaide";
  await db.update(schema.users).set({ timezone: tz }).where(eq(schema.users.id, userId));
  const today = localDate(new Date(), tz);
  const tomorrow = addDays(today, 1);
  const goal = await createGoal(userId, { title: "Evening walk", category: "walk", cadence: "daily", targetCount: 1, daysOfWeek: null, times: ["19:00"], durationMinutes: null, notes: null }, { type: "patient" });
  const { reminder: walkReminder } = await createReminder(userId, { title: "Evening walk", localTime: "19:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], channel: "phone", goalId: goal.id }, { type: "patient" });
  await db.update(schema.callJobs).set({ status: "cancelled" }).where(eq(schema.callJobs.reminderId, walkReminder.id));
  await scheduleNextJob(walkReminder.id, zonedTimeToUtc(today, "23:59", tz)); // next regular call: tomorrow 19:00
  await postponeSession(userId, { goalId: goal.id, date: tomorrow, slotTime: "19:00" }, { date: tomorrow, time: "20:30" }, { type: "patient" });
  const jobs = await db.select().from(schema.callJobs).where(eq(schema.callJobs.reminderId, walkReminder.id));
  const scheduled = jobs.filter((j) => j.status === "scheduled").map((j) => `${localDate(j.dueAt, tz)} ${localClock(j.dueAt, tz)}${j.idempotencyKey.includes(":moved:") ? " (moved)" : ""}`).sort();
  check(
    "moving one session moves that day's reminder call and keeps the next regular one",
    scheduled.includes(`${tomorrow} 20:30 (moved)`) && !scheduled.includes(`${tomorrow} 19:00`) && scheduled.some((entry) => entry === `${addDays(tomorrow, 1)} 19:00`),
  );
  if (!results.at(-1)![1]) console.log("      scheduled jobs:", scheduled);

  // 9. A real scheduler (without the fake-Twilio opt-out) never dials a fictional test number.
  await db.delete(schema.callJobs).where(sql`${schema.callJobs.userId} = ${userId} and ${schema.callJobs.kind} = 'on_demand'`);
  const guarded = await queueOnDemandCall(userId);
  const placedBefore = placed.length;
  await runSchedulerOnce({ env, twilio: fakeTwilio, log } as never);
  check("a fictional number is never dialled", guarded.ok && placed.length === placedBefore && (await job(guarded.jobId)).lastError === "fictional number");
} finally {
  await admin.auth.admin.deleteUser(authUserId);
}

const ok = results.every(([, passed]) => passed);
console.log(ok ? "SCHEDULER CHECK PASSED (no real calls placed)" : "SCHEDULER CHECK FAILED");
process.exit(ok ? 0 : 1);
