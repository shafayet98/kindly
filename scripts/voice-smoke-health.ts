// Text-only smoke test of Natalie's health tools against the real Realtime API (a few cents):
// log a check-in, correct it, review progress (Iris), agree a smaller goal and move a bedtime (Theo).
// Runs as the demo patient; run `pnpm demo:reset` afterwards. Usage: pnpm voice:smoke:health
import "./load-env";
import { RealtimeSession } from "@openai/agents/realtime";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { runTool } from "@/lib/agents/tools/run";
import { createVoiceAgents } from "@/lib/agents/voice-agents";
import { createCallSession, endCallSession } from "@/lib/voice/sessions";

const [user] = await db.select({ id: schema.users.id, timezone: schema.users.timezone }).from(schema.users).where(eq(schema.users.displayName, "Alex Rivera"));
if (!user) throw new Error("Run pnpm demo:reset first");
const [walkGoal] = await db.select().from(schema.goals).where(and(eq(schema.goals.userId, user.id), eq(schema.goals.title, "Walk three times a week")));

const sessionId = await createCallSession({ userId: user.id, channel: "browser", activeAgent: "natalie" });
const toolCalls: string[] = [];
const { start } = createVoiceAgents({
  startAgent: "natalie",
  opening: { reason: "user_started" },
  invoke: async (agent, name, input) => {
    toolCalls.push(`${agent}:${name}`);
    return runTool({ userId: user.id, sessionId, agent, channel: "browser", timezone: user.timezone }, name, input);
  },
});
const session = new RealtimeSession(start, { transport: "websocket", model: process.env.REALTIME_MODEL ?? "gpt-realtime-2.1", tracingDisabled: true, config: { outputModalities: ["text"] } });

// Waits until the assistant has finished responding and no tool call has started for a while.
function waitForTurn() {
  return new Promise<void>((resolve, reject) => {
    let last = Date.now();
    let responded = false;
    const touch = () => (last = Date.now());
    const done = () => {
      responded = true;
      touch();
    };
    session.transport.on("turn_started", touch);
    session.transport.on("turn_done", done);
    session.on("agent_tool_start", touch);
    session.on("agent_tool_end", touch);
    const started = Date.now();
    const poll = setInterval(() => {
      if (responded && Date.now() - last > 4000) finish();
      else if (Date.now() - started > 60_000) finish(new Error("timed out"));
    }, 250);
    function finish(error?: Error) {
      clearInterval(poll);
      session.transport.off("turn_started", touch);
      session.transport.off("turn_done", done);
      session.off("agent_tool_start", touch);
      session.off("agent_tool_end", touch);
      if (error) reject(error);
      else resolve();
    }
  });
}
async function say(text: string) {
  console.log(`\nUSER: ${text}`);
  session.sendMessage(text);
  await waitForTurn();
  const item = session.history.findLast((entry) => entry.type === "message" && entry.role === "assistant");
  if (item?.type === "message") console.log(`NATALIE: ${item.content.map((part) => ("text" in part ? part.text : "transcript" in part ? part.transcript : "")).join(" ")}`);
}

await session.connect({ apiKey: process.env.OPENAI_API_KEY! });
await say("Hi Natalie. I walked for 15 minutes this morning.");
await say("Oh sorry, actually it was 25 minutes, not 15.");
await say("How am I doing with my walking goal lately?");
await say("I keep missing walks because my evening shifts changed and I'm wiped out. Could we make the goal twice a week instead of three?");
await say("Yes, please go ahead with that.");
await say("One more thing: can you update my bedtime from 10:30 to 10 PM?");
await say("Yes, go ahead.");
session.close();
await endCallSession(sessionId, user.id);

const [latest] = await db
  .select({ value: schema.habitEvents.value, correctedFrom: schema.habitEvents.correctedFrom })
  .from(schema.habitEvents)
  .where(and(eq(schema.habitEvents.userId, user.id), isNotNull(schema.habitEvents.correctedFrom)))
  .orderBy(desc(schema.habitEvents.createdAt))
  .limit(1);
const [goalAfter] = await db.select().from(schema.goals).where(eq(schema.goals.id, walkGoal.id));
const [bedtime] = await db.select().from(schema.goals).where(and(eq(schema.goals.userId, user.id), eq(schema.goals.type, "sleep")));
const events = await db.select({ type: schema.agentEvents.eventType, payload: schema.agentEvents.structuredPayload }).from(schema.agentEvents).where(eq(schema.agentEvents.sessionId, sessionId));

console.log("\n--- results");
console.log("tool calls:", toolCalls);
console.log("latest correction value:", latest?.value);
console.log("walk goal target:", goalAfter.target, "plan version:", goalAfter.planVersion);
console.log("bedtime goal:", bedtime.title, bedtime.target);
console.log("delegations:", events.filter((e) => e.type === "delegation").map((e) => `${e.payload.from}->${e.payload.to}`));
const ok =
  toolCalls.includes("natalie:log_habit") &&
  toolCalls.includes("natalie:correct_habit") &&
  toolCalls.includes("natalie:get_progress") &&
  toolCalls.includes("natalie:propose_plan_adjustment") &&
  toolCalls.includes("natalie:confirm_action") &&
  Number(latest?.value) === 25 &&
  goalAfter.target.timesPerWeek === 2 &&
  goalAfter.planVersion === 2 &&
  bedtime.target.time === "22:00" &&
  bedtime.title === "In bed by 10:00 on weeknights";
console.log(ok ? "HEALTH SMOKE TEST PASSED" : "HEALTH SMOKE TEST FAILED");
process.exit(ok ? 0 : 1);
