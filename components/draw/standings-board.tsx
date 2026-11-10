"use client";

import { TIE_BREAKERS } from "@/lib/draw/config";
import { formatNrr, type Qualification, type StandingRow } from "@/lib/draw/standings";
import type { GroupCode, PublicTeam } from "@/lib/draw/types";
import { TeamMark } from "./team-mark";

function Row({ row, name, team, badge, mine, onTeam }: { row: StandingRow; name: string; team?: PublicTeam; badge: string | null; mine: boolean; onTeam?: (id: string) => void }) {
  return (
    <tr className={[badge === "Q" ? "dr-row--q" : badge === "WC" ? "dr-row--wc" : "", mine ? "dr-row--mine" : ""].filter(Boolean).join(" ")}>
      <td className="dr-t-rank">{row.rank}</td>
      <td className="dr-t-team">
        <div className="dr-t-cell">
          <TeamMark name={name} logoUrl={team?.logoUrl} size={22} />
          {onTeam ? (
            <button type="button" className="dr-link" onClick={() => onTeam(row.teamId)}>{name}</button>
          ) : (
            <span>{name}</span>
          )}
          {badge ? <i className={`dr-badge dr-badge--${badge.toLowerCase()}`}>{badge === "Q" ? "Qualified" : badge === "WC" ? "Wildcard" : badge}</i> : null}
        </div>
      </td>
      <td>{row.played}</td>
      <td>{row.won}</td>
      <td>{row.lost}</td>
      <td>{row.tied}</td>
      <td>{row.noResult}</td>
      <td className="dr-t-pts">{row.points}</td>
      <td className="dr-t-nrr">{formatNrr(row.nrr)}</td>
    </tr>
  );
}

const HEAD = (
  <thead>
    <tr>
      <th>#</th>
      <th>Team</th>
      <th title="Played">P</th>
      <th title="Won">W</th>
      <th title="Lost">L</th>
      <th title="Tied">T</th>
      <th title="No result">NR</th>
      <th title="Points">Pts</th>
      <th title="Net run rate">NRR</th>
    </tr>
  </thead>
);

/** Group tables and the wildcard table. Everything shown is computed from recorded scores; nothing is guessed. */
export function StandingsBoard({
  qualification,
  names,
  teams,
  highlightTeam,
  onTeam,
}: {
  qualification: Qualification;
  names: Map<string, string>;
  teams: Map<string, PublicTeam>;
  highlightTeam?: string | null;
  onTeam?: (teamId: string) => void;
}) {
  const nameOf = (id: string) => names.get(id) ?? id;
  const started = qualification.leagueMatchesPlayed > 0;
  const status = qualification.status;
  return (
    <div className="dr-standings">
      <p className="dr-st-progress" role="status">
        <b>{qualification.leagueMatchesPlayed}</b> of 27 league results in
        {qualification.leagueComplete ? "" : " · tables are provisional until every group has played all nine matches"}
      </p>

      {qualification.blockers.length > 0 ? (
        <div className="dr-alert" role="alert">
          <b>Organizer action required.</b>
          <ul>
            {qualification.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
          <p>Teams are level on every published tie-breaker. The site does not choose between them; the quarterfinals stay open until the organizers record a decision.</p>
        </div>
      ) : null}

      <div className="dr-st-groups">
        {(["A", "B", "C"] as GroupCode[]).map((group) => {
          const table = qualification.groups[group];
          return (
            <section className="dr-st-card" key={group} aria-label={`Group ${group} standings`}>
              <h4>
                Group {group}
                <span>{qualification.groupComplete[group] ? "Complete" : started ? "In progress" : "Awaiting results"}</span>
              </h4>
              <div className="dr-table-wrap">
                <table>
                  {HEAD}
                  <tbody>
                    {table.rows.map((row) => {
                      const s = status[row.teamId];
                      const badge = s === "qualified" ? "Q" : s === "wildcard" ? "WC" : null;
                      return <Row key={row.teamId} row={row} name={nameOf(row.teamId)} team={teams.get(row.teamId)} badge={badge} mine={highlightTeam === row.teamId} onTeam={onTeam} />;
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      <section className="dr-st-card dr-st-wild" aria-label="Wildcard standings">
        <h4>
          Wildcard race
          <span>Third-placed teams · best 2 qualify</span>
        </h4>
        <div className="dr-table-wrap">
          <table>
            {HEAD}
            <tbody>
              {qualification.wildcards.rows.map((row) => (
                <Row
                  key={row.teamId}
                  row={{ ...row, rank: row.wildcardRank }}
                  name={nameOf(row.teamId)}
                  team={teams.get(row.teamId)}
                  badge={row.status === "wildcard" ? "WC" : null}
                  mine={highlightTeam === row.teamId}
                  onTeam={onTeam}
                />
              ))}
            </tbody>
          </table>
        </div>
        <p className="dr-st-note">
          Ranked by points, then net run rate. {qualification.leagueComplete ? "The top two are the wildcards." : "Shown with each group's current third place; it changes as results come in."}
        </p>
      </section>

      <details className="dr-rules">
        <summary>How these tables are ranked</summary>
        <ol>
          {TIE_BREAKERS.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}
