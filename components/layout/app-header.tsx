import { signOut } from "@/app/(auth)/actions";
import { Brand, Icon } from "@/components/kindly/parts";
import { ButtonLink } from "@/components/ui/button";
import { NavLinks } from "./nav-links";

const NAV = [
  { href: "/dashboard", label: "Home" },
  { href: "/goals", label: "Goals" },
  { href: "/schedule", label: "Reminders" },
  { href: "/progress", label: "Progress" },
  { href: "/settings", label: "Settings", match: ["/settings", "/activity", "/care-sharing"] },
];

export function AppHeader() {
  return (
    <header className="header">
      <div className="wrap header__inner">
        <Brand href="/dashboard" />
        <NavLinks items={NAV} />
        <div className="header__end">
          <ButtonLink variant="highlight" size="sm" href="/call">
            <Icon name="mic" className="icon--sm" />
            Talk now
          </ButtonLink>
          <form action={signOut}>
            <button type="submit" className="btn btn--link">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
