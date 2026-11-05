import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { requireApprovedClinician } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";

export const metadata: Metadata = { title: "Patients" };

export default async function ClinicianPatientsPage() {
  const clinician = await requireApprovedClinician();
  // Only patients with an active relationship to this clinician. What they can see of each
  // patient is limited further to reports the patient has explicitly shared.
  const patients = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName, nickname: schema.patientProfiles.nickname })
    .from(schema.clinicianRelationships)
    .innerJoin(schema.users, eq(schema.users.id, schema.clinicianRelationships.patientId))
    .leftJoin(schema.patientProfiles, eq(schema.patientProfiles.userId, schema.users.id))
    .where(and(eq(schema.clinicianRelationships.clinicianId, clinician.id), eq(schema.clinicianRelationships.status, "active")));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Your patients</h1>
        <p className="text-muted">Fictional demonstration data. You see only what each patient has chosen to share.</p>
      </div>
      {patients.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {patients.map((patient) => (
            <li key={patient.id} className="rounded-2xl border border-border bg-surface p-4">
              <p className="font-bold">{patient.displayName ?? patient.nickname ?? "Patient"}</p>
              <p className="text-sm text-muted">Shared reports appear here once the patient approves them.</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-border bg-surface p-4 text-muted">No patients are linked to your account yet.</p>
      )}
    </div>
  );
}
