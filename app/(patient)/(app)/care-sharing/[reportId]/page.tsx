import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportView } from "@/components/reports/report-view";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { careTeam, listReports, type ReportContent } from "@/lib/reports/service";
import { revoke } from "../actions";
import { ShareForm } from "../forms";

export const metadata: Metadata = { title: "Report preview" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReportPreviewPage({ params }: PageProps<"/care-sharing/[reportId]">) {
  const user = await requireOnboardedPatient();
  const { reportId } = await params;
  if (!UUID.test(reportId)) notFound();
  const [reports, team] = await Promise.all([listReports(user.id), careTeam(user.id)]);
  const report = reports.find((candidate) => candidate.id === reportId);
  if (!report) notFound();

  const activeShares = report.shares.filter((share) => !share.revokedAt);
  const unsharedTeam = team.filter((member) => !activeShares.some((share) => share.clinicianId === member.clinicianId));
  const when = (date: Date) => new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: user.timezone }).format(date);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <Link href="/care-sharing" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
          ← Care sharing
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Report preview</h1>
        <p className="text-muted">This is exactly what a clinician would see.</p>
      </div>

      <div className="rounded-3xl border border-border bg-surface p-5">
        <ReportView content={report.content as ReportContent} />
      </div>

      <section aria-labelledby="sharing-heading" className="flex flex-col gap-3">
        <h2 id="sharing-heading" className="text-xl font-bold">
          Sharing
        </h2>
        {activeShares.length > 0 && (
          <ul className="flex flex-col gap-2">
            {activeShares.map((share) => (
              <li key={share.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface p-4">
                <span>
                  Shared with <strong>{share.clinicianName}</strong> on {when(share.sharedAt)}
                  {share.reviewedAt ? ` · reviewed ${when(share.reviewedAt)}` : " · not reviewed yet"}
                </span>
                <form action={revoke}>
                  <input type="hidden" name="shareId" value={share.id} />
                  <input type="hidden" name="reportId" value={report.id} />
                  <SubmitButton variant="secondary">Revoke access</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        {unsharedTeam.length > 0 ? (
          <ShareForm reportId={report.id} team={unsharedTeam} />
        ) : (
          activeShares.length === 0 && <p className="text-muted">No clinician is linked to your account, so this report stays with you.</p>
        )}
      </section>
    </div>
  );
}
