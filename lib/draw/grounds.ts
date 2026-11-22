// How the two grounds are shared out in the league. Ground A is everyone's favourite, so the order of play gives every
// team at least one league match on each ground. Which teams get two on Ground A is settled by the draw, because the
// draw decides who takes which position.

import { FORMAT_19, type TournamentFormat } from "./formats";
import type { GroundCode, Stage } from "./types";

export type GroundSplit = Record<GroundCode, number>;

/** League matches on each ground for every position (A1 … B10), from the order of play. */
export function positionGroundSplit(format: TournamentFormat = FORMAT_19): Map<string, GroundSplit> {
  const split = new Map<string, GroundSplit>();
  for (const row of [...format.saturday, ...format.sunday]) {
    row.forEach((pair, index) => {
      const ground: GroundCode = index === 0 ? "A" : "B";
      for (const position of pair) {
        const entry = split.get(position) ?? { A: 0, B: 0 };
        entry[ground] += 1;
        split.set(position, entry);
      }
    });
  }
  return split;
}

/** How many positions play two league matches on Ground A, and how many play two on Ground B. */
export function groundShareCounts(format: TournamentFormat = FORMAT_19): { twoOnA: number; twoOnB: number } {
  let twoOnA = 0;
  let twoOnB = 0;
  for (const [position, split] of positionGroundSplit(format)) {
    if (position === format.byePosition) continue;
    if (split.A > split.B) twoOnA += 1;
    else if (split.B > split.A) twoOnB += 1;
  }
  return { twoOnA, twoOnB };
}

/** One sentence for the Fixtures page and the rules. */
export function groundShareText(format: TournamentFormat = FORMAT_19): string {
  const { twoOnA, twoOnB } = groundShareCounts(format);
  const bye = format.byePosition ? " The BYE team plays one on each." : "";
  return `Every team plays at least one league match on each ground: ${twoOnA} teams play two of their three on Ground A and ${twoOnB} play two on Ground B.${bye} The draw decides which team gets which.`;
}

/** League matches on each ground for every team, from the scheduled matches, so it follows any rescheduling. */
export function teamGroundSplit(matches: Iterable<{ stage: Stage; ground: GroundCode; teamIds: readonly (string | null)[] }>): Map<string, GroundSplit> {
  const split = new Map<string, GroundSplit>();
  for (const match of matches) {
    if (match.stage !== "league") continue;
    for (const teamId of match.teamIds) {
      if (!teamId) continue;
      const entry = split.get(teamId) ?? { A: 0, B: 0 };
      entry[match.ground] += 1;
      split.set(teamId, entry);
    }
  }
  return split;
}

/** "2 on Ground A, 1 on Ground B", for screen readers and titles. */
export function groundSplitText(split: GroundSplit): string {
  return `${split.A} on Ground A, ${split.B} on Ground B`;
}
