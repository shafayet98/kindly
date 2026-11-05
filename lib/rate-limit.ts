import "server-only";
import { headers } from "next/headers";

// Simple fixed-window limiter per action and client IP. In-memory, so it is per server instance;
// Supabase applies its own auth and email rate limits behind it.
const windows = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(action: string, limit: number, windowMs: number): Promise<boolean> {
  const forwarded = (await headers()).get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "local";
  const key = `${action}:${ip}`;
  const now = Date.now();
  const current = windows.get(key);
  if (!current || current.resetAt < now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}
