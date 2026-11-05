import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { runTool } from "@/lib/agents/tools/run";
import { jsonError, readJson, requirePatientApi } from "@/lib/api/guard";
import { getOwnedLiveSession } from "@/lib/voice/sessions";

const body = z.object({
  sessionId: z.uuid(),
  agent: z.enum(["natalie", "milo", "sarah", "theo", "iris", "clara"]),
  name: z.string().max(64),
  input: z.unknown(),
});

// Runs a tool for a browser voice session. Identity comes from the session cookie and the
// session must belong to that user; the model's arguments are validated by runTool.
export async function POST(request: NextRequest) {
  const user = await requirePatientApi(request);
  if (user instanceof NextResponse) return user;

  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, "invalid_request");

  const session = await getOwnedLiveSession(parsed.data.sessionId, user.id);
  if (!session) return jsonError(404, "session_not_found");

  const outcome = await runTool(
    { userId: user.id, sessionId: session.id, agent: parsed.data.agent, channel: "browser", timezone: user.timezone },
    parsed.data.name,
    parsed.data.input,
  );
  return NextResponse.json(outcome, { headers: { "Cache-Control": "no-store" } });
}
