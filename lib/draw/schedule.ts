import { DomainError } from "../errors";
import {
  LEAGUE_DURATION_MINUTES,
  LEAGUE_MATCHES,
  MIN_KNOCKOUT_REST_MINUTES,
  MIN_LEAGUE_REST_MINUTES,
  OVERS,
  SATURDAY_SLOTS,
  SUNDAY_LEAGUE_SLOTS,
} from "./config";
import { groupMembers, slotCode } from "./draw";
import { knockoutMatches, istInstant } from "./bracket";
import { pick, shuffled, type Rng } from "./rng";
import type { DrawResult, GroundCode, GroupCode, PlannedMatch, SlotAssignment } from "./types";

type Edge = {
  group: GroupCode;
  /** Sub-pool 1 side. */
  a: SlotAssignment;
  /** Sub-pool 2 side. */
  b: SlotAssignment;
};

const SATURDAY_COUNT = SATURDAY_SLOTS.length;

/** All nine opposite-pool pairings of every group: 27 league matches. */
export function leagueEdges(result: DrawResult): Edge[] {
  const edges: Edge[] = [];
  for (const group of ["A", "B", "C"] as const) {
    for (const a of groupMembers(result, group, 1)) {
      for (const b of groupMembers(result, group, 2)) edges.push({ group, a, b });
    }
  }
  return edges;
}

const PERMUTATIONS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
] as const;

/**
 * Splits the nine matches of a group into a Sunday perfect matching (three matches, every team once)
 * and a Saturday six-cycle (six matches, every team twice). The opening edge is always a Saturday edge.
 */
function splitGroup(edges: Edge[], group: GroupCode, openingKey: string, rng: Rng): { sunday: Edge[]; saturday: Edge[] } {
  const own = edges.filter((edge) => edge.group === group);
  const pool1 = own.map((edge) => edge.a).filter((a, index, all) => all.findIndex((x) => x.teamId === a.teamId) === index);
  const pool2 = own.map((edge) => edge.b).filter((b, index, all) => all.findIndex((x) => x.teamId === b.teamId) === index);
  const key = (edge: Edge) => [edge.a.teamId, edge.b.teamId].sort().join("|");
  const valid = PERMUTATIONS.filter((perm) =>
    perm.every((target, index) => key({ group, a: pool1[index] as SlotAssignment, b: pool2[target] as SlotAssignment }) !== openingKey),
  );
  const perm = pick(valid, rng);
  const sundayKeys = new Set(perm.map((target, index) => key({ group, a: pool1[index] as SlotAssignment, b: pool2[target] as SlotAssignment })));
  return {
    sunday: own.filter((edge) => sundayKeys.has(key(edge))),
    saturday: own.filter((edge) => !sundayKeys.has(key(edge))),
  };
}

/**
 * Places the eighteen Saturday matches into nine slots of two (one per ground) so that no team plays
 * twice inside `minGap` slots of itself. Searches slot by slot, with the opening match fixed in slot 0.
 */
