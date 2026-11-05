import type { Metadata } from "next";
import { SubmitButton } from "@/components/ui/submit-button";
import { isVoiceAgentKey } from "@/lib/agents/voice-agents";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { getConsentState } from "@/lib/consent/store";
import { getFocusAreas } from "@/lib/preferences/store";
import { suggestedAgents } from "@/lib/preferences/suggestions";
import { allowBrowserVoice } from "./actions";
import { CallClient } from "./call-client";

export const metadata: Metadata = { title: "Talk now" };

export default async function CallPage({ searchParams }: PageProps<"/call">) {
  const user = await requireOnboardedPatient();
  const [consents, areas, params] = await Promise.all([getConsentState(user.id), getFocusAreas(user.id), searchParams]);

  // An explicit choice (link or button) wins; otherwise suggest from focus areas.
  const requested = params.agent;
  const startAgent = isVoiceAgentKey(requested) ? requested : (suggestedAgents(areas).find(isVoiceAgentKey) ?? "natalie");
  const topic = params.topic === "unwell" || params.topic === "plan" ? params.topic : null;

  if (!consents.browser_voice) {
    return (
      <form action={allowBrowserVoice} className="mx-auto flex max-w-xl flex-col gap-4">
        <h1 className="text-3xl font-bold">Talk to Kindly in your browser</h1>
        <p>
          To talk out loud, Kindly needs to use your microphone while a call is open. Your voice is sent to our AI
          provider to generate replies. Audio isn&apos;t recorded or stored, and you can turn this off any time in Settings.
        </p>
        <SubmitButton className="self-start">Allow browser voice</SubmitButton>
      </form>
    );
  }

  return <CallClient startAgent={startAgent} topic={topic} />;
}
