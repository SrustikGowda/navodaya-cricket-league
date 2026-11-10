// Client-safe view model for the Fixtures page. Merges the draw plan (what was drawn) with live fixture rows
// (what the database says now: delays, results, filled-in quarterfinal teams).

import { istParts } from "../format";
import { GROUND_NAMES } from "./config";
import type { DrawPlan, GroundCode, GroupCode, LiveFixture, PlannedMatch, SeedRole, SlotAssignment, Stage } from "./types";

export type ViewSide = { teamId: string | null; label: string; slot: string | null; placeholder: string | null };

export type ViewMatch = {
  code: string;
  number: number;
  stage: Stage;
  group: GroupCode | null;
  day: 1 | 2;
  date: string;
  slotIndex: number;
  startsAt: string;
  startMinutes: number;
  durationMinutes: number;
  overs: number;
  ground: GroundCode;
  groundName: string;
  a: ViewSide;
  b: ViewSide;
  status: string;
  winnerLabel: string | null;
  summary: string | null;
  /** Database id, used to link to the match page. Null for a trial run. */
  fixtureId: string | null;
  scoreA: string | null;
  scoreB: string | null;
};

export const STAGE_LABEL: Record<Stage, string> = { league: "League", quarterfinal: "Quarterfinal", semifinal: "Semifinal", final: "Final" };
export const DAY_LABEL: Record<1 | 2, string> = { 1: "Saturday", 2: "Sunday" };

export function timeText(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(mins).padStart(2, "0")} ${suffix}`;
}

export function statusText(status: string): string {
  return status.replaceAll("_", " ");
}

function side(planned: PlannedMatch["teamA"]): ViewSide {
  return { teamId: planned.teamId, label: planned.label, slot: planned.slot, placeholder: planned.placeholder };
}

export function buildViewMatches(plan: DrawPlan, live?: LiveFixture[]): ViewMatch[] {
  const byCode = new Map((live ?? []).filter((f) => f.code).map((f) => [f.code as string, f]));
  return plan.matches.map((match) => {
    const row = byCode.get(match.code);
    let a = side(match.teamA);
    let b = side(match.teamB);
    let startsAt = match.startsAt;
    let startMinutes = match.startMinutes;
    let date = match.date;
    if (row) {
      if (row.teamAId) a = { teamId: row.teamAId, label: row.teamALabel, slot: a.slot, placeholder: null };
      if (row.teamBId) b = { teamId: row.teamBId, label: row.teamBLabel, slot: b.slot, placeholder: null };
      if (row.startsAt) {
        const parts = istParts(row.startsAt);
        startsAt = row.startsAt;
        startMinutes = parts.minutes;
        date = parts.date;
      }
    }
    return {
      code: match.code,
      number: match.number,
      stage: match.stage,
      group: match.group,
      day: match.day,
      date,
      slotIndex: match.slotIndex,
      startsAt,
      startMinutes,
      durationMinutes: row?.durationMinutes ?? match.durationMinutes,
      overs: row?.overs ?? match.overs,
      ground: match.ground,
      groundName: row?.ground ?? GROUND_NAMES[match.ground],
      a,
      b,
      status: row?.status ?? "scheduled",
      winnerLabel: row?.winnerLabel ?? null,
      summary: row?.summary ?? null,
      fixtureId: row?.id ?? null,
      scoreA: row?.scoreA ?? null,
      scoreB: row?.scoreB ?? null,
    };
  });
}

export function stageText(match: Pick<ViewMatch, "stage" | "group" | "code">): string {
  if (match.stage === "league") return `Group ${match.group} · League`;
  if (match.stage === "final") return "Final";
  return `${STAGE_LABEL[match.stage]} ${match.code.slice(2)}`;
}

export function monogram(name: string): string {
  const words = name.trim().split(/[\s-]+/).filter((word) => /[A-Za-z0-9]/.test(word));
  if (words.length === 0) return "N";
  if (words.length === 1) return words[0]?.slice(0, 2).toUpperCase() ?? "N";
  return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
}

export const SEED_TEXT: Record<SeedRole, string> = {
  champion: "Defending champion",
  runner_up: "Runner-up 2025",
  semifinalist: "Semifinalist 2025",
};

export function slotOf(plan: DrawPlan, teamId: string): SlotAssignment | undefined {
  return plan.result.assignments.find((a) => a.teamId === teamId);
}

export function slotCodeOf(a: Pick<SlotAssignment, "group" | "slot">): string {
  return `${a.group}${a.slot}`;
}

export function teamNames(plan: DrawPlan): Map<string, string> {
  return new Map(plan.roster.map((team) => [team.id, team.name]));
}

export function leagueMatchesOf(matches: ViewMatch[], teamId: string): ViewMatch[] {
  return matches.filter((m) => m.stage === "league" && (m.a.teamId === teamId || m.b.teamId === teamId)).sort((x, y) => x.startsAt.localeCompare(y.startsAt));
}

/** Short, speakable result line for a league match from a team's side. */
export function opponentOf(match: ViewMatch, teamId: string): ViewSide {
  return match.a.teamId === teamId ? match.b : match.a;
}

export function isoToMinutes(iso: string): number {
  return istParts(iso).minutes;
}
