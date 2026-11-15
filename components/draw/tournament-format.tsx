import { GROUP_TEAMS, LEAGUE_MATCHES_BY_GROUP, TEAM_COUNT } from "@/lib/draw/config";

function Trophy() {
  return (
    <svg className="tf-trophy" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M14 6h20v10a10 10 0 0 1-20 0V6Z" />
      <path d="M14 10H7v3a7 7 0 0 0 7 7M34 10h7v3a7 7 0 0 1-7 7" />
      <path d="M24 26v8M17 42h14M20 34h8v8h-8z" />
    </svg>
  );
}

function Arrow({ index }: { index: number }) {
  return (
    <span className="tf-arrow" style={{ ["--i" as string]: index }} aria-hidden="true">
      <i />
    </span>
  );
}

/**
 * The 2026 format at a glance, as real markup rather than a picture: 19 teams, two groups, the top four of each into
 * a knockout of eight. Reads left to right on wide screens and top to bottom on phones.
 */
export function TournamentFormat({ compact = false }: { compact?: boolean }) {
  return (
    <figure className={compact ? "tf tf--compact" : "tf"} aria-label="Tournament format: 19 teams in two groups, the top four of each group reach the quarterfinals, then semifinals and the final">
      <div className="tf-flow">
        <div className="tf-node tf-node--teams" style={{ ["--i" as string]: 0 }}>
          <b>{TEAM_COUNT}</b>
          <span>teams</span>
        </div>
        <Arrow index={1} />
        <div className="tf-groups">
          <div className="tf-node tf-node--group" style={{ ["--i" as string]: 2 }}>
            <h3>Group A</h3>
            <p>
              <b>{GROUP_TEAMS.A}</b> teams <em>+ 1 BYE</em>
            </p>
            <small>{LEAGUE_MATCHES_BY_GROUP.A} matches</small>
          </div>
          <div className="tf-node tf-node--group" style={{ ["--i" as string]: 3 }}>
            <h3>Group B</h3>
            <p>
              <b>{GROUP_TEAMS.B}</b> teams
            </p>
            <small>{LEAGUE_MATCHES_BY_GROUP.B} matches</small>
          </div>
        </div>
        <Arrow index={4} />
        <div className="tf-node tf-node--step" style={{ ["--i" as string]: 5 }}>
          <b>8</b>
          <span>qualifiers</span>
          <small>Top 4 of each group</small>
        </div>
        <Arrow index={6} />
        <div className="tf-node tf-node--step" style={{ ["--i" as string]: 7 }}>
          <b>4</b>
          <span>quarterfinals</span>
        </div>
        <Arrow index={8} />
        <div className="tf-node tf-node--step" style={{ ["--i" as string]: 9 }}>
          <b>2</b>
          <span>semifinals</span>
        </div>
        <Arrow index={10} />
        <div className="tf-node tf-node--final" style={{ ["--i" as string]: 11 }}>
          <Trophy />
          <span>Final</span>
        </div>
      </div>
      <figcaption>Every team plays 3 league fixtures, with at least one on each ground. Group A has one BYE, a walkover worth 2 points.</figcaption>
    </figure>
  );
}
