import { DomainError } from "../errors";
import { GROUP_SIZE, POOL_SIZE, TEAM_COUNT } from "./config";
import { pick, shuffled, type Rng } from "./rng";
import type { ResolvedSeeds, RosterTeam } from "./seeds";
import { assertRoster } from "./seeds";
import type { DrawResult, GroupCode, RevealStep, SeedRole, SlotAssignment, SubPool } from "./types";

const SLOT_POOL = (slot: number): SubPool => (slot <= POOL_SIZE ? 1 : 2);

/**
 * Seeded random group draw.
 *
 * The seeded conditions are built into how positions are chosen, so no draw can break them:
 *  - the champion and runner-up take Group A and Group B, in a random order;
 *  - the two other 2025 semifinalists take Group C, one in each sub-pool, in a random order;
 *  - the other 14 teams fill every remaining position through a random one-to-one pairing.
 * Nothing is checked and corrected afterwards.
 */
export function drawGroups(roster: RosterTeam[], seeds: ResolvedSeeds, rng: Rng): DrawResult {
  assertRoster(roster);
  const ids = new Set(roster.map((team) => team.id));
  const seedIds = [seeds.championId, seeds.runnerUpId, ...seeds.semifinalistIds];
  if (new Set(seedIds).size !== 4 || seedIds.some((id) => !ids.has(id))) {
    throw new DomainError("The seeded teams must be four different approved teams. Nothing was drawn.", 422, "seed_ambiguous");
  }

  const taken = new Map<string, SlotAssignment>();
  const place = (group: GroupCode, subPool: SubPool, teamId: string, seed: SeedRole): SlotAssignment => {
    const free = [1, 2, 3, 4, 5, 6].filter((slot) => SLOT_POOL(slot) === subPool && !taken.has(`${group}${slot}`));
    const slot = pick(free, rng);
    const assignment: SlotAssignment = { group, slot, subPool, teamId, seed };
    taken.set(`${group}${slot}`, assignment);
    return assignment;
  };

  // Champion and runner-up: separate groups, random which is in A and which in B, random sub-pool.
  const championInA = rng.int(2) === 0;
  const champion = place(championInA ? "A" : "B", (rng.int(2) + 1) as SubPool, seeds.championId, "champion");
  const runnerUp = place(championInA ? "B" : "A", (rng.int(2) + 1) as SubPool, seeds.runnerUpId, "runner_up");

  // Other semifinalists: Group C, opposite sub-pools, random which goes where.
  const firstPool = (rng.int(2) + 1) as SubPool;
  const secondPool = (firstPool === 1 ? 2 : 1) as SubPool;
  const semiOne = place("C", firstPool, seeds.semifinalistIds[0], "semifinalist");
  const semiTwo = place("C", secondPool, seeds.semifinalistIds[1], "semifinalist");

  // Everyone else: a uniformly random one-to-one pairing of the 14 teams with the 14 open positions.
  const openSlots: { group: GroupCode; slot: number }[] = [];
  for (const group of ["A", "B", "C"] as const) {
    for (let slot = 1; slot <= GROUP_SIZE; slot += 1) {
      if (!taken.has(`${group}${slot}`)) openSlots.push({ group, slot });
    }
  }
  const remaining = roster.filter((team) => !seedIds.includes(team.id)).map((team) => team.id).sort();
  if (remaining.length !== openSlots.length || remaining.length !== TEAM_COUNT - 4) {
    throw new DomainError("The draw could not allocate every team. Nothing was drawn.", 500, "draw_internal");
  }
  const teamOrder = shuffled(remaining, rng);
  const slotOrder = shuffled(openSlots, rng);

  const drawn: SlotAssignment[] = teamOrder.map((teamId, index) => {
    const target = slotOrder[index] as { group: GroupCode; slot: number };
    const assignment: SlotAssignment = { group: target.group, slot: target.slot, subPool: SLOT_POOL(target.slot), teamId, seed: null };
    taken.set(`${target.group}${target.slot}`, assignment);
    return assignment;
  });

  // Reveal order: losing semifinalists, runner-up, then the champion, then the random draw.
  const seededOrder = [semiOne, semiTwo, runnerUp, champion];
  const reveal: RevealStep[] = [...seededOrder.map((a) => ({ ...a, phase: "seed" as const })), ...drawn.map((a) => ({ ...a, phase: "draw" as const }))].map(
    (step, index) => ({
      order: index + 1,
      phase: step.phase,
      teamId: step.teamId,
      group: step.group,
      slot: step.slot,
      subPool: step.subPool,
      seed: step.seed,
    }),
  );

  const assignments = [...taken.values()].sort((a, b) => a.group.localeCompare(b.group) || a.slot - b.slot);

  // The opening opponent comes from the draw: one of the champion's three possible league opponents.
  const opposite = assignments.filter((a) => a.group === champion.group && a.subPool !== champion.subPool);
  const opening = pick(opposite, rng);

  return { assignments, reveal, openingOpponentId: opening.teamId };
}

export function groupMembers(result: DrawResult, group: GroupCode, subPool?: SubPool): SlotAssignment[] {
  return result.assignments.filter((a) => a.group === group && (subPool == null || a.subPool === subPool)).sort((a, b) => a.slot - b.slot);
}

export function slotCode(assignment: Pick<SlotAssignment, "group" | "slot">): string {
  return `${assignment.group}${assignment.slot}`;
}
