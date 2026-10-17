import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton, PaymentBox } from "@/components/captain-tools";
import { PublicShell } from "@/components/shell";
import { getActor } from "@/lib/auth";
import { captainDashboard } from "@/lib/captain-actions";
import { getDb } from "@/lib/db";
import { formatInrFromPaise, formatIst } from "@/lib/format";
import { listPublicFixtures } from "@/lib/public-data";
import { registrationPhase, registrationStatusCopy } from "@/lib/season";
import QRCode from "qrcode";

export const metadata = { title: "Captain", robots: { index: false, follow: false } };

export default async function CaptainPage() {
  const actor = await getActor();
  if (!actor) redirect("/captain/login?next=/captain");
  const { season, registration, payments, instructions } = await captainDashboard(actor);
  const fixtures = registration
    ? (await listPublicFixtures(await getDb())).filter((fixture) => fixture.teamAId === registration.id || fixture.teamBId === registration.id)
    : [];
  const qr = instructions ? await QRCode.toDataURL(instructions.link, { margin: 1, width: 280 }) : null;
  const latest = payments[0];
  return (
    <PublicShell>
      <p className="kicker">Captain desk</p>
      <h1>{actor.displayName || actor.email}</h1>
      <LogoutButton />
      {!registration ? (
        <p>{registrationStatusCopy(registrationPhase(season))} <Link href="/2026/register">Open registration</Link></p>
      ) : (
        <div className="stack">
          <p className="pill">{registration.status.replaceAll("_", " ")}</p>
          {registration.reference ? <p>Reference {registration.reference}</p> : <p className="quiet">No reference yet. It appears only after a successful submit.</p>}
          {registration.reviewReason ? <p className="note">Organizer note: {registration.reviewReason}</p> : null}
          {registration.nameReviewRequired ? <p className="note">A player name matches another application. An organizer will review it. The application was not rejected for the name alone.</p> : null}
          <ul>
            <li>{registration.teamName ? "Team details saved" : "Team details still needed"}</li>
            <li>{registration.captainPhone ? "Mobile number saved" : "Mobile number still needed"}</li>
            <li>{registration.players.filter((player) => player.publicState !== "pending_remove").length} players in the working squad</li>
            <li>{registration.publicationConsent ? "Publication consent recorded" : "Publication consent still needed"}</li>
          </ul>
          <p><Link href={`/captain/card?id=${registration.id}`}>Registration card</Link></p>
          <section className="section">
            <h2>Payment</h2>
            {registration.batchLeavingYear != null && registration.batchLeavingYear >= 2021 ? <p>No entry fee is due. Batches that passed out in 2021 or later are exempt.</p> : null}
            {season.feePaise == null ? <p>The fee has not been decided. No payment is being collected.</p> : null}
            {season.feePaise === 0 ? <p>The organizer set this edition as free.</p> : null}
            {latest ? <p>Latest payment state: {latest.status.replaceAll("_", " ")}{latest.rejectionReason ? ` · ${latest.rejectionReason}` : ""}</p> : null}
            {instructions && qr ? (
              <div className="stack">
                <p>Pay {formatInrFromPaise(instructions.amountPaise)} to {instructions.payeeName} · {instructions.upiVpa}</p>
                <p>Use the note {instructions.note}. Then submit the transaction reference.</p>
                <img src={qr} alt="" width={220} height={220} />
                <p><a href={instructions.link}>Open UPI app</a></p>
                <PaymentBox registrationId={registration.id} note={instructions.note} />
              </div>
            ) : season.feePaise && season.feePaise > 0 && (registration.batchLeavingYear == null || registration.batchLeavingYear < 2021) ? <p>Payment instructions appear after approval, and only when the payee and UPI ID are configured.</p> : null}
            <ul>
              {payments.map((payment) => (
                <li key={payment.id}>{payment.status} · {payment.transactionReference ?? "no reference"} {payment.receiptPath ? <a href={`/api/receipts/${payment.id}`}>Receipt</a> : null}</li>
              ))}
            </ul>
          </section>
          <section className="section">
            <h2>Fixtures</h2>
            {fixtures.length === 0 ? <p className="quiet">No published fixture for this team yet.</p> : fixtures.map((fixture) => (
              <p key={fixture.id}><Link href={`/2026/matches/${fixture.id}`}>{fixture.teamALabel} vs {fixture.teamBLabel}</Link> · {formatIst(fixture.startsAt)} · {fixture.groundName ?? "Ground to be announced"}{fixture.reportingAt ? ` · report ${formatIst(fixture.reportingAt)}` : ""}</p>
            ))}
          </section>
        </div>
      )}
      {actor.role === "organizer" ? <p><Link href="/admin">Organizer desk</Link></p> : null}
    </PublicShell>
  );
}
