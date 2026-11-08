import { and, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { Twilio } from "twilio";
import { db, schema } from "@/lib/db";
import { isWithinQuietHours, localClock } from "@/lib/scheduling/occurrences";
import { scheduleNextJob } from "@/lib/scheduling/jobs";
import { checkCallEligibility } from "@/lib/telephony/eligibility";
import { isFictionalNumber } from "@/lib/telephony/phone";
import { bindToken, issueToken } from "@/lib/telephony/stream-tokens";
import { localDate } from "@/lib/time";
import type { AuthorizedCall } from "@/lib/voice/twilio-realtime";
import type { Env } from "./env";

const POLL_MS = 5_000;
// A reminder call that is more than this late (e.g. the server was down) is skipped, not placed.
const MISSED_WINDOW_MS = 15 * 60_000;
const ON_DEMAND_EXPIRY_MS = 2 * 60_000;
// A claimed job with no CallSid after this long is in an unknown state. It is failed rather than
// redialled, because the call may already have gone out (never risk a duplicate call).
const STALE_DIAL_MS = 2 * 60_000;

type ClaimedJob = { id: string; user_id: string; reminder_id: string | null; kind: "reminder" | "on_demand"; due_at: Date; attempts: number };

type Deps = {
  env: Pick<Env, "TWILIO_PHONE_NUMBER" | "PUBLIC_BASE_URL" | "CALL_MAX_DURATION_SECONDS" | "CALLS_MAX_PER_HOUR">;
  twilio: Pick<Twilio, "calls">;
  log: FastifyBaseLogger;
  // Only for scheduler:check, whose fake Twilio "dials" a fictional number.
  allowFictionalNumbers?: boolean;
};

export function startScheduler(deps: Deps) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runSchedulerOnce(deps);
    } catch (error) {
      deps.log.error({ err: error instanceof Error ? error.message : "unknown" }, "scheduler tick failed");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, POLL_MS);
  void tick();
  return () => clearInterval(timer);
}

/** One scheduler pass. Exported for tests, which supply a fake Twilio client. */
export async function runSchedulerOnce(deps: Deps) {
  await failStaleDials();
  for (const job of await claimDueJobs(5)) await processJob(job, deps);
}

async function failStaleDials() {
  await db
    .update(schema.callJobs)
    .set({ status: "failed", lastError: "dial state unknown; not retried to avoid a duplicate call" })
    .where(and(eq(schema.callJobs.status, "dialing"), sql`${schema.callJobs.twilioCallSid} is null`, sql`${schema.callJobs.updatedAt} < now() - make_interval(secs => ${STALE_DIAL_MS / 1000})`));
}

/** Atomically moves due jobs to "dialing". SKIP LOCKED lets several servers run safely. */
async function claimDueJobs(limit: number): Promise<ClaimedJob[]> {
  const rows = await db.execute<ClaimedJob>(sql`
    update call_jobs set status = 'dialing', attempts = attempts + 1, updated_at = now()
    where id in (
      select id from call_jobs where status = 'scheduled' and due_at <= now()
      order by due_at limit ${limit} for update skip locked
    )
    returning id, user_id, reminder_id, kind, due_at, attempts`);
  return [...rows];
}

async function finish(job: ClaimedJob, status: "skipped" | "failed", reason: string, scheduleNext = true) {
  await db.update(schema.callJobs).set({ status, lastError: reason }).where(eq(schema.callJobs.id, job.id));
  if (scheduleNext && job.reminder_id) await scheduleNextJob(job.reminder_id);
}

