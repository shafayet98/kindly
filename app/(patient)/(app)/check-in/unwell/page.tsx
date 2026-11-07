import type { Metadata } from "next";
import { Icon } from "@/components/kindly/parts";
import { ButtonLink } from "@/components/ui/button";
import { requireOnboardedPatient } from "@/lib/auth/session";
import { SAFETY_CONTACTS } from "@/lib/safety/contacts";

export const metadata: Metadata = { title: "Feeling unwell" };

// Available to everyone from the home page. Non-diagnostic by design.
export default async function FeelingUnwellPage() {
  await requireOnboardedPatient();
  const { emergency, healthAdvice } = SAFETY_CONTACTS;
  const adviceName = healthAdvice.label.split(" (")[0];

  return (
    <div style={{ display: "grid", justifyItems: "center" }}>
      <div style={{ width: "100%", maxWidth: 900 }}>
        <h1 className="headline" style={{ marginBottom: 32 }}>
          Sorry you&apos;re not feeling well
        </h1>
        <div className="emergency" role="alert" style={{ alignItems: "flex-start", padding: "28px 32px", flexWrap: "wrap" }}>
          <Icon name="phone" />
          <div className="emergency__text">
            If this could be an emergency, call {emergency.number} now.
            <span style={{ fontSize: 17, marginTop: 8 }}>
              For example: chest pain, trouble breathing, signs of a stroke, severe bleeding, or thoughts of harming yourself. Don&apos;t wait to talk to Kindly.
            </span>
          </div>
          <a className="btn btn--lg" href={`tel:${emergency.number}`}>
            <Icon name="phone" />
            Call {emergency.number}
          </a>
        </div>

        <section className="card card--lg" style={{ marginTop: 32 }} aria-labelledby="cc-h">
          <h2 id="cc-h" className="subhead" style={{ marginBottom: 20 }}>
            What Kindly can and can&apos;t do
          </h2>
          <div className="grid-2">
            <div className="stack">
              <p className="label">CAN</p>
              <p className="row nowrap top">
                <Icon name="check" />
                <span>Natalie can listen while you describe how you feel, in your own words.</span>
              </p>
              <p className="row nowrap top">
                <Icon name="check" />
                <span>If you want, she can write it down so you can share it with a doctor or nurse.</span>
              </p>
            </div>
            <div className="stack">
              <p className="label">CAN&apos;T</p>
              <p className="row nowrap top">
                <Icon name="x" />
                <span>Kindly can&apos;t diagnose, rule out an emergency, or tell you an illness is harmless.</span>
              </p>
            </div>
          </div>
          <div className="row" style={{ marginTop: 28, gap: 16 }}>
            <ButtonLink size="lg" href="/call?agent=natalie&topic=unwell">
              <Icon name="mic" />
              Talk to Natalie
            </ButtonLink>
            <ButtonLink variant="ghost" size="lg" href="/dashboard">
              Back to home
            </ButtonLink>
          </div>
        </section>

        <section className="stack" style={{ marginTop: 40 }} aria-labelledby="adv-h">
          <h2 id="adv-h" className="title">
            Where to get real advice
          </h2>
          <p className="muted">
            For medical advice from a registered nurse any time, call {adviceName} on {healthAdvice.number}, or contact your GP.
          </p>
          <div className="grid-2" style={{ marginTop: 8 }}>
            <a className="list-card" href={`tel:${healthAdvice.number.replace(/\s/g, "")}`}>
              <span className="cat-icon">
                <Icon name="phone" />
              </span>
              <span>
                <span style={{ fontWeight: 500, display: "block" }}>{adviceName}</span>
                <span className="muted small">Registered nurse, any time · {healthAdvice.number}</span>
              </span>
              <Icon name="chev-right" className="icon--sm" />
            </a>
            <div className="list-card">
              <span className="cat-icon">
                <Icon name="heart" />
              </span>
              <span>
                <span style={{ fontWeight: 500, display: "block" }}>Your GP</span>
                <span className="muted small">Book an appointment as usual</span>
              </span>
              <span />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
