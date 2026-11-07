"use client";

import { useOptimistic, useRef, useTransition } from "react";

/**
 * An on/off switch that saves straight away through a server action. The action gets the hidden
 * fields plus `next` = "true" or "false".
 */
export function ActionSwitch({
  action,
  checked,
  fields,
  labelId,
  descId,
}: {
  action: (formData: FormData) => Promise<void>;
  checked: boolean;
  fields: Record<string, string>;
  labelId: string;
  descId?: string;
}) {
  const [optimistic, setOptimistic] = useOptimistic(checked);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="next" value={optimistic ? "true" : "false"} />
      <label className="switch">
        <input
          type="checkbox"
          role="switch"
          aria-labelledby={labelId}
          aria-describedby={descId}
          checked={optimistic}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.checked;
            const data = new FormData(formRef.current!);
            data.set("next", next ? "true" : "false");
            startTransition(async () => {
              setOptimistic(next);
              await action(data);
            });
          }}
        />
        <span className="switch__track" />
        <span className="switch__state" aria-hidden="true">
          {optimistic ? "On" : "Off"}
        </span>
      </label>
    </form>
  );
}
