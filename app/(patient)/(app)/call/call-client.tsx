"use client";

import { RealtimeSession, type RealtimeItem } from "@openai/agents/realtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AGENTS } from "@/lib/agents/directory";
import type { ToolName } from "@/lib/agents/tools/specs";
import {
  agentKeyOf,
  createVoiceAgents,
  REALTIME_VOICE,
  VOICE_AGENT_KEYS,
  type ToolOutcome,
  type VoiceAgentKey,
} from "@/lib/agents/voice-agents";
import { SAFETY_CONTACTS } from "@/lib/safety/contacts";
import { crossesPrivacyBoundary, pruneForHandoff } from "@/lib/voice/privacy";

type Status = "idle" | "connecting" | "live" | "ended" | "error";
type Caption = { id: string; who: string; text: string };

const MAX_CALL_MS = 10 * 60_000;

const AGENT_STYLE: Record<VoiceAgentKey, string> = {
  milo: "bg-primary",
  natalie: "bg-accent",
  sarah: "bg-[#7c6fb0]",
};

const ERRORS: Record<string, string> = {
  consent_required: "Please allow browser voice first.",
  rate_limited: "You've started a lot of calls this hour. Please try again a bit later.",
  voice_unavailable: "Voice isn't available right now. Please try again in a minute.",
  mic_denied: "Kindly couldn't use your microphone. Allow microphone access in your browser settings, then try again.",
};

async function postJson(path: string, body: unknown, keepalive = false) {
  return fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive });
}

