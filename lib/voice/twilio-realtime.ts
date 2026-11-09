import type { RawData, WebSocket } from "ws";
import { RealtimeSession } from "@openai/agents/realtime";
import { TwilioRealtimeTransportLayer } from "@openai/agents-extensions";
import type { FastifyBaseLogger } from "fastify";
import { runTool } from "@/lib/agents/tools/run";
import { createVoiceAgent, type CallOpening, type VoiceAgentKey } from "@/lib/agents/voice-agents";
import { callerContext, createCallSession, endCallSession, MAX_SESSION_MINUTES, recordHandoff } from "./sessions";
import { summarizeConversation, type TranscriptSegment } from "@/lib/conversations/summary";
import { handoffBriefing } from "./privacy";
import { TwilioLeg } from "./twilio-leg";

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
  // Test hook (phone:smoke): sees each companion's session as it connects.
  onSession?: (agent: VoiceAgentKey, session: RealtimeSession) => void;
};

const START_TIMEOUT_MS = 10_000;
// Longest wait for the "one moment" line to finish playing before the next companion joins.
const HOLD_LINE_MAX_MS = 8_000;

type Segment = { agent: VoiceAgentKey; leg: TwilioLeg; session: RealtimeSession };

/**
 * Bridges one Twilio Media Stream to the Kindly voice agents, one realtime session per companion
 * (each has its own voice). Nothing is sent to OpenAI until the stream proves it belongs to a call
 * Kindly placed.
 */
export function handleTwilioMediaStream(socket: WebSocket, { apiKey, model, log, authorize, onSession }: Options) {
  let call: AuthorizedCall | null = null;
  let sessionId: string | null = null;
  let startMessage: RawData | null = null;
  let current: Segment | null = null;
  let switching: Promise<void> | null = null;
  let closed = false;
  const openedAt = Date.now();
  const transcript = new Map<string, TranscriptSegment>();
  const metThisCall = new Set<VoiceAgentKey>();
  let context: Awaited<ReturnType<typeof callerContext>> = { personName: null, met: [] };

  const startTimer = setTimeout(() => {
    if (!startMessage) {
      log.warn("media stream sent no start event; closing");
      socket.close(1008, "start timeout");
    }
  }, START_TIMEOUT_MS);

  // Hard stop in case Twilio's own time limit is misconfigured.
  const maxDurationTimer = setTimeout(() => socket.close(1000, "max duration"), MAX_SESSION_MINUTES * 60_000);

  async function connectCompanion(agent: VoiceAgentKey, opening: CallOpening) {
    const authorized = call!;
    const currentSessionId = sessionId!;
    const leg = new TwilioLeg(socket);
    const transport = new TwilioRealtimeTransportLayer({ twilioWebSocket: leg as never });
    // The transport learns the stream id from Twilio's start event, which arrived before this leg.
    leg.deliver(startMessage!);

    const voiceAgent = createVoiceAgent({
      agent,
      opening,
      familiarity: { personName: context.personName, met: context.met.includes(agent) || metThisCall.has(agent) },
      invoke: (who, name, input) => runTool({ userId: authorized.userId, sessionId: currentSessionId, agent: who, channel: "phone", timezone: authorized.timezone }, name, input),
      onTransfer: (to, request) => transfer(agent, to, request),
    });
    metThisCall.add(agent);
    const session = new RealtimeSession(voiceAgent, {
      transport,
      model,
      tracingDisabled: true,
      config: { audio: { input: { transcription: { model: "gpt-4o-mini-transcribe" } } } },
    });
    const segment: Segment = { agent, leg, session };

    // Kept in memory for this call only, to write a summary at the end if the person wants one.
    session.on("history_updated", (history) => {
      for (const item of history) {
        if (item.type !== "message" || item.role === "system") continue;
        const text = item.content.map((part) => ("transcript" in part && part.transcript) || ("text" in part && part.text) || "").join(" ").trim();
        if (text) transcript.set(item.itemId, { agent, role: item.role, text: text.slice(0, 2000) });
      }
    });
    session.on("error", (event) => {
      if (current === segment) log.error({ callSid: authorized.callSid, agent, err: describeError(event.error) }, "realtime session error");
    });

    current = segment;
    await session.connect({ apiKey });
    if (closed) return session.close();
    onSession?.(agent, session);
    log.info({ callSid: authorized.callSid, agent }, "voice session connected");
    // The companion speaks first: the caller who placed the call, or the one who was asked for.
    session.transport.sendEvent({ type: "response.create" });
  }

  function transfer(from: VoiceAgentKey, to: VoiceAgentKey, request: string) {
    // A repeated transfer call waits for the one already under way.
    switching ??= (async () => {
      const segment = current;
      if (!segment || closed) return;
      await segment.leg.playbackFinished(HOLD_LINE_MAX_MS);
      if (closed) return;
      const briefing = handoffBriefing({ from, to, request, turns: [...transcript.values()] });
      segment.leg.detach();
      segment.session.close();
      log.info({ callSid: call!.callSid, from, to }, "agent handoff");
      void recordHandoff(sessionId!, call!.userId, from, to, "voice").catch((error) =>
        log.error({ err: error instanceof Error ? error.message : "unknown" }, "failed to record handoff"),
      );
      try {
        await connectCompanion(to, { reason: "transferred", from, briefing });
      } catch (error) {
        log.error({ callSid: call!.callSid, to, err: describeError(error) }, "failed to connect next companion");
        socket.close(1011, "realtime unavailable");
      }
    })().finally(() => {
      switching = null;
    });
    return switching;
  }

  socket.on("message", async (raw) => {
    if (startMessage) return current?.leg.deliver(raw);
    let message: { event?: string; start?: { callSid?: string; customParameters?: Record<string, string> } };
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (message.event !== "start") return;
    startMessage = raw;
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
      context = await callerContext(authorized.userId, sessionId);
      await connectCompanion(authorized.startAgent, authorized.opening);
    } catch (error) {
      log.error({ callSid: authorized.callSid, err: describeError(error) }, "failed to start voice session");
      socket.close(1011, "realtime unavailable");
    }
  });

  socket.on("close", () => {
    closed = true;
    clearTimeout(startTimer);
    clearTimeout(maxDurationTimer);
    const segment = current;
    current = null;
    try {
      segment?.leg.close();
      segment?.session.close();
    } catch {
      // Already closed by the transport.
    }
    if (sessionId && call) {
      const { userId } = call;
      const endedSession = sessionId;
      const segments = [...transcript.values()].slice(-400);
      transcript.clear();
      void endCallSession(endedSession, userId)
        .then(() => (segments.length ? summarizeConversation(userId, endedSession, segments) : null))
        .catch(() => undefined);
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
