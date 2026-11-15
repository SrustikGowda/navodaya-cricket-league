// Shared, client-safe types for the NCL 2026 group draw. Nothing in this file may import node-only modules.

import type { Timetable } from "./config";

export type GroupCode = "A" | "B";
export type SeedRole = "champion" | "runner_up" | "semifinalist";
export type Stage = "league" | "quarterfinal" | "semifinal" | "final";
export type GroundCode = "A" | "B";

export const GROUP_CODES: readonly GroupCode[] = ["A", "B"];

export type TeamRef = { id: string; name: string };

/** One of the 19 positions: A1..A9 and B1..B10. A9 is the position that carries the BYE. */
export type SlotAssignment = {
  group: GroupCode;
  slot: number;
  teamId: string;
  seed: SeedRole | null;
};

export type RevealStep = {
  /** 1-based position in the reveal sequence. The four seeded teams come first, the BYE team last. */
  order: number;
  phase: "seed" | "draw" | "bye";
  teamId: string;
  group: GroupCode;
  slot: number;
  seed: SeedRole | null;
};

export type DrawResult = {
  assignments: SlotAssignment[];
  reveal: RevealStep[];
  /** The one team whose third league fixture is a BYE (position A9). */
  byeTeamId: string;
  /** The team at A2, who plays the team at A1 in the opening match. */
  openingOpponentId: string;
};

export type MatchSide = {
  teamId: string | null;
  /** Position code such as A1 for league sides. Null for knockout sides. */
  slot: string | null;
  /** The team name, or the qualification placeholder until the team is known. */
  label: string;
  /** Machine-readable placeholder, for example "rank:A:1" or "winner:QF1". Null once a real team is known. */
  placeholder: string | null;
};

export type PlannedMatch = {
  /** Stable identifier inside a schedule: M01..M28, QF1..QF4, SF1, SF2, F. */
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

/** The walkover. A fixture entry for one team, with no ground, time, runs or net run rate. */
export type ByeFixture = {
  code: "BYE";
  number: number;
  group: "A";
  slot: string;
  teamId: string;
  label: string;
};

export type DrawPlan = {
  algorithm: string;
  /** Hex entropy that fully determines this plan together with the roster. */
  seed: string;
  roster: TeamRef[];
  seeds: { championId: string; runnerUpId: string; semifinalistIds: [string, string] };
  result: DrawResult;
  matches: PlannedMatch[];
  bye: ByeFixture;
  /** The times the plan was built with. Later changes by organizers are kept on the draw, not in this record. */
  timetable: Timetable;
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
  /** The times in force now: the plan's, plus any rescheduling by organizers. */
  timetable: Timetable;
  /** When an organizer confirmed the final group standings, so the quarterfinals could be filled. */
  standingsConfirmedAt: string | null;
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
  isBye: boolean;
  changeNote: string | null;
};
