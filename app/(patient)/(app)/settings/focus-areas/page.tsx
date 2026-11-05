import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { FOCUS_AREAS } from "@/lib/preferences/focus-areas";
import { getFocusAreas } from "@/lib/preferences/store";
import { updateFocusAreas } from "./actions";

export const metadata: Metadata = { title: "Focus areas" };

export default async function FocusAreasSettingsPage() {
  const user = await requireOnboardedPatient();
  const selected = await getFocusAreas(user.id);

  return (
    <form action={updateFocusAreas} className="mx-auto flex max-w-2xl flex-col gap-6">
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1">
          <h1 className="text-3xl font-bold">Focus areas</h1>
          <p className="mt-1 text-muted">
            Choose what Kindly should suggest first. This doesn&apos;t change any calling or sharing permissions, and you
            can always ask any companion for anything.
          </p>
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {FOCUS_AREAS.map((area) => (
            <label
              key={area.key}
              className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-border bg-surface p-4 hover:border-primary/40 has-checked:border-primary has-checked:bg-primary-soft"
            >
              <input type="checkbox" name="area" value={area.key} defaultChecked={selected.includes(area.key)} className="mt-1 h-5 w-5 shrink-0 accent-primary" />
              <span>
                <span className="block font-bold">{area.title}</span>
                <span className="block text-sm text-muted">{area.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <ButtonLink href="/dashboard" variant="ghost">
          Cancel
        </ButtonLink>
        <SubmitButton>Save</SubmitButton>
      </div>
    </form>
  );
}
