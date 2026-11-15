// Points, net run rate and qualification for the NCL 2026 league (two groups, top four each). Pure and client-safe.
// Overs are always handled as balls (6 per over), never as decimals.

import { LEAGUE_MATCHES_BY_GROUP, POINTS, QUALIFIERS_PER_GROUP } from "./config";
import { pairQuarterfinals, type Qualifier } from "./bracket";
import { GROUP_CODES, type GroupCode } from "./types";

export type Innings = {
  runs: number;
  wickets: number;
  /** Legal balls faced. */
  balls: number;
  /** True when the side was dismissed. NRR then counts the full overs quota. */
  allOut: boolean;
};

export type MatchOutcome = "win" | "tie" | "no_result";

export type MatchScore = {
  fixtureId: string;
  teamAId: string;
  teamBId: string;
  outcome: MatchOutcome;
  /** Which side batted first. */
  firstBats: "a" | "b";
  first: Innings;
  second: Innings;
  /** overs x 6 for this match. */
  maxBalls: number;
};

export type StandingRow = {
  teamId: string;
  group: GroupCode;
  played: number;
  won: number;
  lost: number;
  tied: number;
  noResult: number;
  /** BYE walkovers (0 or 1). A BYE is worth 2 points but is not a match played and has no runs or net run rate. */
  byes: number;
  points: number;
  runsFor: number;
  ballsFor: number;
  runsAgainst: number;
  ballsAgainst: number;
  nrr: number;
  /** 1-based rank inside the group after tie-breaks and any organizer decision. */
  rank: number;
  /** True when this team is level with another on every published criterion and no decision was recorded. */
  tied_unresolved: boolean;
};

export type OrganizerDecision = { scope: string; order: string[] };

export type TieNote = { scope: string; teamIds: string[]; positions: [number, number]; blocking: boolean };

/** Entry errors for a score line. Returns an empty list when the score is acceptable. */
export function validateScore(score: Omit<MatchScore, "fixtureId" | "teamAId" | "teamBId"> & Partial<Pick<MatchScore, "fixtureId">>): string[] {
  const problems: string[] = [];
  if (score.outcome === "no_result") return problems;
  const check = (name: string, inn: Innings, chasing: boolean, target: number) => {
    if (![inn.runs, inn.wickets, inn.balls].every((value) => Number.isInteger(value) && value >= 0)) problems.push(`${name}: runs, wickets and balls must be whole numbers.`);
    if (inn.balls > score.maxBalls) problems.push(`${name}: balls faced cannot exceed ${score.maxBalls} (${score.maxBalls / 6} overs).`);
    if (inn.wickets > 10) problems.push(`${name}: wickets cannot exceed 10.`);
    if (inn.balls === 0 && !inn.allOut) problems.push(`${name}: an innings with no balls faced is a no result.`);
    // An innings ends only by being dismissed, using its overs, or (when chasing) reaching the target.
    if (!inn.allOut && inn.balls < score.maxBalls) {
      const reachedTarget = chasing && inn.runs > target;
      if (!reachedTarget) problems.push(`${name}: fewer than ${score.maxBalls / 6} overs were faced without being all out or reaching the target. Record a shortened match as no result.`);
    }
  };
  check("First innings", score.first, false, 0);
  check("Second innings", score.second, true, score.first.runs);
  const level = score.second.runs === score.first.runs;
  if (score.outcome === "tie" && !level) problems.push("The scores are not level, so this cannot be a tie.");
  if (score.outcome === "win" && level) problems.push("The scores are level, so this is a tie.");
  return problems;
}

/** Winner decided by runs. Null for a tie or no result. */
export function matchWinner(score: MatchScore): "a" | "b" | null {
  if (score.outcome !== "win") return null;
  const secondWins = score.second.runs > score.first.runs;
  const other = score.firstBats === "a" ? "b" : "a";
  return secondWins ? other : score.firstBats;
}

function effectiveBalls(inn: Innings, maxBalls: number): number {
  return inn.allOut ? maxBalls : inn.balls;
}

