import { AppHeader } from "@/components/layout/app-header";
import { Footer } from "@/components/kindly/parts";
import { SAFETY_CONTACTS } from "@/lib/safety/contacts";

export default function PatientAppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <AppHeader />
      <main id="main" className="page">
        <div className="wrap">{children}</div>
      </main>
      <Footer>
        Kindly&apos;s companions are AI, not clinicians or an emergency service. In an emergency call {SAFETY_CONTACTS.emergency.number}.
      </Footer>
    </>
  );
}
