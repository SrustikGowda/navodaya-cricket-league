// Tournament constants for the NCL 2026 group draw. Client-safe.
//
// 19 teams, two groups, one BYE. The opponent pattern and the order of matches are the ones NCL 2025 used, kept
// as fixed templates: only which team sits in which position is random.

export const ALGORITHM = "ncl-2026-draw-v2";

export const TEAM_COUNT = 19;
export const GROUP_CODES = ["A", "B"] as const;
export type GroupKey = (typeof GROUP_CODES)[number];

/** Real teams in each group. Group A also has one BYE, which is not a team. */
export const GROUP_TEAMS: Record<GroupKey, number> = { A: 9, B: 10 };
export const BYE_POSITION = "A9";
export const BYE_CODE = "BYE";

export const LEAGUE_MATCHES = 28;
export const LEAGUE_MATCHES_BY_GROUP: Record<GroupKey, number> = { A: 13, B: 15 };
export const KNOCKOUT_MATCHES = 7;
/** Real cricket matches: 28 league and 7 knockouts. */
export const ACTUAL_MATCHES = 35;
/** Fixture entries, counting the BYE. */
export const FIXTURE_ENTRIES = 36;
export const QUALIFIERS_PER_GROUP = 4;

export const OVERS = { league: 6, quarterfinal: 6, semifinal: 8, final: 8 } as const;

/**
 * Who plays whom. Each position lists its three league opponents. "BYE" is the walkover: it is a fixture entry
 * for that team, not a match, and takes no ground or time. Every pairing appears under both of its teams.
 */
export const OPPONENT_TEMPLATE: Record<GroupKey, Record<string, readonly string[]>> = {
  A: {
    A1: ["A2", "A5", "A6"],
    A2: ["A1", "A3", "A7"],
    A3: ["A2", "A4", "A8"],
    A4: ["A3", "A5", "A9"],
    A5: ["A1", "A4", "A6"],
    A6: ["A1", "A5", "A7"],
    A7: ["A2", "A6", "A8"],
    A8: ["A3", "A7", "A9"],
    A9: ["A4", "A8", "BYE"],
  },
  B: {
    B1: ["B2", "B6", "B10"],
    B2: ["B1", "B3", "B7"],
    B3: ["B2", "B4", "B8"],
    B4: ["B3", "B5", "B9"],
    B5: ["B4", "B6", "B10"],
    B6: ["B1", "B5", "B7"],
    B7: ["B2", "B6", "B8"],
    B8: ["B3", "B7", "B9"],
    B9: ["B4", "B8", "B10"],
    B10: ["B1", "B5", "B9"],
  },
};

export type SlotPair = readonly [string, string];
/** One time slot: the match on Ground A and the match on Ground B. */
export type SlotRow = readonly [SlotPair, SlotPair];

/**
 * Saturday, in the order NCL 2025 played it. The inauguration break comes after the fifth slot.
 *
 * Ground A is everyone's favourite, so within each slot the two matches are placed to share it out: every team plays
 * at least one league match on each ground. Nine positions play two of their three on Ground A, nine play two on
 * Ground B, and the BYE position (A9) plays one on each. Only the ground changed from 2025, in three slots (the
 * fifth, sixth and tenth); the times, the order and the rest between matches are exactly as before.
 */
export const SATURDAY_TEMPLATE: readonly SlotRow[] = [
  [["A1", "A2"], ["B3", "B8"]],
  [["A6", "A7"], ["B4", "B9"]],
  [["B2", "B7"], ["B10", "B1"]],
  [["A3", "A4"], ["A1", "A6"]],
  [["B1", "B6"], ["B4", "B5"]],
  [["B9", "B10"], ["A3", "A8"]],
  [["B3", "B4"], ["A4", "A9"]],
  [["A5", "A6"], ["A2", "A7"]],
  [["B8", "B9"], ["B6", "B7"]],
  [["A8", "A9"], ["B2", "B3"]],
];

export const SUNDAY_TEMPLATE: readonly SlotRow[] = [
  [["B5", "B10"], ["A4", "A5"]],
  [["A2", "A3"], ["B7", "B8"]],
  [["B5", "B6"], ["B1", "B2"]],
  [["A7", "A8"], ["A1", "A5"]],
];

/** Minutes from midnight IST. */
export const hm = (hours: number, minutes: number) => hours * 60 + minutes;

/**
 * Times and lengths an organizer can change. Opponents never depend on any of this.
 * Defaults are NCL 2025's league timings and the proposed 2026 knockout timings.
 */