function placeSaturday(edges: Edge[], openingIndex: number, minGap: number, rng: Rng, budget: number): number[] | null {
  const slotOf = new Array<number>(edges.length).fill(-1);
  const placedSlots = new Map<string, number[]>();
  const teamsOf = (edge: Edge) => [edge.a.teamId, edge.b.teamId];
  let nodes = 0;

  const fits = (edge: Edge, slot: number): boolean =>
    teamsOf(edge).every((team) => (placedSlots.get(team) ?? []).every((other) => Math.abs(other - slot) >= minGap));

  const assign = (index: number, slot: number) => {
    slotOf[index] = slot;
    for (const team of teamsOf(edges[index] as Edge)) placedSlots.set(team, [...(placedSlots.get(team) ?? []), slot]);
  };
  const unassign = (index: number, slot: number) => {
    slotOf[index] = -1;
    for (const team of teamsOf(edges[index] as Edge)) {
      const list = (placedSlots.get(team) ?? []).slice();
      list.splice(list.indexOf(slot), 1);
      placedSlots.set(team, list);
    }
  };

  /** Every unplaced match still needs a later slot that keeps its teams apart. */
  const viable = (fromSlot: number): boolean => {
    for (let index = 0; index < edges.length; index += 1) {
      if (slotOf[index] !== -1) continue;
      let ok = false;
      for (let slot = fromSlot; slot < SATURDAY_COUNT && !ok; slot += 1) ok = fits(edges[index] as Edge, slot);
      if (!ok) return false;
    }
    return true;
  };

  const fill = (slot: number): boolean => {
    if (slot === SATURDAY_COUNT) return slotOf.every((value) => value !== -1);
    nodes += 1;
    if (nodes > budget) return false;
    const preplaced = slotOf.filter((value) => value === slot).length;
    const need = 2 - preplaced;
    const candidates = shuffled(
      edges.map((_, index) => index).filter((index) => slotOf[index] === -1 && fits(edges[index] as Edge, slot)),
      rng,
    );
    const choose = (start: number, remaining: number, chosen: number[]): boolean => {
      if (remaining === 0) {
        for (const index of chosen) assign(index, slot);
        if (viable(slot + 1) && fill(slot + 1)) return true;
        for (const index of chosen) unassign(index, slot);
        return false;
      }
      for (let at = start; at < candidates.length; at += 1) {
        const index = candidates[at] as number;
        const mine = teamsOf(edges[index] as Edge);
        const clash = chosen.some((other) => teamsOf(edges[other] as Edge).some((team) => mine.includes(team)));
        if (clash) continue;
        if (choose(at + 1, remaining - 1, [...chosen, index])) return true;
        if (nodes > budget) return false;
      }
      return false;
    };
    return choose(0, need, []);
  };

  assign(openingIndex, 0);
  if (!viable(0)) return null;
  return fill(0) ? slotOf : null;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

export type ScheduleOptions = { days: [string, string] };

/**
 * Builds the full 34-match schedule from a finished group draw. Randomness comes only from `rng`, so the
 * same entropy always reproduces the same schedule.
 */
export function buildSchedule(result: DrawResult, names: Map<string, string>, rng: Rng, options: ScheduleOptions): PlannedMatch[] {
  const champion = result.assignments.find((a) => a.seed === "champion");
  if (!champion) throw new DomainError("The draw has no champion seed.", 500, "draw_internal");
  const [saturday, sunday] = options.days;

  const edges = leagueEdges(result);
  if (edges.length !== LEAGUE_MATCHES) throw new DomainError("League fixtures could not be generated.", 500, "draw_internal");
  const openingKey = pairKey(champion.teamId, result.openingOpponentId);

  const split = (["A", "B", "C"] as const).map((group) => splitGroup(edges, group, openingKey, rng));
  const sundayEdges = split.flatMap((part) => part.sunday);
  const saturdayEdges = split.flatMap((part) => part.saturday);
  const openingIndex = saturdayEdges.findIndex((edge) => pairKey(edge.a.teamId, edge.b.teamId) === openingKey);
  if (openingIndex < 0) throw new DomainError("The opening match could not be placed on Saturday.", 500, "draw_internal");

  // Prefer the most recovery time. Every candidate still keeps teams out of back-to-back slots.
  let satSlots: number[] | null = null;
  for (const gap of [4, 3, 2]) {
    for (let attempt = 0; attempt < (gap === 2 ? 400 : 30) && !satSlots; attempt += 1) {
      satSlots = placeSaturday(saturdayEdges, openingIndex, gap, rng, 60_000);
    }
    if (satSlots) break;
  }
  if (!satSlots) throw new DomainError("A conflict-free Saturday schedule could not be built. Nothing was drawn.", 500, "schedule_infeasible");

  const make = (
    edge: Edge,
    day: 1 | 2,
    slotIndex: number,
    ground: GroundCode,
  ): Omit<PlannedMatch, "code" | "number"> => {
    const startMinutes = (day === 1 ? SATURDAY_SLOTS : SUNDAY_LEAGUE_SLOTS)[slotIndex] as number;
    const date = day === 1 ? saturday : sunday;
    return {
      stage: "league",
      group: edge.group,
      day,
      date,
      slotIndex,
      startMinutes,
      startsAt: istInstant(date, startMinutes),
      durationMinutes: LEAGUE_DURATION_MINUTES,
      overs: OVERS.league,
      ground,
      teamA: { teamId: edge.a.teamId, slot: slotCode(edge.a), label: names.get(edge.a.teamId) ?? edge.a.teamId, placeholder: null },
      teamB: { teamId: edge.b.teamId, slot: slotCode(edge.b), label: names.get(edge.b.teamId) ?? edge.b.teamId, placeholder: null },
    };
  };

  const league: Omit<PlannedMatch, "code" | "number">[] = [];

  // Saturday: two matches per slot, Ground A first. The opening match is Ground A, slot 0.
  for (let slot = 0; slot < SATURDAY_COUNT; slot += 1) {
    const inSlot = saturdayEdges.map((edge, index) => ({ edge, index })).filter(({ index }) => satSlots?.[index] === slot);
    let ordered = shuffled(inSlot, rng);
    if (slot === 0) ordered = [...ordered].sort((x, y) => Number(y.index === openingIndex) - Number(x.index === openingIndex));
    ordered.forEach(({ edge }, position) => league.push(make(edge, 1, slot, position === 0 ? "A" : "B")));
  }

  // Sunday: nine matches over five slots, two grounds in the first four and Ground A only in the last.
  const sundayOrder = shuffled(sundayEdges, rng);
  sundayOrder.forEach((edge, index) => {
    const slot = Math.floor(index / 2);
    league.push(make(edge, 2, slot, index % 2 === 0 ? "A" : "B"));
  });

  const numbered: PlannedMatch[] = league.map((match, index) => ({
    ...match,
    code: `M${String(index + 1).padStart(2, "0")}`,
    number: index + 1,
  }));
  return [...numbered, ...knockoutMatches(sunday, numbered.length + 1)];
}

export function matchEndMinutes(match: Pick<PlannedMatch, "startMinutes" | "durationMinutes">): number {
  return match.startMinutes + match.durationMinutes;
}

export { MIN_KNOCKOUT_REST_MINUTES, MIN_LEAGUE_REST_MINUTES };
