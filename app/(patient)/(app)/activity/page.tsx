import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Conversation activity</h1>
        <p className="text-muted">Who you spoke with and what they did. Kindly never keeps the audio or the words.</p>
        {!prefs.enabled && (
          <p className="mt-2 text-sm text-muted">
            Conversation summaries are off.{" "}
            <Link href="/settings/privacy" className="font-semibold text-primary underline-offset-4 hover:underline">
              Turn them on in Privacy & data
            </Link>
          </p>
        )}
      </div>
      {sessions.length === 0 && <p className="text-muted">No conversations yet.</p>}
      {sessions.map((session) => (
        <section key={session.id} aria-labelledby={`session-${session.id}`} className="rounded-2xl border border-border bg-surface p-4">
          <h2 id={`session-${session.id}`} className="font-bold">
            {session.channel === "phone" ? "Phone call" : "Browser call"} · {day(session.startedAt)}
            {session.state !== "ended" && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-sm">live</span>}
          </h2>
          {summaryFor.has(session.id) && (
            <div className="mt-2 rounded-xl bg-primary-soft/60 p-3">
              <p className="text-xs font-bold text-muted">Summary (only you can see this)</p>
              <p className="whitespace-pre-line">{summaryFor.get(session.id)}</p>
              <form action={removeSummary} className="mt-1">
                <input type="hidden" name="sessionId" value={session.id} />
                <SubmitButton variant="ghost" className="px-0 py-0 text-sm">
                  Delete summary
                </SubmitButton>
              </form>
            </div>
          )}
          <details className="mt-2" open={!summaryFor.has(session.id)}>
            <summary className="cursor-pointer text-sm font-semibold text-primary">Timeline</summary>
            <ol className="mt-2 flex flex-col gap-1 border-l-2 border-border pl-4">
              {events
                .filter((event) => event.sessionId === session.id)
                .map((event, index) => (
                  <li key={index} className="text-sm">
                    <span className="text-muted">{time(event.at)}</span> · {describe({ agent: event.agent, eventType: event.eventType, payload: event.payload })}
                  </li>
                ))}
            </ol>
          </details>
        </section>
      ))}
    </div>
  );
}
