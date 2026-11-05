import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Reset your password</h1>
        <p className="text-muted">We&apos;ll email you a link to choose a new one.</p>
      </div>
      <ForgotPasswordForm />
      <Link href="/login" className="text-center text-primary underline-offset-4 hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}
