"use client";

import { useMemo, useState } from "react";
import { BYE_CODE, BYE_POSITION, GROUP_TEAMS, LEAGUE_MATCHES_BY_GROUP, OPPONENT_TEMPLATE } from "@/lib/draw/config";
import type { DrawPlan, GroupCode, PublicTeam, SeedRole } from "@/lib/draw/types";
import { SEED_TEXT, slotCodeOf, teamNames, type ViewMatch } from "@/lib/draw/view";
import { MatchCard } from "./match-card";
import { TeamMark } from "./team-mark";

const SIZE = 320;
const CENTER = SIZE / 2;
const RADIUS = 118;

const SEED_BADGE: Record<SeedRole, string> = { champion: "Champion", runner_up: "Runner-up", semifinalist: "Semifinalist" };

/** Every pairing of a group, once, as two position codes. The BYE is a pairing with the virtual "BYE" entry. */
export function groupEdges(group: GroupCode): [string, string][] {
  const seen = new Set<string>();
  const edges: [string, string][] = [];
  for (const [position, opponents] of Object.entries(OPPONENT_TEMPLATE[group])) {
    for (const opponent of opponents) {
      const key = [position, opponent].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([position, opponent]);
    }
  }
  return edges;
}

/**
 * Who plays whom in one group, as a ring of positions joined by a line per match. A9's dashed line is the BYE.
 * Pure SVG with no state, so it renders on the server and inside the animated draw alike.
 */
