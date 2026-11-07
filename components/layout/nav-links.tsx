"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Header navigation; marks the section you're in with aria-current. */
export function NavLinks({ items, label = "Main" }: { items: { href: string; label: string; match?: string[] }[]; label?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label}>
      <ul className="nav">
        {items.map((item) => {
          const prefixes = item.match ?? [item.href];
          const current = prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={current ? "page" : undefined}>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
