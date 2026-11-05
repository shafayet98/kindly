import type { Metadata } from "next";
import Link from "next/link";
import { AGENTS } from "@/lib/agents/directory";
import { requireOnboardedPatient } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Meet the team" };

export default async function AgentsPage() {
  await requireOnboardedPatient();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Meet the team</h1>
        <p className="text-muted">
          Six AI companions who work together. None of them are human or clinicians, and each one only sees what it needs.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {Object.values(AGENTS).map((agent) => (
          <li key={agent.key} className="flex flex-col gap-2 rounded-3xl border border-border bg-surface p-5">
            <p className="text-xl font-bold">
              {agent.name} <span className="text-base font-normal text-muted">· {agent.role}</span>
            </p>
            <p>{agent.helpsWith}</p>
            <p className="text-sm text-muted">{agent.limits}</p>
            {agent.live ? (
              <Link href={`/call?agent=${agent.key}`} className="mt-auto font-semibold text-primary underline-offset-4 hover:underline">
                Talk to {agent.name}
              </Link>
            ) : (
              <p className="mt-auto text-sm text-muted">Works behind the scenes when another companion asks.</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
