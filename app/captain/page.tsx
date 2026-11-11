import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/captain-tools";
import { PublicShell } from "@/components/shell";
import { getActor } from "@/lib/auth";
import { captainDashboard } from "@/lib/captain-actions";
import { getDb } from "@/lib/db";
import { formatInrFromPaise, formatIst } from "@/lib/format";
import { listPublicFixtures } from "@/lib/public-data";
import { registrationPhase, registrationStatusCopy } from "@/lib/season";

export const metadata = { title: "Captain", robots: { index: false, follow: false } };

export default async function CaptainPage() {
  const actor = await getActor();
  if (!actor) redirect("/captain/login?next=/captain");
  const { season, registration, payments } = await captainDashboard(actor);
  const fixtures = registration
    ? (await listPublicFixtures(await getDb())).filter((fixture) => fixture.teamAId === registration.id || fixture.teamBId === registration.id)
    : [];
  const feePaid = payments.some((payment) => payment.status === "verified");
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
            <h2>Entry fee</h2>
            <p>
              {registration.batchLeavingYear != null && registration.batchLeavingYear >= 2021
                ? "No entry fee is due. Batches that passed out in 2021 or later are exempt."
                : season.feePaise == null
                  ? "The entry fee has not been decided yet."
                  : season.feePaise === 0
                    ? "There is no entry fee this edition."
                    : feePaid
                      ? `Paid ✓ (${formatInrFromPaise(season.feePaise)})`
                      : `${formatInrFromPaise(season.feePaise)}, not paid yet. Pay the organizers directly; they mark it here once it is received.`}
            </p>
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
