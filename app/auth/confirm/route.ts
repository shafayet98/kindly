import type { EmailOtpType, User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/routing";
import { ensureAppUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "email", "recovery", "invite", "email_change"];

// Handles links from confirmation and password-reset emails. Supports both the PKCE `code`
// redirect (default templates) and `token_hash` links (custom templates).
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path.split("?")[0];
    url.search = path.includes("?") ? path.slice(path.indexOf("?")) : "";
    return NextResponse.redirect(url);
  };

  const supabase = await createSupabaseServerClient();
  let authUser: User | null = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) authUser = data.user;
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) authUser = data.user;
  }

  if (!authUser) {
    // A confirmation link opened in a different browser can't finish the PKCE exchange, but the
    // email is usually confirmed already, so signing in is the right next step either way.
    return redirectTo("/login?notice=link");
  }

  await ensureAppUser(authUser);
  if (type === "recovery" || next === "/auth/reset-password") return redirectTo("/auth/reset-password");
  return redirectTo(next ?? "/onboarding");
}
