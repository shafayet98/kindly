// Must be first: loads and validates .env before any module reads process.env.
import { env } from "./env";
import Fastify, { LogController, type FastifyRequest } from "fastify";
import formbody from "@fastify/formbody";
import websocket from "@fastify/websocket";
import twilio from "twilio";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { checkCallEligibility } from "@/lib/telephony/eligibility";
import { queueOnDemandCall } from "@/lib/scheduling/jobs";
import { consumeToken, issueToken } from "@/lib/telephony/stream-tokens";
import { handleTwilioMediaStream, type AuthorizedCall } from "@/lib/voice/twilio-realtime";
import { purgeExpiredNotes } from "@/lib/wellbeing/notes";
import { applyCallStatus, startScheduler } from "./scheduler";

// Request logging is off: Twilio URLs carry one-time tokens. Routes log what matters themselves.
const app = Fastify({
  logger: { level: "info" },
  logController: new LogController({ disableRequestLogging: true }),
});
await app.register(formbody);
await app.register(websocket);

const twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
const streamUrl = `${env.PUBLIC_BASE_URL.replace(/^https:/, "wss:")}/twilio/media-stream`;

// Twilio signs every webhook with the auth token over the exact public URL and form params.
function isSignedByTwilio(request: FastifyRequest) {
  const signature = request.headers["x-twilio-signature"];
  if (typeof signature !== "string") return false;
  return twilio.validateRequest(
    env.TWILIO_AUTH_TOKEN,
    signature,
    `${env.PUBLIC_BASE_URL}${request.url}`,
    (request.body ?? {}) as Record<string, string>,
  );
}

app.get("/health", async () => ({ ok: true }));

// Twilio fetches this when the callee answers. We reply with TwiML that opens the media stream.
app.post<{ Querystring: { t?: string }; Body: Record<string, string> }>("/twilio/voice", async (request, reply) => {
  if (!isSignedByTwilio(request)) {
    request.log.warn("rejected unsigned /twilio/voice request");
    return reply.code(403).send();
  }
  const callSid = request.body.CallSid;
  const response = new twilio.twiml.VoiceResponse();
  const callToken = consumeToken(request.query.t, "call");

  if (!callToken || callToken.callSid !== callSid) {
    request.log.warn({ callSid }, "call answered without a valid call token; hanging up");
    response.hangup();
  } else {
    const streamToken = issueToken("stream", 60_000, callToken);
    const stream = response.connect().stream({ url: streamUrl });
    stream.parameter({ name: "streamToken", value: streamToken });
    request.log.info({ callSid }, "call answered; opening media stream");
  }
  return reply.type("text/xml").send(response.toString());
});

app.post<{ Body: Record<string, string> }>("/twilio/status", async (request, reply) => {
  if (!isSignedByTwilio(request)) return reply.code(403).send();
  const { CallSid, CallStatus, CallDuration, ErrorCode } = request.body;
  request.log.info({ callSid: CallSid, status: CallStatus, duration: CallDuration, errorCode: ErrorCode }, "call status");
  await applyCallStatus(CallSid, CallStatus, request.log);
  return reply.code(204).send();
});

app.get("/twilio/media-stream", { websocket: true }, (socket, request) => {
  handleTwilioMediaStream(socket, {
    apiKey: env.OPENAI_API_KEY,
    model: env.REALTIME_MODEL,
    log: request.log,
    authorize: (token, callSid) => {
      const data = consumeToken(token, "stream") as AuthorizedCall | null;
      return data && data.callSid === callSid ? data : null;
    },
  });
});

if (env.NODE_ENV !== "production") {
  // Development-only "call my phone now" for the user whose confirmed number is the verified demo
  // number. It queues a normal on-demand job, so it goes through every consent and limit check.
  app.post("/dev/call-me", async (request, reply) => {
    if (request.headers["x-dev-token"] !== env.DEV_ADMIN_TOKEN) return reply.code(401).send();
    const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.phoneE164, env.DEMO_CALL_TO_NUMBER)).limit(1);
    if (!user) return reply.code(409).send({ error: "No user has the demo number. Run pnpm demo:reset." });
    const eligibility = await checkCallEligibility(user.id);
    if (!eligibility.ok) return reply.code(409).send({ error: `Calls not allowed for this user: ${eligibility.reason}` });
    const queued = await queueOnDemandCall(user.id);
    return queued.ok ? { queued: queued.jobId } : reply.code(429).send({ error: queued.reason });
  });
}

// Retention: expired private wellbeing notes are deleted, not just hidden.
const purge = async () => {
  try {
    const removed = await purgeExpiredNotes();
    if (removed) app.log.info({ removed }, "expired wellbeing notes deleted");
  } catch (error) {
    app.log.error({ err: error instanceof Error ? error.message : "unknown" }, "note retention purge failed");
  }
};
void purge();
setInterval(purge, 60 * 60_000);

if (env.SCHEDULER_ENABLED) {
  startScheduler({ env, twilio: twilioClient, log: app.log });
  app.log.info("call scheduler running");
} else {
  app.log.warn("call scheduler is OFF (set SCHEDULER_ENABLED=true); scheduled and on-demand calls will wait");
}

await app.listen({ port: env.REALTIME_PORT, host: "0.0.0.0" });
app.log.info({ publicBaseUrl: env.PUBLIC_BASE_URL }, "kindly realtime server ready");
