import { Wordmark } from "@/components/brand";
import { signOut } from "@/app/(auth)/actions";

export default function ClinicianLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Wordmark href="/clinician/patients" />
            <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-bold">Clinician portal</span>
          </div>
          <form action={signOut}>
            <button type="submit" className="rounded-full px-3 py-2 font-semibold text-muted hover:bg-primary-soft">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
