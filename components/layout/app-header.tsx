import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { signOut } from "@/app/(auth)/actions";

const NAV = [
  { href: "/dashboard", label: "Home" },
  { href: "/goals", label: "Goals" },
  { href: "/schedule", label: "Reminders" },
  { href: "/progress", label: "Progress" },
  { href: "/settings", label: "Settings" },
] as const;

export function AppHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Wordmark href="/dashboard" />
        <nav aria-label="Main" className="order-3 flex w-full gap-1 overflow-x-auto sm:order-2 sm:w-auto">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-full px-3 py-2 font-semibold text-muted hover:bg-primary-soft hover:text-primary">
              {item.label}
            </Link>
          ))}
        </nav>
        <form action={signOut} className="order-2 sm:order-3">
          <button type="submit" className="rounded-full px-3 py-2 font-semibold text-muted hover:bg-primary-soft hover:text-primary">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
