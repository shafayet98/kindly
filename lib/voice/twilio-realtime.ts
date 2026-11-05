import type { WebSocket } from "ws";
import { RealtimeSession } from "@openai/agents/realtime";
import { TwilioRealtimeTransportLayer } from "@openai/agents-extensions";
import type { FastifyBaseLogger } from "fastify";
import { createVoiceAgents } from "@/lib/agents/voice-agents";

type StreamAuthorizer = (streamToken: string | undefined) => { callSid: string } | null;

type Options = {
  apiKey: string;
  model: string;
  log: FastifyBaseLogger;
  authorize: StreamAuthorizer;
};

const START_TIMEOUT_MS = 10_000;

/**
 * Bridges one Twilio Media Stream to an OpenAI RealtimeSession running the Kindly voice agents.
 * The OpenAI connection is only opened after the stream proves it belongs to a call we placed.
 */
export function handleTwilioMediaStream(socket: WebSocket, { apiKey, model, log, authorize }: Options) {
  const { milo } = createVoiceAgents();
  // Construct the transport immediately so it sees Twilio's `start` event (it carries the streamSid).
  const transport = new TwilioRealtimeTransportLayer({ twilioWebSocket: socket });
  const session = new RealtimeSession(milo, { transport, model, tracingDisabled: true });

  let callSid: string | null = null;
  let started = false;
  const openedAt = Date.now();

  const startTimer = setTimeout(() => {
    if (!started) {
      log.warn("media stream sent no start event; closing");
      socket.close(1008, "start timeout");
    }
  }, START_TIMEOUT_MS);

  socket.on("message", async (raw) => {
    if (started) return;
    let message: { event?: string; start?: { callSid?: string; customParameters?: Record<string, string> } };
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (message.event !== "start") return;
    started = true;
    clearTimeout(startTimer);

    const auth = authorize(message.start?.customParameters?.streamToken);
    if (!auth || auth.callSid !== message.start?.callSid) {
      log.warn("media stream rejected: invalid stream token");
      socket.close(1008, "unauthorized");
      return;
    }
    callSid = auth.callSid;

    try {
      await session.connect({ apiKey });
      log.info({ callSid, agent: session.currentAgent.name }, "voice session connected");
      // Milo speaks first, like a person who placed the call.
      session.transport.sendEvent({ type: "response.create" });
    } catch (error) {
      log.error({ callSid, err: describeError(error) }, "failed to connect realtime session");
      socket.close(1011, "realtime unavailable");
    }
  });

  session.on("agent_handoff", (_context, fromAgent, toAgent) => {
    log.info({ callSid, from: fromAgent.name, to: toAgent.name }, "agent handoff");
  });

  session.on("error", (event) => {
    log.error({ callSid, err: describeError(event.error) }, "realtime session error");
  });

  socket.on("close", () => {
    clearTimeout(startTimer);
    try {
      session.close();
    } catch {
      // Already closed by the transport.
    }
    log.info({ callSid, seconds: Math.round((Date.now() - openedAt) / 1000) }, "media stream closed");
  });
}

// Error objects from the realtime API can embed conversation content; log only the shape.
function describeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message };
  if (error && typeof error === "object" && "error" in error) {
    const inner = (error as { error?: { type?: string; code?: string; message?: string } }).error;
    return { type: inner?.type, code: inner?.code, message: inner?.message };
  }
  return { type: typeof error };
}
