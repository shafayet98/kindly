import type { ReactNode } from "react";
import { Brand, Icon } from "@/components/kindly/parts";

/** Split screen for account pages: a short example call on the left explains the product. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth__art">
        <Brand />
        <div className="convo" aria-hidden="true">
          <p className="bubble bubble--them">
            <span className="bubble__who">Milo · AI companion</span>Morning, Alex. Want me to move your walk to 5 PM today?
          </p>
          <p className="bubble bubble--me">Yes please, it&apos;s raining now.</p>
          <p className="bubble bubble--them">
            <span className="bubble__who">Milo · AI companion</span>Done. I&apos;ll call you at 4:45 to remind you.
          </p>
        </div>
        <p className="label" style={{ color: "#b9c8d2" }}>
          A team of AI companions who call, listen, and help healthy habits stick.
        </p>
      </aside>
      <main id="main" className="auth__main">
        <div className="auth__form">{children}</div>
        <p className="auth__foot row nowrap top" style={{ gap: 10 }}>
          <Icon name="info" />
          <span>Kindly is an AI wellbeing companion, not a medical or emergency service. In an emergency, call 000.</span>
        </p>
      </main>
    </div>
  );
}
