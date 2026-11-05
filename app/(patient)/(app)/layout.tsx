import { AppHeader } from "@/components/layout/app-header";
import { SAFETY_CONTACTS } from "@/lib/safety/contacts";

export default function PatientAppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-border px-4 py-4 text-center text-sm text-muted">
        Kindly&apos;s companions are AI, not clinicians or an emergency service. In an emergency call{" "}
        {SAFETY_CONTACTS.emergency.number}.
      </footer>
    </>
  );
}
