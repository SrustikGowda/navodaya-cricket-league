"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BackButton } from "./back-button";
import { SignOutButton } from "./sign-out-button";

const LINKS = [
  ["/admin", "Overview"],
  ["/admin/registrations", "Registrations"],
  ["/admin/payments", "Payments"],
  ["/admin/fixtures", "Fixtures"],
  ["/admin/standings", "Standings"],
  ["/admin/content", "Content"],
  ["/admin/settings", "Settings"],
] as const;

export function AdminChrome({ email, children }: { email: string; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [path]);

  return (
    <div className="admin-shell">
      <header className="admin-top">
        <button className="admin-icon admin-menu" type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="admin-nav" onClick={() => setOpen((value) => !value)}>
          {open ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          )}
        </button>
        <strong>NCL 2026</strong>
        <Link className="admin-history" href="/history" aria-current={path.startsWith("/history") ? "page" : undefined}>History</Link>
        <Link className="admin-icon" href="/2026" aria-label="View website">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8" /><path d="M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" /></svg>
        </Link>
        <details key={path} className="admin-account">
          <summary className="admin-icon" aria-label="Account">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19.2a6.5 6.5 0 0 1 13 0" /></svg>
          </summary>
          <div id="admin-account-menu">
            <p>{email}</p>
            <SignOutButton />
          </div>
        </details>
      </header>
      <div className="admin-body">
        <aside className={open ? "admin-side open" : "admin-side"}>
          <nav id="admin-nav" aria-label="Admin">
            {LINKS.map(([href, label]) => {
              const active = href === "/admin" ? path === "/admin" : path.startsWith(href);
              return (
                <Link key={href} href={href} aria-current={active ? "page" : undefined}>
                  {label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className="admin-main">{path === "/admin" ? null : <BackButton />}{children}</div>
      </div>
    </div>
  );
}
