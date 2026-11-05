import { createClient } from "@supabase/supabase-js";

// Full-access client for trusted server processes (seed and admin scripts). Never import from
// code that can reach the browser.
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
