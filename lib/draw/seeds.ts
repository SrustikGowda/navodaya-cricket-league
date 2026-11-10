import { DomainError } from "../errors";
import { SEED_SPECS, TEAM_COUNT, type SeedSpec } from "./config";

export type RosterTeam = {
  id: string;
  name: string;
  batchAdmissionYear?: number | null;
  batchLeavingYear?: number | null;
};

export type ResolvedSeeds = {
  championId: string;
  runnerUpId: string;
  semifinalistIds: [string, string];
};

/**
 * Reduces a team name to letters and digits so historical spellings compare equal:
 * "4s-11 (2004–2011)", "4S 11" and "4s11" are the same team; "Jnv Junglees" equals "JNV Junglees".
 * Bracketed batch notes are dropped first.
 */
export function normalizeTeamName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function matches(spec: SeedSpec, team: RosterTeam): boolean {
  const name = normalizeTeamName(team.name);
  return spec.variants.some((variant) => normalizeTeamName(variant) === name);
}

function resolveOne(spec: SeedSpec, roster: RosterTeam[]): RosterTeam {
  const found = roster.filter((team) => matches(spec, team));
  if (found.length === 1) return found[0] as RosterTeam;
  if (found.length === 0) {
    throw new DomainError(
      `The draw cannot run: seeded team "${spec.label}" was not found among the approved teams. Nothing was drawn.`,
      422,
      "seed_missing",
      { seed: spec.key },
    );
  }
  // Identical names: the 2025 record's batch may identify exactly one of them.
  if (spec.batch) {
    const same = found.filter(
      (team) => team.batchAdmissionYear === spec.batch?.admission && team.batchLeavingYear === spec.batch?.leaving,
    );
    if (same.length === 1) return same[0] as RosterTeam;
  }
  throw new DomainError(
    `The draw cannot run: "${spec.label}" matches ${found.length} approved teams (${found.map((team) => team.name).join(", ")}). An organizer must resolve the duplicate. Nothing was drawn.`,
    422,
    "seed_ambiguous",
    { seed: spec.key, candidates: found.map((team) => team.id) },
  );
}

/** Roster must contain exactly 18 distinct approved teams. */
export function assertRoster(roster: RosterTeam[]): void {
  const ids = new Set(roster.map((team) => team.id));
  if (ids.size !== roster.length) {
    throw new DomainError("The approved roster lists a team more than once. Nothing was drawn.", 422, "roster_invalid");
  }
  if (roster.length !== TEAM_COUNT) {
    throw new DomainError(
      `The draw needs exactly ${TEAM_COUNT} approved teams, but ${roster.length} ${roster.length === 1 ? "is" : "are"} approved. Nothing was drawn.`,
      422,
      "roster_count",
      { count: roster.length, required: TEAM_COUNT },
    );
  }
}

export function resolveSeeds(roster: RosterTeam[]): ResolvedSeeds {
  assertRoster(roster);
  const byKey = new Map<string, RosterTeam>();
  for (const spec of SEED_SPECS) byKey.set(spec.key, resolveOne(spec, roster));
  const chosen = [...byKey.values()].map((team) => team.id);
  if (new Set(chosen).size !== SEED_SPECS.length) {
    throw new DomainError("Two seeded teams resolved to the same approved team. Nothing was drawn.", 422, "seed_ambiguous");
  }
  return {
    championId: (byKey.get("champion") as RosterTeam).id,
    runnerUpId: (byKey.get("runner_up") as RosterTeam).id,
    semifinalistIds: [(byKey.get("semifinalist_1") as RosterTeam).id, (byKey.get("semifinalist_2") as RosterTeam).id],
  };
}
