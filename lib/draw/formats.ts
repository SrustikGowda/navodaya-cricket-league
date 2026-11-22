// The tournament formats the draw can run, chosen by how many teams are approved. Client-safe.
//
//  - 19 teams: Group A has 9 teams and a BYE (position A9), Group B has 10. 28 league matches.
//  - 20 teams: both groups have 10 teams and every team plays three matches, so there is no BYE. 30 league matches.
//
// Both play two groups, three league matches per team, the top four of each group into the quarterfinals, then
// semifinals and the final. The 19-team opponent pattern and order of play are NCL 2025's. The 20-team format uses the
// same pattern for a group of 10 in both groups, and an order of play worked out for 15 time slots (see FORMAT_20).

import {
  ACTUAL_MATCHES,
  BYE_POSITION,
  FIXTURE_ENTRIES,
  GROUP_TEAMS,
  KNOCKOUT_MATCHES,
  LEAGUE_MATCHES,
  LEAGUE_MATCHES_BY_GROUP,
  OPPONENT_TEMPLATE,
  SATURDAY_TEMPLATE,
  SUNDAY_TEMPLATE,
  TEAM_COUNT,
  type GroupKey,
  type SlotRow,
} from "./config";

export type TournamentFormat = {
  /** Approved teams the draw needs. */
  teams: number;
  /** Real teams in each group. */
  groupTeams: Record<GroupKey, number>;
  /** The position that carries the BYE, or null when every team plays three matches. */
  byePosition: string | null;
  leagueMatches: number;
  leagueMatchesByGroup: Record<GroupKey, number>;
  /** League matches plus the seven knockouts. */
  actualMatches: number;
  /** Fixture entries, counting the BYE when there is one. */
  fixtureEntries: number;
  /** Each position's three league opponents ("BYE" where it has the walkover). */
  opponents: Record<GroupKey, Record<string, readonly string[]>>;
  /** Order of play: one row per time slot, [Ground A match, Ground B match]. */
  saturday: readonly SlotRow[];
  sunday: readonly SlotRow[];
};

/** NCL 2025's pattern: 9 teams and a BYE in Group A, 10 in Group B. */
export const FORMAT_19: TournamentFormat = {
  teams: TEAM_COUNT,
  groupTeams: GROUP_TEAMS,
  byePosition: BYE_POSITION,
  leagueMatches: LEAGUE_MATCHES,
  leagueMatchesByGroup: LEAGUE_MATCHES_BY_GROUP,
  actualMatches: ACTUAL_MATCHES,
  fixtureEntries: FIXTURE_ENTRIES,
  opponents: OPPONENT_TEMPLATE,
  saturday: SATURDAY_TEMPLATE,
  sunday: SUNDAY_TEMPLATE,
};

/** A group of 10 uses the pattern NCL 2025 played in its 10-team group, with the group's own letter. */
function tenTeamGroup(group: GroupKey): Record<string, readonly string[]> {
  const out: Record<string, readonly string[]> = {};
  for (const [position, opponents] of Object.entries(OPPONENT_TEMPLATE.B)) {
    out[`${group}${position.slice(1)}`] = opponents.map((opponent) => `${group}${opponent.slice(1)}`);
  }
  return out;
}

/**
 * The order of play for 20 teams: 30 league matches over 15 time slots, Saturday's eleven and Sunday's four. It keeps
 * every rule the 19-team order keeps: A1 v A2 opens on Ground A; no team plays in two slots in a row (so at least a
 * slot of rest, including across the inauguration break); every team plays at least once on each ground (ten teams
 * play twice on Ground A, ten twice on Ground B). The times spread as evenly as the pattern allows.
 */
const SATURDAY_20: readonly SlotRow[] = [
  [["A1", "A2"], ["B3", "B8"]],
  [["A7", "A8"], ["B9", "B10"]],
  [["A9", "A10"], ["A4", "A5"]],
  [["A6", "A7"], ["B4", "B9"]],
  [["B5", "B6"], ["A1", "A10"]],
  [["B1", "B2"], ["B7", "B8"]],
  [["A8", "A9"], ["A2", "A3"]],
  [["B4", "B5"], ["B2", "B7"]],
  [["A5", "A6"], ["B1", "B6"]],
  [["A3", "A4"], ["B5", "B10"]],
  [["B8", "B9"], ["B3", "B4"]],
];

const SUNDAY_20: readonly SlotRow[] = [
  [["B2", "B3"], ["A1", "A6"]],
  [["B6", "B7"], ["A4", "A9"]],
  [["B1", "B10"], ["A3", "A8"]],
  [["A5", "A10"], ["A2", "A7"]],
];

/** Two groups of 10, no BYE: every team plays three league matches. */
export const FORMAT_20: TournamentFormat = {
  teams: 20,
  groupTeams: { A: 10, B: 10 },
  byePosition: null,
  leagueMatches: 30,
  leagueMatchesByGroup: { A: 15, B: 15 },
  actualMatches: 30 + KNOCKOUT_MATCHES,
  fixtureEntries: 30 + KNOCKOUT_MATCHES,
  opponents: { A: tenTeamGroup("A"), B: tenTeamGroup("B") },
  saturday: SATURDAY_20,
  sunday: SUNDAY_20,
};

export const FORMATS: Record<number, TournamentFormat> = { [FORMAT_19.teams]: FORMAT_19, [FORMAT_20.teams]: FORMAT_20 };

/** The team counts the draw can run, smallest first. */
export const SUPPORTED_TEAM_COUNTS: readonly number[] = Object.keys(FORMATS)
  .map(Number)
  .sort((a, b) => a - b);

/** The format for a number of approved teams, or null when there is none. */
export function formatFor(teamCount: number): TournamentFormat | null {
  return FORMATS[teamCount] ?? null;
}

/** "19 or 20", for messages. */
export function supportedCountsText(): string {
  return SUPPORTED_TEAM_COUNTS.join(" or ");
}

/** League slots a day holds in this format. */
export function slotRows(format: TournamentFormat, day: 1 | 2): readonly SlotRow[] {
  return day === 1 ? format.saturday : format.sunday;
}

/** Positions of a group, in order: A1..A9 or B1..B10 (the BYE position is not a team). */
export function groupPositions(format: TournamentFormat, group: GroupKey): string[] {
  return Array.from({ length: format.groupTeams[group] }, (_, index) => `${group}${index + 1}`);
}

/** The match count of a plan or a list of matches tells which format it was made in. */
export function formatOfMatchCount(matchCount: number): TournamentFormat | null {
  return Object.values(FORMATS).find((format) => format.actualMatches === matchCount) ?? null;
}

/** The format a draw was made in, from the number of teams on its roster. */
export function formatOfPlan(plan: { roster: readonly unknown[] }): TournamentFormat {
  return formatFor(plan.roster.length) ?? FORMAT_19;
}

/** The format to describe before a draw exists: 20 approved teams get the 20-team format, any other number the 19-team one. */
export function formatToShow(approvedTeams: number): TournamentFormat {
  return approvedTeams >= FORMAT_20.teams ? FORMAT_20 : FORMAT_19;
}
