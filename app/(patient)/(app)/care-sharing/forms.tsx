"use client";

import { useActionState } from "react";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { REPORT_SCOPES } from "@/lib/reports/scopes";
import { draftReport, share, type CareState } from "./actions";

const initial: CareState = { status: "idle" };

export function DraftReportForm() {
  const [state, action] = useActionState(draftReport, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.message && <Notice tone="error">{state.message}</Notice>}
      <fieldset className="flex flex-col gap-2">
        <legend className="font-semibold">Period</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="weeks" value="2" className="h-4 w-4 accent-primary" /> Last 2 weeks
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="weeks" value="4" defaultChecked className="h-4 w-4 accent-primary" /> Last 4 weeks
        </label>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="font-semibold">Include</legend>
        {Object.entries(REPORT_SCOPES).map(([key, label]) => (
          <label key={key} className="flex items-start gap-2">
            <input type="checkbox" name="scope" value={key} defaultChecked={key !== "patterns"} className="mt-1 h-4 w-4 accent-primary" /> {label}
          </label>
        ))}
      </fieldset>
      <p className="text-sm text-muted">Your private conversations and notes with Sarah are never included.</p>
      <SubmitButton className="self-start">Prepare a preview</SubmitButton>
    </form>
  );
}

export function ShareForm({ reportId, team }: { reportId: string; team: { clinicianId: string; name: string | null }[] }) {
  const [state, action] = useActionState(share, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.message && <Notice tone="error">{state.message}</Notice>}
      <input type="hidden" name="reportId" value={reportId} />
      <label className="flex flex-col gap-1.5 font-semibold sm:max-w-sm">
        Share with
        <select name="clinicianId" className="rounded-xl border border-border bg-surface px-3 py-2 font-normal">
          {team.map((member) => (
            <option key={member.clinicianId} value={member.clinicianId}>
              {member.name ?? "Clinician"}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="agree" className="mt-1 h-5 w-5 shrink-0 accent-primary" />
        <span>I&apos;ve checked this report and want to share exactly this with the clinician above. I can revoke access later.</span>
      </label>
      <SubmitButton className="self-start">Share report</SubmitButton>
    </form>
  );
}
