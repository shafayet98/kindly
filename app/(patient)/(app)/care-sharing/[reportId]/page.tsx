import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink, Chip, PageHead, PersonAvatar } from "@/components/kindly/parts";
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
    <>
      <BackLink href="/care-sharing">Care sharing</BackLink>
      <PageHead title="Report preview" sub="This is exactly what a clinician would see." />
      <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) 400px" }}>
        <ReportView content={report.content as ReportContent} />
        <aside className="sticky">
          <section className="card card--lg stack-24" aria-labelledby="sh-h">
            <h2 id="sh-h" className="subhead">
              Sharing
            </h2>
            {activeShares.map((share) => (
              <div key={share.id} className="stack">
                <div className="list-card" style={{ padding: 16 }}>
                  <PersonAvatar name={share.clinicianName ?? "Clinician"} />
                  <span>
                    <span style={{ fontWeight: 500, display: "block" }}>Shared with {share.clinicianName}</span>
                    <span className="small muted">Shared {when(share.sharedAt)}</span>
                  </span>
                  <span />
                </div>
                <span style={{ justifySelf: "start" }}>
                  {share.reviewedAt ? (
                    <Chip tone="done" icon="check">
                      Reviewed {when(share.reviewedAt)}
                    </Chip>
                  ) : (
                    <Chip tone="planned" icon="clock">
                      Not reviewed yet
                    </Chip>
                  )}
                </span>
                <form action={revoke}>
                  <input type="hidden" name="shareId" value={share.id} />
                  <input type="hidden" name="reportId" value={report.id} />
                  <SubmitButton variant="danger-ghost">Revoke access</SubmitButton>
                </form>
                <p className="muted small">Revoking removes the report from {share.clinicianName}&apos;s portal straight away.</p>
              </div>
            ))}
            {unsharedTeam.length > 0 ? (
              <ShareForm reportId={report.id} team={unsharedTeam} />
            ) : (
              activeShares.length === 0 && <p className="muted">No clinician is linked to your account, so this report stays with you.</p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
