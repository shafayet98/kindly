import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, ne } from "drizzle-orm";
import { Chip, Empty, Icon, PageHead, PanelSummary } from "@/components/kindly/parts";
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
// How each call status looks: chip tone and icon.
const STATUS_LOOK: Record<string, { tone: "ok" | "warn" | "live" | "done" | "planned" | "notdone" | "moved"; icon: "check" | "dash" | "clock" | "phone" | "alert" }> = {
  scheduled: { tone: "planned", icon: "clock" },
  dialing: { tone: "live", icon: "phone" },
  ringing: { tone: "live", icon: "phone" },
  in_progress: { tone: "live", icon: "phone" },
  completed: { tone: "done", icon: "check" },
  no_answer: { tone: "notdone", icon: "dash" },
  busy: { tone: "notdone", icon: "dash" },
  failed: { tone: "warn", icon: "alert" },
  cancelled: { tone: "notdone", icon: "dash" },
  skipped: { tone: "notdone", icon: "dash" },
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
    new Intl.DateTimeFormat("en-AU", { timeZone: user.timezone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(date);
  const hourPart = (time: string) => formatTime12h(time).split(" ");

  return (
    <>
      <PageHead title="Your Daily Reminders" sub="You can also ask Milo or Natalie to change these. Reminders for a goal follow the goal's time." />
      <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) 440px" }}>
        <div className="stack-32">
          <div className="card row nowrap" style={{ gap: 14, padding: "16px 20px" }}>
            <span className="cat-icon cat-icon--sm">
              <Icon name="pin" />
            </span>
            <span>
              Times are in{" "}
              <strong style={{ fontWeight: 600 }}>
                {zone.place} time ({zone.abbreviation})
              </strong>
              {zone.country ? `, ${zone.country}` : ""}.
            </span>
            <Link className="link" href="/settings/location" style={{ marginLeft: "auto" }}>
              Change
            </Link>
          </div>

          <section className="stack" aria-labelledby="yr-h">
            <h2 id="yr-h" className="subhead" style={{ marginBottom: 8 }}>
              Your reminders
            </h2>
            {reminders.length === 0 && <p className="muted">No reminders yet.</p>}
            <ul className="stack">
              {reminders.map((reminder) => {
                const next = nextCallFor.get(reminder.id);
                return (
                  <li key={reminder.id} className="card" style={{ padding: "22px 24px" }}>
                    <div className="card-grid">
                      <div style={{ textAlign: "center", minWidth: 84 }}>
                        <p className="subhead">{hourPart(reminder.localTime)[0]}</p>
                        <p className="label">{hourPart(reminder.localTime)[1]}</p>
                      </div>
                      <div>
                        <h3 className="title">
                          {reminder.title}
                          {reminder.status === "paused" && (
                            <span className="tag tag--soft" style={{ marginLeft: 8 }}>
                              PAUSED
                            </span>
                          )}
                        </h3>
                        <p className="row" style={{ gap: 8, marginTop: 6 }}>
                          {formatTime12h(reminder.localTime)} · {formatDays(reminder.daysOfWeek)} · <Icon name={reminder.channel === "phone" ? "phone" : "bell"} className="icon--sm" />
                          {reminder.channel === "phone" ? "Phone call from Milo" : "In the app"}
                        </p>
                        {next && (
                          <p className="label" style={{ marginTop: 8 }}>
                            Next call: {formatWhen(next)}
                          </p>
                        )}
                      </div>
                      <div className="row" style={{ gap: 8 }}>
                        <form action={changeReminderStatus}>
                          <input type="hidden" name="id" value={reminder.id} />
                          <input type="hidden" name="status" value={reminder.status === "paused" ? "active" : "paused"} />
                          <SubmitButton variant="ghost" size="sm">
                            {reminder.status === "paused" ? "Resume" : "Pause"}
                          </SubmitButton>
                        </form>
                        <form action={changeReminderStatus}>
                          <input type="hidden" name="id" value={reminder.id} />
                          <input type="hidden" name="status" value="cancelled" />
                          <SubmitButton variant="link" size="sm" className="link--danger" aria-label={`Delete ${reminder.title}`}>
                            Delete
                          </SubmitButton>
                        </form>
                      </div>
                    </div>
                    <details className="panel panel-sm dashed" style={{ marginTop: 16 }}>
                      <PanelSummary icon="clock">Change time or days</PanelSummary>
                      <div className="panel__body">
                        <EditReminderForm id={reminder.id} localTime={reminder.localTime} daysOfWeek={reminder.daysOfWeek} />
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
            <details className="panel">
              <PanelSummary icon="plus" accent>
                Add a reminder
              </PanelSummary>
              <div className="panel__body">
                <AddReminderForm phoneAllowed={callsOn} />
              </div>
            </details>
          </section>
        </div>

        <div className="stack-32">
          <section className="card card--lg stack-24" aria-labelledby="pc-h">
            <div className="row row--between">
              <h2 id="pc-h" className="subhead">
                Phone calls
              </h2>
              {!callsOn ? (
                <Chip tone="notdone" icon="dash">
                  Off
                </Chip>
              ) : paused ? (
                <Chip tone="warn" icon="alert">
                  Paused
                </Chip>
              ) : (
                <Chip tone="ok" icon="check">
                  Calls are on
                </Chip>
              )}
            </div>
            {!callsOn ? (
              <>
                <p className="muted">Milo can call your mobile at the times you choose, even when this website is closed. Nothing happens until you add your number and agree below.</p>
                <TurnOnCallsForm phone={settings?.phoneE164 ?? null} />
              </>
            ) : (
              <>
                <div className="row nowrap" style={{ gap: 14 }}>
                  <span className="cat-icon">
                    <Icon name="phone" />
                  </span>
                  <p>
                    Calls go to <strong style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>{maskPhone(settings!.phoneE164!)}</strong>
                    {paused && <span className="muted"> · all calls are paused</span>}
                  </p>
                </div>
                <div className="row">
                  <CallMeNowButton disabled={paused} />
                  <form action={togglePause}>
                    <input type="hidden" name="pause" value={paused ? "false" : "true"} />
                    <SubmitButton variant={paused ? "primary" : "ghost"}>{paused ? "Resume calls" : "Pause all calls"}</SubmitButton>
                  </form>
                </div>
                <details className="panel">
                  <PanelSummary icon="clock">Quiet hours and limits</PanelSummary>
                  <div className="panel__body">
                    <CallLimitsForm
                      quietHoursStart={settings!.quietHoursStart!}
                      quietHoursEnd={settings!.quietHoursEnd!}
                      maxCallsPerDay={settings!.maxCallsPerDay!}
                      maxRetries={settings!.maxRetries!}
                      retryDelayMinutes={settings!.retryDelayMinutes!}
                    />
                  </div>
                </details>
                <hr className="divider" />
                <form action={turnOffCalls}>
                  <SubmitButton variant="link" size="sm" className="link--danger" style={{ paddingLeft: 0 }}>
                    Turn off phone calls
                  </SubmitButton>
                </form>
              </>
            )}
          </section>

          <section className="stack" aria-labelledby="rc-h">
            <div className="row row--between">
              <h2 id="rc-h" className="title">
                Recent calls
              </h2>
              <LiveRefresh active={hasCallInFlight(calls)} />
            </div>
            {calls.length === 0 ? (
              <Empty icon="phone" title="No calls yet">
                <p className="muted small">Calls from Milo will show here with their status.</p>
              </Empty>
            ) : (
              <ul className="rows">
                {calls.map((call) => {
                  const look = STATUS_LOOK[call.status] ?? STATUS_LOOK.scheduled;
                  return (
                    <li key={call.id}>
                      <span>
                        <span style={{ fontWeight: 500 }}>{call.reminderTitle ?? "Call you asked for"}</span>
                        <span className="rows__sub" style={{ display: "block" }}>
                          {formatWhen(call.dueAt)}
                          {call.attempts > 1 ? ` · ${call.attempts} attempts` : ""}
                          {call.status === "skipped" && call.lastError ? ` · ${SKIP_REASONS[call.lastError] ?? "not placed"}` : ""}
                          {call.status === "failed" ? " · the call couldn't be placed" : ""}
                        </span>
                      </span>
                      <Chip tone={look.tone} icon={look.icon}>
                        {STATUS_LABEL[call.status] ?? call.status}
                        {call.status === "in_progress" && call.activeAgent && call.sessionState !== "ended" ? ` · talking with ${AGENTS[call.activeAgent].name}` : ""}
                      </Chip>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
