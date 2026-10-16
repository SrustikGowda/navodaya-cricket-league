export const dynamic = "force-dynamic";

import Link from "next/link";
import { PublicShell } from "@/components/shell";
import { getDb } from "@/lib/db";
import { listPublicTeams } from "@/lib/public-data";

export const metadata = { title: "Registered teams" };

export default async function TeamsPage() {
  const teams = await listPublicTeams(await getDb());
  return (
    <PublicShell>
      <p className="kicker">2026</p>
      <h1>Registered teams</h1>
      {teams.length === 0 ? <p>Approved teams will appear here. Applications that are still in review stay private.</p> : (
        <div className="team-list">
          {teams.map((team) => (
            <Link key={team.id} className="identity" href={`/2026/teams/${team.slug}`}>
              <strong>{team.teamName}</strong>
              <span>{team.batchAdmissionYear}–{team.batchLeavingYear}</span>
            </Link>
          ))}
        </div>
      )}
    </PublicShell>
  );
}
