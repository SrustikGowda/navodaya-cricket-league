export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/shell";
import { RememberTeam } from "@/components/my-team";
import { ShareBar } from "@/components/share-bar";
import { getDb } from "@/lib/db";
import { formatIst } from "@/lib/format";
import { getPublicTeam } from "@/lib/public-data";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = await getPublicTeam(await getDb(), slug);
  return { title: team?.teamName ?? "Team" };
}

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = await getPublicTeam(await getDb(), slug);
  if (!team) notFound();
  const logo = team.logoPath?.split(":").at(-1);
  return (
    <PublicShell>
      <p className="kicker">Batch {team.batchAdmissionYear}–{team.batchLeavingYear}</p>
      <h1>{team.teamName}</h1>
      {logo ? <img src={`/api/media/${logo}`} alt="" /> : null}
      <RememberTeam id={team.id} name={team.teamName} />
      <ShareBar url={`/2026/teams/${team.slug}`} text={`NCL 2026 · ${team.teamName}`} />
      <section className="section">
        <h2>Squad</h2>
        {team.squad.length === 0 ? <p className="quiet">Public squad names have not been released.</p> : (
          <ul>{team.squad.map((player) => <li key={`${player.name}-${player.role}`}>{player.name} · {player.role.replaceAll("_", " ")}{player.jerseyNumber != null ? ` · ${player.jerseyNumber}` : ""}</li>)}</ul>
        )}
      </section>
      <section className="section">
        <h2>Matches</h2>
        {team.fixtures.length === 0 ? <p className="quiet">No published matches yet.</p> : team.fixtures.map((fixture) => (
          <p key={fixture.id} className="fixture">
            <b><Link href={`/2026/matches/${fixture.id}`}>{fixture.teamALabel} vs {fixture.teamBLabel}</Link></b>
            <span>{formatIst(fixture.startsAt)} · {fixture.status.replaceAll("_", " ")}</span>
            {fixture.scorecardUrl ? <a href={fixture.scorecardUrl}>View scorecard on CricHeroes</a> : null}
          </p>
        ))}
      </section>
    </PublicShell>
  );
}