export function OpponentWeb({
  group,
  seeds,
  opener,
  focus,
  animate = false,
  hold = false,
  onPick,
}: {
  group: GroupCode;
  /** Position code (A1) to its seed role. */
  seeds?: Record<string, SeedRole>;
  /** Position codes of the opening match, drawn brighter. */
  opener?: [string, string];
  /** A position whose three fixtures are highlighted. */
  focus?: string | null;
  animate?: boolean;
  /** Keep the lines hidden until `animate` turns on, so an animation that starts later does not flash the finished picture first. */
  hold?: boolean;
  onPick?: (position: string) => void;
}) {
  const codes = useMemo(() => [...Object.keys(OPPONENT_TEMPLATE[group]), ...(group === "A" ? [BYE_CODE] : [])], [group]);
  const point = (code: string) => {
    const index = codes.indexOf(code);
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / codes.length;
    return { x: CENTER + RADIUS * Math.cos(angle), y: CENTER + RADIUS * Math.sin(angle) };
  };
  const edges = groupEdges(group);
  const mine = focus ? new Set(edges.filter(([a, b]) => a === focus || b === focus).flatMap(([a, b]) => [a, b])) : null;
  return (
    <svg className={animate ? "gw gw--draw" : hold ? "gw gw--hold" : "gw"} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Who plays whom in Group ${group}. Every position has three fixtures.`}>
      {edges.map(([a, b], index) => {
        const p = point(a);
        const q = point(b);
        const isBye = a === BYE_CODE || b === BYE_CODE;
        const isOpener = opener ? [a, b].sort().join() === [...opener].sort().join() : false;
        const lit = focus ? a === focus || b === focus : false;
        const cls = ["gw-edge", isBye ? "is-bye" : "", isOpener ? "is-opener" : "", lit ? "is-lit" : "", focus && !lit ? "is-dim" : ""].filter(Boolean).join(" ");
        return <line key={`${a}-${b}`} className={cls} x1={p.x} y1={p.y} x2={q.x} y2={q.y} pathLength={1} style={{ ["--i" as string]: index }} />;
      })}
      {codes.map((code) => {
        const p = point(code);
        const seed = seeds?.[code];
        const isBye = code === BYE_CODE;
        const cls = ["gw-node", seed ? `is-seed is-${seed}` : "", isBye ? "is-byenode" : "", code === focus ? "is-focus" : "", mine?.has(code) && code !== focus ? "is-near" : "", focus && !mine?.has(code) ? "is-dim" : ""].filter(Boolean).join(" ");
        return (
          <g key={code} className={cls} transform={`translate(${p.x} ${p.y})`} onClick={onPick && !isBye ? () => onPick(code) : undefined} style={onPick && !isBye ? { cursor: "pointer" } : undefined}>
            <circle r={isBye ? 19 : 17} />
            <text textAnchor="middle" dominantBaseline="central">
              {code}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function SeedTag({ seed }: { seed: SeedRole }) {
  return (
    <em className={`dr-seed-pill is-${seed}`} title={SEED_TEXT[seed]}>
      {SEED_BADGE[seed]}
    </em>
  );
}

/** The two groups at the top of the published page. Group A shows its BYE team plainly. */
export function GroupCards({ plan, teams, onTeam, onGroup }: { plan: DrawPlan; teams: Map<string, PublicTeam>; onTeam: (teamId: string) => void; onGroup: (group: GroupCode) => void }) {
  const names = teamNames(plan);
  return (
    <div className="gc-grid">
      {(["A", "B"] as const).map((group) => {
        const members = plan.result.assignments.filter((a) => a.group === group).sort((x, y) => x.slot - y.slot);
        return (
          <section className="gc" key={group} aria-label={`Group ${group}`}>
            <header>
              <div>
                <h3>Group {group}</h3>
                <p>
                  {GROUP_TEAMS[group]} teams{group === "A" ? " + 1 BYE" : ""} · {LEAGUE_MATCHES_BY_GROUP[group]} matches
                </p>
              </div>
              <button type="button" className="dr-chipbtn" onClick={() => onGroup(group)}>
                Fixtures
              </button>
            </header>
            <ol>
              {members.map((a) => {
                const name = names.get(a.teamId) ?? a.teamId;
                const isBye = a.teamId === plan.bye.teamId;
                return (
                  <li key={a.teamId} className={[a.seed ? "is-seed" : "", isBye ? "is-bye" : ""].filter(Boolean).join(" ")}>
                    <i className="dr-slot-tag">{slotCodeOf(a)}</i>
                    <TeamMark name={name} logoUrl={teams.get(a.teamId)?.logoUrl} size={26} />
                    <button type="button" className="dr-team-btn" onClick={() => onTeam(a.teamId)}>
                      {name}
                    </button>
                    {a.seed ? <SeedTag seed={a.seed} /> : null}
                    {isBye ? <em className="dr-bye-pill">BYE</em> : null}
                  </li>
                );
              })}
            </ol>
            {group === "A" ? (
              <p className="gc-bye">
                <b>BYE · {BYE_POSITION}</b>
                <span>
                  {names.get(plan.bye.teamId)} · 2 matches + 1 BYE. The only BYE in the tournament.
                </span>
              </p>
            ) : (
              <p className="gc-bye gc-bye--none">No BYE · every team plays 3 matches</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** One group on its own: the web of who plays whom, each team's three opponents, then the group's matches by day. */
export function GroupPanel({
  group,
  plan,
  matches,
  onTeam,
  linkable,
}: {
  group: GroupCode;
  plan: DrawPlan;
  matches: ViewMatch[];
  onTeam: (teamId: string) => void;
  linkable: boolean;
}) {
  const names = teamNames(plan);
  const [focus, setFocus] = useState<string | null>(null);
  const bySlot = new Map(plan.result.assignments.map((a) => [slotCodeOf(a), a]));
  const seeds: Record<string, SeedRole> = {};
  for (const a of plan.result.assignments) if (a.group === group && a.seed) seeds[slotCodeOf(a)] = a.seed;
  const opener = group === "A" ? (["A1", "A2"] as [string, string]) : undefined;
  const nameOf = (code: string) => (code === BYE_CODE ? "BYE" : names.get(bySlot.get(code)?.teamId ?? "") ?? code);
  const own = matches.filter((m) => m.stage === "league" && m.group === group);
  return (
    <div className="gp">
      <div className="gp-top">
        <div className="gp-web">
          <OpponentWeb group={group} seeds={seeds} opener={opener} focus={focus} onPick={(code) => setFocus((current) => (current === code ? null : code))} />
          <p className="gp-legend">
            Each line is one match. {group === "A" ? "The dashed line is the BYE. " : ""}Tap a position to see its three fixtures.
          </p>
        </div>
        <ul className="gp-opp" aria-label={`Opponents in Group ${group}`}>
          {Object.entries(OPPONENT_TEMPLATE[group]).map(([code, opponents]) => {
            const a = bySlot.get(code);
            return (
              <li key={code} className={focus === code ? "is-focus" : undefined} onMouseEnter={() => setFocus(code)} onMouseLeave={() => setFocus(null)}>
                <button type="button" className="gp-opp-name" onClick={() => a && onTeam(a.teamId)}>
                  <i className="dr-slot-tag">{code}</i>
                  <span>{nameOf(code)}</span>
                </button>
                <span className="gp-opp-list">
                  {opponents.map((opponent) => (
                    <span key={opponent} className={opponent === BYE_CODE ? "is-bye" : undefined}>
                      <i>{opponent}</i> {nameOf(opponent)}
                    </span>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <h4 className="gp-h">Group {group} matches · {own.length}</h4>
      {([1, 2] as const).map((day) => {
        const rows = own.filter((m) => m.day === day).sort((x, y) => x.startsAt.localeCompare(y.startsAt) || x.ground.localeCompare(y.ground));
        if (rows.length === 0) return null;
        return (
          <section key={day} className="gp-day">
            <h5>
              {day === 1 ? "Saturday 28 November" : "Sunday 29 November"} <span>{rows.length}</span>
            </h5>
            <div className="dr-list">
              {rows.map((match) => (
                <MatchCard key={match.code} match={match} onTeam={onTeam} linkable={linkable} showWhen />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
