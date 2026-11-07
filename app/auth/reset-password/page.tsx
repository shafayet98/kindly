import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { requireUser } from "@/lib/auth/session";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  // Reached through the emailed recovery link, which establishes a short-lived session.
  await requireUser();
  return (
    <AuthShell>
      <div className="stack-32">
        <div className="stack">
          <h1 className="headline">Choose a new password</h1>
          <p className="body-lg muted">You&apos;ll use it to sign in from now on.</p>
        </div>
        <ResetPasswordForm />
      </div>
    </AuthShell>
  );
}
