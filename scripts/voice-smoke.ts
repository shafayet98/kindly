// Text-only smoke test of the live voice agents against the real Realtime API (costs a few cents).
// Runs as the seeded demo patient. Usage: pnpm voice:smoke
import "./load-env";
import { RealtimeSession } from "@openai/agents/realtime";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { localClock } from "@/lib/scheduling/occurrences";
import { runTool } from "@/lib/agents/tools/run";
import { agentKeyOf, createVoiceAgents, type VoiceAgentKey } from "@/lib/agents/voice-agents";
import { createCallSession, endCallSession, recordHandoff } from "@/lib/voice/sessions";
import { crossesPrivacyBoundary, pruneForHandoff } from "@/lib/voice/privacy";

const [user] = await db.select({ id: schema.users.id, timezone: schema.users.timezone }).from(schema.users).where(eq(schema.users.displayName, "Alex Rivera"));
if (!user) throw new Error("Run pnpm demo:reset first");

const sessionId = await createCallSession({ userId: user.id, channel: "browser", activeAgent: "milo" });
const toolCalls: string[] = [];
const handoffs: string[] = [];
let prunedAt: number | null = null;

const { start } = createVoiceAgents({
  startAgent: "milo",
  opening: { reason: "user_started" },
  invoke: async (agent, name, input) => {
    toolCalls.push(`${agent}:${name}`);
    return runTool({ userId: user.id, sessionId, agent, channel: "browser", timezone: user.timezone }, name, input);
  },
});

const session = new RealtimeSession(start, {
  transport: "websocket",
  model: process.env.REALTIME_MODEL ?? "gpt-realtime-2.1",
  tracingDisabled: true,
  config: { outputModalities: ["text"] },
});

let active: VoiceAgentKey = "milo";
session.on("agent_handoff", (_ctx, from, to) => {
  const fromKey = agentKeyOf(from);
  const toKey = agentKeyOf(to);
  if (crossesPrivacyBoundary(fromKey, toKey)) {
    session.updateHistory(pruneForHandoff);
    prunedAt = session.history.length;
  }
  handoffs.push(`${fromKey}->${toKey}`);
  active = toKey;
  void recordHandoff(sessionId, user.id, fromKey, toKey, "voice");
});

// Waits until the assistant has responded and nothing (speech or tool calls) has happened for a while.
function waitForTurn() {
  return new Promise<void>((resolve) => {
    let last = Date.now();
    let responded = false;
    const touch = () => (last = Date.now());
    const done = () => {
      responded = true;
      touch();
    };
    session.transport.on("turn_started", touch);
    session.transport.on("turn_done", done);
    // A tool still running (slow database round trips) means the turn isn't over.
    let running = 0;
    const toolStart = () => {
      running++;
      touch();
    };
    const toolEnd = () => {
      running = Math.max(0, running - 1);
      touch();
    };
    session.on("agent_tool_start", toolStart);
    session.on("agent_tool_end", toolEnd);
    const started = Date.now();
    const poll = setInterval(() => {
      if ((responded && running === 0 && Date.now() - last > 4000) || Date.now() - started > 60_000) {
        clearInterval(poll);
        session.transport.off("turn_started", touch);
        session.transport.off("turn_done", done);
        session.off("agent_tool_start", toolStart);
        session.off("agent_tool_end", toolEnd);
        resolve();
      }
    }, 250);
  });
}

function lastAssistantText() {
  const item = session.history.findLast((entry) => entry.type === "message" && entry.role === "assistant");
  if (!item || item.type !== "message") return "";
  return item.content.map((part) => ("text" in part ? part.text : "transcript" in part ? part.transcript : "")).join(" ");
}

async function say(text: string) {
  console.log(`\nUSER: ${text}`);
  session.sendMessage(text);
  await waitForTurn();
  console.log(`${active.toUpperCase()}: ${lastAssistantText()}`);
}

const [walk] = await db
  .select({ id: schema.reminders.id })
  .from(schema.reminders)
  .where(and(eq(schema.reminders.userId, user.id), eq(schema.reminders.title, "Morning walk")));

// Non-fatal API errors (e.g. deleting an item that's already gone during a handoff) are logged, not thrown.
session.on("error", (event) => console.warn("realtime error:", (event.error as { error?: { code?: string } })?.error?.code ?? "unknown"));
await session.connect({ apiKey: process.env.OPENAI_API_KEY! });
await say("Hi Milo, what reminders do I have?");
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
const sarahSawWalks = JSON.stringify(session.history).toLowerCase().includes("keep up my walks");
await say("Thanks Sarah. Can you put me back to Milo?");
session.close();
await endCallSession(sessionId, user.id);

const events = await db.select({ type: schema.agentEvents.eventType, payload: schema.agentEvents.structuredPayload }).from(schema.agentEvents).where(eq(schema.agentEvents.sessionId, sessionId));

console.log("\n--- results");
console.log("tool calls:", toolCalls);
console.log("handoffs:", handoffs);
console.log("history pruned at Sarah boundary:", prunedAt !== null);
console.log("Sarah's context still contained earlier health talk:", sarahSawWalks);
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
  !sarahSawWalks;
console.log(ok ? "SMOKE TEST PASSED" : "SMOKE TEST FAILED");
process.exit(ok ? 0 : 1);
