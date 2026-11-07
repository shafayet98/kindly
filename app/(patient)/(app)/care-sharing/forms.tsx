"use client";

import { useActionState, useState } from "react";
import { Icon } from "@/components/kindly/icon";
import { OptionCard } from "@/components/kindly/option-card";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { REPORT_SCOPES } from "@/lib/reports/scopes";
import { draftReport, share, type CareState } from "./actions";

const initial: CareState = { status: "idle" };

export function DraftReportForm() {
  const [state, action] = useActionState(draftReport, initial);
  return (
    <form action={action} className="stack-32">
      {state.message && <Notice tone="error">{state.message}</Notice>}
      <fieldset className="fieldset">
        <legend>Period</legend>
        <div className="grid-2" style={{ gap: 10 }}>
          <OptionCard name="weeks" value="2" radio title="Last 2 weeks" />
          <OptionCard name="weeks" value="4" radio defaultChecked title="Last 4 weeks" />
        </div>
      </fieldset>
      <fieldset className="fieldset">
        <legend>Include</legend>
        <div className="options" style={{ gap: 10 }}>
          {Object.entries(REPORT_SCOPES).map(([key, label]) => (
            <OptionCard key={key} name="scope" value={key} defaultChecked={key !== "patterns"} title={label} />
          ))}
        </div>
      </fieldset>
      <div className="notice notice--info">
        <Icon name="lock" />
        <p>Your private conversations and notes with Sarah are never included.</p>
      </div>
      <div>
        <SubmitButton size="lg">
          Prepare a preview <Icon name="arrow-right" />
        </SubmitButton>
      </div>
    </form>
  );
}

export function ShareForm({ reportId, team }: { reportId: string; team: { clinicianId: string; name: string | null }[] }) {
  const [state, action] = useActionState(share, initial);
  const [agreed, setAgreed] = useState(false);
  return (
    <form action={action} className="stack-24">
      {state.message && <Notice tone="error">{state.message}</Notice>}
      <input type="hidden" name="reportId" value={reportId} />
      <div className="field">
        <label className="field__label" htmlFor="sw">
          Share with
        </label>
        <select className="select" id="sw" name="clinicianId">
          {team.map((member) => (
            <option key={member.clinicianId} value={member.clinicianId}>
              {member.name ?? "Clinician"}
            </option>
          ))}
        </select>
      </div>
      <label className="option" style={{ padding: 16 }}>
        <input type="checkbox" name="agree" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
        <span className="option__box">
          <Icon name="check" />
        </span>
        <span style={{ fontSize: 16 }}>I&apos;ve checked this report and want to share exactly this with the clinician above. I can revoke access later.</span>
      </label>
      <SubmitButton size="lg" block aria-disabled={!agreed || undefined}>
        Share report
      </SubmitButton>
      <p className="muted small">Nothing is shared until you press Share report.</p>
    </form>
  );
}
