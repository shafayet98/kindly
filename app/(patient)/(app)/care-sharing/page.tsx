import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { careTeam, listReports } from "@/lib/reports/service";
import { DraftReportForm } from "./forms";

export const metadata: Metadata = { title: "Care sharing" };

export default async function CareSharingPage() {
  const user = await requireOnboardedPatient();
  const [team, reports] = await Promise.all([careTeam(user.id), listReports(user.id)]);
  const when = (date: Date) => new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: user.timezone }).format(date);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Care sharing</h1>
        <p className="text-muted">
          Clara prepares a factual summary. You preview it, choose what&apos;s in it, and decide whether to share it. Nothing
          is shared automatically.
        </p>
      </div>

      <section aria-labelledby="team-heading" className="flex flex-col gap-2">
        <h2 id="team-heading" className="text-xl font-bold">
          Your care team
        </h2>
        {team.length ? (
          <ul className="flex flex-col gap-2">
            {team.map((member) => (
              <li key={member.clinicianId} className="rounded-2xl border border-border bg-surface p-4 font-semibold">
                {member.name ?? "Clinician"} <span className="font-normal text-muted">· can only see reports you share</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No clinician is linked to your account yet. You can still prepare a summary to keep or print.</p>
        )}
      </section>

      <section aria-labelledby="new-heading" className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-5">
        <h2 id="new-heading" className="text-xl font-bold">
          Prepare a summary
        </h2>
        <DraftReportForm />
      </section>

      <section aria-labelledby="reports-heading" className="flex flex-col gap-2">
        <h2 id="reports-heading" className="text-xl font-bold">
          Your reports
        </h2>
        {reports.length === 0 && <p className="text-muted">No reports yet.</p>}
        <ul className="flex flex-col gap-2">
          {reports.map((report) => {
            const active = report.shares.filter((share) => !share.revokedAt);
            return (
              <li key={report.id}>
                <Link href={`/care-sharing/${report.id}`} className="flex flex-wrap justify-between gap-2 rounded-2xl border border-border bg-surface p-4 hover:border-primary">
                  <span className="font-semibold">Summary prepared {when(report.createdAt)}</span>
                  <span className="text-sm text-muted">
                    {active.length ? `Shared with ${active.map((share) => share.clinicianName).join(", ")}` : "Not shared"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
