import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, ne } from "drizzle-orm";
import { SubmitButton } from "@/components/ui/submit-button";
import { AGENTS } from "@/lib/agents/directory";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { getCallSettings } from "@/lib/calls/settings";
import { getConsentState } from "@/lib/consent/store";
import { db, schema } from "@/lib/db";
import { formatDays, formatTime12h } from "@/lib/scheduling/occurrences";
import { recentCallJobs } from "@/lib/scheduling/jobs";
import { describeTimezone } from "@/lib/location/resolve";
import { maskPhone } from "@/lib/telephony/phone";
import { changeReminderStatus, togglePause, turnOffCalls } from "./actions";
import { AddReminderForm, CallLimitsForm, CallMeNowButton, EditReminderForm, LiveRefresh, TurnOnCallsForm } from "./forms";

export const metadata: Metadata = { title: "Your Daily Reminders" };

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  dialing: "Dialling…",
  ringing: "Ringing…",
  in_progress: "In progress",
  completed: "Answered",
  no_answer: "Missed",
  busy: "Busy",
  failed: "Failed",
  cancelled: "Cancelled",
  skipped: "Skipped",
};
const ACTIVE = new Set(["scheduled", "dialing", "ringing", "in_progress"]);

/** A call is in flight if it's active and due within the next minute (server render time). */
function hasCallInFlight(calls: { status: string; dueAt: Date }[]) {
  const soon = Date.now() + 60_000;
  return calls.some((call) => ACTIVE.has(call.status) && call.dueAt.getTime() < soon);
}

const SKIP_REASONS: Record<string, string> = {
  "quiet hours": "during your quiet hours",
  "daily call limit reached": "daily call limit reached",
  paused: "calls were paused",
  calls_off: "calls were off",
  no_consent: "calls were off",
  no_phone: "no confirmed number",
  "missed call window": "Kindly was offline at the time",
  "calls paused": "calls were paused",
  "calls turned off": "calls were turned off",
  superseded: "reminder changed",
};

