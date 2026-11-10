import { createHash } from "node:crypto";
import { DomainError } from "../errors";
import { ALGORITHM } from "./config";
import { drawGroups } from "./draw";
import { newEntropy, seededRng } from "./rng";
import { buildSchedule } from "./schedule";
import { assertRoster, resolveSeeds, type ResolvedSeeds, type RosterTeam } from "./seeds";
import type { DrawPlan } from "./types";
import { validatePlan } from "./validate";

export type PlanInput = {
  roster: RosterTeam[];
  days: [string, string];
  /** Hex entropy. Omit to draw fresh entropy from the operating system's CSPRNG. */
  entropy?: string;
  /** Pre-resolved seeded teams. Omit to resolve them from the roster. */
  seeds?: ResolvedSeeds;
};

/**
 * Runs the whole draw: seeded group allocation, 27 league fixtures, the two-day schedule and the knockout
 * placeholders. The plan is validated before it is returned, so an invalid plan can never be saved or shown.
 */
export function generatePlan(input: PlanInput): DrawPlan {
  assertRoster(input.roster);
  const seeds = input.seeds ?? resolveSeeds(input.roster);
  const entropy = input.entropy ?? newEntropy();
  const roster = [...input.roster].sort((a, b) => a.id.localeCompare(b.id)).map((team) => ({ id: team.id, name: team.name }));
  const names = new Map(roster.map((team) => [team.id, team.name]));
  const rng = seededRng(entropy);

  const result = drawGroups(roster, seeds, rng);
  const matches = buildSchedule(result, names, rng, { days: input.days });

  const plan: DrawPlan = {
    algorithm: ALGORITHM,
    seed: entropy,
    roster,
    seeds,
    result,
    matches,
    notes: [],
  };
  const report = validatePlan(plan);
  if (report.errors.length > 0) {
    throw new DomainError(`The generated draw failed validation and was discarded: ${report.errors.join("; ")}`, 500, "plan_invalid", report.errors);
  }
  plan.notes = report.notes;
  return plan;
}

/** Re-runs the algorithm from the stored entropy and roster and reports whether it matches the stored plan. */
export function verifyPlan(plan: DrawPlan, days: [string, string]): { ok: boolean; hash: string; replayHash: string } {
  const replay = generatePlan({ roster: plan.roster, days, entropy: plan.seed, seeds: plan.seeds });
  const hash = planHash(plan);
  const replayHash = planHash(replay);
  return { ok: hash === replayHash, hash, replayHash };
}

/** JSON with object keys in a fixed order, so the hash survives a round trip through a jsonb column. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function planHash(plan: DrawPlan): string {
  const canonical = canonicalJson({
    algorithm: plan.algorithm,
    seed: plan.seed,
    roster: plan.roster,
    seeds: plan.seeds,
    result: plan.result,
    matches: plan.matches,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
