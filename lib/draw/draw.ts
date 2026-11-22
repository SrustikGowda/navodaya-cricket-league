import { DomainError } from "../errors";
import { BYE_POSITION } from "./config";
import { formatFor } from "./formats";
import { pick, shuffled, type Rng } from "./rng";
import type { ResolvedSeeds, RosterTeam } from "./seeds";
import { assertRoster } from "./seeds";
import type { DrawResult, GroupCode, RevealStep, SeedRole, SlotAssignment } from "./types";

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

/**
 * Seeded random group draw for 19 or 20 teams in two groups.
 *
 * The conditions are built into how positions are chosen, so no draw can break them:
 *  - the defending champion and the runner-up go to different groups, which of the two groups is random;
 *  - the other two 2025 semifinalists go one to each group, in a random order;
 *  - every seed takes a random position in its group, so each group starts with two seeds;
 *  - with 19 teams, A9 carries the BYE and goes to one of the 15 unseeded teams, chosen uniformly (with 20 there is no BYE);
 *  - the other unseeded teams fill every remaining position through a random one-to-one pairing.
 * Nothing is checked and corrected afterwards.
 */
export function drawGroups(roster: RosterTeam[], seeds: ResolvedSeeds, rng: Rng): DrawResult {
  assertRoster(roster);
  const format = formatFor(roster.length);
  if (!format) throw new DomainError("The draw could not allocate every team. Nothing was drawn.", 500, "draw_internal");
  const teamCount = format.teams;
  const groupTeams = format.groupTeams;
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

  // Seeds. A position that carries the BYE is never a seed's, so with 19 teams Group A's seeds take A1 to A8.
  const byeSlot = format.byePosition ? Number(format.byePosition.slice(1)) : null;
  const seedSlot = (group: GroupCode) => pick(free(group, range(1, groupTeams[group] - (byeSlot !== null && format.byePosition?.startsWith(group) ? 1 : 0))), rng);
  const championGroup: GroupCode = rng.int(2) === 0 ? "A" : "B";
  const runnerUpGroup: GroupCode = championGroup === "A" ? "B" : "A";
  const semiInA = rng.int(2);
  const semiAId = seeds.semifinalistIds[semiInA] as string;
  const semiBId = seeds.semifinalistIds[1 - semiInA] as string;
  const champion = place(championGroup, seedSlot(championGroup), seeds.championId, "champion");
  const runnerUp = place(runnerUpGroup, seedSlot(runnerUpGroup), seeds.runnerUpId, "runner_up");
  const semiA = place("A", seedSlot("A"), semiAId, "semifinalist");
  const semiB = place("B", seedSlot("B"), semiBId, "semifinalist");

  // The BYE (19 teams): one of the 15 unseeded teams, equally likely, takes A9.
  const unseeded = roster.filter((team) => !seedIds.includes(team.id)).map((team) => team.id).sort();
  if (unseeded.length !== teamCount - 4) throw new DomainError("The draw could not allocate every team. Nothing was drawn.", 500, "draw_internal");
  const byeTeamId = byeSlot !== null ? pick(unseeded, rng) : null;
  const bye = byeTeamId !== null ? place("A", byeSlot as number, byeTeamId, null) : null;

  // Everyone else: a uniformly random one-to-one pairing of the remaining teams with the open positions.
  const openSlots: { group: GroupCode; slot: number }[] = [
    ...free("A", range(1, groupTeams.A)).map((slot) => ({ group: "A" as const, slot })),
    ...free("B", range(1, groupTeams.B)).map((slot) => ({ group: "B" as const, slot })),
  ];
  const remaining = unseeded.filter((id) => id !== byeTeamId);
  if (remaining.length !== openSlots.length) throw new DomainError("The draw could not allocate every team. Nothing was drawn.", 500, "draw_internal");
  const teamOrder = shuffled(remaining, rng);
  const slotOrder = shuffled(openSlots, rng);
  const drawn: SlotAssignment[] = teamOrder.map((teamId, index) => {
    const target = slotOrder[index] as { group: GroupCode; slot: number };
    return place(target.group, target.slot, teamId, null);
  });

  // Reveal order: the four seeds (champion, runner-up, then the other two in a fixed order), the random draw, then the BYE if there is one.
  const semiFor = (id: string) => (id === semiAId ? semiA : semiB);
  const seeded = [champion, runnerUp, semiFor(seeds.semifinalistIds[0]), semiFor(seeds.semifinalistIds[1])];
  const steps: { a: SlotAssignment; phase: RevealStep["phase"] }[] = [
    ...seeded.map((a) => ({ a, phase: "seed" as const })),
    ...drawn.map((a) => ({ a, phase: "draw" as const })),
    ...(bye ? [{ a: bye, phase: "bye" as const }] : []),
  ];
  const reveal: RevealStep[] = steps.map(({ a, phase }, index) => ({ order: index + 1, phase, teamId: a.teamId, group: a.group, slot: a.slot, seed: a.seed }));

  const assignments = [...taken.values()].sort((a, b) => a.group.localeCompare(b.group) || a.slot - b.slot);
  const opening = assignments.find((a) => a.group === "A" && a.slot === 2);
  if (!opening || assignments.length !== teamCount) throw new DomainError("The draw could not allocate every team. Nothing was drawn.", 500, "draw_internal");
  return { assignments, reveal, byeTeamId, openingOpponentId: opening.teamId };
}

export function groupMembers(result: DrawResult, group: GroupCode): SlotAssignment[] {
  return result.assignments.filter((a) => a.group === group).sort((a, b) => a.slot - b.slot);
}

export function slotCode(assignment: Pick<SlotAssignment, "group" | "slot">): string {
  return `${assignment.group}${assignment.slot}`;
}

export { BYE_POSITION };
