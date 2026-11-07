import type { Metadata } from "next";
import { Avatar, BackLink, Icon, PageHead } from "@/components/kindly/parts";
import { ActionSwitch } from "@/components/kindly/switch";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { getConsentState } from "@/lib/consent/store";
import { summaryPreferences } from "@/lib/conversations/summary";
import { exportUserData } from "@/lib/privacy/export";
import { listWellbeingNotes, NOTE_RETENTION_DAYS } from "@/lib/wellbeing/notes";
import { removeNote, toggleConsent, toggleSarahInSummaries } from "./actions";
import { DeleteAccountForm } from "./delete-form";

export const metadata: Metadata = { title: "Privacy & data" };

const PERMISSIONS = [
  { purpose: "health_data_processing", title: "Save my habit check-ins", detail: "Activity, food, sleep, smoking and mood you report." },
  { purpose: "browser_voice", title: "Browser voice calls", detail: "Microphone use during Talk now. Audio isn't recorded." },
  { purpose: "sensitive_wellbeing", title: "Private notes with Sarah", detail: `Sarah can keep short notes you ask for, for ${NOTE_RETENTION_DAYS} days. Never shared.` },
  { purpose: "conversation_summaries", title: "Conversation summaries", detail: "A short AI summary of each call, only for you. The words themselves are never stored." },
] as const;

export default async function PrivacyPage() {
  const user = await requireOnboardedPatient();
  const [consents, notes, data, summaryPrefs] = await Promise.all([getConsentState(user.id), listWellbeingNotes(user.id), exportUserData(user.id), summaryPreferences(user.id)]);
  const when = (date: Date) => new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: user.timezone }).format(date);
  const activeShares = data.reportShares.filter((share) => !share.revokedAt).length;
  const counts: [number, string][] = [
    [data.habitEvents.length, "habit check-ins (including corrected originals)"],
    [data.goals.length, "goals (including earlier versions)"],
    [data.reminders.length, "reminders"],
    [data.callSessions.length, "call records (who spoke and when, no audio or words)"],
    [data.conversationSummaries.length, "conversation summaries"],
    [data.goalSessions.length, "goal sessions marked done or moved"],
    [data.reports.length, "reports"],
    [data.wellbeingNotes.length, "private notes"],
  ];

  const permissionRow = (id: string, title: string, detail: string, control: React.ReactNode) => (
    <div key={id} className="perm">
      <div>
        <p style={{ fontWeight: 500, fontSize: 18 }} id={`${id}-l`}>
          {title}
        </p>
        <p className="muted" id={`${id}-d`}>
          {detail}
        </p>
      </div>
      {control}
    </div>
  );

  return (
    <>
      <BackLink href="/settings">Settings</BackLink>
      <PageHead title="Privacy & data" sub="Each permission is separate. Adding goals or talking to a companion never turns any of these on." />
      <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) 400px" }}>
        <div className="stack-48">
          <section className="stack" aria-labelledby="pm-h">
            <h2 id="pm-h" className="subhead">
              Permissions
            </h2>
            <div className="card" style={{ padding: "4px 28px" }}>
              {PERMISSIONS.map((permission) =>
                permissionRow(
                  permission.purpose,
                  permission.title,
                  permission.detail,
                  <ActionSwitch action={toggleConsent} checked={consents[permission.purpose]} fields={{ purpose: permission.purpose }} labelId={`${permission.purpose}-l`} descId={`${permission.purpose}-d`} />,
                ),
              )}
              {consents.conversation_summaries &&
                permissionRow(
                  "sarah-summaries",
                  "Include chats with Sarah in summaries",
                  summaryPrefs.includeSarah ? "On: summaries cover the whole call." : "Off: summaries only say you had a private chat with Sarah.",
                  <ActionSwitch action={toggleSarahInSummaries} checked={summaryPrefs.includeSarah} fields={{}} labelId="sarah-summaries-l" descId="sarah-summaries-d" />,
                )}
              {permissionRow(
                "phone",
                "Phone calls",
                `${consents.outbound_calls ? "On" : "Off"}. Managed with your number and quiet hours.`,
                <ButtonLink variant="ghost" size="sm" href="/schedule">
                  Reminders & calls
                </ButtonLink>,
              )}
              {permissionRow(
                "sharing",
                "Sharing with clinicians",
                `${activeShares ? `${activeShares} report${activeShares > 1 ? "s" : ""} shared` : "Nothing shared"}. Approved one report at a time.`,
                <ButtonLink variant="ghost" size="sm" href="/care-sharing">
                  Care sharing
                </ButtonLink>,
              )}
            </div>
          </section>

          <section className="stack" aria-labelledby="sn-h">
            <h2 id="sn-h" className="subhead">
              Private notes with Sarah
            </h2>
            {notes.length === 0 ? (
              <div className="empty" style={{ padding: 28 }}>
                <span className="empty__art" style={{ background: "var(--ember-pale)" }}>
                  <Avatar agent="sarah" size="sm" />
                </span>
                <p className="title">No notes</p>
                <p className="muted small">If you turn this on, notes Sarah keeps for you appear here. You can delete any of them.</p>
              </div>
            ) : (
              <ul className="rows">
                {notes.map((note) => (
                  <li key={note.id}>
                    <span>
                      <span style={{ display: "block" }}>{note.content}</span>
                      <span className="rows__sub">
                        {when(note.createdAt)}
                        {note.expiresAt ? ` · deleted automatically ${when(note.expiresAt)}` : ""}
                      </span>
                    </span>
                    <form action={removeNote}>
                      <input type="hidden" name="id" value={note.id} />
                      <SubmitButton variant="link" size="sm" className="link--danger">
                        Delete
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="danger-zone stack-24" aria-labelledby="dz-h">
            <div className="row" style={{ gap: 12 }}>
              <span style={{ color: "var(--danger)" }}>
                <Icon name="alert" className="icon--lg" />
              </span>
              <h2 id="dz-h" className="subhead" style={{ color: "var(--danger-text)" }}>
                Delete my account
              </h2>
            </div>
            <p>
              This permanently deletes your account and everything above, cancels any calls, and removes any reports you shared. It can&apos;t be undone. An anonymous record that an account was
              deleted is kept for security.
            </p>
            <DeleteAccountForm />
          </section>
        </div>

        <aside className="sticky stack-24">
          <section className="card stack" aria-labelledby="wr-h">
            <h2 id="wr-h" className="title">
              What Kindly remembers
            </h2>
            <ul className="rows" style={{ fontSize: 16 }}>
              {counts.map(([count, label]) => (
                <li key={label} style={{ gridTemplateColumns: "1fr" }}>
                  <span>
                    <b style={{ fontSize: 24, fontWeight: 400, letterSpacing: "-0.03em", display: "inline-block", minWidth: 44 }}>{count}</b> {label}
                  </span>
                </li>
              ))}
            </ul>
            <a className="btn btn--ghost" href="/api/me/export">
              <Icon name="arrow-right" className="icon--sm" />
              Download all my data (JSON)
            </a>
          </section>
        </aside>
      </div>
    </>
  );
}
