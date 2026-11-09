"use client";

import { RealtimeSession, type RealtimeItem } from "@openai/agents/realtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { AiTag, Avatar, Icon } from "@/components/kindly/parts";
import { Button } from "@/components/ui/button";
import { AGENTS } from "@/lib/agents/directory";
import type { ToolName } from "@/lib/agents/tools/specs";
import { createVoiceAgent, VOICE_AGENT_KEYS, type CallOpening, type ToolOutcome, type VoiceAgentKey } from "@/lib/agents/voice-agents";
import { SAFETY_CONTACTS } from "@/lib/safety/contacts";
import { handoffBriefing, type Turn } from "@/lib/voice/privacy";

type Status = "idle" | "connecting" | "live" | "ended" | "error";
type Caption = { id: string; who: string; text: string };
type Started = { sessionId: string; clientSecret: string; model: string; personName?: string | null; met?: VoiceAgentKey[] };

const MAX_CALL_MS = 10 * 60_000;
// Longest wait for the "one moment" line to finish before the next companion joins.
const HOLD_LINE_MAX_MS = 8_000;

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

async function requestSecret(body: Record<string, unknown>): Promise<Started | { error: string }> {
  try {
    const response = await postJson("/api/voice/session", body);
    if (!response.ok) return (await response.json().catch(() => null)) ?? { error: "voice_unavailable" };
    return await response.json();
  } catch {
    return { error: "voice_unavailable" };
  }
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

  // Each companion has its own realtime session (its own voice); this is the current one.
  const sessionRef = useRef<RealtimeSession | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const modelRef = useRef("");
  const familiarRef = useRef<{ personName: string | null; met: Set<VoiceAgentKey> }>({ personName: null, met: new Set() });
  const switchingRef = useRef<Promise<void> | null>(null);
  const playbackRef = useRef<{ started: () => void; stopped: () => void } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakingRef = useRef(false);
  const mutedRef = useRef(false);
  const activeRef = useRef<VoiceAgentKey>(startAgent);
  // What was said, tagged with who was speaking, kept only in this tab. Used to brief the next
  // companion (see handoffBriefing) and sent once at the end so a summary can be written (if the
  // person turned summaries on); the server doesn't keep it.
  const transcriptRef = useRef(new Map<string, Turn>());

  const endCall = useCallback((reason?: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const session = sessionRef.current;
    sessionRef.current = null;
    session?.close();
    if (sessionIdRef.current) {
      void postJson("/api/voice/events", { type: "end", sessionId: sessionIdRef.current, transcript: transcriptForSummary(transcriptRef.current) }, true);
    }
    sessionIdRef.current = null;
    switchingRef.current = null;
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

  async function connectCompanion(agent: VoiceAgentKey, opening: CallOpening, clientSecret: string) {
    const sessionId = sessionIdRef.current!;
    const familiar = familiarRef.current;
    const voiceAgent = createVoiceAgent({
      agent,
      opening,
      familiarity: { personName: familiar.personName, met: [...familiar.met] },
      // Tools run on the server, which checks this session belongs to the signed-in user.
      invoke: async (who, name: ToolName, input) => {
        const result = await postJson("/api/voice/tools", { sessionId, agent: who, name, input });
        if (!result.ok) return { ok: false, error: "That didn't work. Nothing was changed." } satisfies ToolOutcome;
        return (await result.json()) as ToolOutcome;
      },
      onTransfer: (to, request) => transfer(agent, to, request, "voice"),
    });
    // Met from now on: the next companion won't explain who this one is.
    familiar.met.add(agent);

    const session = new RealtimeSession(voiceAgent, {
      transport: "webrtc",
      model: modelRef.current,
      tracingDisabled: true,
      config: { audio: { input: { transcription: { model: "gpt-4o-mini-transcribe" } } } },
    });
    sessionRef.current = session;
    activeRef.current = agent;

    // With WebRTC the browser plays audio itself, so speaking state comes from the server's
    // playback events rather than the SDK's audio events.
    session.on("transport_event", (event) => {
      if (sessionRef.current !== session) return;
      if (event.type === "output_audio_buffer.started") {
        speakingRef.current = true;
        setSpeaking(true);
        setSwitchingTo(null);
        playbackRef.current?.started();
      } else if (event.type === "output_audio_buffer.stopped" || event.type === "output_audio_buffer.cleared") {
        speakingRef.current = false;
        setSpeaking(false);
        playbackRef.current?.stopped();
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
        if (text) transcriptRef.current.set(item.itemId, { agent, role: item.role, text });
      }
      if (sessionRef.current === session) setCaptions(toCaptions(history, agent));
    });
    // Non-fatal API errors (e.g. cancelling a response that already finished) don't end the call;
    // a dropped connection is handled below.
    session.on("error", () => console.warn("realtime session reported an error"));
    session.transport.on("connection_change", (state) => {
      if (state === "disconnected" && sessionRef.current === session) endCall("The call was disconnected.");
    });

    await session.connect({ apiKey: clientSecret });
    if (sessionRef.current !== session) return session.close();
    if (mutedRef.current) session.mute(true);
    // The companion speaks first: a greeting, or picking up what the person asked for.
    session.transport.sendEvent({ type: "response.create" });
  }

  async function startCall() {
    setError(null);
    setCaptions([]);
    setSafetyMessage(null);
    setActive(startAgent);
    transcriptRef.current = new Map();
    setJoined([{ agent: startAgent, at: new Date() }]);
    setStatus("connecting");

    const started = await requestSecret({ agent: startAgent, topic });
    if ("error" in started) {
      setError(ERRORS[started.error] ?? ERRORS.voice_unavailable);
      setStatus("error");
      return;
    }
    sessionIdRef.current = started.sessionId;
    modelRef.current = started.model;
    familiarRef.current = { personName: started.personName ?? null, met: new Set(started.met ?? []) };

    try {
      await connectCompanion(startAgent, { reason: "user_started", topic }, started.clientSecret);
    } catch (connectError) {
      const denied = connectError instanceof DOMException && connectError.name === "NotAllowedError";
      endCall(denied ? ERRORS.mic_denied : ERRORS.voice_unavailable);
      setStatus("error");
      return;
    }
    setStatus("live");
    timerRef.current = setTimeout(() => endCall("Calls end after 10 minutes. You can start a new one any time."), MAX_CALL_MS);
  }

  /** Waits for the current companion's last words (the "one moment" line) to finish playing. */
  function playbackFinished() {
    return new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(cap);
        clearTimeout(grace);
        playbackRef.current = null;
        resolve();
      };
      const cap = setTimeout(finish, HOLD_LINE_MAX_MS);
      // Nothing playing and nothing starting soon means there's nothing to wait for.
      const grace = speakingRef.current ? undefined : setTimeout(finish, 1200);
      playbackRef.current = { started: () => clearTimeout(grace), stopped: finish };
    });
  }

  function transfer(from: VoiceAgentKey, to: VoiceAgentKey, request: string, via: "voice" | "ui") {
    // A repeated transfer call waits for the one already under way.
    switchingRef.current ??= (async () => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      setSwitchingTo(to);
      // The next companion's secret is fetched while the "one moment" line plays.
      const [next] = await Promise.all([requestSecret({ agent: to, continueSessionId: sessionId, via }), via === "voice" ? playbackFinished() : null]);
      if (sessionIdRef.current !== sessionId) return;
      if ("error" in next) return endCall(ERRORS[next.error] ?? ERRORS.voice_unavailable);

      const briefing = handoffBriefing({ from, to, request, turns: [...transcriptRef.current.values()] });
      const previous = sessionRef.current;
      sessionRef.current = null;
      previous?.close();
      speakingRef.current = false;
      setSpeaking(false);
      setActive(to);
      setJoined((current) => [...current, { agent: to, at: new Date() }]);
      setCaptions([]);
      try {
        await connectCompanion(to, { reason: "transferred", from, briefing }, next.clientSecret);
      } catch {
        // Unless the person ended the call while the next companion was connecting.
        if (sessionIdRef.current === sessionId) endCall(ERRORS.voice_unavailable);
      }
    })().finally(() => {
      switchingRef.current = null;
    });
    return switchingRef.current;
  }

  function switchTo(key: VoiceAgentKey) {
    const session = sessionRef.current;
    if (!session || key === active || switchingRef.current) return;
    if (speakingRef.current) session.interrupt();
    void transfer(activeRef.current, key, `The person pressed the button to talk to ${AGENTS[key].name}.`, "ui");
  }

  function toggleMute() {
    const next = !muted;
    mutedRef.current = next;
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

function toCaptions(history: RealtimeItem[], agent: VoiceAgentKey): Caption[] {
  const captions: Caption[] = [];
  for (const item of history) {
    if (item.type !== "message" || item.role === "system") continue;
    const text = messageText(item);
    if (text) captions.push({ id: item.itemId, who: item.role === "user" ? "YOU" : AGENTS[agent].name.toUpperCase(), text });
  }
  return captions.slice(-20);
}

/** The most recent part of the conversation that fits in one small request. */
function transcriptForSummary(map: Map<string, Turn>) {
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
