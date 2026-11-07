"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { safeNextPath, homePathFor } from "@/lib/auth/routing";
import { ensureAppUser, getCurrentUser } from "@/lib/auth/session";
import { emailSchema, passwordSchema, signInSchema, signUpSchema } from "@/lib/auth/validation";
import { rateLimit } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
  // Lets the login form offer "resend confirmation" without echoing anything sensitive.
  needsConfirmation?: boolean;
  email?: string;
};

const TOO_MANY: FormState = { status: "error", message: "Too many attempts. Please wait a minute and try again." };

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await rateLimit("signup", 5, 60_000))) return TOO_MANY;
  const parsed = signUpSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error.issues) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: siteUrl("/auth/confirm") },
  });

  if (error) {
    if (error.code === "weak_password") return { status: "error", fieldErrors: { password: "Choose a stronger password." } };
    if (error.code === "over_email_send_rate_limit" || error.status === 429) return TOO_MANY;
    return { status: "error", message: "We couldn't create your account right now. Please try again." };
  }

  // Same response whether or not the email already has an account.
  return {
    status: "success",
    email: parsed.data.email,
    message: "If this email can be used, we've sent it a confirmation link. Open it to finish creating your account.",
  };
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await rateLimit("signin", 10, 60_000))) return TOO_MANY;
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error.issues) };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        status: "error",
        needsConfirmation: true,
        email: parsed.data.email,
        message: "Please confirm your email first. Check your inbox for the link we sent.",
      };
    }
    if (error.status === 429) return TOO_MANY;
    return { status: "error", message: "Email or password is incorrect." };
  }

  const user = await ensureAppUser(data.user);
  if (!user) {
    await supabase.auth.signOut();
    return { status: "error", needsConfirmation: true, email: parsed.data.email, message: "Please confirm your email first." };
  }
  await audit({ actorUserId: user.id, actorType: user.role, resourceType: "session", action: "auth.sign_in", result: "success" });

  const next = safeNextPath(formData.get("next") as string | null);
  // Patients who haven't onboarded always go to onboarding first.
  redirect(next && user.onboardingCompletedAt && user.role === "patient" ? next : homePathFor(user));
}

export async function resendConfirmation(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await rateLimit("resend", 3, 10 * 60_000))) return TOO_MANY;
  const email = emailSchema.safeParse(formData.get("email"));
  if (email.success) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.resend({ type: "signup", email: email.data, options: { emailRedirectTo: siteUrl("/auth/confirm") } });
  }
  return { status: "success", message: "If that account needs confirming, we've sent a new link." };
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await rateLimit("reset", 3, 10 * 60_000))) return TOO_MANY;
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { status: "error", fieldErrors: { email: "Enter a valid email address." } };

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: siteUrl("/auth/confirm?next=/auth/reset-password"),
  });
  return { status: "success", message: "If an account exists for that email, we've sent a link to reset the password." };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = passwordSchema.safeParse(formData.get("password"));
  if (!password.success) return { status: "error", fieldErrors: { password: password.error.issues[0].message } };
  if (formData.get("password") !== formData.get("confirm")) {
    return { status: "error", fieldErrors: { confirm: "Passwords don't match." } };
  }

  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Your reset link has expired. Please request a new one." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) {
    if (error.code === "same_password") return { status: "error", fieldErrors: { password: "Choose a different password from your current one." } };
    return { status: "error", message: "We couldn't update your password. Please request a new reset link." };
  }
  await audit({ actorUserId: user.id, actorType: user.role, resourceType: "user", resourceId: user.id, action: "auth.password_changed", result: "success" });
  redirect(homePathFor(user));
}

export async function signOut() {
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  if (user) await audit({ actorUserId: user.id, actorType: user.role, resourceType: "session", action: "auth.sign_out", result: "success" });
  redirect("/login");
}
