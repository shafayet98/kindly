import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, readJson, requirePatientApi } from "@/lib/api/guard";
import { endCallSession, getOwnedLiveSession, recordHandoff } from "@/lib/voice/sessions";

const agent = z.enum(["natalie", "milo", "sarah"]);
const body = z.discriminatedUnion("type", [
  z.object({ type: z.literal("handoff"), sessionId: z.uuid(), from: agent, to: agent, via: z.enum(["voice", "ui"]) }),
  z.object({ type: z.literal("end"), sessionId: z.uuid() }),
]);

// Records what happened in a browser session (handoffs, end). Structured facts only.
export async function POST(request: NextRequest) {
  const user = await requirePatientApi(request);
  if (user instanceof NextResponse) return user;

  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, "invalid_request");

  const session = await getOwnedLiveSession(parsed.data.sessionId, user.id);
  if (!session) return jsonError(404, "session_not_found");

  if (parsed.data.type === "handoff") {
    await recordHandoff(session.id, user.id, parsed.data.from, parsed.data.to, parsed.data.via);
  } else {
    await endCallSession(session.id, user.id);
  }
  return new NextResponse(null, { status: 204 });
}
