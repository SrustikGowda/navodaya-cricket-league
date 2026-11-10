// Tournament constants for the NCL 2026 group draw. Client-safe.

export const ALGORITHM = "ncl-2026-draw-v1";

export const TEAM_COUNT = 18;
export const GROUP_SIZE = 6;
export const POOL_SIZE = 3;
export const LEAGUE_MATCHES = 27;
export const TOTAL_MATCHES = 34;

export const OVERS = { league: 6, quarterfinal: 6, semifinal: 8, final: 8 } as const;

/** Minutes from midnight IST. */
const hm = (hours: number, minutes: number) => hours * 60 + minutes;

export const LEAGUE_SLOT_MINUTES = 50;
export const LEAGUE_DURATION_MINUTES = 50;

export const SATURDAY_SLOTS = [hm(7, 30), hm(8, 20), hm(9, 10), hm(10, 0), hm(10, 50), hm(11, 40), hm(12, 30), hm(13, 20), hm(14, 10)] as const;
export const SUNDAY_LEAGUE_SLOTS = [hm(7, 0), hm(7, 50), hm(8, 40), hm(9, 30), hm(10, 20)] as const;

export const KNOCKOUT_TIMES = {
  QF1: hm(11, 45),
  QF2: hm(11, 45),
  QF3: hm(12, 45),
  QF4: hm(12, 45),
  SF1: hm(14, 0),
  SF2: hm(14, 0),
  F: hm(15, 35),
} as const;

/** Durations are chosen so ground bookings never overlap and each team keeps a recovery gap. */
export const KNOCKOUT_DURATION_MINUTES = { quarterfinal: 55, semifinal: 70, final: 75 } as const;

/** League: a team may not play in back-to-back slots, so it always gets at least one slot of rest. */
export const MIN_LEAGUE_REST_MINUTES = LEAGUE_SLOT_MINUTES;
/** Knockout recovery floor between a team's matches. */
export const MIN_KNOCKOUT_REST_MINUTES = 15;
/** Time between the last league match ending and the first quarterfinal, for standings and qualification. */
export const MIN_QUALIFICATION_WINDOW_MINUTES = 30;

export const GROUND_NAMES = { A: "Ground A", B: "Ground B" } as const;

export const DEFENDING_CHAMPION_LABEL = "Defending champion (NCL 2025)";

export const REVEAL_LEAD_MS = 4_000;

/** Points table. Tie and no result are worth one point to each side. */
export const POINTS = { win: 2, tie: 1, noResult: 1, loss: 0 } as const;

export const TIE_BREAKERS = [
  "Points (win 2, tie or no result 1 each, loss 0)",
  "Net run rate, using all-out innings at the full overs quota",
  "Most wins",
  "Result of the match between the two teams, if exactly two are level and they met",
  "If teams are still level, the organizers decide under these rules. The site never picks a team on its own.",
] as const;

export const QUALIFICATION_RULES = [
  "Top 2 of each group qualify directly (6 teams).",
  "The 3 third-placed teams are ranked by points, then net run rate. The best 2 qualify as wildcards.",
  "Quarterfinal seeds: 1-3 group winners, 4-6 runners-up, 7-8 wildcards, each band ranked by points then net run rate.",
  "Quarterfinals pair seed 1 v 8, 4 v 5, 2 v 7 and 3 v 6. If a pairing would put two teams from the same group together, the lower seeds are swapped by the smallest change that avoids it.",
] as const;

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
