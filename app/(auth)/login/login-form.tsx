"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { resendConfirmation, signIn, type FormState } from "../actions";

const initial: FormState = { status: "idle" };

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signIn, initial);
  const [resendState, resend, resending] = useActionState(resendConfirmation, initial);

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4" noValidate>
        {next && <input type="hidden" name="next" value={next} />}
        {state.message && <Notice tone="error">{state.message}</Notice>}
        <Field id="email" name="email" type="email" label="Email" autoComplete="email" required defaultValue={state.email} error={state.fieldErrors?.email} />
        <Field id="password" name="password" type="password" label="Password" autoComplete="current-password" required error={state.fieldErrors?.password} />
        <Button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      {state.needsConfirmation && (
        <form action={resend} className="flex flex-col gap-2">
          <input type="hidden" name="email" value={state.email ?? ""} />
          {resendState.message ? (
            <Notice tone="success">{resendState.message}</Notice>
          ) : (
            <Button type="submit" variant="secondary" disabled={resending}>
              {resending ? "Sending…" : "Resend confirmation email"}
            </Button>
          )}
        </form>
      )}
    </div>
  );
}
