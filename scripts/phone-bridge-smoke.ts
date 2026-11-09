// Exercises the Twilio media-stream bridge without a real phone call: a local WebSocket client
// speaks Twilio's protocol to the real bridge, which talks to the real Realtime API (a few cents).
// Usage: pnpm phone:smoke
import "./load-env";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { and, desc, eq } from "drizzle-orm";
import WebSocket from "ws";
import { db, schema } from "@/lib/db";
import { consumeToken, issueToken } from "@/lib/telephony/stream-tokens";
import type { RealtimeSession } from "@openai/agents/realtime";
import type { VoiceAgentKey } from "@/lib/agents/voice-agents";
import { handleTwilioMediaStream, type AuthorizedCall } from "@/lib/voice/twilio-realtime";

const [user] = await db.select({ id: schema.users.id, timezone: schema.users.timezone }).from(schema.users).where(eq(schema.users.displayName, "Alex Rivera"));
if (!user) throw new Error("Run pnpm demo:reset first");

// Each companion's session as it connects, with when it joined.
const companions: { agent: VoiceAgentKey; session: RealtimeSession; at: number }[] = [];

const app = Fastify({ logger: { level: "warn" } });
await app.register(websocket);
app.get("/twilio/media-stream", { websocket: true }, (socket, request) => {
  handleTwilioMediaStream(socket, {
    apiKey: process.env.OPENAI_API_KEY!,
    model: process.env.REALTIME_MODEL ?? "gpt-realtime-2.1",
    log: request.log,
    onSession: (agent, session) => companions.push({ agent, session, at: Date.now() }),
    authorize: (token, callSid) => {
      const data = consumeToken(token, "stream") as AuthorizedCall | null;
      return data && data.callSid === callSid ? data : null;
    },
  });
});
await app.listen({ port: 8798, host: "127.0.0.1" });

async function runStream(streamToken: string, callSid: string, { seconds = 9, during }: { seconds?: number; during?: () => Promise<void> } = {}) {
  const ws = new WebSocket("ws://127.0.0.1:8798/twilio/media-stream");
  let audioBytes = 0;
  let closedCode: number | null = null;
  // Like Twilio: audio plays in real time, and a mark is echoed once the audio before it has played.
  let playhead = Date.now();
  const audio: { at: number; bytes: number }[] = [];
  const echoes = new Set<ReturnType<typeof setTimeout>>();
  const echo = (name: string) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ event: "mark", streamSid: "MZsmoke", mark: { name } }));
  ws.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.event === "media") {
      const bytes = Buffer.from(message.media.payload, "base64").length;
      audioBytes += bytes;
      audio.push({ at: Date.now(), bytes });
      playhead = Math.max(playhead, Date.now()) + bytes / 8;
    } else if (message.event === "mark") {
      const timer = setTimeout(() => (echoes.delete(timer), echo(message.mark.name)), Math.max(0, playhead - Date.now()));
      echoes.add(timer);
    } else if (message.event === "clear") {
      playhead = Date.now();
    }
  });
  ws.on("close", (code) => (closedCode = code));
  await new Promise((resolve) => ws.on("open", resolve));
  ws.send(JSON.stringify({ event: "connected", protocol: "Call", version: "1.0.0" }));
  ws.send(
    JSON.stringify({
      event: "start",
      streamSid: "MZsmoke",
      start: { streamSid: "MZsmoke", callSid, customParameters: { streamToken }, mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 } },
    }),
  );
  // 20 ms frames of μ-law silence, like a quiet line.
  const silence = Buffer.alloc(160, 0xff).toString("base64");
  const ticker = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event: "media", streamSid: "MZsmoke", media: { payload: silence, timestamp: String(Date.now()) } }));
  }, 20);
  await Promise.all([new Promise((resolve) => setTimeout(resolve, seconds * 1000)), during?.()]);
  clearInterval(ticker);
  for (const timer of echoes) clearTimeout(timer);
  if (ws.readyState === WebSocket.OPEN) ws.close();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  // μ-law at 8 kHz: 8000 bytes per second.
  return { audioSeconds: audioBytes / 8000, closedCode, audioBetween: (from: number, to: number) => audio.filter((a) => a.at >= from && a.at < to).reduce((sum, a) => sum + a.bytes, 0) / 8000 };
}

