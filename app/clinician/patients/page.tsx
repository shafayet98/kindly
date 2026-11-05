import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { requireApprovedClinician } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { sharedReportsForClinician } from "@/lib/reports/service";

export const metadata: Metadata = { title: "Patients" };

export default async function ClinicianPatientsPage() {
  const clinician = await requireApprovedClinician();
  // Only patients with an active relationship to this clinician; what's visible is limited
  // further to reports each patient has explicitly shared.
  const [patients, shared] = await Promise.all([
    db
      .select({ id: schema.users.id, displayName: schema.users.displayName })
      .from(schema.clinicianRelationships)
      .innerJoin(schema.users, eq(schema.users.id, schema.clinicianRelationships.patientId))
      .where(and(eq(schema.clinicianRelationships.clinicianId, clinician.id), eq(schema.clinicianRelationships.status, "active"))),
    sharedReportsForClinician(clinician.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Your patients</h1>
        <p className="text-muted">Fictional demonstration data. You see only what each patient has chosen to share.</p>
      </div>
      {patients.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {patients.map((patient) => {
            const reports = shared.filter((report) => report.patientId === patient.id);
            const unreviewed = reports.filter((report) => !report.reviewedAt).length;
            return (
              <li key={patient.id}>
                <Link href={`/clinician/patients/${patient.id}`} className="flex flex-col rounded-2xl border border-border bg-surface p-4 hover:border-primary">
                  <span className="font-bold">{patient.displayName ?? "Patient"}</span>
                  <span className="text-sm text-muted">
                    {reports.length ? `${reports.length} shared report${reports.length > 1 ? "s" : ""}${unreviewed ? ` · ${unreviewed} to review` : ""}` : "Nothing shared yet"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl border border-border bg-surface p-4 text-muted">No patients are linked to your account yet.</p>
      )}
    </div>
  );
}
