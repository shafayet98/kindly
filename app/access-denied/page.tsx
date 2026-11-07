import type { Metadata } from "next";
import { signOut } from "@/app/(auth)/actions";
import { Brand, Footer, Icon } from "@/components/kindly/parts";
import { SubmitButton } from "@/components/ui/submit-button";

export const metadata: Metadata = { title: "Access denied" };

export default function AccessDeniedPage() {
  return (
    <>
      <main id="main" className="page" style={{ display: "grid", placeItems: "start center", paddingTop: 56 }}>
        <div className="wrap" style={{ maxWidth: 672, display: "grid", gap: 32, justifyItems: "center" }}>
          <Brand />
          <div className="card card--lg card--bubble stack-24" style={{ width: "100%" }}>
            <span className="cat-icon" style={{ width: 64, height: 64 }}>
              <Icon name="lock" className="icon--xl" />
            </span>
            <div className="stack">
              <p className="label">CLINICIAN PORTAL</p>
              <h1 className="headline">You don&apos;t have access to this area</h1>
              <p className="body-lg muted">
                The clinician portal is only available to invited and approved clinicians. If you think this is a mistake, contact the Kindly team.
              </p>
            </div>
            <form action={signOut} className="row">
              <SubmitButton variant="secondary" size="lg">
                <Icon name="logout" />
                Sign out
              </SubmitButton>
            </form>
          </div>
        </div>
      </main>
      <Footer lead="">Kindly is an AI wellbeing companion, not a medical or emergency service. In an emergency, call 000.</Footer>
    </>
  );
}
