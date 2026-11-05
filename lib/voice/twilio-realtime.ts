import type { WebSocket } from "ws";
import { RealtimeSession } from "@openai/agents/realtime";
import { TwilioRealtimeTransportLayer } from "@openai/agents-extensions";
import type { FastifyBaseLogger } from "fastify";
import { runTool } from "@/lib/agents/tools/run";
import { agentKeyOf, createVoiceAgents, REALTIME_VOICE, type CallOpening, type VoiceAgentKey } from "@/lib/agents/voice-agents";
import { createCallSession, endCallSession, MAX_SESSION_MINUTES, recordHandoff } from "./sessions";
import { crossesPrivacyBoundary, pruneForHandoff } from "./privacy";

/** What a valid stream token proves: which call this is and whose it is. */
export type AuthorizedCall = {
  callSid: string;
  userId: string;
  timezone: string;
  opening: CallOpening;
  startAgent: VoiceAgentKey;
  callJobId?: string;
};

type Options = {
  apiKey: string;
  model: string;
  log: FastifyBaseLogger;
  authorize: (streamToken: string | undefined, callSid: string | undefined) => AuthorizedCall | null;
};

const START_TIMEOUT_MS = 10_000;

/**
 * Bridges one Twilio Media Stream to an OpenAI RealtimeSession running the Kindly voice agents.
 * Nothing is sent to OpenAI until the stream proves it belongs to a call Kindly placed.
 */
export function handleTwilioMediaStream(socket: WebSocket, { apiKey, model, log, authorize }: Options) {
  // Created immediately so it sees Twilio's `start` event, which carries the streamSid.
  const transport = new TwilioRealtimeTransportLayer({ twilioWebSocket: socket });
  let session: RealtimeSession | null = null;
  let call: AuthorizedCall | null = null;
  let sessionId: string | null = null;
  let started = false;
  const openedAt = Date.now();

  const startTimer = setTimeout(() => {
    if (!started) {
      log.warn("media stream sent no start event; closing");
      socket.close(1008, "start timeout");
    }
  }, START_TIMEOUT_MS);

  // Hard stop in case Twilio's own time limit is misconfigured.
  const maxDurationTimer = setTimeout(() => socket.close(1000, "max duration"), MAX_SESSION_MINUTES * 60_000);

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

    call = authorize(message.start?.customParameters?.streamToken, message.start?.callSid);
    if (!call) {
      log.warn("media stream rejected: invalid stream token");
      socket.close(1008, "unauthorized");
      return;
    }
    const authorized = call;

    try {
      sessionId = await createCallSession({
        userId: authorized.userId,
        channel: "phone",
        activeAgent: authorized.startAgent,
        twilioCallSid: authorized.callSid,
        callJobId: authorized.callJobId,
      });
      const currentSessionId = sessionId;
      let activeAgent: VoiceAgentKey = authorized.startAgent;

      const { start } = createVoiceAgents({
        startAgent: authorized.startAgent,
        opening: authorized.opening,
        invoke: (agent, name, input) =>
          runTool({ userId: authorized.userId, sessionId: currentSessionId, agent, channel: "phone", timezone: authorized.timezone }, name, input),
      });

      session = new RealtimeSession(start, {
        transport,
        model,
        tracingDisabled: true,
        config: { audio: { output: { voice: REALTIME_VOICE } } },
      });
      const liveSession = session;

      liveSession.on("agent_handoff", (_context, fromAgent, toAgent) => {
        const from = agentKeyOf(fromAgent);
        const to = agentKeyOf(toAgent);
        // Synchronous, so the deletions reach the model before the new agent's first response.
        if (crossesPrivacyBoundary(from, to)) liveSession.updateHistory(pruneForHandoff);
        activeAgent = to;
        log.info({ callSid: authorized.callSid, from, to }, "agent handoff");
        void recordHandoff(currentSessionId, authorized.userId, from, to, "voice").catch((error) =>
          log.error({ err: error instanceof Error ? error.message : "unknown" }, "failed to record handoff"),
        );
      });

      liveSession.on("error", (event) => {
        log.error({ callSid: authorized.callSid, agent: activeAgent, err: describeError(event.error) }, "realtime session error");
      });

      await liveSession.connect({ apiKey });
      log.info({ callSid: authorized.callSid, agent: authorized.startAgent }, "voice session connected");
      // The agent speaks first, like a person who placed the call.
      liveSession.transport.sendEvent({ type: "response.create" });
    } catch (error) {
      log.error({ callSid: authorized.callSid, err: describeError(error) }, "failed to start voice session");
      socket.close(1011, "realtime unavailable");
    }
  });

  socket.on("close", () => {
    clearTimeout(startTimer);
    clearTimeout(maxDurationTimer);
    try {
      session?.close();
    } catch {
      // Already closed by the transport.
    }
    if (sessionId && call) {
      void endCallSession(sessionId, call.userId).catch(() => undefined);
    }
    log.info({ callSid: call?.callSid ?? null, seconds: Math.round((Date.now() - openedAt) / 1000) }, "media stream closed");
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
