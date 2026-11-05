import { NextResponse, type NextRequest } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { REALTIME_VOICE, VOICE_AGENT_KEYS } from "@/lib/agents/voice-agents";
import { jsonError, readJson, requirePatientApi } from "@/lib/api/guard";
import { getConsentState } from "@/lib/consent/store";
import { countRecentSessions, createCallSession } from "@/lib/voice/sessions";

const MAX_SESSIONS_PER_HOUR = 6;
const model = process.env.REALTIME_MODEL ?? "gpt-realtime-2.1";

const body = z.object({
  agent: z.enum(VOICE_AGENT_KEYS as ["milo", "natalie", "sarah"]).default("natalie"),
  topic: z.enum(["unwell", "plan"]).nullish(),
});

// Starts a browser voice session: records it, then issues a short-lived OpenAI client secret so
// the browser can connect directly. The real API key never leaves the server.
export async function POST(request: NextRequest) {
  const user = await requirePatientApi(request);
  if (user instanceof NextResponse) return user;

  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, "invalid_request");

  const consents = await getConsentState(user.id);
  if (!consents.browser_voice) return jsonError(403, "consent_required");
  if ((await countRecentSessions(user.id)) >= MAX_SESSIONS_PER_HOUR) return jsonError(429, "rate_limited");

  const sessionId = await createCallSession({ userId: user.id, channel: "browser", activeAgent: parsed.data.agent });

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const secret = await openai.realtime.clientSecrets.create({
      // Only long enough to connect; the secret can't be reused afterwards.
      expires_after: { anchor: "created_at", seconds: 60 },
      session: { type: "realtime", model, audio: { output: { voice: REALTIME_VOICE } } },
    });
    return NextResponse.json(
      { sessionId, clientSecret: secret.value, model, startAgent: parsed.data.agent, topic: parsed.data.topic ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("client secret failed", error instanceof Error ? error.message : "unknown");
    return jsonError(502, "voice_unavailable");
  }
}
