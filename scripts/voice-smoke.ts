// Text-only smoke test of the live voice agents against the real Realtime API (costs a few cents).
// Each companion runs in its own session, as on a real call: a transfer says "one moment", closes
// the session and briefs the next companion. Runs as the seeded demo patient, who has met Milo
// and Natalie before but not Sarah. Usage: pnpm voice:smoke (KINDLY_ENV=test for the test project)
import "./load-env";
import { RealtimeSession } from "@openai/agents/realtime";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { localClock } from "@/lib/scheduling/occurrences";
import { runTool } from "@/lib/agents/tools/run";
import { createVoiceAgent, isVoiceAgentKey, type CallOpening, type VoiceAgentKey } from "@/lib/agents/voice-agents";
import { callerContext, createCallSession, endCallSession, recordHandoff } from "@/lib/voice/sessions";
import { handoffBriefing, type Turn } from "@/lib/voice/privacy";

const [user] = await db.select({ id: schema.users.id, timezone: schema.users.timezone }).from(schema.users).where(eq(schema.users.displayName, "Alex Rivera"));
if (!user) throw new Error("Run pnpm demo:reset first");

const sessionId = await createCallSession({ userId: user.id, channel: "browser", activeAgent: "milo" });
const context = await callerContext(user.id, sessionId);
const met = new Set(context.met);
const toolCalls: string[] = [];
const handoffs: string[] = [];
const turns = new Map<string, Turn>();
const holdLines: Record<string, string> = {};
const greetings: Record<string, string> = {};
const briefings: Record<string, string> = {};
const metBefore: Record<string, boolean> = {};

let session!: RealtimeSession;
let active: VoiceAgentKey = "milo";
// Turn tracking across sessions: a transfer swaps the session mid-turn.
let last = Date.now();
let responded = false;
let running = 0;
const touch = () => (last = Date.now());

function lastAssistantText(from = session) {
  const item = from.history.findLast((entry) => entry.type === "message" && entry.role === "assistant");
  if (!item || item.type !== "message") return "";
  return item.content.map((part) => ("text" in part ? part.text : "transcript" in part ? part.transcript : "")).join(" ");
}

async function connect(agent: VoiceAgentKey, opening: CallOpening) {
  metBefore[agent] = met.has(agent);
  const voiceAgent = createVoiceAgent({
    agent,
    opening,
    familiarity: { personName: context.personName, met: [...met].filter(isVoiceAgentKey) },
    invoke: async (who, name, input) => {
      toolCalls.push(`${who}:${name}`);
      return runTool({ userId: user.id, sessionId, agent: who, channel: "browser", timezone: user.timezone }, name, input);
    },
    onTransfer: (to, request) => transfer(agent, to, request),
  });
  met.add(agent);
  const next = new RealtimeSession(voiceAgent, { transport: "websocket", model: process.env.REALTIME_MODEL ?? "gpt-realtime-2.1", tracingDisabled: true, config: { outputModalities: ["text"] } });
  next.transport.on("turn_started", touch);
  next.transport.on("turn_done", () => {
    responded = true;
    touch();
    if (!greetings[agent]) greetings[agent] = lastAssistantText(next);
  });
  // A tool still running (slow database round trips) means the turn isn't over.
  next.on("agent_tool_start", () => (running++, touch()));
  next.on("agent_tool_end", () => ((running = Math.max(0, running - 1)), touch()));
  next.on("history_updated", (history) => {
    for (const item of history) {
      if (item.type !== "message" || item.role === "system") continue;
      const text = item.content.map((part) => ("text" in part ? part.text : "transcript" in part ? part.transcript : "")).join(" ").trim();
      if (text) turns.set(item.itemId, { agent, role: item.role, text });
    }
  });
  // Non-fatal API errors are logged, not thrown.
  next.on("error", (event) => console.warn("realtime error:", (event.error as { error?: { code?: string } })?.error?.code ?? "unknown"));
  session = next;
  active = agent;
  await next.connect({ apiKey: process.env.OPENAI_API_KEY! });
  // The companion speaks first, as on a real call.
  responded = false;
  running = 0;
  touch();
  next.transport.sendEvent({ type: "response.create" });
}

async function transfer(from: VoiceAgentKey, to: VoiceAgentKey, request: string) {
  holdLines[`${from}->${to}`] = lastAssistantText();
  const briefing = handoffBriefing({ from, to, request, turns: [...turns.values()] });
  briefings[to] = briefing;
  session.close();
  handoffs.push(`${from}->${to}`);
  void recordHandoff(sessionId, user.id, from, to, "voice");
  await connect(to, { reason: "transferred", from, briefing });
}

