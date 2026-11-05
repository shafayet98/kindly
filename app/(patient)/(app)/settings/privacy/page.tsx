import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { getConsentState } from "@/lib/consent/store";
import { exportUserData } from "@/lib/privacy/export";
import { listWellbeingNotes, NOTE_RETENTION_DAYS } from "@/lib/wellbeing/notes";
import { removeNote, toggleConsent } from "./actions";
import { DeleteAccountForm } from "./delete-form";

export const metadata: Metadata = { title: "Privacy & data" };

const PERMISSIONS = [
  { purpose: "health_data_processing", title: "Save my habit check-ins", detail: "Activity, food, sleep, smoking and mood you report." },
  { purpose: "browser_voice", title: "Browser voice calls", detail: "Microphone use during Talk now. Audio isn't recorded." },
  { purpose: "sensitive_wellbeing", title: "Private notes with Sarah", detail: `Sarah can keep short notes you ask for, for ${NOTE_RETENTION_DAYS} days. Never shared.` },
] as const;

export default async function PrivacyPage() {
  const user = await requireOnboardedPatient();
  const [consents, notes, data] = await Promise.all([getConsentState(user.id), listWellbeingNotes(user.id), exportUserData(user.id)]);
  const when = (date: Date) => new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: user.timezone }).format(date);
  const activeShares = data.reportShares.filter((share) => !share.revokedAt).length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Privacy & data</h1>
        <p className="text-muted">Each permission is separate. Choosing focus areas or talking to a companion never turns any of these on.</p>
      </div>

      <section aria-labelledby="perm-heading" className="flex flex-col gap-3">
        <h2 id="perm-heading" className="text-xl font-bold">
          Permissions
        </h2>
        <ul className="flex flex-col gap-2">
          {PERMISSIONS.map((permission) => {
            const on = consents[permission.purpose];
            return (
              <li key={permission.purpose} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
                <span>
                  <span className="block font-bold">{permission.title}</span>
                  <span className="block text-sm text-muted">{permission.detail}</span>
                </span>
                <form action={toggleConsent}>
                  <input type="hidden" name="purpose" value={permission.purpose} />
                  <input type="hidden" name="grant" value={on ? "false" : "true"} />
                  <SubmitButton variant={on ? "secondary" : "primary"} aria-label={`${on ? "Turn off" : "Turn on"}: ${permission.title}`}>
                    {on ? "On · turn off" : "Off · turn on"}
                  </SubmitButton>
                </form>
              </li>
            );
          })}
          <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
            <span>
              <span className="block font-bold">Phone calls</span>
              <span className="block text-sm text-muted">{consents.outbound_calls ? "On" : "Off"}. Managed with your number and quiet hours.</span>
            </span>
            <Link href="/schedule" className="font-semibold text-primary underline-offset-4 hover:underline">
              Reminders & calls
            </Link>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
            <span>
              <span className="block font-bold">Sharing with clinicians</span>
              <span className="block text-sm text-muted">{activeShares ? `${activeShares} report${activeShares > 1 ? "s" : ""} shared` : "Nothing shared"}. Approved one report at a time.</span>
            </span>
            <Link href="/care-sharing" className="font-semibold text-primary underline-offset-4 hover:underline">
              Care sharing
            </Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="notes-heading" className="flex flex-col gap-3">
        <h2 id="notes-heading" className="text-xl font-bold">
          Private notes with Sarah
        </h2>
        {notes.length === 0 ? (
          <p className="text-muted">No notes.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {notes.map((note) => (
              <li key={note.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
                <span>
                  <span className="block">{note.content}</span>
                  <span className="block text-xs text-muted">
                    {when(note.createdAt)}
                    {note.expiresAt ? ` · deleted automatically ${when(note.expiresAt)}` : ""}
                  </span>
                </span>
                <form action={removeNote}>
                  <input type="hidden" name="id" value={note.id} />
                  <SubmitButton variant="ghost">Delete</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="remember-heading" className="flex flex-col gap-3">
        <h2 id="remember-heading" className="text-xl font-bold">
          What Kindly remembers
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {[
            [data.habitEvents.length, "habit check-ins (including corrected originals)"],
            [data.goals.length, "goals"],
            [data.reminders.length, "reminders"],
            [data.callSessions.length, "call records (who spoke and when, no audio or words)"],
            [data.reports.length, "reports"],
            [data.wellbeingNotes.length, "private notes"],
          ].map(([count, label]) => (
            <li key={String(label)} className="rounded-xl bg-surface p-3">
              <span className="font-extrabold">{count}</span> {label}
            </li>
          ))}
        </ul>
        <a href="/api/me/export" className="self-start font-semibold text-primary underline-offset-4 hover:underline">
          Download all my data (JSON)
        </a>
      </section>

      <section aria-labelledby="delete-heading" className="flex flex-col gap-3 rounded-3xl border-2 border-danger/30 p-5">
        <h2 id="delete-heading" className="text-xl font-bold text-danger">
          Delete my account
        </h2>
        <p>
          This permanently deletes your account and everything above, cancels any calls, and removes any reports you shared.
          It can&apos;t be undone. An anonymous record that an account was deleted is kept for security.
        </p>
        <DeleteAccountForm />
      </section>
    </div>
  );
}
