// Text-only smoke test of Natalie's health tools against the real Realtime API (a few cents):
// log and correct a check-in, mark a goal session done, add a goal and move a bedtime (Theo).
// Runs as the demo patient; run `pnpm demo:reset` afterwards. Usage: pnpm voice:smoke:health
import "./load-env";
import { RealtimeSession } from "@openai/agents/realtime";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { runTool } from "@/lib/agents/tools/run";
import { createVoiceAgents } from "@/lib/agents/voice-agents";
import { activeGoals } from "@/lib/goals/service";
import { localDate } from "@/lib/time";
import { createCallSession, endCallSession } from "@/lib/voice/sessions";

const [user] = await db.select({ id: schema.users.id, timezone: schema.users.timezone }).from(schema.users).where(eq(schema.users.displayName, "Alex Rivera"));
if (!user) throw new Error("Run pnpm demo:reset first");

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
      if (responded && running === 0 && Date.now() - last > 4000) finish();
      else if (Date.now() - started > 60_000) finish(new Error("timed out"));
    }, 250);
    function finish(error?: Error) {
      clearInterval(poll);
      session.transport.off("turn_started", touch);
      session.transport.off("turn_done", done);
      session.off("agent_tool_start", toolStart);
      session.off("agent_tool_end", toolEnd);
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

// Non-fatal API errors (e.g. deleting an item that's already gone during a handoff) are logged, not thrown.
session.on("error", (event) => console.warn("realtime error:", (event.error as { error?: { code?: string } })?.error?.code ?? "unknown"));
await session.connect({ apiKey: process.env.OPENAI_API_KEY! });
await say("Hi Natalie. I slept about 6 hours last night.");
await say("Sorry, actually it was more like 7 hours, not 6.");
await say("I took my blood pressure tablet this morning.");
await say("I'd like to start doing 30 push-ups, twice a week, any days.");
await say("Yes, that's right, please add it.");
await say("No reminder for that one, thanks. Also, can you move my bedtime from 10:30 to 10 PM, every weeknight from now on?");
await say("Yes, go ahead.");
session.close();
await endCallSession(sessionId, user.id);

const today = localDate(new Date(), user.timezone);
const [latestSleep] = await db
  .select({ value: schema.habitEvents.value })
  .from(schema.habitEvents)
  .where(and(eq(schema.habitEvents.userId, user.id), isNotNull(schema.habitEvents.correctedFrom), eq(schema.habitEvents.kind, "sleep")))
  .orderBy(desc(schema.habitEvents.createdAt))
  .limit(1);
const goals = await activeGoals(user.id);
const pushups = goals.find((goal) => goal.category === "workout" && /push/i.test(goal.title) && goal.createdInSessionId === sessionId);
const bedtime = goals.find((goal) => goal.category === "sleep");
const tabletToday = await db
  .select({ status: schema.goalSessions.status })
  .from(schema.goalSessions)
  .where(and(eq(schema.goalSessions.userId, user.id), eq(schema.goalSessions.scheduledDate, today), eq(schema.goalSessions.sessionId, sessionId)));
const events = await db.select({ type: schema.agentEvents.eventType, payload: schema.agentEvents.structuredPayload }).from(schema.agentEvents).where(eq(schema.agentEvents.sessionId, sessionId));

console.log("\n--- results");
console.log("tool calls:", toolCalls);
console.log("corrected sleep:", latestSleep?.value);
console.log("tablet marked today in this call:", tabletToday.map((row) => row.status));
console.log("new goal:", pushups && { title: pushups.title, cadence: pushups.cadence, target: pushups.targetCount, days: pushups.daysOfWeek, by: pushups.createdByAgent });
console.log("bedtime goal:", bedtime && { title: bedtime.title, times: bedtime.times, days: bedtime.daysOfWeek });
console.log("delegations:", events.filter((e) => e.type === "delegation").map((e) => `${e.payload.from}->${e.payload.to}`));
const ok =
  Number(latestSleep?.value) === 7 &&
  tabletToday.some((row) => row.status === "done") &&
  Boolean(pushups && pushups.cadence === "weekly" && pushups.targetCount === 2 && pushups.daysOfWeek === null) &&
  Boolean(bedtime && bedtime.times[0] === "22:00" && /10:00/.test(bedtime.title));
console.log(ok ? "HEALTH SMOKE TEST PASSED (run pnpm demo:reset to restore the demo data)" : "HEALTH SMOKE TEST FAILED");
process.exit(ok ? 0 : 1);
