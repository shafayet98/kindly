import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink, Chip, Icon, PageHead, PersonAvatar } from "@/components/kindly/parts";
import { ReportView } from "@/components/reports/report-view";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireApprovedClinician } from "@/lib/auth/session";
import { getReportForClinician, type ReportContent } from "@/lib/reports/service";
import { markReportReviewed } from "../../actions";

export const metadata: Metadata = { title: "Shared report" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClinicianReportPage({ params }: PageProps<"/clinician/reports/[reportId]">) {
  const clinician = await requireApprovedClinician();
  const { reportId } = await params;
  if (!UUID.test(reportId)) notFound();
  const shared = await getReportForClinician(clinician.id, reportId);
  if (!shared) notFound();
  const name = shared.patientName ?? "Patient";

  return (
    <>
      <BackLink href={`/clinician/patients/${shared.report.patientId}`}>{name}</BackLink>
      <PageHead title={`Shared report: ${name}`} sub="Shared by the patient. Fictional demonstration data." />
      <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) 400px" }}>
        <ReportView content={shared.report.content as ReportContent} />
        <aside className="sticky">
          <section className="card card--lg stack-24" aria-labelledby="rv-h">
            <h2 id="rv-h" className="subhead">
              Review
            </h2>
            <div className="list-card" style={{ padding: 16 }}>
              <PersonAvatar name={name} />
              <span>
                <span style={{ fontWeight: 500, display: "block" }}>{name}</span>
                <span className="small muted">Shared by the patient</span>
              </span>
              <span />
            </div>
            {shared.reviewedAt ? (
              <p className="stack" style={{ gap: 8 }}>
                <span>
                  <Chip tone="done" icon="check">
                    Reviewed
                  </Chip>
                </span>
                <span>You marked this report as reviewed.</span>
              </p>
            ) : (
              <>
                <span style={{ justifySelf: "start" }}>
                  <Chip tone="planned" icon="clock">
                    Not reviewed yet
                  </Chip>
                </span>
                <form action={markReportReviewed}>
                  <input type="hidden" name="reportId" value={reportId} />
                  <SubmitButton size="lg" block>
                    <Icon name="check" />
                    Mark as reviewed
                  </SubmitButton>
                </form>
              </>
            )}
            <p className="muted small">The patient sees “reviewed” once you mark it.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
