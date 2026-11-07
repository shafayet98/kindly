"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Icon } from "@/components/kindly/icon";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { resendConfirmation, signUp, type FormState } from "../actions";

const initial: FormState = { status: "idle" };

export function SignupForm() {
  const [state, action] = useActionState(signUp, initial);
  const [resendState, resend] = useActionState(resendConfirmation, initial);

  if (state.status === "success") {
    return (
      <div className="stack-32">
        <span className="empty__art" style={{ background: "var(--accent-soft)" }}>
          <Icon name="mail" className="icon--xl" />
        </span>
        <div className="stack">
          <h1 className="headline">Check your inbox</h1>
          <p className="body-lg muted">{state.message}</p>
        </div>
        <Notice>It can take a few minutes. Check your junk or spam folder if it doesn&apos;t arrive.</Notice>
        <form action={resend} className="row">
          <input type="hidden" name="email" value={state.email ?? ""} />
          {resendState.message ? (
            <p className="small" role="status">
              {resendState.message}
            </p>
          ) : (
            <SubmitButton variant="ghost">Didn&apos;t get it? Resend</SubmitButton>
          )}
          <Link className="btn btn--link" href="/login">
            Back to sign in
          </Link>
        </form>
      </div>
    );
  }

  return (
    <div className="stack-32">
      <div className="stack">
        <h1 className="headline">Create your account</h1>
        <p className="body-lg muted">It takes a minute. You choose what Kindly helps with next.</p>
      </div>
      <form action={action} className="stack-24" noValidate>
        {state.message && <Notice tone="error">{state.message}</Notice>}
        <Field id="email" name="email" type="email" label="Email" autoComplete="email" required error={state.fieldErrors?.email} />
        <Field
          id="password"
          name="password"
          type="password"
          label="Password"
          autoComplete="new-password"
          required
          hint="At least 10 characters, with a letter and a number."
          error={state.fieldErrors?.password}
        />
        <SubmitButton size="lg" block>
          Create account
        </SubmitButton>
      </form>
      <Notice icon="lock">Creating an account doesn&apos;t sign you up for calls or share any health information. You choose those separately.</Notice>
      <p className="muted" style={{ textAlign: "center" }}>
        Already have an account?{" "}
        <Link className="link" href="/login">
          Sign in
        </Link>
      </p>
    </div>
  );
}
