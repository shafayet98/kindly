"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { resendConfirmation, signIn, type FormState } from "../actions";

const initial: FormState = { status: "idle" };

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, initial);
  const [resendState, resend] = useActionState(resendConfirmation, initial);

  return (
    <div className="stack-24">
      {state.message && !state.needsConfirmation && <Notice tone="error">{state.message}</Notice>}
      {state.needsConfirmation && (
        <div className="notice notice--info" role="status">
          <svg className="icon" viewBox="0 0 20 20" aria-hidden="true">
            <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
            <path d="m3 5.5 7 5.5 7-5.5" />
          </svg>
          <div>
            <p className="notice__title">Please confirm your email first</p>
            <p>We sent a link to your inbox when you created your account.</p>
            <form action={resend} style={{ marginTop: 12 }}>
              <input type="hidden" name="email" value={state.email ?? ""} />
              {resendState.message ? (
                <p className="small">{resendState.message}</p>
              ) : (
                <SubmitButton variant="ghost" size="sm">
                  Resend confirmation email
                </SubmitButton>
              )}
            </form>
          </div>
        </div>
      )}
      <form action={action} className="stack-24" noValidate>
        {next && <input type="hidden" name="next" value={next} />}
        <Field id="email" name="email" type="email" label="Email" autoComplete="email" required defaultValue={state.email} error={state.fieldErrors?.email} />
        <Field id="password" name="password" type="password" label="Password" autoComplete="current-password" required error={state.fieldErrors?.password} />
        <SubmitButton size="lg" block>
          Sign in
        </SubmitButton>
      </form>
    </div>
  );
}
