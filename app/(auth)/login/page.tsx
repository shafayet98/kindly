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
    <div className="stack-32">
      <div className="stack">
        <h1 className="headline">Welcome back</h1>
        <p className="body-lg muted">Sign in to talk with your Kindly companions.</p>
      </div>
      {noticeText && <Notice>{noticeText}</Notice>}
      <LoginForm next={typeof next === "string" ? next : undefined} />
      <div className="stack" style={{ textAlign: "center" }}>
        <p>
          <Link className="link" href="/forgot-password">
            Forgot password?
          </Link>
        </p>
        <p className="muted">
          New to Kindly?{" "}
          <Link className="link" href="/signup">
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}
