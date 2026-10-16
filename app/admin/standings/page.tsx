import { getActor } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatIst } from "@/lib/format";
import { getPublishedStandings } from "@/lib/standings";

export default async function StandingsAdminPage() {
  const actor = await getActor();
  if (!actor || actor.role !== "organizer") return null;
  const table = await getPublishedStandings(await getDb());
  return (
    <div className="stack">
      <h1>Standings</h1>
      {table.rows.length === 0 ? <p>No standings have been published.</p> : null}
      {table.publishedAt ? <p className="quiet">Published {formatIst(table.publishedAt)}{table.source ? ` · ${table.source}` : ""}.</p> : null}
      {table.rows.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Team</th><th>P</th><th>W</th><th>L</th><th>Pts</th></tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row.teamLabel}><td>{row.teamLabel}</td><td>{row.played}</td><td>{row.won}</td><td>{row.lost}</td><td>{row.points}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
