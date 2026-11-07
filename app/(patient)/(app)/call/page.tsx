import type { Metadata } from "next";
import Link from "next/link";
import { AiTag, Avatar, Icon, type IconName } from "@/components/kindly/parts";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { AGENTS } from "@/lib/agents/directory";
import { isVoiceAgentKey, VOICE_AGENT_KEYS } from "@/lib/agents/voice-agents";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { getConsentState } from "@/lib/consent/store";
import { allowBrowserVoice } from "./actions";
import { CallClient } from "./call-client";

export const metadata: Metadata = { title: "Talk now" };

const POINTS: { icon: IconName; text: string }[] = [
  { icon: "mic", text: "Your microphone is used only while a call is open." },
  { icon: "sparkle", text: "Your voice is sent to our AI provider to generate replies." },
  { icon: "lock", text: "Audio isn't recorded or stored." },
  { icon: "settings", text: "You can turn this off any time in Settings." },
];

export default async function CallPage({ searchParams }: PageProps<"/call">) {
  const user = await requireOnboardedPatient();
  const [consents, params] = await Promise.all([getConsentState(user.id), searchParams]);

  // Start with the companion the person picked; Natalie otherwise. They can switch any time.
  const requested = params.agent;
  const startAgent = isVoiceAgentKey(requested) ? requested : "natalie";
  const topic = params.topic === "unwell" || params.topic === "plan" ? params.topic : null;

  if (!consents.browser_voice) {
    const others = VOICE_AGENT_KEYS.filter((key) => key !== startAgent);
    return (
      <div className="grid items-center gap-16 pt-8 lg:grid-cols-[1fr_1.1fr]">
        <div style={{ background: "var(--surface-sunken)", borderRadius: "32px 32px 32px 8px", padding: 56, display: "grid", justifyItems: "center", gap: 24 }}>
          <Avatar agent={startAgent} size="xl" />
          <div style={{ textAlign: "center" }}>
            <p className="subhead">
              {AGENTS[startAgent].name} <AiTag />
            </p>
            <p className="companion__role" style={{ marginTop: 6 }}>
              {AGENTS[startAgent].role} · Ready when you are
            </p>
          </div>
          <div className="row" aria-hidden="true">
            {others.map((key) => (
              <Avatar key={key} agent={key} size="sm" />
            ))}
            <span className="small muted">
              {others.map((key) => AGENTS[key].name).join(" and ")} can join any time
            </span>
          </div>
        </div>
        <form action={allowBrowserVoice} className="stack-32">
          <div className="stack">
            <p className="label">One-time permission</p>
            <h1 className="headline">Talk to Kindly in your browser</h1>
          </div>
          <p className="body-lg">
            To talk out loud, Kindly needs to use your microphone while a call is open. Your voice is sent to our AI provider to generate replies. Audio isn&apos;t recorded or stored, and you can turn this
            off any time in Settings.
          </p>
          <ul className="stack">
            {POINTS.map((point) => (
              <li key={point.text} className="row nowrap" style={{ gap: 14 }}>
                <span className="cat-icon cat-icon--sm">
                  <Icon name={point.icon} />
                </span>
                <span>{point.text}</span>
              </li>
            ))}
          </ul>
          <div className="row" style={{ gap: 16 }}>
            <SubmitButton size="lg">
              <Icon name="mic" />
              Allow browser voice
            </SubmitButton>
            <ButtonLink variant="ghost" size="lg" href="/dashboard">
              Not now
            </ButtonLink>
          </div>
          <p className="muted small">
            Prefer a phone call instead?{" "}
            <Link className="link" href="/schedule">
              Set up calls from Milo in Reminders
            </Link>
            .
          </p>
        </form>
      </div>
    );
  }

  return <CallClient startAgent={startAgent} topic={topic} />;
}