// 1) A forged token is rejected before anything reaches OpenAI.
const forged = await runStream("not-a-real-token", "CAforged");
console.log("forged token -> closed with", forged.closedCode, "audio seconds:", forged.audioSeconds);

// 2) A valid token for this call gets Milo talking.
const callSid = `CAsmoke${Date.now()}`;
const streamToken = issueToken("stream", 60_000, { callSid, userId: user.id, timezone: user.timezone, opening: { reason: "test_call" }, startAgent: "milo" });
const valid = await runStream(streamToken, callSid);
console.log("valid token -> seconds of audio from Milo:", valid.audioSeconds.toFixed(1));

const [session] = await db
  .select({ channel: schema.callSessions.channel, state: schema.callSessions.state, userId: schema.callSessions.userId, sid: schema.callSessions.twilioCallSid })
  .from(schema.callSessions)
  .where(eq(schema.callSessions.twilioCallSid, callSid))
  .orderBy(desc(schema.callSessions.startedAt));
console.log("stored session:", session ? { channel: session.channel, state: session.state, ownedByAlex: session.userId === user.id } : null);

// 3) A replayed token is refused (tokens are one-time).
const replay = await runStream(streamToken, callSid);
console.log("replayed token -> closed with", replay.closedCode, "audio seconds:", replay.audioSeconds);

// 4) Asking for Natalie: Milo says "one moment", then Natalie joins in her own voice on the same call.
companions.length = 0;
const transferSid = `CAsmokeT${Date.now()}`;
const transferToken = issueToken("stream", 60_000, { callSid: transferSid, userId: user.id, timezone: user.timezone, opening: { reason: "test_call" }, startAgent: "milo" });
let askedAt = 0;
const transferred = await runStream(transferToken, transferSid, {
  seconds: 30,
  during: async () => {
    await new Promise((resolve) => setTimeout(resolve, 8000)); // Milo's greeting
    askedAt = Date.now();
    companions[0]?.session.sendMessage("Please put me through to Natalie.");
  },
});
const natalie = companions.find((companion) => companion.agent === "natalie");
const holdSeconds = natalie ? transferred.audioBetween(askedAt, natalie.at) : 0;
const natalieSeconds = natalie ? transferred.audioBetween(natalie.at, Date.now()) : 0;
const [transferSession] = await db.select({ id: schema.callSessions.id, active: schema.callSessions.activeAgent }).from(schema.callSessions).where(eq(schema.callSessions.twilioCallSid, transferSid));
const handoffEvents = transferSession
  ? await db.select({ payload: schema.agentEvents.structuredPayload }).from(schema.agentEvents).where(and(eq(schema.agentEvents.sessionId, transferSession.id), eq(schema.agentEvents.eventType, "handoff")))
  : [];
console.log("transfer -> companions:", companions.map((c) => `${c.agent} (${c.session.currentAgent.voice})`).join(", "));
console.log(`  Milo's hold line: ${holdSeconds.toFixed(1)} s of audio; Natalie afterwards: ${natalieSeconds.toFixed(1)} s`);
console.log("  stored handoffs:", handoffEvents.map((event) => `${event.payload.from}->${event.payload.to} (${event.payload.via})`), "active agent:", transferSession?.active);

await app.close();
const ok =
  forged.closedCode === 1008 &&
  forged.audioSeconds === 0 &&
  valid.audioSeconds > 1 &&
  session?.state === "ended" &&
  replay.closedCode === 1008 &&
  replay.audioSeconds === 0 &&
  companions.map((c) => c.agent).join(",") === "milo,natalie" &&
  companions[0].session.currentAgent.voice !== companions[1].session.currentAgent.voice &&
  holdSeconds > 0.5 &&
  natalieSeconds > 1 &&
  handoffEvents.length === 1 &&
  transferSession?.active === "natalie";
console.log(ok ? "PHONE BRIDGE SMOKE TEST PASSED" : "PHONE BRIDGE SMOKE TEST FAILED");
process.exit(ok ? 0 : 1);
