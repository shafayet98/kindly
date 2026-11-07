import { AiTag, Avatar, Brand, Footer, Icon, type IconName } from "@/components/kindly/parts";
import { ButtonLink } from "@/components/ui/button";
import { AGENTS } from "@/lib/agents/directory";

const STEPS: { n: string; title: string; body: string; icon: IconName }[] = [
  { n: "01", title: "Set small goals", body: "Say it in your own words, like “walk 3 days a week”. Kindly sorts it and puts it on your weekly calendar.", icon: "calendar" },
  { n: "02", title: "Talk, don't type", body: "Speak naturally. Ask for Natalie, Milo or Sarah and they'll pass the conversation along without hanging up.", icon: "mic" },
  { n: "03", title: "Real actions, your permission", body: "Companions move reminders and adjust plans only after you say yes. Nothing is shared unless you choose.", icon: "shield" },
];

const LIVE = Object.values(AGENTS).filter((agent) => agent.live);
const BEHIND = Object.values(AGENTS).filter((agent) => !agent.live);

export default async function LandingPage({ searchParams }: PageProps<"/">) {
  const { deleted } = await searchParams;
  return (
    <>
      <header className="header">
        <div className="wrap header__inner">
          <Brand />
          <div className="header__end">
            <ButtonLink variant="link" href="/login">
              Sign in
            </ButtonLink>
            <ButtonLink href="/signup">Create account</ButtonLink>
          </div>
        </div>
      </header>
      <main id="main">
        {deleted === "1" && (
          <div className="wrap" style={{ paddingTop: 24 }}>
            <p role="status" className="notice notice--success">
              <Icon name="check" />
              <span>Your account and data have been deleted.</span>
            </p>
          </div>
        )}
        <section className="wrap" style={{ paddingTop: 80, paddingBottom: 96 }}>
          <div className="grid items-center gap-16 lg:grid-cols-[1.25fr_1fr]">
            <div className="stack-32">
              <span className="label">AI wellbeing companions · Australia</span>
              <h1 className="display">A team of AI companions who call, listen, and help healthy habits stick.</h1>
              <p className="body-lg muted" style={{ maxWidth: 560 }}>
                Kindly checks in when you invite it, works with you through setbacks, and keeps your care team informed only with your permission.
              </p>
              <div className="row" style={{ gap: 16 }}>
                <ButtonLink size="lg" href="/signup">
                  Get started <Icon name="arrow-right" />
                </ButtonLink>
                <ButtonLink variant="ghost" size="lg" href="/login">
                  I already have an account
                </ButtonLink>
              </div>
            </div>
            <div role="img" aria-label="Example conversation" style={{ background: "var(--ink)", borderRadius: "28px 28px 28px 6px", padding: "40px 36px", display: "grid", gap: 16 }}>
              <div className="row" style={{ gap: 10, color: "var(--paper)" }}>
                <Avatar agent="natalie" size="sm" />
                <span className="label" style={{ color: "#b9c8d2" }}>
                  Natalie · AI companion · on the phone
                </span>
              </div>
              <p className="bubble bubble--them">How did the walk go this morning?</p>
              <p className="bubble bubble--me">Didn&apos;t happen. My shifts changed.</p>
              <p className="bubble bubble--them">That&apos;s okay. Want to try 20 minutes after work instead? I&apos;ll only change it if you say yes.</p>
              <p className="bubble bubble--me">Yes, let&apos;s do that.</p>
            </div>
          </div>
        </section>

        <section className="wrap" style={{ paddingBottom: 96 }} aria-labelledby="how-h">
          <div className="section-head">
            <h2 id="how-h" className="headline">
              How it works
            </h2>
          </div>
          <ol className="grid-3">
            {STEPS.map((step) => (
              <li key={step.n} className="card card--lg stack-24">
                <div className="row row--between">
                  <span className="label">Step {step.n}</span>
                  <span className="cat-icon">
                    <Icon name={step.icon} />
                  </span>
                </div>
                <div className="stack">
                  <h3 className="subhead">{step.title}</h3>
                  <p className="muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section style={{ background: "var(--surface-sunken)", padding: "96px 0" }} aria-labelledby="team-h">
          <div className="wrap">
            <div className="section-head">
              <div className="stack">
                <h2 id="team-h" className="headline">
                  Meet the companions
                </h2>
                <p className="body-lg muted">All of them are AI. Talk to three of them; three more work behind the scenes.</p>
              </div>
            </div>
            <ul className="grid-3">
              {LIVE.map((agent) => (
                <li key={agent.key} className="card companion-card">
                  <div className="companion">
                    <Avatar agent={agent.key} />
                    <div>
                      <p className="companion__name">
                        {agent.name} <AiTag />
                      </p>
                      <p className="companion__role">{agent.role}</p>
                    </div>
                  </div>
                  <p className="muted">{agent.helpsWith}</p>
                </li>
              ))}
            </ul>
            <div className="mt-14 grid gap-12 lg:grid-cols-[280px_1fr]">
              <div className="stack">
                <h3 className="subhead">Behind the scenes</h3>
                <p className="muted">You don&apos;t talk to these helpers directly. They support Natalie, Milo and Sarah.</p>
              </div>
              <ul className="grid gap-x-8 lg:grid-cols-3">
                {BEHIND.map((agent) => (
                  <li key={agent.key} className="companion" style={{ padding: "20px 0", borderTop: "1px solid var(--border)" }}>
                    <Avatar agent={agent.key} size="sm" />
                    <div>
                      <p style={{ fontWeight: 500 }}>
                        {agent.name}{" "}
                        <span className="muted" style={{ fontWeight: 400 }}>
                          · {agent.role}
                        </span>
                      </p>
                      <p className="muted small">{agent.helpsWith}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="wrap" style={{ padding: "96px 16px", textAlign: "center" }}>
          <div className="stack-24" style={{ maxWidth: 640, margin: "0 auto", display: "grid", justifyItems: "center" }}>
            <h2 className="headline">Start with one small goal.</h2>
            <ButtonLink size="lg" href="/signup">
              Get started <Icon name="arrow-right" />
            </ButtonLink>
          </div>
        </section>
      </main>
      <Footer>Kindly is an AI wellbeing companion. It doesn&apos;t diagnose or treat, and it isn&apos;t an emergency service. In an emergency, call 000. Prototype with fictional data only.</Footer>
    </>
  );
}