export function oversText(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

/** Parses overs notation ("5.3" = 5 overs 3 balls) into balls. Returns null when it is not valid cricket notation. */
export function parseOvers(text: string): number | null {
  const match = text.trim().match(/^(\d+)(?:\.(\d))?$/);
  if (!match) return null;
  const extra = match[2] ? Number(match[2]) : 0;
  if (extra > 5) return null;
  return Number(match[1]) * 6 + extra;
}

export function formatNrr(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  if (rounded === 0) return "0.000";
  return `${rounded > 0 ? "+" : "-"}${Math.abs(rounded).toFixed(3)}`;
}

type Team = { teamId: string; group: GroupCode };

function blankRow(team: Team): StandingRow {
  return {
    teamId: team.teamId,
    group: team.group,
    played: 0,
    won: 0,
    lost: 0,
    tied: 0,
    noResult: 0,
    byes: 0,
    points: 0,
    runsFor: 0,
    ballsFor: 0,
    runsAgainst: 0,
    ballsAgainst: 0,
    nrr: 0,
    rank: 0,
    tied_unresolved: false,
  };
}

export function computeRows(teams: Team[], scores: MatchScore[], byeTeamIds: string[] = []): Map<string, StandingRow> {
  const rows = new Map(teams.map((team) => [team.teamId, blankRow(team)]));
  for (const id of byeTeamIds) {
    const row = rows.get(id);
    if (!row) continue;
    row.byes += 1;
    row.points += POINTS.bye;
  }
  for (const score of scores) {
    const a = rows.get(score.teamAId);
    const b = rows.get(score.teamBId);
    if (!a || !b) continue;
    a.played += 1;
    b.played += 1;
    if (score.outcome === "no_result") {
      a.noResult += 1;
      b.noResult += 1;
      a.points += POINTS.noResult;
      b.points += POINTS.noResult;
      continue;
    }
    const winner = matchWinner(score);
    if (winner === null) {
      a.tied += 1;
      b.tied += 1;
      a.points += POINTS.tie;
      b.points += POINTS.tie;
    } else {
      const [win, lose] = winner === "a" ? [a, b] : [b, a];
      win.won += 1;
      lose.lost += 1;
      win.points += POINTS.win;
      lose.points += POINTS.loss;
    }
    const aBatsFirst = score.firstBats === "a";
    const aInn = aBatsFirst ? score.first : score.second;
    const bInn = aBatsFirst ? score.second : score.first;
    a.runsFor += aInn.runs;
    a.ballsFor += effectiveBalls(aInn, score.maxBalls);
    a.runsAgainst += bInn.runs;
    a.ballsAgainst += effectiveBalls(bInn, score.maxBalls);
    b.runsFor += bInn.runs;
    b.ballsFor += effectiveBalls(bInn, score.maxBalls);
    b.runsAgainst += aInn.runs;
    b.ballsAgainst += effectiveBalls(aInn, score.maxBalls);
  }
  for (const row of rows.values()) {
    // (runs scored / overs faced) - (runs conceded / overs bowled), with overs = balls / 6.
    const forRate = row.ballsFor > 0 ? (row.runsFor * 6) / row.ballsFor : 0;
    const againstRate = row.ballsAgainst > 0 ? (row.runsAgainst * 6) / row.ballsAgainst : 0;
    row.nrr = forRate - againstRate;
  }
  return rows;
}

const EPSILON = 1e-9;

/** Points, then net run rate. Teams level on both are decided by a Super Over, which an organizer records. */
function compare(a: StandingRow, b: StandingRow): number {
  if (a.points !== b.points) return b.points - a.points;
  if (Math.abs(a.nrr - b.nrr) > EPSILON) return b.nrr - a.nrr;
  return 0;
}

function sameOnAllKeys(a: StandingRow, b: StandingRow): boolean {
  return compare(a, b) === 0;
}

export type RankedTable = { rows: StandingRow[]; ties: TieNote[] };

/**
 * Ranks teams by points, then net run rate. Teams still level are decided by a Super Over: the order an organizer
 * records afterwards is used, and until then they stay marked unresolved and are listed in `ties` (never guessed).
 */
export function rankRows(
  rows: StandingRow[],
  _scores: MatchScore[],
  scope: string,
  decisions: OrganizerDecision[] = [],
  /** Number of leading ranks where a tie changes who qualifies or how they are seeded. */
  blockingRanks = 3,
): RankedTable {
  const sorted = [...rows].sort((a, b) => compare(a, b) || a.teamId.localeCompare(b.teamId));
  const ties: TieNote[] = [];
  const out: StandingRow[] = [];
  let index = 0;
  while (index < sorted.length) {
    let end = index + 1;
    while (end < sorted.length && sameOnAllKeys(sorted[index] as StandingRow, sorted[end] as StandingRow)) end += 1;
    let block = sorted.slice(index, end);
    if (block.length > 1) {
      const decision = decisions.find((d) => d.scope === scope && block.every((row) => d.order.includes(row.teamId)));
      if (decision) {
        block = [...block].sort((x, y) => decision.order.indexOf(x.teamId) - decision.order.indexOf(y.teamId));
      } else {
        ties.push({
          scope,
          teamIds: block.map((row) => row.teamId),
          positions: [index + 1, end],
          blocking: index + 1 <= blockingRanks,
        });
        for (const row of block) row.tied_unresolved = true;
      }
    }
    out.push(...block);
    index = end;
  }
  out.forEach((row, position) => {
    row.rank = position + 1;
  });
  return { rows: out, ties };
}

export type QualificationStatus = "qualified" | "eliminated" | "pending";

export type Qualification = {
  groups: Record<GroupCode, RankedTable>;
  leagueMatchesPlayed: number;
  leagueComplete: boolean;
  groupComplete: Record<GroupCode, boolean>;
  /** The top four of each group, ranked 1-4 inside the group. Null until the league is complete and ties are settled. */
  qualifiers: Qualifier[] | null;
  /** Plain-language reasons the bracket cannot be filled yet. Empty when it can. */
  blockers: string[];
  /** The unresolved ties behind those blockers, so an organizer can record a decision for each. */
  blockingTies: TieNote[];
  status: Record<string, QualificationStatus>;
};

export function computeQualification(
  teams: Team[],
  scores: MatchScore[],
  decisions: OrganizerDecision[] = [],
  byeTeamIds: string[] = [],
  matchesPerGroup: Record<GroupCode, number> = LEAGUE_MATCHES_BY_GROUP,
): Qualification {
  const rows = computeRows(teams, scores, byeTeamIds);
  const groups = {} as Record<GroupCode, RankedTable>;
  const groupComplete = {} as Record<GroupCode, boolean>;
  const blockers: string[] = [];
  const blockingTies: TieNote[] = [];
  for (const group of GROUP_CODES) {
    const members = teams.filter((team) => team.group === group).map((team) => rows.get(team.teamId) as StandingRow);
    const ids = new Set(members.map((row) => row.teamId));
    const scoresInGroup = scores.filter((score) => ids.has(score.teamAId));
    groups[group] = rankRows(members, scoresInGroup, `group:${group}`, decisions, QUALIFIERS_PER_GROUP);
    groupComplete[group] = scoresInGroup.length >= matchesPerGroup[group];
  }

  const leagueMatchesPlayed = scores.length;
  const leagueComplete = GROUP_CODES.every((group) => groupComplete[group]);

  const status: Record<string, QualificationStatus> = {};
  for (const group of GROUP_CODES) {
    groups[group].rows.forEach((row, index) => {
      if (!groupComplete[group]) status[row.teamId] = "pending";
      else status[row.teamId] = index < QUALIFIERS_PER_GROUP ? "qualified" : "eliminated";
    });
  }

  let qualifiers: Qualifier[] | null = null;
  if (leagueComplete) {
    for (const group of GROUP_CODES) {
      for (const tie of groups[group].ties.filter((t) => t.blocking)) {
        blockingTies.push(tie);
        blockers.push(`Group ${group}: teams level for place ${tie.positions[0]}${tie.positions[1] > tie.positions[0] ? `-${tie.positions[1]}` : ""}. Organizer decision required.`);
      }
    }
    if (blockers.length === 0) {
      qualifiers = GROUP_CODES.flatMap((group) =>
        groups[group].rows.slice(0, QUALIFIERS_PER_GROUP).map((row, index) => ({ teamId: row.teamId, group, rank: index + 1 })),
      );
    }
  }
  return { groups, leagueMatchesPlayed, leagueComplete, groupComplete, qualifiers, blockers, blockingTies, status };
}

export { pairQuarterfinals };
