"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { resendConfirmation, signUp, type FormState } from "../actions";

const initial: FormState = { status: "idle" };

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, initial);
  const [resendState, resend, resending] = useActionState(resendConfirmation, initial);

  if (state.status === "success") {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="success">
          <p className="font-semibold">Check your inbox</p>
          <p>{state.message}</p>
        </Notice>
        <form action={resend} className="flex flex-col gap-2">
          <input type="hidden" name="email" value={state.email ?? ""} />
          {resendState.message ? (
            <p className="text-sm text-muted" role="status">
              {resendState.message}
            </p>
          ) : (
            <Button type="submit" variant="secondary" disabled={resending}>
              {resending ? "Sending…" : "Didn't get it? Resend"}
            </Button>
          )}
        </form>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
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
      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
