// Points, net run rate and qualification for the NCL 2026 league. Pure and client-safe.
// Overs are always handled as balls (6 per over), never as decimals.

import { POINTS } from "./config";
import { pairQuarterfinals, type Qualifier } from "./bracket";
import type { GroupCode } from "./types";

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

export function computeRows(teams: Team[], scores: MatchScore[]): Map<string, StandingRow> {
  const rows = new Map(teams.map((team) => [team.teamId, blankRow(team)]));
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

function compare(a: StandingRow, b: StandingRow): number {
  if (a.points !== b.points) return b.points - a.points;
  if (Math.abs(a.nrr - b.nrr) > EPSILON) return b.nrr - a.nrr;
  if (a.won !== b.won) return b.won - a.won;
  return 0;
}

function sameOnAllKeys(a: StandingRow, b: StandingRow): boolean {
  return compare(a, b) === 0;
}

/** Head-to-head between exactly two level teams, when they met and one won. Returns the winner's id. */
function headToHead(a: StandingRow, b: StandingRow, scores: MatchScore[]): string | null {
  const meeting = scores.find(
    (score) => (score.teamAId === a.teamId && score.teamBId === b.teamId) || (score.teamAId === b.teamId && score.teamBId === a.teamId),
  );
  if (!meeting) return null;
  const winner = matchWinner(meeting);
  if (!winner) return null;
  return winner === "a" ? meeting.teamAId : meeting.teamBId;
}

export type RankedTable = { rows: StandingRow[]; ties: TieNote[] };

/**
 * Ranks teams: points, NRR, wins, then head-to-head for exactly two level teams. Teams still level are
 * ordered by a recorded organizer decision when one exists; otherwise they stay marked unresolved and are
 * listed in `ties` (never ordered by the site).
 */
export function rankRows(
  rows: StandingRow[],
  scores: MatchScore[],
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
    if (block.length === 2) {
      const winner = headToHead(block[0] as StandingRow, block[1] as StandingRow, scores);
      if (winner) block = [...block].sort((x, y) => Number(y.teamId === winner) - Number(x.teamId === winner));
    }
    const settledByH2H = block.length === 2 && headToHead(block[0] as StandingRow, block[1] as StandingRow, scores) !== null;
    if (block.length > 1 && !settledByH2H) {
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

export type QualificationStatus = "qualified" | "wildcard" | "eliminated" | "pending";

export type WildcardRow = StandingRow & { wildcardRank: number; status: QualificationStatus };

export type Qualification = {
  groups: Record<GroupCode, RankedTable>;
  wildcards: { rows: WildcardRow[]; ties: TieNote[] };
  leagueMatchesPlayed: number;
  leagueComplete: boolean;
  groupComplete: Record<GroupCode, boolean>;
  /** Direct and wildcard qualifiers with seeds 1-8. Null until the league is complete and ties are settled. */
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
  matchesPerGroup = 9,
): Qualification {
  const rows = computeRows(teams, scores);
  const groups = {} as Record<GroupCode, RankedTable>;
  const groupComplete = {} as Record<GroupCode, boolean>;
  const blockers: string[] = [];
  const blockingTies: TieNote[] = [];
  for (const group of ["A", "B", "C"] as const) {
    const members = teams.filter((team) => team.group === group).map((team) => rows.get(team.teamId) as StandingRow);
    const scoresInGroup = scores.filter((score) => members.some((row) => row.teamId === score.teamAId));
    groups[group] = rankRows(members, scoresInGroup, `group:${group}`, decisions, 3);
    groupComplete[group] = scoresInGroup.length >= matchesPerGroup;
  }

  const leagueMatchesPlayed = scores.length;
  const leagueComplete = (["A", "B", "C"] as const).every((group) => groupComplete[group]);

  // Wildcards: the three third-placed teams, ranked across groups.
  const thirds = (["A", "B", "C"] as const).map((group) => groups[group].rows[2]).filter((row): row is StandingRow => Boolean(row));
  const wildcardTable = rankRows(
    thirds.map((row) => ({ ...row, tied_unresolved: false })),
    scores,
    "wildcard",
    decisions,
    3,
  );
  const wildcardRows: WildcardRow[] = wildcardTable.rows.map((row, index) => ({
    ...row,
    wildcardRank: index + 1,
    status: !leagueComplete ? "pending" : index < 2 ? "wildcard" : "eliminated",
  }));

  const status: Record<string, QualificationStatus> = {};
  for (const group of ["A", "B", "C"] as const) {
    groups[group].rows.forEach((row, index) => {
      if (!groupComplete[group]) status[row.teamId] = "pending";
      else if (index < 2) status[row.teamId] = "qualified";
      else if (index === 2) status[row.teamId] = leagueComplete ? (wildcardRows.find((w) => w.teamId === row.teamId)?.status ?? "pending") : "pending";
      else status[row.teamId] = "eliminated";
    });
  }

  let qualifiers: Qualifier[] | null = null;
  if (leagueComplete) {
    for (const group of ["A", "B", "C"] as const) {
      for (const tie of groups[group].ties.filter((t) => t.blocking)) {
        blockingTies.push(tie);
        blockers.push(`Group ${group}: teams level for place ${tie.positions[0]}${tie.positions[1] > tie.positions[0] ? `-${tie.positions[1]}` : ""}. Organizer decision required.`);
      }
    }
    for (const tie of wildcardTable.ties.filter((t) => t.blocking)) {
      blockingTies.push(tie);
      blockers.push(`Wildcards: ${tie.teamIds.length} third-placed teams are level for place ${tie.positions[0]}${tie.positions[1] > tie.positions[0] ? `-${tie.positions[1]}` : ""}. Organizer decision required.`);
    }
    if (blockers.length === 0) {
      const winners = (["A", "B", "C"] as const).map((group) => groups[group].rows[0] as StandingRow);
      const runners = (["A", "B", "C"] as const).map((group) => groups[group].rows[1] as StandingRow);
      const wild = wildcardTable.rows.slice(0, 2);
      const seedBand = (band: StandingRow[], scope: string, firstSeed: number) => {
        const ranked = rankRows(band.map((row) => ({ ...row, tied_unresolved: false })), scores, scope, decisions, band.length);
        for (const tie of ranked.ties) {
          blockingTies.push(tie);
          blockers.push(`${scope === "winners" ? "Group winners" : scope === "runners" ? "Runners-up" : "Wildcards"}: ${tie.teamIds.length} teams are level for seeding. Organizer decision required.`);
        }
        return ranked.rows.map((row, index) => ({ teamId: row.teamId, group: row.group, seed: firstSeed + index }));
      };
      const seeded = [...seedBand(winners, "winners", 1), ...seedBand(runners, "runners", 4), ...seedBand(wild, "wildcard-seeds", 7)];
      if (blockers.length === 0) qualifiers = seeded;
    }
  }
  return { groups, wildcards: { rows: wildcardRows, ties: wildcardTable.ties }, leagueMatchesPlayed, leagueComplete, groupComplete, qualifiers, blockers, blockingTies, status };
}

export { pairQuarterfinals };
