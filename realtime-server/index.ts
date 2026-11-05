import Fastify, { LogController, type FastifyRequest } from "fastify";
import formbody from "@fastify/formbody";
import websocket from "@fastify/websocket";
import twilio from "twilio";
import { env } from "./env";
import { bindToken, consumeToken, issueToken } from "@/lib/telephony/stream-tokens";
import { handleTwilioMediaStream } from "@/lib/voice/twilio-realtime";

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
    const streamToken = issueToken("stream", 60_000, { callSid });
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
  return reply.code(204).send();
});

app.get("/twilio/media-stream", { websocket: true }, (socket, request) => {
  handleTwilioMediaStream(socket, {
    apiKey: env.OPENAI_API_KEY,
    model: env.REALTIME_MODEL,
    log: request.log,
    authorize: (token) => {
      const data = consumeToken(token, "stream");
      return data?.callSid ? { callSid: data.callSid } : null;
    },
  });
});

if (env.NODE_ENV !== "production") {
  const COOLDOWN_MS = 30_000;
  let lastCallAt = 0;

  // Development-only "call my phone now": only ever dials the verified demo number.
  app.post("/dev/call-me", async (request, reply) => {
    if (request.headers["x-dev-token"] !== env.DEV_ADMIN_TOKEN) return reply.code(401).send();
    if (Date.now() - lastCallAt < COOLDOWN_MS) {
      return reply.code(429).send({ error: "Please wait 30 seconds between test calls." });
    }
    lastCallAt = Date.now();

    // The call token goes into the answer URL, so it is issued before dialling and bound to
    // the CallSid once Twilio returns it (the answer URL is only fetched after pickup).
    const pending = issueToken("call", 120_000);
    try {
      const call = await twilioClient.calls.create({
        to: env.DEMO_CALL_TO_NUMBER,
        from: env.TWILIO_PHONE_NUMBER,
        url: `${env.PUBLIC_BASE_URL}/twilio/voice?t=${pending}`,
        statusCallback: `${env.PUBLIC_BASE_URL}/twilio/status`,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        timeout: 30,
        timeLimit: env.CALL_MAX_DURATION_SECONDS,
      });
      bindToken(pending, { callSid: call.sid });
      request.log.info({ callSid: call.sid }, "test call placed");
      return { callSid: call.sid, status: call.status };
    } catch (error) {
      consumeToken(pending, "call");
      const err = error as { status?: number; code?: number; message?: string };
      request.log.error({ status: err.status, code: err.code, message: err.message }, "twilio call failed");
      return reply.code(502).send({ error: "Twilio rejected the call", code: err.code, message: err.message });
    }
  });
}

await app.listen({ port: env.REALTIME_PORT, host: "0.0.0.0" });
app.log.info({ publicBaseUrl: env.PUBLIC_BASE_URL }, "kindly realtime server ready");
