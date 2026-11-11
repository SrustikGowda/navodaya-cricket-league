export const dynamic = "force-dynamic";

import Link from "next/link";
import { PublicShell } from "@/components/shell";
import { getDb } from "@/lib/db";
import { formatIndianMobile } from "@/lib/format";
import { FeeBadge } from "@/components/fee-badge";
import { listPublicTeams } from "@/lib/public-data";

export const metadata = { title: "Registered teams" };

type Team = Awaited<ReturnType<typeof listPublicTeams>>[number];

export default async function TeamsPage() {
  const teams = await listPublicTeams(await getDb());
  const eras = groupByEra(teams);
  return (
    <PublicShell>
      <div className="teams-page">
        <p className="kicker">2026</p>
        <h1>Registered teams</h1>
        {teams.length === 0 ? (
          <p className="teams-lead">Approved teams will appear here. Applications that are still in review stay private.</p>
        ) : (
          <>
            <p className="teams-lead">{leadLine(teams)}</p>
            {eras.length > 1 ? (
              <nav className="tm-jump" aria-label="Jump to a decade">
                {eras.map((era) => (
                  <a key={era.id} href={`#${era.id}`} aria-label={`${era.short}, ${era.teams.length === 1 ? "1 team" : `${era.teams.length} teams`}`}>
                    {era.short}
                    <span aria-hidden="true">{era.teams.length}</span>
                  </a>
                ))}
              </nav>
            ) : null}
            {eras.map((era) => (
              <section key={era.id} id={era.id} className="tm-era" aria-labelledby={`${era.id}-title`}>
                <div className="tm-era-head">
                  <h2 id={`${era.id}-title`}>{era.title}</h2>
                  <span>{era.teams.length === 1 ? "1 team" : `${era.teams.length} teams`}</span>
                </div>
                <ul className="tm-grid">
                  {era.teams.map((team) => (
                    <li key={team.id}>
                      <Link className="tm-card" href={`/2026/teams/${team.slug}`}>
                        <span className="tm-top">
                          <span className="tm-batch">{batchLabel(team)}</span>
                          <FeeBadge status={team.feeStatus} />
                          <span className="tm-arrow" aria-hidden="true">→</span>
                        </span>
                        <span className="tm-identity">
                          <span className="tm-mono" aria-hidden="true">{monogram(team.teamName)}</span>
                          <strong>{team.teamName}</strong>
                        </span>
                        <Officers team={team} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </PublicShell>
  );
}

function Officers({ team }: { team: Team }) {
  const captain = officerLine(team.captainName, team.captainPhone);
  const vice = officerLine(team.viceCaptainName, team.viceCaptainPhone);
  if (!captain && !vice) return null;
  return (
    <span className="tm-officers">
      {captain ? (
        <span className="tm-officer">
          <span className="tm-role">Captain</span>
          <span>{captain}</span>
        </span>
      ) : null}
      {vice ? (
        <span className="tm-officer">
          <span className="tm-role">Vice-captain</span>
          <span>{vice}</span>
        </span>
      ) : null}
    </span>
  );
}

function officerLine(name: string | null, phone: string | null) {
  const parts = [name?.trim(), formatIndianMobile(phone)].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function batchLabel(team: Team) {
  if (team.batchAdmissionYear == null || team.batchLeavingYear == null) return "Batch not listed";
  return `Batch ${team.batchAdmissionYear}–${team.batchLeavingYear}`;
}

function leadLine(teams: Team[]) {
  const count = teams.length === 1 ? "1 approved team" : `${teams.length} approved teams`;
  const admissions = teams.map((team) => team.batchAdmissionYear).filter((year): year is number => year != null);
  const leavings = teams.map((team) => team.batchLeavingYear).filter((year): year is number => year != null);
  if (admissions.length === 0 || leavings.length === 0) return count;
  const span = `batches from ${Math.min(...admissions)} to ${Math.max(...leavings)}`;
  return teams.length === 1 ? `${count} · ${span}` : `${count} · ${span}, oldest first`;
}

// The list arrives sorted oldest batch first, so teams from one decade of admission sit side by side.
function groupByEra(teams: Team[]) {
  const eras: { id: string; short: string; title: string; teams: Team[] }[] = [];
  for (const team of teams) {
    const decade = team.batchAdmissionYear != null ? Math.floor(team.batchAdmissionYear / 10) * 10 : null;
    const id = decade != null ? `era-${decade}s` : "era-unlisted";
    let era = eras.at(-1);
    if (!era || era.id !== id) {
      era = {
        id,
        short: decade != null ? `${decade}s` : "Not listed",
        title: decade != null ? `Joined in the ${decade}s` : "Batch not listed",
        teams: [],
      };
      eras.push(era);
    }
    era.teams.push(team);
  }
  return eras;
}

function monogram(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "N";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}