export type Timetable = {
  saturdayStart: number;
  sundayStart: number;
  /** Minutes from the start of one league slot to the start of the next. */
  slotMinutes: number;
  /** How long a league match is booked for. */
  leagueMinutes: number;
  /** Saturday's inauguration break comes after this many league slots, and lasts this long. */
  breakAfterSlots: number;
  breakMinutes: number;
  quarterfinalMinutes: number;
  semifinalMinutes: number;
  finalMinutes: number;
  /** Start times on Sunday: the first pair of quarterfinals, the second pair, both semifinals, and the final. */
  qf1: number;
  qf2: number;
  sf: number;
  final: number;
};

export const DEFAULT_TIMETABLE: Timetable = {
  saturdayStart: hm(7, 0),
  sundayStart: hm(7, 0),
  slotMinutes: 55,
  leagueMinutes: 55,
  breakAfterSlots: 5,
  breakMinutes: 55,
  quarterfinalMinutes: 55,
  semifinalMinutes: 75,
  finalMinutes: 75,
  qf1: hm(11, 15),
  qf2: hm(12, 20),
  sf: hm(13, 45),
  final: hm(15, 30),
};

/** A team may not play back to back in the league: there is always at least one slot of rest. */
export const MIN_LEAGUE_REST_MINUTES = 55;
/** Knockout recovery floor between a team's matches. */
export const MIN_KNOCKOUT_REST_MINUTES = 30;
/** Time between the last league match ending and the first quarterfinal, for standings and confirmation. */
export const MIN_QUALIFICATION_WINDOW_MINUTES = 30;
/** Play must start after this and finish before this, so every match is finished in daylight. */
export const EARLIEST_START_MINUTES = hm(6, 30);
export const DAYLIGHT_END_MINUTES = hm(17, 45);

export const GROUND_NAMES = { A: "Ground A", B: "Ground B" } as const;

export const DEFENDING_CHAMPION_LABEL = "Defending champion (NCL 2025)";

export const REVEAL_LEAD_MS = 4_000;

/** Points table. Tie and no result are worth one point to each side; the BYE is a walkover worth a win. */
export const POINTS = { win: 2, tie: 1, noResult: 1, loss: 0, bye: 2 } as const;

export const TIE_BREAKERS = [
  "Points (win 2, tie or no result 1 each, loss 0, BYE 2)",
  "Net run rate, using all-out innings at the full overs quota",
  "Most wins",
  "Result of the match between the two teams, if exactly two are level and they met",
  "If teams are still level, the organizers decide under these rules. The site never picks a team on its own.",
] as const;

export const QUALIFICATION_RULES = [
  "The top 4 teams of each group qualify for the quarterfinals: 8 teams. There are no wildcards.",
  "Quarterfinals: Group A #1 v Group B #4, Group A #2 v Group B #3, Group A #3 v Group B #2, Group A #4 v Group B #1.",
  "Semifinals: winner QF1 v winner QF2, and winner QF3 v winner QF4. The final is between the semifinal winners.",
  "The quarterfinals are filled only after an organizer confirms the final group standings.",
] as const;

export const BYE_RULES = [
  "One team in Group A has a BYE in place of its third league match. It is a walkover: the team gets 2 points.",
  "A BYE is not a match. It has no runs, wickets, overs or net run rate, and does not count as a match played.",
] as const;

export const KNOCKOUT_TIE_RULE =
  "A tied knockout match is never given a winner by the site. The organizers decide it under the tie-break announced for the day, for example a Super Over, and record the winner with a note.";

/** Who is seeded from NCL 2025, and the spellings the roster or archive may use for each. */
export type SeedKey = "champion" | "runner_up" | "semifinalist_1" | "semifinalist_2";

export type SeedSpec = {
  key: SeedKey;
  label: string;
  /** Normalised spellings (see normalizeTeamName). Exact matches only. */
  variants: string[];
  /** Batch hint from the 2025 record, used only to break a tie between two otherwise identical names. */
  batch?: { admission: number; leaving: number };
};

export const SEED_SPECS: readonly SeedSpec[] = [
  {
    key: "champion",
    label: "4s-11",
    variants: ["4s-11", "4s 11", "4's 11", "4s11", "4s xi", "4sxi"],
    batch: { admission: 2004, leaving: 2011 },
  },
  {
    key: "runner_up",
    label: "RCB United",
    variants: ["rcb united", "rcbunited", "rcb-united", "r.c.b united", "rcb utd"],
  },
  {
    key: "semifinalist_1",
    label: "JNV Junglees",
    variants: ["jnv junglees", "jnvjunglees", "jnv junglee", "jnv jungles", "junglees"],
  },
  {
    key: "semifinalist_2",
    label: "Balehonnur Bulls",
    variants: ["balehonnur bulls", "balehonnurbulls", "balehonnur bull"],
    batch: { admission: 2005, leaving: 2012 },
  },
];
