"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PRIMARY = [
  { href: "/2026", label: "Home" },
  { href: "/2026/fixtures", label: "Fixtures" },
  { href: "/2026/teams", label: "Teams" },
  { href: "/2026/standings", label: "Standings" },
] as const;

export function HeaderHistory() {
  const path = usePathname();
  return (
    <Link className="header-history" href="/history" aria-current={path.startsWith("/history") ? "page" : undefined}>
      History
    </Link>
  );
}

export function DesktopNav() {
  const path = usePathname();
  return (
    <nav className="desktop-nav" aria-label="Primary">
      {PRIMARY.map((item) => (
        <Link key={item.href} href={item.href} aria-current={current(path, item.href) ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
      <Link href="/history" aria-current={path.startsWith("/history") ? "page" : undefined}>History</Link>
    </nav>
  );
}

export function MobileNav() {
  const path = usePathname();
  return (
    <nav className="mobile-nav" aria-label="Mobile">
      <Link href="/2026" aria-current={current(path, "/2026") ? "page" : undefined}>Home</Link>
      <Link href="/2026/fixtures" aria-current={path.startsWith("/2026/fixtures") ? "page" : undefined}>Fixtures</Link>
      <Link href="/2026/teams" aria-current={path.startsWith("/2026/teams") ? "page" : undefined}>Teams</Link>
      <details>
        <summary>More</summary>
        <div>
          <Link href="/2026/standings">Standings</Link>
          <Link href="/2026/match-day">Match day</Link>
        </div>
      </details>
    </nav>
  );
}

function current(path: string, href: string) {
  if (href === "/2026") return path === "/2026";
  return path === href || path.startsWith(`${href}/`);
}
