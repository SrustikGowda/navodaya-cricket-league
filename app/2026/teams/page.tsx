export const dynamic = "force-dynamic";

import Link from "next/link";
import { PublicShell } from "@/components/shell";
import { getDb } from "@/lib/db";
import { contactLine } from "@/lib/format";
import { listPublicTeams } from "@/lib/public-data";

export const metadata = { title: "Registered teams" };

export default async function TeamsPage() {
  const teams = await listPublicTeams(await getDb());
  return (
    <PublicShell>
      <div className="teams-page">
        <p className="kicker">2026</p>
        <h1>Registered teams</h1>
        {teams.length === 0 ? (
          <p className="teams-lead">Approved teams will appear here. Applications that are still in review stay private.</p>
        ) : (
          <>
            <p className="teams-lead">{teams.length === 1 ? "1 approved team" : `${teams.length} approved teams`}</p>
            <ul className="teams-list">
              {teams.map((team) => (
                <li key={team.id}>
                  <Link className="bc-team" href={`/2026/teams/${team.slug}`}>
                    <span className="bc-mono" aria-hidden="true">{monogram(team.teamName)}</span>
                    <span className="bc-team-copy">
                      <strong>{team.teamName}</strong>
                      {team.batchAdmissionYear != null && team.batchLeavingYear != null ? (
                        <span>Batch {team.batchAdmissionYear}–{team.batchLeavingYear}</span>
                      ) : null}
                      <Officers captainName={team.captainName} captainPhone={team.captainPhone} viceCaptainName={team.viceCaptainName} viceCaptainPhone={team.viceCaptainPhone} />
                    </span>
                    <span className="bc-arrow" aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </PublicShell>
  );
}

function Officers({ captainName, captainPhone, viceCaptainName, viceCaptainPhone }: { captainName: string | null; captainPhone: string | null; viceCaptainName: string | null; viceCaptainPhone: string | null }) {
  const captain = contactLine("Captain", captainName, captainPhone);
  const vice = contactLine("Vice-captain", viceCaptainName, viceCaptainPhone);
  if (!captain && !vice) return null;
  return (
    <>
      {captain ? <span className="bc-officer">{captain}</span> : null}
      {vice ? <span className="bc-officer">{vice}</span> : null}
    </>
  );
}

function monogram(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "N";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}
