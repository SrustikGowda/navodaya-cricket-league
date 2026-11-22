"use client";

import { QUALIFICATION_RULES, TIE_BREAKERS } from "@/lib/draw/config";
import { formatNrr, type Qualification, type StandingRow } from "@/lib/draw/standings";
import type { GroupCode, PublicTeam } from "@/lib/draw/types";
import { TeamMark } from "./team-mark";

function Row({ row, name, team, badge, mine, onTeam }: { row: StandingRow; name: string; team?: PublicTeam; badge: string | null; mine: boolean; onTeam?: (id: string) => void }) {
  return (
    <tr className={[badge === "Q" ? "dr-row--q" : "", mine ? "dr-row--mine" : ""].filter(Boolean).join(" ")}>
      <td className="dr-t-rank">{row.rank}</td>
      <td className="dr-t-team">
        <div className="dr-t-cell">
          <TeamMark name={name} logoUrl={team?.logoUrl} size={22} />
          {onTeam ? (
            <button type="button" className="dr-link" onClick={() => onTeam(row.teamId)}>{name}</button>
          ) : (
            <span>{name}</span>
          )}
          {row.byes > 0 ? <i className="dr-badge dr-badge--bye" title="A BYE walkover: 2 points, not a match">BYE +2</i> : null}
          {badge ? <i className={`dr-badge dr-badge--${badge.toLowerCase()}`}>{badge === "Q" ? "Qualified" : badge}</i> : null}
        </div>
      </td>
      <td>{row.played}</td>
      <td>{row.won}</td>
      <td>{row.lost}</td>
      <td>{row.tied + row.noResult}</td>
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
      <th title="Tied or no result">T/NR</th>
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
  confirmedAt = null,
}: {
  confirmedAt?: string | null;
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
        <b>{qualification.leagueMatchesPlayed}</b> of {qualification.leagueMatchesTotal} league results in
        {qualification.leagueComplete ? (confirmedAt ? " · standings confirmed by the organizers" : " · waiting for the organizers to confirm the standings") : " · tables are provisional until both groups have played all their matches"}
      </p>

      {qualification.blockers.length > 0 ? (
        <div className="dr-alert" role="alert">
          <b>Organizer action required.</b>
          <ul>
            {qualification.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
          <p>Teams are level on points and net run rate. A Super Over decides; the quarterfinals stay open until the organizers record its result.</p>
        </div>
      ) : null}

      <div className="dr-st-groups">
        {(["A", "B"] as GroupCode[]).map((group) => {
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
                      const badge = s === "qualified" ? "Q" : null;
                      return <Row key={row.teamId} row={row} name={nameOf(row.teamId)} team={teams.get(row.teamId)} badge={badge} mine={highlightTeam === row.teamId} onTeam={onTeam} />;
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      <details className="dr-rules">
        <summary>How these tables are ranked</summary>
        <ol>
          {TIE_BREAKERS.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
        <p className="dr-rules-h">Who qualifies</p>
        <ul>
          {QUALIFICATION_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
