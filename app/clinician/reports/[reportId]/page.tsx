import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link href={`/clinician/patients/${shared.report.patientId}`} className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
          ← {shared.patientName ?? "Patient"}
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Shared report: {shared.patientName ?? "Patient"}</h1>
        <p className="text-muted">Shared by the patient. Fictional demonstration data.</p>
      </div>
      <div className="rounded-3xl border border-border bg-surface p-5">
        <ReportView content={shared.report.content as ReportContent} />
      </div>
      {shared.reviewedAt ? (
        <p className="font-semibold text-primary">You marked this report as reviewed.</p>
      ) : (
        <form action={markReportReviewed}>
          <input type="hidden" name="reportId" value={reportId} />
          <SubmitButton>Mark as reviewed</SubmitButton>
        </form>
      )}
    </div>
  );
}
