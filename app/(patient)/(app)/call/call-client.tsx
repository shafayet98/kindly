"use client";

import { RealtimeSession, type RealtimeItem } from "@openai/agents/realtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { AiTag, Avatar, Icon } from "@/components/kindly/parts";
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

const THINGS_TO_SAY = ["Move my walk to 5 PM", "I did my walk", "Put me through to Sarah"];

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
  const [joined, setJoined] = useState<{ agent: VoiceAgentKey; at: Date }[]>([]);

  const sessionRef = useRef<RealtimeSession | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const agentsRef = useRef<ReturnType<typeof createVoiceAgents>["agents"] | null>(null);
  const uiSwitchRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakingRef = useRef(false);
  const activeRef = useRef<VoiceAgentKey>(startAgent);
  // What was said, tagged with who was speaking, kept only in this tab. Sent once at the end so a
  // summary can be written (if the person turned summaries on); the server doesn't keep it.
  const transcriptRef = useRef(new Map<string, { agent: VoiceAgentKey; role: "user" | "assistant"; text: string }>());

  const endCall = useCallback((reason?: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    sessionRef.current?.close();
    sessionRef.current = null;
    if (sessionIdRef.current) {
      void postJson("/api/voice/events", { type: "end", sessionId: sessionIdRef.current, transcript: transcriptForSummary(transcriptRef.current) }, true);
    }
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
    activeRef.current = startAgent;
    transcriptRef.current = new Map();
    setJoined([{ agent: startAgent, at: new Date() }]);
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
      activeRef.current = to;
      setJoined((current) => [...current, { agent: to, at: new Date() }]);
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
    session.on("history_updated", (history) => {
      for (const item of history) {
        if (item.type !== "message" || item.role === "system") continue;
        const text = messageText(item);
        if (!text) continue;
        const known = transcriptRef.current.get(item.itemId);
        transcriptRef.current.set(item.itemId, { agent: known?.agent ?? activeRef.current, role: item.role, text });
      }
      setCaptions(toCaptions(history, transcriptRef.current));
    });
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
  const statusText =
    status === "idle"
      ? "Ready when you are"
      : status === "connecting"
        ? "Connecting…"
        : live
          ? switchingTo
            ? `Connecting to ${AGENTS[switchingTo].name}…`
            : speaking
              ? `${agent.name} is speaking`
              : "Listening"
          : status === "ended"
            ? "Call ended"
            : "Couldn't start the call";
  const timeOf = (date: Date) => new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit" }).format(date);

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="stage" style={live ? undefined : { padding: "72px 56px" }}>
        {safetyMessage && (
          <div className="emergency" role="alert" style={{ width: "100%", maxWidth: 760, textAlign: "left" }}>
            <Icon name="alert" />
            <p className="emergency__text">
              If this could be an emergency, call {SAFETY_CONTACTS.emergency.number} now.
              <span>{safetyMessage}</span>
            </p>
            <a className="btn" href={`tel:${SAFETY_CONTACTS.emergency.number}`}>
              <Icon name="phone" />
              Call {SAFETY_CONTACTS.emergency.number}
            </a>
          </div>
        )}

        <div className={live && speaking ? "ring" : undefined}>
          <Avatar agent={active} size="xl" />
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="headline">{agent.name}</h1>
          <p className="companion__role">{agent.role} · AI companion</p>
        </div>
        <p className="stage-status" role="status" aria-live="polite">
          {live && speaking && !switchingTo ? (
            <span className="speaking" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </span>
          ) : (
            <Icon name={live ? "mic" : status === "error" ? "alert" : "check"} className="icon--sm" />
          )}
          {statusText}
        </p>

        {error && (
          <p role="alert" className="notice notice--error" style={{ textAlign: "left", maxWidth: 560 }}>
            <Icon name="alert" />
            <span>{error}</span>
          </p>
        )}

        {!live && (
          <Button variant="highlight" size="lg" onClick={startCall} disabled={status === "connecting"} aria-busy={status === "connecting" || undefined} style={{ minWidth: 280 }}>
            <Icon name="mic" />
            {status === "idle" || status === "connecting" ? `Start talking to ${AGENTS[startAgent].name}` : "Start a new call"}
          </Button>
        )}

        {live && (
          <>
            <div className="row" style={{ justifyContent: "center", gap: 12 }}>
              <Button variant="ghost" size="lg" onClick={toggleMute} aria-pressed={muted}>
                <Icon name="mic" />
                {muted ? "Unmute" : "Mute"}
              </Button>
              <Button variant="danger" size="lg" onClick={() => endCall()}>
                <Icon name="phone" />
                End call
              </Button>
            </div>

            <div className="stack" style={{ gap: 10, marginTop: 8 }}>
              <p className="muted small">Switch companion (or just ask out loud)</p>
              <div className="switcher">
                {VOICE_AGENT_KEYS.filter((key) => key !== active).map((key) => (
                  <Button key={key} variant="ghost" onClick={() => switchTo(key)} disabled={switchingTo !== null}>
                    <Avatar agent={key} />
                    Talk to {AGENTS[key].name}
                  </Button>
                ))}
              </div>
            </div>

            <form onSubmit={sendTyped} className="row nowrap" style={{ width: "100%", maxWidth: 640, marginTop: 8 }}>
              <label htmlFor="typed" className="sr-only">
                Type instead of speaking
              </label>
              <input id="typed" className="input" value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="Type instead of speaking…" />
              <Button type="submit" variant="ghost">
                Send
              </Button>
            </form>

            <div className="captions" aria-live="polite">
              <label className="row" style={{ gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={showCaptions}
                  onChange={(event) => setShowCaptions(event.target.checked)}
                  style={{ width: 20, height: 20, accentColor: "var(--ember)" }}
                />
                Show captions <span className="muted small">(not saved)</span>
              </label>
              {showCaptions && captions.length === 0 && <p className="muted small">Captions will appear here.</p>}
              {showCaptions &&
                captions.map((caption) => (
                  <p key={caption.id}>
                    <span className="who">{caption.who}</span>
                    {caption.text}
                  </p>
                ))}
            </div>
          </>
        )}

        <p className="muted small" style={{ maxWidth: 520 }}>
          Audio isn&apos;t recorded. Kindly&apos;s companions are AI and can make mistakes. In an emergency call {SAFETY_CONTACTS.emergency.number}.
        </p>
      </div>

      {live || status === "ended" ? (
        <div className="stack-24">
          <div className="card stack">
            <p className="title">{live ? "In this call" : "Last call"}</p>
            {joined.map((entry, index) => (
              <div key={index} className="companion" style={{ alignItems: "center" }}>
                <Avatar agent={entry.agent} size="sm" />
                <span>
                  <span style={{ fontWeight: 500 }}>{AGENTS[entry.agent].name}</span> <span className="muted small">· joined {timeOf(entry.at)}</span>
                </span>
              </div>
            ))}
            <p className="muted small">Changes are saved only after you say yes.</p>
          </div>
          <div className="notice notice--info">
            <Icon name="lock" />
            <p>Audio isn&apos;t recorded. Captions disappear when the call ends.</p>
          </div>
        </div>
      ) : (
        <div className="stack-24">
          <div className="card stack">
            <p className="title">Things you can say</p>
            <ul className="stack">
              {THINGS_TO_SAY.map((line) => (
                <li key={line} className="quote">
                  “{line}”
                </li>
              ))}
            </ul>
          </div>
          <div className="card stack">
            <p className="title">Who can join</p>
            {VOICE_AGENT_KEYS.map((key) => (
              <div key={key} className="companion" style={{ alignItems: "center" }}>
                <Avatar agent={key} size="sm" />
                <span>
                  <span style={{ fontWeight: 500 }}>{AGENTS[key].name}</span> <AiTag /> <span className="muted small">· {AGENTS[key].role}</span>
                </span>
              </div>
            ))}
            <p className="muted small">Ask for anyone out loud — they&apos;ll join without hanging up.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function messageText(item: Extract<RealtimeItem, { type: "message" }>) {
  return item.content
    .map((part) => ("transcript" in part && part.transcript) || ("text" in part && part.text) || "")
    .join(" ")
    .trim();
}

function toCaptions(history: RealtimeItem[], speakers: Map<string, { agent: VoiceAgentKey }>): Caption[] {
  const captions: Caption[] = [];
  for (const item of history) {
    if (item.type !== "message" || item.role === "system") continue;
    const text = messageText(item);
    const agent = speakers.get(item.itemId)?.agent;
    if (text) captions.push({ id: item.itemId, who: item.role === "user" ? "YOU" : agent ? AGENTS[agent].name.toUpperCase() : "KINDLY", text });
  }
  return captions.slice(-20);
}

/** The most recent part of the conversation that fits in one small request. */
function transcriptForSummary(map: Map<string, { agent: VoiceAgentKey; role: "user" | "assistant"; text: string }>) {
  const segments = [...map.values()].map((segment) => ({ ...segment, text: segment.text.slice(0, 2000) }));
  let size = 0;
  const kept: typeof segments = [];
  for (const segment of segments.reverse()) {
    size += segment.text.length + 40;
    if (size > 30_000 || kept.length >= 400) break;
    kept.unshift(segment);
  }
  return kept;
}