async function processJob(job: ClaimedJob, { env, twilio, log, allowFictionalNumbers }: Deps) {
  const lateness = Date.now() - new Date(job.due_at).getTime();
  if (job.kind === "reminder" && job.attempts === 1 && lateness > MISSED_WINDOW_MS) return finish(job, "skipped", "missed call window");
  // "Call me now" means now: a request left queued while the server was down must never ring later.
  if (job.kind === "on_demand" && lateness > ON_DEMAND_EXPIRY_MS) return finish(job, "skipped", "request expired", false);

  // Consent and switches are re-checked at dial time, so a pause or opt-out always wins (AC-11, AC-41).
  const eligibility = await checkCallEligibility(job.user_id);
  if (!eligibility.ok) return finish(job, "skipped", eligibility.reason, false);
  // Tests use the ACMA's fiction numbers. Never dial one, even if a test's job reaches a real scheduler.
  if (isFictionalNumber(eligibility.phoneE164) && !allowFictionalNumbers) return finish(job, "skipped", "fictional number", false);

  const [prefs] = await db.select().from(schema.callPreferences).where(eq(schema.callPreferences.userId, job.user_id));
  const now = new Date();

  if (job.kind === "reminder") {
    if (isWithinQuietHours(localClock(now, eligibility.timezone), prefs.quietHoursStart, prefs.quietHoursEnd)) {
      return finish(job, "skipped", "quiet hours");
    }
    const today = localDate(now, eligibility.timezone);
    const placed = await db
      .select({ dueAt: schema.callJobs.dueAt })
      .from(schema.callJobs)
      .where(and(eq(schema.callJobs.userId, job.user_id), eq(schema.callJobs.kind, "reminder"), isNotNull(schema.callJobs.twilioCallSid), gt(schema.callJobs.dueAt, sql`now() - interval '2 days'`)));
    if (placed.filter((row) => localDate(row.dueAt, eligibility.timezone) === today).length >= prefs.maxCallsPerDay) {
      return finish(job, "skipped", "daily call limit reached");
    }
  }

  // Global spend cap across all users.
  const [hourly] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.callJobs)
    .where(and(isNotNull(schema.callJobs.twilioCallSid), gt(schema.callJobs.updatedAt, sql`now() - interval '1 hour'`)));
  if ((hourly?.count ?? 0) >= env.CALLS_MAX_PER_HOUR) return finish(job, "skipped", "service-wide hourly call cap");

  let reminderTitle: string | null = null;
  if (job.reminder_id) {
    const [reminder] = await db.select({ title: schema.reminders.title }).from(schema.reminders).where(eq(schema.reminders.id, job.reminder_id));
    reminderTitle = reminder?.title ?? null;
  }

  const callData: Omit<AuthorizedCall, "callSid"> = {
    userId: job.user_id,
    timezone: eligibility.timezone,
    opening: reminderTitle ? { reason: "reminder_call", reminderTitle } : { reason: "test_call" },
    startAgent: "milo",
    callJobId: job.id,
  };
  const pending = issueToken("call", 3 * 60_000, callData);

  try {
    const call = await twilio.calls.create({
      to: eligibility.phoneE164,
      from: env.TWILIO_PHONE_NUMBER,
      url: `${env.PUBLIC_BASE_URL}/twilio/voice?t=${pending}`,
      statusCallback: `${env.PUBLIC_BASE_URL}/twilio/status`,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      timeout: 25,
      timeLimit: env.CALL_MAX_DURATION_SECONDS,
    });
    bindToken(pending, { callSid: call.sid });
    await db.update(schema.callJobs).set({ twilioCallSid: call.sid }).where(eq(schema.callJobs.id, job.id));
    log.info({ jobId: job.id, callSid: call.sid, kind: job.kind }, "call placed");
  } catch (error) {
    const err = error as { code?: number; message?: string };
    log.error({ jobId: job.id, code: err.code }, "twilio rejected the call");
    // Honest failure: never shown as ringing or completed (AC-18, AC-42).
    await finish(job, "failed", `Twilio ${err.code ?? "error"}: ${err.message ?? "call not placed"}`.slice(0, 300));
  }
}

const TWILIO_STATUS: Record<string, (typeof schema.callJobStatus.enumValues)[number]> = {
  queued: "dialing",
  initiated: "dialing",
  ringing: "ringing",
  "in-progress": "in_progress",
  completed: "completed",
  busy: "busy",
  "no-answer": "no_answer",
  failed: "failed",
  canceled: "cancelled",
};
const TERMINAL = new Set(["completed", "busy", "no_answer", "failed", "cancelled", "skipped"]);

/** Applies a Twilio status callback to its job: progress, retry, or schedule the next occurrence. */
export async function applyCallStatus(callSid: string, twilioStatus: string, log: FastifyBaseLogger) {
  const status = TWILIO_STATUS[twilioStatus];
  if (!status) return;
  const [job] = await db.select().from(schema.callJobs).where(eq(schema.callJobs.twilioCallSid, callSid));
  if (!job || TERMINAL.has(job.status)) return; // unknown call or late/out-of-order callback

  if (!TERMINAL.has(status)) {
    await db.update(schema.callJobs).set({ status }).where(eq(schema.callJobs.id, job.id));
    return;
  }

  const unanswered = status === "busy" || status === "no_answer" || status === "failed";
  if (unanswered && job.kind === "reminder") {
    const [prefs] = await db.select().from(schema.callPreferences).where(eq(schema.callPreferences.userId, job.userId));
    if (prefs && job.attempts <= prefs.maxRetries && !prefs.pausedAt && prefs.callsEnabled) {
      // Bounded retry on the same job row, so it can never fan out into duplicates (AC-12, AC-40).
      await db
        .update(schema.callJobs)
        .set({
          status: "scheduled",
          dueAt: new Date(Date.now() + prefs.retryDelayMinutes * 60_000),
          twilioCallSid: null,
          lastError: `attempt ${job.attempts}: ${twilioStatus}`,
        })
        .where(and(eq(schema.callJobs.id, job.id), inArray(schema.callJobs.status, ["dialing", "ringing", "in_progress"])));
      log.info({ jobId: job.id, attempt: job.attempts }, "call unanswered; retry scheduled");
      return;
    }
  }

  await db.update(schema.callJobs).set({ status, lastError: unanswered ? `final attempt: ${twilioStatus}` : job.lastError }).where(eq(schema.callJobs.id, job.id));
  if (job.reminderId) await scheduleNextJob(job.reminderId);
}
