export const dynamic = "force-dynamic";

import Link from "next/link";
import { DrawStudio } from "@/components/draw/draw-studio";
import { FormatImage } from "@/components/draw/format-image";
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
  description: "NCL 2026 fixtures: the live group draw, the Saturday and Sunday schedule, the knockout bracket and standings.",
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
          <p className="kicker">NCL 2026 · 28–29 November</p>
          <h1>Fixtures</h1>
        </header>

        <DrawStudio
          initialBoard={board}
          isOrganizer={isOrganizer}
          passwordConfigured={drawPasswordConfigured()}
          readiness={{ ready: readiness.ready, message: readiness.message }}
          initial={{ tab: params.tab, team: params.team, day: params.day, stage: params.stage, ground: params.ground, group: params.group }}
          about={<FormatImage />}
        >
          {manual.length > 0 ? (
            <div className="dr-manual">
              <p>These fixtures were published by the organizers directly.</p>
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
            <p>
              {season.fixturesOn
                ? `Who plays whom will be published on ${formatIst(`${season.fixturesOn}T00:00:00+05:30`, false)}, when the groups are drawn live.`
                : "The 2026 schedule has not been published."}{" "}
              It appears here for everyone the moment the official draw is run.
            </p>
          )}
        </DrawStudio>
      </div>
    </PublicShell>
  );
}