// Waits until the assistant has responded and nothing (speech or tool calls) has happened for a while.
function waitForTurn() {
  return new Promise<void>((resolve) => {
    const started = Date.now();
    const poll = setInterval(() => {
      if ((responded && running === 0 && Date.now() - last > 4000) || Date.now() - started > 60_000) {
        clearInterval(poll);
        resolve();
      }
    }, 250);
  });
}

async function say(text: string) {
  console.log(`\nUSER: ${text}`);
  responded = false;
  touch();
  session.sendMessage(text);
  await waitForTurn();
  console.log(`${active.toUpperCase()}: ${lastAssistantText()}`);
}

const [walk] = await db
  .select({ id: schema.reminders.id })
  .from(schema.reminders)
  .where(and(eq(schema.reminders.userId, user.id), eq(schema.reminders.title, "Morning walk")));

await connect("milo", { reason: "user_started" });
await waitForTurn();
console.log(`MILO (opening): ${lastAssistantText()}`);
await say("What reminders do I have?");
await say("Can you put me through to Natalie please?");
await say("I've been finding it hard to keep up my walks. I'm too tired in the mornings. Can you move my walk reminder to 5 PM?");
const timeBeforeYes = (await db.select({ t: schema.reminders.localTime }).from(schema.reminders).where(eq(schema.reminders.id, walk.id)))[0].t;
await say("Yes, please go ahead.");
const timeAfterYes = (await db.select({ t: schema.reminders.localTime }).from(schema.reminders).where(eq(schema.reminders.id, walk.id)))[0].t;
// A second confirmation of the same proposal must not change anything again.
const confirmation = (await db.select({ id: schema.actionConfirmations.id }).from(schema.actionConfirmations).where(eq(schema.actionConfirmations.sessionId, sessionId)))[0];
const replay = confirmation
  ? await runTool({ userId: user.id, sessionId, agent: "natalie", channel: "browser", timezone: user.timezone }, "confirm_action", { confirmation_id: confirmation.id })
  : null;
const nextJob = await db.select({ dueAt: schema.callJobs.dueAt }).from(schema.callJobs).where(and(eq(schema.callJobs.reminderId, walk.id), eq(schema.callJobs.status, "scheduled")));
await say("I'd like to talk to Sarah now.");
const sarahSawWalks = `${JSON.stringify(session.history)} ${briefings.sarah ?? ""}`.toLowerCase().includes("keep up my walks");
await say("Thanks Sarah. Can you put me back to Milo?");
session.close();
await endCallSession(sessionId, user.id);

const events = await db.select({ type: schema.agentEvents.eventType, payload: schema.agentEvents.structuredPayload }).from(schema.agentEvents).where(eq(schema.agentEvents.sessionId, sessionId));

console.log("\n--- results");
console.log("tool calls:", toolCalls);
console.log("handoffs:", handoffs);
console.log("met before this call:", metBefore);
console.log("greetings:", greetings);
console.log("hold lines:", holdLines);
console.log("Sarah's context contained earlier health talk:", sarahSawWalks);
console.log("stored events:", events.map((event) => event.type).join(", "));
console.log(`walk reminder: before yes ${timeBeforeYes}, after yes ${timeAfterYes}`);
console.log("replayed confirmation:", replay);
console.log("scheduled call jobs for the walk:", nextJob.map((job) => job.dueAt.toISOString()));

const walkGoals = await db.select().from(schema.goals).where(and(eq(schema.goals.userId, user.id), eq(schema.goals.category, "walk")));
console.log("walk goal now:", walkGoals.filter((goal) => goal.endsOn === null).map((goal) => goal.times));
console.log("(run pnpm demo:reset to restore the demo data)");

const ok =
  toolCalls.includes("milo:get_reminders") &&
  toolCalls.includes("natalie:propose_reminder_change") &&
  toolCalls.includes("natalie:confirm_action") &&
  timeBeforeYes === "08:00" &&
  timeAfterYes === "17:00" &&
  replay !== null &&
  replay.ok &&
  "error" in replay.result &&
  events.some((event) => event.type === "delegation") &&
  nextJob.length === 1 &&
  localClock(nextJob[0].dueAt, user.timezone) === "17:00" &&
  walkGoals.some((goal) => goal.times[0] === "17:00" && goal.endsOn === null) &&
  handoffs.includes("milo->natalie") &&
  handoffs.includes("natalie->sarah") &&
  handoffs.includes("sarah->milo") &&
  Object.values(holdLines).every((line) => line.trim().length > 0) &&
  !sarahSawWalks;
console.log(ok ? "SMOKE TEST PASSED" : "SMOKE TEST FAILED");
process.exit(ok ? 0 : 1);
