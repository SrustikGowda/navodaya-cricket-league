export const revalidate = 3600;

import { PublicShell } from "@/components/shell";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <PublicShell>
      <p className="kicker">Privacy</p>
      <h1>What this site shows</h1>
      <div className="section stack">
        <p>Spectators can read the public season, approved teams, published fixtures, published standings and consented photographs without an account.</p>
        <p>After a team is approved, its name, batch years and logo can be public. Player names, roles and jersey numbers are public only when the captain has given publication consent and an organizer has accepted the squad.</p>
        <p>Captain phone numbers, email addresses, vice-captain contacts, payment references, receipts and the audit log are not public. They are not placed on share cards.</p>
        <p>Receipts stay in private storage. A payment screenshot is not treated as proof that money arrived.</p>
        <p>The optional “my team” choice is stored in this browser only. It is not an account.</p>
        <p>No Aadhaar, PAN or other identity document is requested.</p>
      </div>
    </PublicShell>
  );
}
