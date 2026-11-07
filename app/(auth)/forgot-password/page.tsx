import type { Metadata } from "next";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <div className="stack-32">
      <div className="stack">
        <h1 className="headline">Reset your password</h1>
        <p className="body-lg muted">We&apos;ll email you a link to choose a new one.</p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
