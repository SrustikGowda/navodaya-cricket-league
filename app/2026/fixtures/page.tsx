export const dynamic = "force-dynamic";

import Link from "next/link";
import { DrawStudio } from "@/components/draw/draw-studio";
import { FormatDiagram } from "@/components/draw/format-diagram";
import "@/components/draw/draw.css";
import { PublicShell } from "@/components/shell";
import { getActor } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadBoard } from "@/lib/draw/board";
import { drawPasswordConfigured, drawReadiness } from "@/lib/draw/service";
import { formatIst } from "@/lib/format";
import { listPublicFixtures } from "@/lib/public-data";
import { getActiveSeason } from "@/lib/season";

export const metadata = {
  title: "Fixtures",
  description: "NCL 2026 tournament format, the live group draw, the full Saturday and Sunday schedule, bracket and standings.",
};

type Search = { day?: string; team?: string; stage?: string; ground?: string; tab?: string; group?: string };

export default async function FixturesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const db = await getDb();
  const season = await getActiveSeason(db);
  const [board, actor, readiness] = await Promise.all([loadBoard(db), getActor(), drawReadiness(db)]);
  const isOrganizer = actor?.role === "organizer";
  // A schedule published by hand (not from the draw) keeps working exactly as before.
  const manual = board.official ? [] : await listPublicFixtures(db, { day: params.day, team: params.team, stage: params.stage, ground: params.ground });

  return (
    <PublicShell>
      <div className="dr-page">
        <header className="dr-hero">
          <div>
            <p className="kicker">2026</p>
            <h1>Fixtures</h1>
            <p className="dr-hero-sub">Format, live draw, schedule and bracket for NCL 2026.</p>
          </div>
          {board.official ? (
            <a className="dr-hero-chip" href="#schedule">
              <i aria-hidden="true" /> Official draw published · see the fixtures
            </a>
          ) : null}
        </header>
        <nav className="dr-jump" aria-label="On this page">
          <a href="#format">Format</a>
          <a href="#draw">Live draw</a>
          <a href="#schedule">Fixtures</a>
        </nav>

        <FormatDiagram />

        <DrawStudio
          initialBoard={board}
          isOrganizer={isOrganizer}
          passwordConfigured={drawPasswordConfigured()}
          readiness={{ ready: readiness.ready, message: readiness.message }}
          initial={{ tab: params.tab, team: params.team, day: params.day, stage: params.stage, ground: params.ground, group: params.group }}
        >
          {manual.length > 0 ? (
            <div className="dr-manual">
              <p className="dr-note">These fixtures were published by the organizers directly.</p>
              <div className="schedule-list fixture-list" style={{ display: "grid" }}>
                {manual.map((fixture) => (
                  <article className="fixture" key={fixture.id}>
                    <b>
                      <Link href={`/2026/matches/${fixture.id}`}>
                        {fixture.teamALabel} vs {fixture.teamBLabel}
                      </Link>
                    </b>
                    <span>
                      {fixture.matchNumber ? `Match ${fixture.matchNumber} · ` : ""}
                      {fixture.stage} · {formatIst(fixture.startsAt)}
                    </span>
                    <span>
                      {fixture.groundName ?? "Ground to be announced"} · {fixture.status.replaceAll("_", " ")}
                      {fixture.overs ? ` · ${fixture.overs} overs` : ""}
                    </span>
                    {fixture.changeNote ? <span>Update: {fixture.changeNote}</span> : null}
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="dr-pending">
              <p>
                {season.fixturesOn
                  ? `Who plays whom will be published on ${formatIst(`${season.fixturesOn}T00:00:00+05:30`, false)}, when the groups are drawn live.`
                  : "The 2026 schedule has not been published."}
              </p>
              <p>Groups and the full Saturday–Sunday schedule appear here for everyone at the same moment the official draw is run.</p>
            </div>
          )}
        </DrawStudio>
      </div>
    </PublicShell>
  );
}
