import { Wordmark } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";
import { AGENTS } from "@/lib/agents/directory";

const STEPS = [
  { title: "Choose what matters", body: "Pick one or more areas, like healthy habits, routines or how you're feeling. Change them any time." },
  { title: "Talk, don't type", body: "Speak naturally. Ask for Natalie, Milo or Sarah and they'll pass the conversation along without hanging up." },
  { title: "Real actions, your permission", body: "Companions move reminders and adjust plans only after you say yes. Nothing is shared unless you choose." },
];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <Wordmark />
        <nav className="flex gap-2">
          <ButtonLink href="/login" variant="ghost">
            Sign in
          </ButtonLink>
          <ButtonLink href="/signup">Create account</ButtonLink>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-4 py-10">
        <section className="flex max-w-2xl flex-col gap-5">
          <h1 className="text-4xl leading-tight font-extrabold sm:text-5xl">
            A team of AI companions who call, listen, and help healthy habits stick.
          </h1>
          <p className="text-lg text-muted">
            Kindly checks in when you invite it, works with you through setbacks, and keeps your care team informed only
            with your permission.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/signup">Get started</ButtonLink>
            <ButtonLink href="/login" variant="secondary">
              I already have an account
            </ButtonLink>
          </div>
        </section>

        <section aria-labelledby="how-heading" className="flex flex-col gap-4">
          <h2 id="how-heading" className="text-2xl font-bold">
            How it works
          </h2>
          <ol className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-3xl border border-border bg-surface p-5">
                <p className="text-sm font-bold text-accent">Step {index + 1}</p>
                <p className="mt-1 text-lg font-bold">{step.title}</p>
                <p className="mt-1 text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="team-heading" className="flex flex-col gap-4">
          <h2 id="team-heading" className="text-2xl font-bold">
            Meet the companions
          </h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {Object.values(AGENTS).map((agent) => (
              <li key={agent.key} className="rounded-2xl bg-primary-soft p-4">
                <p className="font-bold">
                  {agent.name} <span className="font-normal text-muted">· {agent.role}</span>
                </p>
                <p className="text-sm">{agent.helpsWith}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-6 text-center text-sm text-muted">
        Kindly is an AI wellbeing companion. It doesn&apos;t diagnose or treat, and it isn&apos;t an emergency service. In an
        emergency, call 000. Prototype with fictional data only.
      </footer>
    </div>
  );
}
