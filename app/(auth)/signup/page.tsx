import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { homePathFor } from "@/lib/auth/routing";
import { getCurrentUser } from "@/lib/auth/session";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="text-muted">It takes a minute. You choose what Kindly helps with next.</p>
      </div>
      <SignupForm />
      <p className="text-center text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
      <p className="text-center text-sm text-muted">
        Creating an account doesn&apos;t sign you up for calls or share any health information. You choose those
        separately.
      </p>
    </div>
  );
}
