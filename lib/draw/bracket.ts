import {
  KNOCKOUT_DURATION_MINUTES,
  KNOCKOUT_TIMES,
  OVERS,
} from "./config";
import type { GroundCode, GroupCode, MatchSide, PlannedMatch, Stage } from "./types";

/** Quarterfinal pairings by seed. Seeds 1-3 are group winners, 4-6 runners-up, 7-8 wildcards. */
export const QF_PAIRINGS = [
  { code: "QF1", seeds: [1, 8], ground: "A" as GroundCode },
  { code: "QF2", seeds: [4, 5], ground: "B" as GroundCode },
  { code: "QF3", seeds: [2, 7], ground: "A" as GroundCode },
  { code: "QF4", seeds: [3, 6], ground: "B" as GroundCode },
] as const;

export const SF_PAIRINGS = [
  { code: "SF1", from: ["QF1", "QF2"] as const, ground: "A" as GroundCode },
  { code: "SF2", from: ["QF3", "QF4"] as const, ground: "B" as GroundCode },
] as const;

export const FINAL_FROM = ["SF1", "SF2"] as const;

export const SEED_DESCRIPTIONS: Record<number, string> = {
  1: "Best group winner",
  2: "Second-best group winner",
  3: "Third-best group winner",
  4: "Best runner-up",
  5: "Second-best runner-up",
  6: "Third-best runner-up",
  7: "Best wildcard (third-placed)",
  8: "Second wildcard (third-placed)",
};

export function seedLabel(seed: number): string {
  return `Qualifier Seed ${seed}`;
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
  stage: Stage,
  date: string,
  startMinutes: number,
  ground: GroundCode,
  teamA: MatchSide,
  teamB: MatchSide,
): PlannedMatch {
  const durations = KNOCKOUT_DURATION_MINUTES;
  return {
    code,
    number,
    stage,
    group: null as GroupCode | null,
    day: 2,
    date,
    slotIndex: -1,
    startMinutes,
    startsAt: startsAt(date, startMinutes),
    durationMinutes: stage === "quarterfinal" ? durations.quarterfinal : stage === "semifinal" ? durations.semifinal : durations.final,
    overs: OVERS[stage === "league" ? "league" : stage],
    ground,
    teamA,
    teamB,
  };
}

/** The seven knockout fixtures with qualification placeholders. Numbers continue after the 27 league matches. */
export function knockoutMatches(sundayDate: string, firstNumber: number): PlannedMatch[] {
  const matches: PlannedMatch[] = [];
  let number = firstNumber;
  for (const pairing of QF_PAIRINGS) {
    matches.push(
      knockout(
        pairing.code,
        number++,
        "quarterfinal",
        sundayDate,
        KNOCKOUT_TIMES[pairing.code],
        pairing.ground,
        side(seedLabel(pairing.seeds[0]), `seed:${pairing.seeds[0]}`),
        side(seedLabel(pairing.seeds[1]), `seed:${pairing.seeds[1]}`),
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
        KNOCKOUT_TIMES[pairing.code],
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
      KNOCKOUT_TIMES.F,
      "A",
      side(winnerLabel(FINAL_FROM[0]), `winner:${FINAL_FROM[0]}`),
      side(winnerLabel(FINAL_FROM[1]), `winner:${FINAL_FROM[1]}`),
    ),
  );
  return matches;
}

export type Qualifier = { teamId: string; group: GroupCode; seed: number };

/**
 * Pairs the eight qualified teams into quarterfinals.
 *
 * Seeds are paired 1v8, 4v5, 2v7, 3v6. If a pairing would meet two teams from the same group, the
 * lower seeds (5-8) are reassigned among the top four seeds by the smallest total seed displacement
 * that gives the fewest same-group pairings. The result is deterministic.
 */
export function pairQuarterfinals(qualifiers: Qualifier[]): { code: string; teamAId: string; teamBId: string; sameGroup: boolean }[] {
  const bySeed = new Map(qualifiers.map((q) => [q.seed, q]));
  for (let seed = 1; seed <= 8; seed += 1) {
    if (!bySeed.has(seed)) throw new Error(`Quarterfinal seed ${seed} is missing.`);
  }
  const top = QF_PAIRINGS.map((pairing) => pairing.seeds[0]);
  const ideal = QF_PAIRINGS.map((pairing) => pairing.seeds[1]);
  const lowers = [5, 6, 7, 8];

  let best: { assignment: number[]; clashes: number; displacement: number } | null = null;
  const permute = (current: number[], remaining: number[]) => {
    if (remaining.length === 0) {
      const clashes = current.reduce((sum, lower, index) => {
        const a = bySeed.get(top[index] as number) as Qualifier;
        const b = bySeed.get(lower) as Qualifier;
        return sum + (a.group === b.group ? 1 : 0);
      }, 0);
      const displacement = current.reduce((sum, lower, index) => sum + Math.abs(lower - (ideal[index] as number)), 0);
      if (!best || clashes < best.clashes || (clashes === best.clashes && displacement < best.displacement)) {
        best = { assignment: [...current], clashes, displacement };
      }
      return;
    }
    for (const lower of remaining) {
      permute([...current, lower], remaining.filter((value) => value !== lower));
    }
  };
  permute([], lowers);

  const chosen = best as unknown as { assignment: number[] };
  return QF_PAIRINGS.map((pairing, index) => {
    const a = bySeed.get(top[index] as number) as Qualifier;
    const b = bySeed.get(chosen.assignment[index] as number) as Qualifier;
    return { code: pairing.code, teamAId: a.teamId, teamBId: b.teamId, sameGroup: a.group === b.group };
  });
}