export default async function SchedulePage() {
  const user = await requireOnboardedPatient();
  const [reminders, settings, consents, calls, upcoming] = await Promise.all([
    db
      .select()
      .from(schema.reminders)
      .where(and(eq(schema.reminders.userId, user.id), ne(schema.reminders.status, "cancelled")))
      .orderBy(asc(schema.reminders.localTime)),
    getCallSettings(user.id),
    getConsentState(user.id),
    recentCallJobs(user.id),
    db
      .select({ reminderId: schema.callJobs.reminderId, dueAt: schema.callJobs.dueAt })
      .from(schema.callJobs)
      .where(and(eq(schema.callJobs.userId, user.id), eq(schema.callJobs.status, "scheduled"))),
  ]);

  const callsOn = Boolean(consents.outbound_calls && settings?.callsEnabled);
  const zone = describeTimezone(user.timezone, user.countryCode);
  const paused = Boolean(settings?.pausedAt);
  const nextCallFor = new Map(upcoming.map((job) => [job.reminderId, job.dueAt]));
  const formatWhen = (date: Date) =>
    new Intl.DateTimeFormat("en-AU", { timeZone: user.timezone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(date);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Your Daily Reminders</h1>
        <p className="text-muted">
          Times are in <strong>{zone.place} time ({zone.abbreviation})</strong>
          {zone.country ? `, ${zone.country}` : ""}.{" "}
          <Link href="/settings/location" className="font-semibold text-primary underline-offset-4 hover:underline">
            Change
          </Link>
        </p>
        <p className="text-muted">You can also ask Milo or Natalie to change these. Reminders for a goal follow the goal&apos;s time.</p>
      </div>

      <section aria-labelledby="reminders-heading" className="flex flex-col gap-3">
        <h2 id="reminders-heading" className="text-xl font-bold">
          Your reminders
        </h2>
        {reminders.length === 0 && <p className="text-muted">No reminders yet.</p>}
        <ul className="flex flex-col gap-3">
          {reminders.map((reminder) => {
            const next = nextCallFor.get(reminder.id);
            return (
              <li key={reminder.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold">
                      {reminder.title}
                      {reminder.status === "paused" && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-sm">Paused</span>}
                    </p>
                    <p>
                      {formatTime12h(reminder.localTime)} · {formatDays(reminder.daysOfWeek)} ·{" "}
                      {reminder.channel === "phone" ? "Phone call from Milo" : "In the app"}
                    </p>
                    {next && <p className="text-sm text-muted">Next call: {formatWhen(next)}</p>}
                  </div>
                  <div className="flex gap-2">
                    <form action={changeReminderStatus}>
                      <input type="hidden" name="id" value={reminder.id} />
                      <input type="hidden" name="status" value={reminder.status === "paused" ? "active" : "paused"} />
                      <SubmitButton variant="secondary">{reminder.status === "paused" ? "Resume" : "Pause"}</SubmitButton>
                    </form>
                    <form action={changeReminderStatus}>
                      <input type="hidden" name="id" value={reminder.id} />
                      <input type="hidden" name="status" value="cancelled" />
                      <SubmitButton variant="ghost" aria-label={`Delete ${reminder.title}`}>
                        Delete
                      </SubmitButton>
                    </form>
                  </div>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer font-semibold text-primary">Change time or days</summary>
                  <EditReminderForm id={reminder.id} localTime={reminder.localTime} daysOfWeek={reminder.daysOfWeek} />
                </details>
              </li>
            );
          })}
        </ul>
        <details className="rounded-2xl border border-dashed border-border p-4">
          <summary className="cursor-pointer font-bold text-primary">Add a reminder</summary>
          <div className="mt-4">
            <AddReminderForm phoneAllowed={callsOn} />
          </div>
        </details>
      </section>

      <section aria-labelledby="calls-heading" className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5">
        <h2 id="calls-heading" className="text-xl font-bold">
          Phone calls
        </h2>
        {!callsOn ? (
          <>
            <p>
              Milo can call your phone at the times you choose, even when this website is closed. Calls are off until you
              turn them on.
            </p>
            <TurnOnCallsForm phone={settings?.phoneE164 ?? null} />
          </>
        ) : (
          <>
            <p>
              Calls go to <strong>{maskPhone(settings!.phoneE164!)}</strong>.{" "}
              {paused ? <strong className="text-danger">All calls are paused.</strong> : "Calls are on."}
            </p>
            <div className="flex flex-wrap gap-3">
              <form action={togglePause}>
                <input type="hidden" name="pause" value={paused ? "false" : "true"} />
                <SubmitButton variant={paused ? "primary" : "secondary"}>{paused ? "Resume calls" : "Pause all calls"}</SubmitButton>
              </form>
              <CallMeNowButton disabled={paused} />
            </div>
            <details>
              <summary className="cursor-pointer font-semibold text-primary">Quiet hours and limits</summary>
              <div className="mt-3">
                <CallLimitsForm
                  quietHoursStart={settings!.quietHoursStart!}
                  quietHoursEnd={settings!.quietHoursEnd!}
                  maxCallsPerDay={settings!.maxCallsPerDay!}
                  maxRetries={settings!.maxRetries!}
                  retryDelayMinutes={settings!.retryDelayMinutes!}
                />
              </div>
            </details>
            <form action={turnOffCalls}>
              <SubmitButton variant="ghost">Turn off phone calls</SubmitButton>
            </form>
          </>
        )}
      </section>

      <section aria-labelledby="activity-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="activity-heading" className="text-xl font-bold">
            Recent calls
          </h2>
          <LiveRefresh active={hasCallInFlight(calls)} />
        </div>
        {calls.length === 0 ? (
          <p className="text-muted">No calls yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
            {calls.map((call) => (
              <li key={call.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span>
                  <span className="font-semibold">{call.reminderTitle ?? "Call you asked for"}</span>
                  <span className="text-muted"> · {formatWhen(call.dueAt)}</span>
                </span>
                <span className="text-sm">
                  <span className="font-bold">{STATUS_LABEL[call.status] ?? call.status}</span>
                  {call.status === "in_progress" && call.activeAgent && call.sessionState !== "ended" && ` · talking with ${AGENTS[call.activeAgent].name}`}
                  {call.status === "skipped" && call.lastError && ` · ${SKIP_REASONS[call.lastError] ?? "not placed"}`}
                  {call.status === "failed" && " · the call couldn't be placed"}
                  {call.attempts > 1 && ` · ${call.attempts} attempts`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
