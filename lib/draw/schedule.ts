import { DomainError } from "../errors";
import {
  BYE_CODE,
  DEFAULT_TIMETABLE,
  FIXTURE_ENTRIES,
  LEAGUE_MATCHES,
  OPPONENT_TEMPLATE,
  OVERS,
  SATURDAY_TEMPLATE,
  SUNDAY_TEMPLATE,
  type SlotPair,
  type Timetable,
} from "./config";
import { istInstant, knockoutMatches } from "./bracket";
import type { ByeFixture, DrawResult, GroundCode, GroupCode, PlannedMatch } from "./types";

/** Start minutes of each league slot of a day, with Saturday's inauguration break after `breakAfterSlots` slots. */
export function leagueSlotStarts(day: 1 | 2, timetable: Timetable): number[] {
  const rows = day === 1 ? SATURDAY_TEMPLATE.length : SUNDAY_TEMPLATE.length;
  let at = day === 1 ? timetable.saturdayStart : timetable.sundayStart;
  const starts: number[] = [];
  for (let index = 0; index < rows; index += 1) {
    if (day === 1 && index === timetable.breakAfterSlots) at += timetable.breakMinutes;
    starts.push(at);
    at += timetable.slotMinutes;
  }
  return starts;
}

export type TimeSlot = {
  code: string;
  number: number;
  stage: PlannedMatch["stage"];
  day: 1 | 2;
  slotIndex: number;
  startMinutes: number;
  durationMinutes: number;
  ground: GroundCode;
  /** Template positions for a league match, for example ["A1", "A2"]. Knockouts have none. */
  pair: SlotPair | null;
};

/** Where and when each of the 35 matches is played, for a set of times. The opponents come from the template, not from here. */
export function timeSlots(timetable: Timetable = DEFAULT_TIMETABLE): TimeSlot[] {
  const slots: TimeSlot[] = [];
  let number = 0;
  for (const day of [1, 2] as const) {
    const rows = day === 1 ? SATURDAY_TEMPLATE : SUNDAY_TEMPLATE;
    const starts = leagueSlotStarts(day, timetable);
    rows.forEach((row, slotIndex) => {
      row.forEach((pair, position) => {
        number += 1;
        slots.push({
          code: `M${String(number).padStart(2, "0")}`,
          number,
          stage: "league",
          day,
          slotIndex,
          startMinutes: starts[slotIndex] as number,
          durationMinutes: timetable.leagueMinutes,
          ground: position === 0 ? "A" : "B",
          pair,
        });
      });
    });
  }
  const knock = knockoutMatches("2000-01-01", number + 1, timetable);
  for (const match of knock) {
    slots.push({
      code: match.code,
      number: match.number,
      stage: match.stage,
      day: 2,
      slotIndex: -1,
      startMinutes: match.startMinutes,
      durationMinutes: match.durationMinutes,
      ground: match.ground,
      pair: null,
    });
  }
  return slots;
}

/** Every league pairing of the template, once, as position codes. 13 in Group A and 15 in Group B. */
export function templatePairs(): { group: GroupCode; a: string; b: string }[] {
  const pairs: { group: GroupCode; a: string; b: string }[] = [];
  for (const group of ["A", "B"] as const) {
    const seen = new Set<string>();
    for (const [position, opponents] of Object.entries(OPPONENT_TEMPLATE[group])) {
      for (const opponent of opponents) {
        if (opponent === BYE_CODE) continue;
        const key = [position, opponent].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ group, a: position, b: opponent });
      }
    }
  }
  return pairs;
}

/** The three league fixture entries of a position: its opponents, with "BYE" where it has the walkover. */
export function opponentsOfPosition(position: string): readonly string[] {
  const group = position.slice(0, 1) as GroupCode;
  return OPPONENT_TEMPLATE[group]?.[position] ?? [];
}

export type BuiltSchedule = { matches: PlannedMatch[]; bye: ByeFixture };

export type ScheduleOptions = { days: [string, string]; timetable?: Timetable };

/**
 * Builds the schedule from a finished group draw: the 28 league matches in NCL 2025's order, the seven knockouts
 * with qualification placeholders, and the BYE entry. There is no randomness here at all.
 */
export function buildSchedule(result: DrawResult, names: Map<string, string>, options: ScheduleOptions): BuiltSchedule {
  const timetable = options.timetable ?? DEFAULT_TIMETABLE;
  const [saturday, sunday] = options.days;
  const at = new Map(result.assignments.map((a) => [`${a.group}${a.slot}`, a]));
  const side = (position: string) => {
    const a = at.get(position);
    if (!a) throw new DomainError("League fixtures could not be generated.", 500, "draw_internal");
    return { teamId: a.teamId, slot: position, label: names.get(a.teamId) ?? a.teamId, placeholder: null };
  };

  const league: PlannedMatch[] = [];
  for (const slot of timeSlots(timetable)) {
    if (slot.stage !== "league" || !slot.pair) continue;
    const date = slot.day === 1 ? saturday : sunday;
    league.push({
      code: slot.code,
      number: slot.number,
      stage: "league",
      group: slot.pair[0].slice(0, 1) as GroupCode,
      day: slot.day,
      date,
      slotIndex: slot.slotIndex,
      startMinutes: slot.startMinutes,
      startsAt: istInstant(date, slot.startMinutes),
      durationMinutes: slot.durationMinutes,
      overs: OVERS.league,
      ground: slot.ground,
      teamA: side(slot.pair[0]),
      teamB: side(slot.pair[1]),
    });
  }
  if (league.length !== LEAGUE_MATCHES) throw new DomainError("League fixtures could not be generated.", 500, "draw_internal");

  const matches = [...league, ...knockoutMatches(sunday, league.length + 1, timetable)];
  const byeAssignment = at.get("A9");
  if (!byeAssignment || byeAssignment.teamId !== result.byeTeamId) throw new DomainError("The BYE could not be placed.", 500, "draw_internal");
  const bye: ByeFixture = { code: BYE_CODE, number: FIXTURE_ENTRIES, group: "A", slot: "A9", teamId: result.byeTeamId, label: names.get(result.byeTeamId) ?? result.byeTeamId };
  return { matches, bye };
}

/**
 * The same matches at new times. Opponents, codes and numbers are copied untouched; only the day's start, the slot
 * length, the break and the knockout times move.
 */
export function applyTimetable(matches: PlannedMatch[], days: [string, string], timetable: Timetable): PlannedMatch[] {
  const slots = new Map(timeSlots(timetable).map((slot) => [slot.code, slot]));
  return matches.map((match) => {
    const slot = slots.get(match.code);
    if (!slot) return match;
    const date = slot.day === 1 ? days[0] : days[1];
    return { ...match, date, day: slot.day, slotIndex: slot.slotIndex, startMinutes: slot.startMinutes, startsAt: istInstant(date, slot.startMinutes), durationMinutes: slot.durationMinutes, ground: slot.ground };
  });
}

export function matchEndMinutes(match: Pick<PlannedMatch, "startMinutes" | "durationMinutes">): number {
  return match.startMinutes + match.durationMinutes;
}
