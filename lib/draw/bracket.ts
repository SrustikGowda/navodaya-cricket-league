import { OVERS, type Timetable } from "./config";
import type { GroundCode, GroupCode, MatchSide, PlannedMatch, Stage } from "./types";

/** Quarterfinal pairings: the top four of each group, crossed over. "A1" here means Group A's first-placed team. */
export const QF_PAIRINGS = [
  { code: "QF1", a: { group: "A" as GroupCode, rank: 1 }, b: { group: "B" as GroupCode, rank: 4 }, ground: "A" as GroundCode },
  { code: "QF2", a: { group: "A" as GroupCode, rank: 2 }, b: { group: "B" as GroupCode, rank: 3 }, ground: "B" as GroundCode },
  { code: "QF3", a: { group: "A" as GroupCode, rank: 3 }, b: { group: "B" as GroupCode, rank: 2 }, ground: "A" as GroundCode },
  { code: "QF4", a: { group: "A" as GroupCode, rank: 4 }, b: { group: "B" as GroupCode, rank: 1 }, ground: "B" as GroundCode },
] as const;

export const SF_PAIRINGS = [
  { code: "SF1", from: ["QF1", "QF2"] as const, ground: "A" as GroundCode },
  { code: "SF2", from: ["QF3", "QF4"] as const, ground: "B" as GroundCode },
] as const;

export const FINAL_FROM = ["SF1", "SF2"] as const;

export function rankLabel(group: GroupCode, rank: number): string {
  return `Group ${group} #${rank}`;
}

export function rankPlaceholder(group: GroupCode, rank: number): string {
  return `rank:${group}:${rank}`;
}

export function winnerLabel(code: string): string {
  return `Winner ${code}`;
}

function side(label: string, placeholder: string): MatchSide {
  return { teamId: null, slot: null, label, placeholder };
}

function startsAt(date: string, minutes: number): string {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mins = String(minutes % 60).padStart(2, "0");
  return new Date(`${date}T${hours}:${mins}:00+05:30`).toISOString();
}

export { startsAt as istInstant };

function knockout(
  code: string,
  number: number,
  stage: Exclude<Stage, "league">,
  date: string,
  startMinutes: number,
  durationMinutes: number,
  ground: GroundCode,
  teamA: MatchSide,
  teamB: MatchSide,
): PlannedMatch {
  return {
    code,
    number,
    stage,
    group: null,
    day: 2,
    date,
    slotIndex: -1,
    startMinutes,
    startsAt: startsAt(date, startMinutes),
    durationMinutes,
    overs: OVERS[stage],
    ground,
    teamA,
    teamB,
  };
}

/** The seven knockout fixtures with qualification placeholders. Numbers continue after the 28 league matches. */
export function knockoutMatches(sundayDate: string, firstNumber: number, timetable: Timetable): PlannedMatch[] {
  const matches: PlannedMatch[] = [];
  let number = firstNumber;
  for (const pairing of QF_PAIRINGS) {
    const start = pairing.code === "QF1" || pairing.code === "QF2" ? timetable.qf1 : timetable.qf2;
    matches.push(
      knockout(
        pairing.code,
        number++,
        "quarterfinal",
        sundayDate,
        start,
        timetable.quarterfinalMinutes,
        pairing.ground,
        side(rankLabel(pairing.a.group, pairing.a.rank), rankPlaceholder(pairing.a.group, pairing.a.rank)),
        side(rankLabel(pairing.b.group, pairing.b.rank), rankPlaceholder(pairing.b.group, pairing.b.rank)),
      ),
    );
  }
  for (const pairing of SF_PAIRINGS) {
    matches.push(
      knockout(
        pairing.code,
        number++,
        "semifinal",
        sundayDate,
        timetable.sf,
        timetable.semifinalMinutes,
        pairing.ground,
        side(winnerLabel(pairing.from[0]), `winner:${pairing.from[0]}`),
        side(winnerLabel(pairing.from[1]), `winner:${pairing.from[1]}`),
      ),
    );
  }
  matches.push(
    knockout(
      "F",
      number++,
      "final",
      sundayDate,
      timetable.final,
      timetable.finalMinutes,
      "A",
      side(winnerLabel(FINAL_FROM[0]), `winner:${FINAL_FROM[0]}`),
      side(winnerLabel(FINAL_FROM[1]), `winner:${FINAL_FROM[1]}`),
    ),
  );
  return matches;
}

export type Qualifier = { teamId: string; group: GroupCode; rank: number };

/** Pairs the eight qualified teams into quarterfinals. Always the same crossover; nothing is ever swapped. */
export function pairQuarterfinals(qualifiers: Qualifier[]): { code: string; teamAId: string; teamBId: string }[] {
  const find = (group: GroupCode, rank: number) => {
    const found = qualifiers.find((q) => q.group === group && q.rank === rank);
    if (!found) throw new Error(`Group ${group} #${rank} is missing.`);
    return found;
  };
  return QF_PAIRINGS.map((pairing) => ({
    code: pairing.code,
    teamAId: find(pairing.a.group, pairing.a.rank).teamId,
    teamBId: find(pairing.b.group, pairing.b.rank).teamId,
  }));
}
