import { signOut } from "@/app/(auth)/actions";
import { NavLinks } from "@/components/layout/nav-links";
import { Brand, Footer } from "@/components/kindly/parts";

export default function ClinicianLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="header">
        <div className="wrap header__inner">
          <div className="row" style={{ gap: 12 }}>
            <Brand href="/clinician/patients" />
            <span className="badge-portal">CLINICIAN PORTAL</span>
          </div>
          <div className="header__end">
            <NavLinks
              label="Clinician"
              items={[
                { href: "/clinician/patients", label: "Patients", match: ["/clinician/patients", "/clinician/reports"] },
                { href: "/clinician/tasks", label: "Tasks" },
              ]}
            />
            <form action={signOut}>
              <button type="submit" className="btn btn--link">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="page">
        <div className="wrap">{children}</div>
      </main>
      <Footer lead="Clinician portal.">
        Kindly reports are prepared by an AI from what each patient records and chooses to share. They are not a clinical assessment.
      </Footer>
    </>
  );
}
