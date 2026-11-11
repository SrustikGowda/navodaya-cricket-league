// Shared, client-safe types for the NCL 2026 group draw. Nothing in this file may import node-only modules.

export type GroupCode = "A" | "B" | "C";
export type SubPool = 1 | 2;
export type SeedRole = "champion" | "runner_up" | "semifinalist";
export type Stage = "league" | "quarterfinal" | "semifinal" | "final";
export type GroundCode = "A" | "B";

export const GROUP_CODES: readonly GroupCode[] = ["A", "B", "C"];
export const SUB_POOLS: readonly SubPool[] = [1, 2];

export type TeamRef = { id: string; name: string };

/** One of the 18 positions (A1..A6, B1..B6, C1..C6). Slots 1-3 are sub-pool 1, slots 4-6 are sub-pool 2. */
export type SlotAssignment = {
  group: GroupCode;
  slot: number;
  subPool: SubPool;
  teamId: string;
  seed: SeedRole | null;
};

export type RevealStep = {
  /** 1-based position in the reveal sequence. The four seeded teams come first. */
  order: number;
  phase: "seed" | "draw";
  teamId: string;
  group: GroupCode;
  slot: number;
  subPool: SubPool;
  seed: SeedRole | null;
};

export type DrawResult = {
  assignments: SlotAssignment[];
  reveal: RevealStep[];
  openingOpponentId: string;
};

export type MatchSide = {
  teamId: string | null;
  /** Position code such as A1 for league sides. Null for knockout sides. */
  slot: string | null;
  /** The team name, or the qualification placeholder until the team is known. */
  label: string;
  /** Machine-readable placeholder, for example "seed:8" or "winner:QF1". Null once a real team is known. */
  placeholder: string | null;
};

export type PlannedMatch = {
  /** Stable identifier inside a schedule: M01..M27, QF1..QF4, SF1, SF2, F. */
  code: string;
  number: number;
  stage: Stage;
  group: GroupCode | null;
  day: 1 | 2;
  date: string;
  /** Slot index inside the day for league matches, 0-based. Knockouts use -1. */
  slotIndex: number;
  startMinutes: number;
  startsAt: string;
  durationMinutes: number;
  overs: number;
  ground: GroundCode;
  teamA: MatchSide;
  teamB: MatchSide;
};

export type DrawPlan = {
  algorithm: string;
  /** Hex entropy that fully determines this plan together with the roster. */
  seed: string;
  roster: TeamRef[];
  seeds: { championId: string; runnerUpId: string; semifinalistIds: [string, string] };
  result: DrawResult;
  matches: PlannedMatch[];
  /** Plain-language warnings about the schedule, such as short knockout rest. Never silent failures. */
  notes: string[];
};

export type PublicTeam = {
  id: string;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  /** The years the team's batch joined and left school. Teams are listed oldest batch first. */
  batchAdmissionYear: number | null;
  batchLeavingYear: number | null;
};

/** Everything the page needs about a stored official draw. */
export type OfficialDrawView = {
  id: string;
  ref: string;
  publishedAt: string;
  /** The moment every connected viewer should start the reveal. */
  revealAt: string;
  publishedByLabel: string | null;
  plan: DrawPlan;
  scheduleVersionId: string;
};

export type LiveFixture = {
  id: string;
  code: string | null;
  number: number | null;
  stage: Stage | string;
  group: GroupCode | null;
  startsAt: string | null;
  durationMinutes: number | null;
  overs: number | null;
  ground: string | null;
  teamAId: string | null;
  teamBId: string | null;
  teamALabel: string;
  teamBLabel: string;
  status: string;
  winnerLabel: string | null;
  summary: string | null;
  /** Each side's innings as "48/3 (6.0)", once a score is recorded. */
  scoreA: string | null;
  scoreB: string | null;
};
