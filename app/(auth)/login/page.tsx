import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui/notice";
import { homePathFor } from "@/lib/auth/routing";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  link: "That link has expired or was opened in a different browser. If you just confirmed your email, you can sign in now.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user));

  const { next, notice } = await searchParams;
  const noticeText = typeof notice === "string" ? NOTICES[notice] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="text-muted">Sign in to talk with your Kindly companions.</p>
      </div>
      {noticeText && <Notice>{noticeText}</Notice>}
      <LoginForm next={typeof next === "string" ? next : undefined} />
      <div className="flex flex-col gap-2 text-center">
        <Link href="/forgot-password" className="text-primary underline-offset-4 hover:underline">
          Forgot password?
        </Link>
        <p className="text-muted">
          New to Kindly?{" "}
          <Link href="/signup" className="font-semibold text-primary underline-offset-4 hover:underline">
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}
