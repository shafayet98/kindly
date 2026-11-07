"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { requestPasswordReset, type FormState } from "../actions";

const initial: FormState = { status: "idle" };

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, initial);
  const back = (
    <p style={{ textAlign: "center" }}>
      <Link className="link" href="/login">
        Back to sign in
      </Link>
    </p>
  );

  if (state.status === "success") {
    return (
      <>
        <Notice tone="success" title="Check your email">
          {state.message}
        </Notice>
        {back}
      </>
    );
  }

  return (
    <>
      <form action={action} className="stack-24" noValidate>
        {state.message && <Notice tone="error">{state.message}</Notice>}
        <Field id="email" name="email" type="email" label="Email" autoComplete="email" required error={state.fieldErrors?.email} />
        <SubmitButton size="lg" block>
          Send reset link
        </SubmitButton>
      </form>
      {back}
    </>
  );
}
