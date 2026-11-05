import type { Metadata } from "next";
import { Wordmark } from "@/components/brand";
import { requireUser } from "@/lib/auth/session";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  // Reached through the emailed recovery link, which establishes a short-lived session.
  await requireUser();

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <Wordmark />
      <main className="mt-8 flex w-full max-w-md flex-col gap-6 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <div>
          <h1 className="text-2xl font-bold">Choose a new password</h1>
          <p className="text-muted">You&apos;ll stay signed in after saving it.</p>
        </div>
        <ResetPasswordForm />
      </main>
    </div>
  );
}
