import Image from "next/image";
import Link from "next/link";
import { getActor } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { demoAllowed } from "@/lib/integrations";
import { toPublicSeason } from "@/lib/season";
import { getActiveSeason } from "@/lib/season";
import { PwaRegister } from "./pwa-register";
import { SignOutButton } from "./sign-out-button";
import { BackButton } from "./back-button";
import { DesktopNav, HeaderHistory, MobileNav } from "./site-nav";

export async function PublicShell({
  children,
  home = false,
  registration = false,
  history = false,
}: {
  children: React.ReactNode;
  home?: boolean;
  registration?: boolean;
  history?: boolean;
}) {
  const season = toPublicSeason(await getActiveSeason(await getDb()));
  const actor = await getActor();
  const organizer = actor?.role === "organizer";
  const registrationOpen = season.registrationPhase === "open";
  const registerLabel = registrationOpen ? "Register a team" : season.registrationPhase === "closed" ? "Registration is closed" : "Registration opens soon";
  const mobileRegisterLabel = registrationOpen ? "Register" : registerLabel;
  return (
    <div className={home ? "home-page" : history ? "history-shell" : registration ? "register-shell" : undefined}>
      {demoAllowed() ? <p className="note">Demo mode is on. Fixtures marked DEMO are fictional and are not 2026 registrations.</p> : null}
      <header className={home || history ? "site-header home-header" : "site-header"}>
        <Link href="/2026" className="brand">
          <span className="logo-plate">
            <Image src="/brand/jnv-logo.png" alt="Jawahar Navodaya Vidyalaya emblem" width={48} height={62} priority />
          </span>
          <span>
            <strong>NCL</strong>
            <span>JNVCKM Alumni</span>
          </span>
        </Link>
        <DesktopNav />
        <HeaderHistory />
        {home || registration || history ? null : (
          <Link href="/2026/register" className="button header-cta nav-register">{registerLabel}</Link>
        )}
        {home || registration || history ? null : (
          <Link href="/2026/register" className="button header-cta mobile-cta">{mobileRegisterLabel}</Link>
        )}
      </header>
      <div className={[home ? "home-main" : "", registration ? "register-main" : "", "main-wrap"].filter(Boolean).join(" ")}>
        <main id="content">{home || registration ? null : <BackButton />}{children}</main>
      </div>
      <footer className={registration ? "site-footer register-footer" : home ? "site-footer home-footer" : "site-footer"}>
        {home ? null : <p>NCL {season.year}</p>}
        <nav aria-label="Footer">
          <Link href="/2026/rules">Rules</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/history">History</Link>
          {organizer ? <Link href="/admin">Admin Dashboard</Link> : <Link className="footer-quiet" href="/admin/login">Organizer Login</Link>}
          {organizer ? <SignOutButton className="footer-quiet footer-signout" /> : null}
        </nav>
      </footer>
      {registration ? null : <MobileNav />}
      <PwaRegister />
    </div>
  );
}
