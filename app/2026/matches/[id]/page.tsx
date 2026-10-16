export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/shell";
import { ShareBar } from "@/components/share-bar";
import { getDb } from "@/lib/db";
import { formatIst } from "@/lib/format";
import { getPublicFixture } from "@/lib/public-data";
import { getActiveSeason } from "@/lib/season";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fixture = await getPublicFixture(await getDb(), id);
  return { title: fixture ? `${fixture.teamALabel} vs ${fixture.teamBLabel}` : "Match" };
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const fixture = await getPublicFixture(db, id);
  if (!fixture) notFound();
  const season = await getActiveSeason(db);
  const sharePath = `/2026/matches/${fixture.id}`;
  return (
    <PublicShell>
      <p className="kicker">Match {fixture.matchNumber ?? ""} · {fixture.stage}</p>
      <h1>{fixture.teamALabel} vs {fixture.teamBLabel}</h1>
      <p>{formatIst(fixture.startsAt)} · {fixture.groundName ?? "Ground to be announced"} · {season.venueName}</p>
      <p>Status: {fixture.status.replaceAll("_", " ")}. Last updated {formatIst(fixture.updatedAt)}.</p>
      {fixture.reportingAt ? <p>Reporting time {formatIst(fixture.reportingAt)}</p> : null}
      {fixture.changeNote ? <p className="note">{fixture.changeNote}</p> : null}
      {fixture.needsResolution ? <p className="alert">This match needs an organizer to confirm the participants after an upstream result changed.</p> : null}
      {fixture.summary ? (
        <section className="section">
          <h2>Organizer summary</h2>
          <p>{fixture.summary}</p>
          <p className="quiet">{fixture.summarySource === "import" ? "Imported by an organizer" : "Entered by an organizer"} · {formatIst(fixture.summaryUpdatedAt)}. This is not a live score.</p>
          {fixture.winnerLabel ? <p>Winner: {fixture.winnerLabel}</p> : null}
        </section>
      ) : <p className="quiet">No result summary has been entered.</p>}
      {fixture.scorecardUrl ? <p><a href={fixture.scorecardUrl}>View scorecard on CricHeroes</a></p> : <p className="quiet">No CricHeroes scorecard link has been added.</p>}
      {fixture.livestreamUrl ? <p><a href={fixture.livestreamUrl}>Livestream</a></p> : null}
      <p><a href={`/api/calendar/${fixture.id}`}>Add to calendar</a></p>
      <ShareBar url={sharePath} text={`NCL 2026: ${fixture.teamALabel} vs ${fixture.teamBLabel}`} />
      <p><Link href="/2026/fixtures">All fixtures</Link></p>
    </PublicShell>
  );
}
