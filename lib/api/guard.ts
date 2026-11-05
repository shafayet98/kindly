import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Guards a JSON API route: same-origin JSON requests only (blocks cross-site form posts) and an
 * onboarded patient session. Returns the user, or a response to send back.
 */
export async function requirePatientApi(request: NextRequest): Promise<CurrentUser | NextResponse> {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) return jsonError(403, "forbidden");
  if (!request.headers.get("content-type")?.startsWith("application/json")) return jsonError(415, "json_required");

  const user = await getCurrentUser();
  if (!user) return jsonError(401, "unauthenticated");
  if (user.role !== "patient" || !user.onboardingCompletedAt) return jsonError(403, "forbidden");
  return user;
}

export async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
