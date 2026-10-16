export const revalidate = 30;

import { PublicShell } from "@/components/shell";
import { getDb } from "@/lib/db";
import { getPublishedStandings } from "@/lib/standings";

export const metadata = { title: "Standings" };

export default async function StandingsPage() {
  const table = await getPublishedStandings(await getDb());
  return (
    <PublicShell>
      <p className="kicker">2026</p>
      <h1>Standings</h1>
      {table.needsReview ? <p className="alert">These standings need review after a result correction. They were not recalculated automatically.</p> : null}
      {table.rows.length === 0 ? <p>Awaiting results.</p> : (
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
