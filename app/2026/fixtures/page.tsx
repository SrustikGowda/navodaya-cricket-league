export const dynamic = "force-dynamic";

import Link from "next/link";
import { PublicShell } from "@/components/shell";
import { ScheduleWatch } from "@/components/schedule-watch";
import { ShareBar } from "@/components/share-bar";
import { getDb } from "@/lib/db";
import { formatIst } from "@/lib/format";
import { listPublicFixtures, scheduleMeta } from "@/lib/public-data";
import { getActiveSeason } from "@/lib/season";

export const metadata = { title: "Fixtures" };

export default async function FixturesPage({ searchParams }: { searchParams: Promise<{ day?: string; team?: string; stage?: string; ground?: string }> }) {
  const filters = await searchParams;
  const db = await getDb();
  const season = await getActiveSeason(db);
  const fixtures = await listPublicFixtures(db, filters);
  const meta = await scheduleMeta(db);
  const grounds = [...new Set(fixtures.map((fixture) => fixture.groundName).filter(Boolean))] as string[];
  return (
    <PublicShell>
      <p className="kicker">2026</p>
      <h1>Fixtures</h1>
      <ScheduleWatch sequence={meta.sequence} updatedAt={meta.updatedAt} />
      <form className="stack" method="get">
        <label className="field">Day<input className="text-input" name="day" placeholder="2026-11-28" defaultValue={filters.day} /></label>
        <label className="field">Team<input className="text-input" name="team" defaultValue={filters.team} /></label>
        <label className="field">Stage<input className="text-input" name="stage" defaultValue={filters.stage} /></label>
        <label className="field">Ground<input className="text-input" name="ground" defaultValue={filters.ground} /></label>
        <button className="button" type="submit">Filter</button>
      </form>
      {fixtures.length === 0 ? (
        <p>{season.fixturesOn ? `Who plays whom will be published on ${formatIst(`${season.fixturesOn}T00:00:00+05:30`, false)}.` : "The 2026 schedule has not been published."}</p>
      ) : null}
      <div className="schedule-list fixture-list">
        {fixtures.map((fixture) => <FixtureRow key={fixture.id} fixture={fixture} />)}
      </div>
      <div className="schedule-grid">
        {grounds.map((ground) => (
          <section key={ground}>
            <h2>{ground}</h2>
            {fixtures.filter((fixture) => fixture.groundName === ground).map((fixture) => <FixtureRow key={fixture.id} fixture={fixture} />)}
          </section>
        ))}
      </div>
      {meta.count > 0 ? <ShareBar url="/2026/fixtures" text="NCL 2026 fixtures" /> : null}
    </PublicShell>
  );
}

function FixtureRow({ fixture }: { fixture: Awaited<ReturnType<typeof listPublicFixtures>>[number] }) {
  return (
    <article className="fixture">
      <b><Link href={`/2026/matches/${fixture.id}`}>{fixture.teamALabel} vs {fixture.teamBLabel}</Link></b>
      <span>{fixture.matchNumber ? `Match ${fixture.matchNumber} · ` : ""}{fixture.stage} · {formatIst(fixture.startsAt)}</span>
      <span>{fixture.groundName ?? "Ground to be announced"} · {fixture.status.replaceAll("_", " ")}{fixture.overs ? ` · ${fixture.overs} overs` : ""}</span>
      {fixture.reportingAt ? <span>Report by {formatIst(fixture.reportingAt)}</span> : null}
      {fixture.changeNote ? <span>Update: {fixture.changeNote}</span> : null}
    </article>
  );
}
