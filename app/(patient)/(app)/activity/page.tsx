import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Empty, Icon, PageHead, PanelSummary } from "@/components/kindly/parts";
import { SubmitButton } from "@/components/ui/submit-button";
import { summaryPreferences } from "@/lib/conversations/summary";
import { AGENTS, type AgentKey } from "@/lib/agents/directory";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { removeSummary } from "./actions";

export const metadata: Metadata = { title: "Conversation activity" };

const TOOL_LABEL: Record<string, string> = {
  get_reminders: "looked up your reminders",
  get_goals: "looked up your goals",
  get_week_plan: "looked at your week",
  propose_new_goal: "suggested a new goal",
  mark_goal_done: "marked a goal session as done",
  propose_postpone_session: "suggested moving a session",
  propose_reminder_change: "proposed a reminder change",
  propose_new_reminder: "proposed a new reminder",
  confirm_action: "carried out a change you approved",
  decline_action: "recorded that you said no",
  log_habit: "saved a check-in",
  correct_habit: "corrected a check-in",
  get_recent_habits: "looked up recent check-ins",
  get_progress: "asked Iris for your progress",
  propose_plan_adjustment: "asked Theo for a plan change",
  save_wellbeing_note: "kept a private note",
  get_wellbeing_notes: "read your private notes",
  get_call_preferences: "checked your call settings",
  trigger_safety_response: "gave safety guidance",
};

const KIND_LABEL: Record<string, string> = {
  "reminder.reschedule": "reminder moved",
  "reminder.status": "reminder status changed",
  "reminder.create": "reminder created",
  "plan.adjust": "goal added or adjusted",
  "session.postpone": "session moved",
};

function describe(event: { agent: AgentKey; eventType: string; payload: Record<string, unknown> }) {
  const name = (key: unknown) => AGENTS[key as AgentKey]?.name ?? String(key);
  switch (event.eventType) {
    case "session_started":
      return `${name(event.agent)} joined (${event.payload.channel === "phone" ? "phone call" : "browser"})`;
    case "handoff":
      return `${name(event.payload.from)} handed over to ${name(event.payload.to)}${event.payload.via === "ui" ? " (you pressed a button)" : ""}`;
    case "delegation":
      return `${name(event.payload.from)} asked ${name(event.payload.to)} to help (${KIND_LABEL[String(event.payload.task)] ?? "progress summary"})`;
    case "action_executed":
      return `${name(event.agent)} saved it: ${KIND_LABEL[String(event.payload.kind)] ?? "change"}`;
    case "tool_call":
      return `${name(event.agent)} ${TOOL_LABEL[String(event.payload.tool)] ?? "used a tool"}${event.payload.ok === false ? " (it failed; nothing changed)" : ""}`;
    case "session_ended":
      return "Call ended";
    default:
      return event.eventType;
  }
}

export default async function ActivityPage() {
  const user = await requireOnboardedPatient();
  const sessions = await db
    .select()
    .from(schema.callSessions)
    .where(eq(schema.callSessions.userId, user.id))
    .orderBy(desc(schema.callSessions.startedAt))
    .limit(8);
  const events = sessions.length
    ? await db
        .select({ sessionId: schema.agentEvents.sessionId, agent: schema.agentEvents.agent, eventType: schema.agentEvents.eventType, payload: schema.agentEvents.structuredPayload, at: schema.agentEvents.at })
        .from(schema.agentEvents)
        .where(inArray(schema.agentEvents.sessionId, sessions.map((session) => session.id)))
        .orderBy(asc(schema.agentEvents.at))
    : [];
  const [summaries, prefs] = await Promise.all([
    sessions.length
      ? db
          .select({ sessionId: schema.conversationSummaries.sessionId, summary: schema.conversationSummaries.summary })
          .from(schema.conversationSummaries)
          .where(and(eq(schema.conversationSummaries.userId, user.id), inArray(schema.conversationSummaries.sessionId, sessions.map((session) => session.id))))
      : [],
    summaryPreferences(user.id),
  ]);
  const summaryFor = new Map(summaries.map((row) => [row.sessionId, row.summary]));
  const time = (date: Date) => new Intl.DateTimeFormat("en-AU", { timeStyle: "medium", timeZone: user.timezone }).format(date);
  const day = (date: Date) => new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: user.timezone }).format(date);

  const bullets = (summary: string) =>
    summary
      .split("\n")
      .map((line) => line.replace(/^\s*[-•]\s*/, "").trim())
      .filter(Boolean);

  return (
    <>
      <PageHead title="Conversation activity" sub="Who you spoke with and what they did. Kindly never keeps the audio or the words." />
      <div className="split">
        <div className="stack-24">
          {sessions.length === 0 && (
            <Empty icon="bubble" title="No conversations yet">
              <p className="muted small">Calls with Milo, Natalie and Sarah will show here.</p>
            </Empty>
          )}
          {sessions.map((session) => {
            const summary = summaryFor.get(session.id);
            const sessionEvents = events.filter((event) => event.sessionId === session.id);
            return (
              <section key={session.id} aria-labelledby={`session-${session.id}`} className="card card--lg stack-24">
                <div className="row nowrap" style={{ gap: 14 }}>
                  <span className="cat-icon">
                    <Icon name={session.channel === "phone" ? "phone" : "mic"} />
                  </span>
                  <h2 id={`session-${session.id}`} className="title">
                    {session.channel === "phone" ? "Phone call" : "Browser call"}{" "}
                    <span className="muted" style={{ fontWeight: 400 }}>
                      · {day(session.startedAt)}
                    </span>
                    {session.state !== "ended" && (
                      <span className="tag tag--soft" style={{ marginLeft: 8 }}>
                        LIVE
                      </span>
                    )}
                  </h2>
                </div>
                {summary ? (
                  <div className="summary-box">
                    <div className="row row--between">
                      <p className="row" style={{ gap: 8 }}>
                        <span className="tag tag--soft">
                          <Icon name="sparkle" className="icon--sm" />
                          AI SUMMARY
                        </span>
                        <span className="small muted">Only you can see this</span>
                      </p>
                      <form action={removeSummary}>
                        <input type="hidden" name="sessionId" value={session.id} />
                        <SubmitButton variant="link" size="sm" className="link--danger">
                          Delete summary
                        </SubmitButton>
                      </form>
                    </div>
                    <ul>
                      {bullets(summary).map((line, index) => (
                        <li key={index}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="muted small">No summary for this call.</p>
                )}
                <details className="panel panel-sm" open={!summary}>
                  <PanelSummary icon="clock">Timeline</PanelSummary>
                  <div className="panel__body">
                    <ol className="timeline">
                      {sessionEvents.map((event, index) => (
                        <li key={index}>
                          <span className="t">{time(event.at)}</span>
                          <span className={`dot ${event.eventType === "action_executed" ? "dot--key" : ""}`} />
                          <span>{describe({ agent: event.agent, eventType: event.eventType, payload: event.payload })}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </details>
              </section>
            );
          })}
        </div>
        <aside className="sticky stack-24">
          <div className="card stack">
            <p className="title">About summaries</p>
            <p className="muted small">
              {prefs.enabled ? "Summaries are written by AI when a call ends, only for you." : "Conversation summaries are off."} Chats with Sarah are left out unless you choose otherwise.
            </p>
            <Link className="link small" href="/settings/privacy">
              {prefs.enabled ? "Privacy & data" : "Turn them on in Privacy & data"}
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