export function CallClient({ startAgent, topic }: { startAgent: VoiceAgentKey; topic: "unwell" | "plan" | null }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<VoiceAgentKey>(startAgent);
  const [switchingTo, setSwitchingTo] = useState<VoiceAgentKey | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showCaptions, setShowCaptions] = useState(false);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [safetyMessage, setSafetyMessage] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  const sessionRef = useRef<RealtimeSession | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const agentsRef = useRef<ReturnType<typeof createVoiceAgents>["agents"] | null>(null);
  const uiSwitchRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakingRef = useRef(false);

  const endCall = useCallback((reason?: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    sessionRef.current?.close();
    sessionRef.current = null;
    if (sessionIdRef.current) void postJson("/api/voice/events", { type: "end", sessionId: sessionIdRef.current }, true);
    sessionIdRef.current = null;
    setSpeaking(false);
    setSwitchingTo(null);
    setStatus("ended");
    if (reason) setError(reason);
  }, []);

  // Close the call if the person leaves the page.
  useEffect(() => {
    const onLeave = () => endCall();
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      if (sessionRef.current) endCall();
    };
  }, [endCall]);

  async function startCall() {
    setError(null);
    setCaptions([]);
    setSafetyMessage(null);
    setActive(startAgent);
    setStatus("connecting");

    const response = await postJson("/api/voice/session", { agent: startAgent, topic });
    if (!response.ok) {
      const { error: code } = await response.json().catch(() => ({ error: "voice_unavailable" }));
      setError(ERRORS[code] ?? ERRORS.voice_unavailable);
      setStatus("error");
      return;
    }
    const { sessionId, clientSecret, model } = (await response.json()) as { sessionId: string; clientSecret: string; model: string };
    sessionIdRef.current = sessionId;

    const { agents, start } = createVoiceAgents({
      startAgent,
      opening: { reason: "user_started", topic },
      // Tools run on the server, which checks this session belongs to the signed-in user.
      invoke: async (agent, name: ToolName, input) => {
        const result = await postJson("/api/voice/tools", { sessionId, agent, name, input });
        if (!result.ok) return { ok: false, error: "That didn't work. Nothing was changed." } satisfies ToolOutcome;
        return (await result.json()) as ToolOutcome;
      },
    });
    agentsRef.current = agents;

    const session = new RealtimeSession(start, {
      transport: "webrtc",
      model,
      tracingDisabled: true,
      config: {
        audio: {
          input: { transcription: { model: "gpt-4o-mini-transcribe" } },
          output: { voice: REALTIME_VOICE },
        },
      },
    });
    sessionRef.current = session;

    session.on("agent_handoff", (_context, fromAgent, toAgent) => {
      const from = agentKeyOf(fromAgent);
      const to = agentKeyOf(toAgent);
      if (crossesPrivacyBoundary(from, to)) session.updateHistory(pruneForHandoff);
      setActive(to);
      setSwitchingTo(to);
      setCaptions([]);
      void postJson("/api/voice/events", { type: "handoff", sessionId, from, to, via: uiSwitchRef.current ? "ui" : "voice" });
      uiSwitchRef.current = false;
    });
    // With WebRTC the browser plays audio itself, so speaking state comes from the server's
    // playback events rather than the SDK's audio events.
    session.on("transport_event", (event) => {
      if (event.type === "output_audio_buffer.started") {
        speakingRef.current = true;
        setSpeaking(true);
        setSwitchingTo(null);
      } else if (event.type === "output_audio_buffer.stopped" || event.type === "output_audio_buffer.cleared") {
        speakingRef.current = false;
        setSpeaking(false);
      }
    });
    session.on("agent_tool_end", (_context, _agent, calledTool, result) => {
      if (calledTool.name !== "trigger_safety_response") return;
      try {
        setSafetyMessage(JSON.parse(result).say_exactly ?? null);
      } catch {
        setSafetyMessage(null);
      }
    });
    session.on("history_updated", (history) => setCaptions(toCaptions(history)));
    // Non-fatal API errors (e.g. cancelling a response that already finished) don't end the call;
    // a dropped connection is handled below.
    session.on("error", () => console.warn("realtime session reported an error"));
    session.transport.on("connection_change", (state) => {
      if (state === "disconnected" && sessionRef.current === session) endCall("The call was disconnected.");
    });

    try {
      await session.connect({ apiKey: clientSecret });
    } catch (connectError) {
      const denied = connectError instanceof DOMException && connectError.name === "NotAllowedError";
      endCall(denied ? ERRORS.mic_denied : ERRORS.voice_unavailable);
      setStatus("error");
      return;
    }
    setStatus("live");
    session.transport.sendEvent({ type: "response.create" });
    timerRef.current = setTimeout(() => endCall("Calls end after 10 minutes. You can start a new one any time."), MAX_CALL_MS);
  }

  async function switchTo(key: VoiceAgentKey) {
    const session = sessionRef.current;
    const agents = agentsRef.current;
    if (!session || !agents || key === active) return;
    uiSwitchRef.current = true;
    setSwitchingTo(key);
    if (speakingRef.current) session.interrupt();
    await session.updateAgent(agents[key]);
    session.transport.sendEvent({ type: "response.create" });
  }

  function toggleMute() {
    const next = !muted;
    sessionRef.current?.mute(next);
    setMuted(next);
  }

  function sendTyped(event: React.FormEvent) {
    event.preventDefault();
    const text = typed.trim();
    if (!text || !sessionRef.current) return;
    sessionRef.current.sendMessage(text);
    setTyped("");
  }

  const agent = AGENTS[active];
  const live = status === "live";

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 text-center">
      {safetyMessage && (
        <div role="alert" className="w-full rounded-2xl border-2 border-danger/40 bg-danger-soft p-4 text-left">
          <p className="font-bold text-danger">If you are in danger, call {SAFETY_CONTACTS.emergency.number} now.</p>
          <p className="mt-1">{safetyMessage}</p>
        </div>
      )}

      <div className="relative mt-4">
        <div
          aria-hidden
          className={`grid h-36 w-36 place-items-center rounded-full text-6xl font-extrabold text-white ${AGENT_STYLE[active]} ${
            speaking ? "ring-8 ring-primary/20 motion-safe:animate-pulse" : ""
          }`}
        >
          {agent.name[0]}
        </div>
      </div>

      <div aria-live="polite">
        <h1 className="text-3xl font-bold">{agent.name}</h1>
        <p className="text-muted">
          {agent.role} · AI companion
        </p>
        <p className="mt-2 font-semibold">
          {status === "idle" && "Ready when you are"}
          {status === "connecting" && "Connecting…"}
          {live && (switchingTo ? `Connecting to ${AGENTS[switchingTo].name}…` : speaking ? `${agent.name} is speaking` : "Listening")}
          {status === "ended" && "Call ended"}
          {status === "error" && "Couldn't start the call"}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-danger">
          {error}
        </p>
      )}

      {!live && status !== "connecting" && (
        <Button onClick={startCall} className="px-8 py-4 text-lg">
          {status === "idle" ? `Start talking to ${AGENTS[startAgent].name}` : "Start a new call"}
        </Button>
      )}

      {live && (
        <>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="secondary" onClick={toggleMute} aria-pressed={muted}>
              {muted ? "Unmute" : "Mute"}
            </Button>
            <Button onClick={() => endCall()} className="bg-danger hover:bg-danger/90">
              End call
            </Button>
          </div>

          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-muted">Switch companion (or just ask out loud)</p>
            <div className="flex flex-wrap justify-center gap-2">
              {VOICE_AGENT_KEYS.filter((key) => key !== active).map((key) => (
                <Button key={key} variant="secondary" onClick={() => switchTo(key)} disabled={switchingTo !== null}>
                  Talk to {AGENTS[key].name}
                </Button>
              ))}
            </div>
          </div>

          <form onSubmit={sendTyped} className="flex w-full gap-2">
            <label htmlFor="typed" className="sr-only">
              Type a message instead
            </label>
            <input
              id="typed"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="Type instead of speaking…"
              className="flex-1 rounded-full border border-border bg-surface px-4 py-3"
            />
            <Button type="submit" variant="secondary">
              Send
            </Button>
          </form>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showCaptions} onChange={(event) => setShowCaptions(event.target.checked)} className="h-4 w-4 accent-primary" />
            Show captions (not saved)
          </label>
          {showCaptions && (
            <ol className="flex max-h-72 w-full flex-col gap-2 overflow-y-auto rounded-2xl border border-border bg-surface p-4 text-left">
              {captions.length === 0 && <li className="text-muted">Captions will appear here.</li>}
              {captions.map((caption) => (
                <li key={caption.id}>
                  <span className="font-bold">{caption.who}: </span>
                  {caption.text}
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      <p className="text-sm text-muted">
        Audio isn&apos;t recorded. Kindly&apos;s companions are AI and can make mistakes. In an emergency call{" "}
        {SAFETY_CONTACTS.emergency.number}.
      </p>
    </div>
  );
}

function toCaptions(history: RealtimeItem[]): Caption[] {
  const captions: Caption[] = [];
  for (const item of history) {
    if (item.type !== "message" || item.role === "system") continue;
    const text = item.content
      .map((part) => ("transcript" in part && part.transcript) || ("text" in part && part.text) || "")
      .join(" ")
      .trim();
    if (text) captions.push({ id: item.itemId, who: item.role === "user" ? "You" : "Kindly", text });
  }
  return captions.slice(-20);
}
