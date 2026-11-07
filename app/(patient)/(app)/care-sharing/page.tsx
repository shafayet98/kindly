import type { Metadata } from "next";
import Link from "next/link";
import { AiTag, Avatar, Chip, Empty, Icon, PageHead, PersonAvatar } from "@/components/kindly/parts";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { careTeam, listReports } from "@/lib/reports/service";
import { DraftReportForm } from "./forms";

export const metadata: Metadata = { title: "Care sharing" };

export default async function CareSharingPage() {
  const user = await requireOnboardedPatient();
  const [team, reports] = await Promise.all([careTeam(user.id), listReports(user.id)]);
  const when = (date: Date) => new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: user.timezone }).format(date);
  const day = (date: Date) => new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);

  return (
    <>
      <PageHead title="Care sharing" sub="Clara prepares a factual summary. You preview it, choose what's in it, and decide whether to share it. Nothing is shared automatically.">
        <div className="row nowrap" style={{ gap: 10 }}>
          <Avatar agent="clara" />
          <span>
            <span style={{ fontWeight: 500, display: "block" }}>
              Clara <AiTag />
            </span>
            <span className="companion__role">Care coordination</span>
          </span>
        </div>
      </PageHead>
      <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) 420px" }}>
        <section className="card card--lg stack-32" aria-labelledby="ps-h">
          <h2 id="ps-h" className="subhead">
            Prepare a summary
          </h2>
          <DraftReportForm />
        </section>
        <div className="stack-48">
          <section className="stack" aria-labelledby="ct-h">
            <h2 id="ct-h" className="subhead">
              Your care team
            </h2>
            {team.length ? (
              team.map((member) => (
                <div key={member.clinicianId} className="list-card">
                  <PersonAvatar name={member.name ?? "Clinician"} />
                  <span>
                    <span style={{ fontWeight: 500, display: "block" }}>{member.name ?? "Clinician"}</span>
                    <span className="small muted">Can only see reports you share</span>
                  </span>
                  <span />
                </div>
              ))
            ) : (
              <p className="muted">No clinician is linked to your account yet. You can still prepare a summary to keep or print.</p>
            )}
          </section>
          <section className="stack" aria-labelledby="yr-h">
            <h2 id="yr-h" className="subhead">
              Your reports
            </h2>
            {reports.length === 0 ? (
              <Empty icon="users" title="No reports yet">
                <p className="muted small" style={{ maxWidth: 340 }}>
                  Nothing is shared until you prepare a summary, check it, and choose to share it.
                </p>
              </Empty>
            ) : (
              <ul className="stack">
                {reports.map((report) => {
                  const active = report.shares.filter((share) => !share.revokedAt);
                  const reviewed = active.some((share) => share.reviewedAt);
                  return (
                    <li key={report.id}>
                      <Link className="list-card" href={`/care-sharing/${report.id}`}>
                        <span className="cat-icon">
                          <Icon name="calendar" />
                        </span>
                        <span>
                          <span style={{ fontWeight: 500, display: "block" }}>
                            Report · {day(report.periodStart)} – {day(report.periodEnd)}
                          </span>
                          <span className="small muted">
                            {active.length ? `Shared with ${active.map((share) => share.clinicianName).join(", ")} on ${when(active[0].sharedAt)}` : `Prepared ${when(report.createdAt)} · not shared`}
                          </span>
                        </span>
                        {active.length ? (
                          reviewed ? (
                            <Chip tone="done" icon="check">
                              Reviewed
                            </Chip>
                          ) : (
                            <Chip tone="planned" icon="clock">
                              Not reviewed yet
                            </Chip>
                          )
                        ) : (
                          <Icon name="chev-right" className="icon--sm" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
