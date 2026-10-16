import { FixtureDesk } from "@/components/fixture-desk";
import { adminSnapshot } from "@/lib/admin-actions";
import { getActor } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatIst } from "@/lib/format";
import { getActiveSeason } from "@/lib/season";

export default async function FixturesAdminPage() {
  const actor = await getActor();
  if (!actor || actor.role !== "organizer") return null;
  const { fixtures, published, grounds, versions, registrations } = await adminSnapshot(actor);
  const db = await getDb();
  const season = await getActiveSeason(db);
  const groups = await db.query<{ id: string; name: string }>("select id, name from groups where season_id = $1 order by name", [season.id]);
  const teams = registrations.filter((registration) => registration.status === "approved").map((team) => ({ id: team.id, name: team.teamName }));
  return (
    <>
      <FixtureDesk
        grounds={grounds.map((ground) => ({ id: ground.id, name: ground.name }))}
        groups={groups.map((group) => ({ id: group.id, name: group.name }))}
        teams={teams}
        matches={fixtures.map((fixture) => ({
          id: fixture.id,
          number: fixture.matchNumber == null ? "—" : String(fixture.matchNumber),
          teams: `${fixture.teamALabel} vs ${fixture.teamBLabel}`,
          when: formatIst(fixture.startsAt),
          status: fixture.status,
          version: fixture.version,
          needsResolution: fixture.needsResolution,
        }))}
        versions={versions.map((version) => ({ id: String(version.id), status: String(version.status), note: String(version.note ?? "") }))}
      />
      <h2>Published matches</h2>
      {published.length === 0 ? <p>No published schedule.</p> : published.map((fixture) => (
        <p key={fixture.id}>#{fixture.matchNumber} {fixture.teamALabel} vs {fixture.teamBLabel} · {formatIst(fixture.startsAt)}</p>
      ))}
    </>
  );
}
