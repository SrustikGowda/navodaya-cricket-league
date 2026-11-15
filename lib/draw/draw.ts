import { DomainError } from "../errors";
import { BYE_POSITION, GROUP_TEAMS, TEAM_COUNT } from "./config";
import { pick, shuffled, type Rng } from "./rng";
import type { ResolvedSeeds, RosterTeam } from "./seeds";
import { assertRoster } from "./seeds";
import type { DrawResult, GroupCode, RevealStep, SeedRole, SlotAssignment } from "./types";

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

/**
 * Seeded random group draw for 19 teams in two groups.
 *
 * The conditions are built into how positions are chosen, so no draw can break them:
 *  - the defending champion takes A1, so the opening match is A1 v A2;
 *  - the runner-up takes Group B, at a random position;
 *  - the other two 2025 semifinalists go one to each group, in a random order and at random positions;
 *  - A9 carries the BYE and goes to one of the 15 unseeded teams, chosen uniformly;
 *  - the other 14 unseeded teams fill every remaining position through a random one-to-one pairing.
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
  const place = (group: GroupCode, slot: number, teamId: string, seed: SeedRole | null): SlotAssignment => {
    const assignment: SlotAssignment = { group, slot, teamId, seed };
    taken.set(`${group}${slot}`, assignment);
    return assignment;
  };
  const free = (group: GroupCode, slots: number[]) => slots.filter((slot) => !taken.has(`${group}${slot}`));

  // Seeds. Group A's positions A1 (champion) and A9 (BYE) are reserved, so its semifinalist takes A2-A8.
  const champion = place("A", 1, seeds.championId, "champion");
  const semiInA = rng.int(2);
  const semiAId = seeds.semifinalistIds[semiInA] as string;
  const semiBId = seeds.semifinalistIds[1 - semiInA] as string;
  const semiA = place("A", pick(range(2, GROUP_TEAMS.A - 1), rng), semiAId, "semifinalist");
  const runnerUp = place("B", pick(range(1, GROUP_TEAMS.B), rng), seeds.runnerUpId, "runner_up");
  const semiB = place("B", pick(free("B", range(1, GROUP_TEAMS.B)), rng), semiBId, "semifinalist");

  // The BYE: one of the 15 unseeded teams, equally likely, takes A9.
  const unseeded = roster.filter((team) => !seedIds.includes(team.id)).map((team) => team.id).sort();
  if (unseeded.length !== TEAM_COUNT - 4) throw new DomainError("The draw could not allocate every team. Nothing was drawn.", 500, "draw_internal");
  const byeTeamId = pick(unseeded, rng);
  const bye = place("A", GROUP_TEAMS.A, byeTeamId, null);

  // Everyone else: a uniformly random one-to-one pairing of the 14 teams with the 14 open positions.
  const openSlots: { group: GroupCode; slot: number }[] = [
    ...free("A", range(1, GROUP_TEAMS.A)).map((slot) => ({ group: "A" as const, slot })),
    ...free("B", range(1, GROUP_TEAMS.B)).map((slot) => ({ group: "B" as const, slot })),
  ];
  const remaining = unseeded.filter((id) => id !== byeTeamId);
  if (remaining.length !== openSlots.length) throw new DomainError("The draw could not allocate every team. Nothing was drawn.", 500, "draw_internal");
  const teamOrder = shuffled(remaining, rng);
  const slotOrder = shuffled(openSlots, rng);
  const drawn: SlotAssignment[] = teamOrder.map((teamId, index) => {
    const target = slotOrder[index] as { group: GroupCode; slot: number };
    return place(target.group, target.slot, teamId, null);
  });

  // Reveal order: the four seeds (champion, runner-up, then the other two in a fixed order), the random draw, then the BYE.
  const semiFor = (id: string) => (id === semiAId ? semiA : semiB);
  const seeded = [champion, runnerUp, semiFor(seeds.semifinalistIds[0]), semiFor(seeds.semifinalistIds[1])];
  const steps: { a: SlotAssignment; phase: RevealStep["phase"] }[] = [
    ...seeded.map((a) => ({ a, phase: "seed" as const })),
    ...drawn.map((a) => ({ a, phase: "draw" as const })),
    { a: bye, phase: "bye" as const },
  ];
  const reveal: RevealStep[] = steps.map(({ a, phase }, index) => ({ order: index + 1, phase, teamId: a.teamId, group: a.group, slot: a.slot, seed: a.seed }));

  const assignments = [...taken.values()].sort((a, b) => a.group.localeCompare(b.group) || a.slot - b.slot);
  const opening = assignments.find((a) => a.group === "A" && a.slot === 2);
  if (!opening || assignments.length !== TEAM_COUNT) throw new DomainError("The draw could not allocate every team. Nothing was drawn.", 500, "draw_internal");
  return { assignments, reveal, byeTeamId, openingOpponentId: opening.teamId };
}

export function groupMembers(result: DrawResult, group: GroupCode): SlotAssignment[] {
  return result.assignments.filter((a) => a.group === group).sort((a, b) => a.slot - b.slot);
}

export function slotCode(assignment: Pick<SlotAssignment, "group" | "slot">): string {
  return `${assignment.group}${assignment.slot}`;
}

export { BYE_POSITION };
