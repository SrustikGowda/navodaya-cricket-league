export const dynamic = "force-dynamic";

import Link from "next/link";
import "@/components/draw/draw.css";
import { StandingsPanel } from "@/components/draw/standings-panel";
import { PublicShell } from "@/components/shell";
import { getDb } from "@/lib/db";
import { loadBoard } from "@/lib/draw/board";
import { getPublishedStandings } from "@/lib/standings";

export const metadata = { title: "Standings" };

export default async function StandingsPage() {
  const db = await getDb();
  const table = await getPublishedStandings(db);
  const board = await loadBoard(db);
  return (
    <PublicShell>
      <p className="kicker">2026</p>
      <h1>Standings</h1>
      {board.official && board.qualification ? (
        <div className="dr-page dr-page--flush">
          <p className="quiet">
            Group tables and the wildcard race, worked out from the match scores the organizers enter. <Link href="/2026/fixtures#schedule">All fixtures and the bracket</Link>
          </p>
          <StandingsPanel qualification={board.qualification} roster={board.official.plan.roster} teams={board.teams} />
        </div>
      ) : null}
      {table.needsReview ? <p className="alert">These standings need review after a result correction. They were not recalculated automatically.</p> : null}
      {board.official && table.rows.length === 0 ? null : table.rows.length === 0 ? <p>Awaiting results.</p> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Rank</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>T</th><th>NR</th><th>Pts</th><th>NRR</th></tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row.teamLabel}>
                  <td>{row.rank ?? "—"}</td>
                  <td>{row.teamLabel}</td>
                  <td>{row.played}</td>
                  <td>{row.won}</td>
                  <td>{row.lost}</td>
                  <td>{row.tied}</td>
                  <td>{row.noResult}</td>
                  <td>{row.points}</td>
                  <td>{row.nrr ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {table.source ? <p className="quiet">Source: {table.source}. Net run rate is shown only when organizers supply it.</p> : null}
    </PublicShell>
  );
}
