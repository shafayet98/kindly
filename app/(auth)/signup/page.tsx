import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { homePathFor } from "@/lib/auth/routing";
import { getCurrentUser } from "@/lib/auth/session";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user));
  return <SignupForm />;
}
