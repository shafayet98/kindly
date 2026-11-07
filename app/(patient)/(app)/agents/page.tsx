import type { Metadata } from "next";
import { AiTag, Avatar, Icon, PageHead } from "@/components/kindly/parts";
import { ButtonLink } from "@/components/ui/button";
import { AGENTS } from "@/lib/agents/directory";
import { requireOnboardedPatient } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Meet the team" };

export default async function AgentsPage() {
  await requireOnboardedPatient();
  const live = Object.values(AGENTS).filter((agent) => agent.live);
  const helpers = Object.values(AGENTS).filter((agent) => !agent.live);
  return (
    <>
      <PageHead title="Meet the team" sub="Six AI companions who work together. None of them are human or clinicians, and each one only sees what it needs." />
      <section className="stack-24" aria-labelledby="live-h">
        <h2 id="live-h" className="label">
          YOU CAN TALK TO
        </h2>
        <div className="grid-3">
          {live.map((agent) => (
            <article key={agent.key} className="card card--lg stack-24" style={{ display: "flex", flexDirection: "column" }}>
              <div className="companion" style={{ alignItems: "center" }}>
                <Avatar agent={agent.key} size="lg" />
                <div>
                  <h3 className="subhead">
                    {agent.name} <AiTag />
                  </h3>
                  <p className="companion__role" style={{ marginTop: 6 }}>
                    {agent.role}
                  </p>
                </div>
              </div>
              <p className="body-lg">{agent.helpsWith}</p>
              <p className="row nowrap top muted small" style={{ gap: 10 }}>
                <Icon name="shield" className="icon--sm" />
                <span>{agent.limits}</span>
              </p>
              <ButtonLink variant={agent.key === "natalie" ? "primary" : "ghost"} href={`/call?agent=${agent.key}`} style={{ marginTop: "auto", alignSelf: "flex-start" }}>
                <Icon name="mic" className="icon--sm" />
                Talk to {agent.name}
              </ButtonLink>
            </article>
          ))}
        </div>
      </section>
      <section className="stack-24" style={{ marginTop: 56 }} aria-labelledby="behind-h">
        <h2 id="behind-h" className="label">
          BEHIND THE SCENES
        </h2>
        <div className="grid-3">
          {helpers.map((agent) => (
            <article key={agent.key} className="card stack" style={{ background: "var(--surface)" }}>
              <div className="companion" style={{ alignItems: "center" }}>
                <Avatar agent={agent.key} />
                <div>
                  <h3 className="title">
                    {agent.name} <AiTag />
                  </h3>
                  <p className="companion__role">{agent.role}</p>
                </div>
              </div>
              <p>{agent.helpsWith}</p>
              <p className="row nowrap top muted small" style={{ gap: 10 }}>
                <Icon name="shield" className="icon--sm" />
                <span>{agent.limits}</span>
              </p>
              <p className="label">Works behind the scenes when another companion asks.</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
