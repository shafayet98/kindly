// Text-only smoke test of the live voice agents against the real Realtime API (costs a few cents).
// Runs as the seeded demo patient. Usage: pnpm voice:smoke
import "./load-env";
import { RealtimeSession } from "@openai/agents/realtime";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
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

function waitForTurn() {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for a response")), 30_000);
    const onDone = () => {
      // A handoff or tool call produces more than one response; wait until things go quiet.
      clearTimeout(timer);
      setTimeout(() => {
        session.transport.off("turn_done", onDone);
        resolve();
      }, 2500);
    };
    session.transport.on("turn_done", onDone);
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

await session.connect({ apiKey: process.env.OPENAI_API_KEY! });
await say("Hi Milo, what reminders do I have?");
await say("Can you put me through to Natalie please?");
await say("I've been finding it hard to keep up my walks.");
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
const ok = toolCalls.includes("milo:get_reminders") && handoffs.includes("milo->natalie") && handoffs.includes("natalie->sarah") && !sarahSawWalks;
console.log(ok ? "SMOKE TEST PASSED" : "SMOKE TEST FAILED");
process.exit(ok ? 0 : 1);
