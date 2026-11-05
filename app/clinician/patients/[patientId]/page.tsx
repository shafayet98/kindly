import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { requireApprovedClinician } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { sharedReportsForClinician } from "@/lib/reports/service";

export const metadata: Metadata = { title: "Patient" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClinicianPatientPage({ params }: PageProps<"/clinician/patients/[patientId]">) {
  const clinician = await requireApprovedClinician();
  const { patientId } = await params;
  if (!UUID.test(patientId)) notFound();

  const [patient] = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName })
    .from(schema.clinicianRelationships)
    .innerJoin(schema.users, eq(schema.users.id, schema.clinicianRelationships.patientId))
    .where(and(eq(schema.clinicianRelationships.clinicianId, clinician.id), eq(schema.clinicianRelationships.patientId, patientId), eq(schema.clinicianRelationships.status, "active")));
  await audit({ actorUserId: clinician.id, actorType: "clinician", resourceType: "patient", resourceId: patientId, action: "patient.viewed", result: patient ? "success" : "denied" });
  // Same response whether the patient doesn't exist or isn't linked: nothing leaks (AC-16).
  if (!patient) notFound();

  const reports = (await sharedReportsForClinician(clinician.id)).filter((report) => report.patientId === patientId);
  const day = (date: Date) => new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: "UTC" }).format(date);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/clinician/patients" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
          ← Patients
        </Link>
        <h1 className="mt-2 text-3xl font-bold">{patient.displayName ?? "Patient"}</h1>
        <p className="text-muted">Only reports this patient has shared with you appear here. Private wellbeing conversations are never shared.</p>
      </div>
      {reports.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-4 text-muted">This patient hasn&apos;t shared a report with you.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {reports.map((report) => (
            <li key={report.reportId}>
              <Link href={`/clinician/reports/${report.reportId}`} className="flex flex-wrap justify-between gap-2 rounded-2xl border border-border bg-surface p-4 hover:border-primary">
                <span className="font-semibold">
                  Report {day(report.periodStart)} – {day(report.periodEnd)}
                </span>
                <span className="text-sm text-muted">{report.reviewedAt ? "Reviewed" : "Not reviewed"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
