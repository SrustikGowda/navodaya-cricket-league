import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { pairQuarterfinals, QF_PAIRINGS, type Qualifier } from "../lib/draw/bracket";
import { LEAGUE_MATCHES, POINTS, SATURDAY_SLOTS, SUNDAY_LEAGUE_SLOTS, TOTAL_MATCHES } from "../lib/draw/config";
import { generatePlan, planHash, verifyPlan } from "../lib/draw/plan";
import { seededRng } from "../lib/draw/rng";
import { beatIndexAt, buildTimeline, placedBefore } from "../lib/draw/timeline";
import { normalizeTeamName, resolveSeeds, type RosterTeam } from "../lib/draw/seeds";
import {
  computeQualification,
  computeRows,
  formatNrr,
  matchWinner,
  parseOvers,
  rankRows,
  validateScore,
  type MatchScore,
  type StandingRow,
} from "../lib/draw/standings";
import { validatePlan } from "../lib/draw/validate";
import type { DrawPlan, GroupCode, PlannedMatch } from "../lib/draw/types";
import { DAYS, TEAM_NAMES } from "./helpers/roster";

const roster: RosterTeam[] = TEAM_NAMES.map((name, index) => ({ id: `team-${String(index).padStart(2, "0")}`, name }));
const idOf = (name: string) => (roster.find((team) => team.name === name) as RosterTeam).id;
const entropyFor = (n: number) => createHash("sha256").update(`ncl-test-${n}`).digest("hex");

/** Deliberately independent of lib/draw/validate.ts: these are the promises the organizers asked for. */
function assertPlanPromises(plan: DrawPlan, label: string) {
  const at = (id: string) => plan.result.assignments.find((a) => a.teamId === id);
  const league = plan.matches.filter((m) => m.stage === "league");
  const ids = plan.roster.map((team) => team.id);

  assert.equal(plan.roster.length, 18, `${label}: 18 teams`);
  assert.equal(new Set(ids).size, 18, `${label}: distinct teams`);
  // every team exactly once in the allocation
  assert.deepEqual([...plan.result.assignments.map((a) => a.teamId)].sort(), [...ids].sort(), `${label}: each team once`);
  for (const group of ["A", "B", "C"] as const) {
    const members = plan.result.assignments.filter((a) => a.group === group);
    assert.equal(members.length, 6, `${label}: group ${group} has six`);
    for (const pool of [1, 2] as const) assert.equal(members.filter((a) => a.subPool === pool).length, 3, `${label}: ${group} pool ${pool} has three`);
  }
  // seeded rules
  const champion = at(idOf("4s-11")) as NonNullable<ReturnType<typeof at>>;
  const runnerUp = at(idOf("RCB United")) as NonNullable<ReturnType<typeof at>>;
  const junglees = at(idOf("JNV Junglees")) as NonNullable<ReturnType<typeof at>>;
  const bulls = at(idOf("Balehonnur Bulls")) as NonNullable<ReturnType<typeof at>>;
  assert.notEqual(champion.group, runnerUp.group, `${label}: champion and runner-up apart`);
  assert.deepEqual([champion.group, runnerUp.group].sort(), ["A", "B"], `${label}: champion and runner-up are A and B`);
  assert.equal(junglees.group, "C", `${label}: Junglees in C`);
  assert.equal(bulls.group, "C", `${label}: Bulls in C`);
  assert.notEqual(junglees.subPool, bulls.subPool, `${label}: C semifinalists in opposite sub-pools`);

  // league fixtures
  assert.equal(league.length, 27, `${label}: 27 league fixtures`);
  const seen = new Set<string>();
  for (const m of league) {
    const a = at(m.teamA.teamId as string) as NonNullable<ReturnType<typeof at>>;
    const b = at(m.teamB.teamId as string) as NonNullable<ReturnType<typeof at>>;
    assert.equal(a.group, b.group, `${label}: ${m.code} same group`);
    assert.notEqual(a.subPool, b.subPool, `${label}: ${m.code} opposite sub-pools`);
    const key = [a.teamId, b.teamId].sort().join("|");
    assert.equal(seen.has(key), false, `${label}: ${m.code} not a duplicate`);
    seen.add(key);
  }
  for (const id of ids) {
    const own = league.filter((m) => m.teamA.teamId === id || m.teamB.teamId === id);
    assert.equal(own.length, 3, `${label}: ${id} plays three`);
    const opponents = own.map((m) => (m.teamA.teamId === id ? m.teamB.teamId : m.teamA.teamId));
    assert.equal(new Set(opponents).size, 3, `${label}: ${id} three different opponents`);
    assert.equal(own.filter((m) => m.day === 1).length, 2, `${label}: ${id} twice on Saturday`);
    assert.equal(own.filter((m) => m.day === 2).length, 1, `${label}: ${id} once on Sunday`);
  }
  assert.equal(league.filter((m) => m.day === 1).length, 18, `${label}: 18 on Saturday`);
  assert.equal(league.filter((m) => m.day === 2).length, 9, `${label}: 9 on Sunday`);
  assert.ok(league.filter((m) => m.day === 1).every((m) => m.date === DAYS[0]));
  assert.ok(league.filter((m) => m.day === 2).every((m) => m.date === DAYS[1]));

  // time: no team or ground overlap, ever
  const span = (m: PlannedMatch) => [Date.parse(m.startsAt), Date.parse(m.startsAt) + m.durationMinutes * 60_000] as const;
  for (let i = 0; i < plan.matches.length; i += 1) {
    for (let j = i + 1; j < plan.matches.length; j += 1) {
      const x = plan.matches[i] as PlannedMatch;
      const y = plan.matches[j] as PlannedMatch;
      const [xs, xe] = span(x);
      const [ys, ye] = span(y);
      if (!(xs < ye && ys < xe)) continue;
      assert.notEqual(x.ground, y.ground, `${label}: ground clash ${x.code}/${y.code}`);
      const xt = [x.teamA.teamId, x.teamB.teamId].filter(Boolean);
      const yt = [y.teamA.teamId, y.teamB.teamId].filter(Boolean);
      assert.equal(xt.some((t) => yt.includes(t)), false, `${label}: team clash ${x.code}/${y.code}`);
    }
  }
  // Saturday teams are never in back-to-back slots.
  for (const id of ids) {
    const slots = league.filter((m) => m.day === 1 && (m.teamA.teamId === id || m.teamB.teamId === id)).map((m) => m.slotIndex).sort((p, q) => p - q);
    assert.ok((slots[1] as number) - (slots[0] as number) >= 2, `${label}: ${id} has a slot of rest on Saturday`);
  }

  // Saturday slots are the specified ones, two grounds each, nothing else.
  const saturday = league.filter((m) => m.day === 1);
  for (const [slot, minutes] of SATURDAY_SLOTS.entries()) {
    const inSlot = saturday.filter((m) => m.slotIndex === slot);
    assert.equal(inSlot.length, 2, `${label}: two matches in Saturday slot ${slot}`);
    assert.deepEqual(inSlot.map((m) => m.ground).sort(), ["A", "B"]);
    assert.ok(inSlot.every((m) => m.startMinutes === minutes && m.durationMinutes === 50));
  }
  const sunday = league.filter((m) => m.day === 2);
  assert.deepEqual([...new Set(sunday.map((m) => m.startMinutes))].sort((p, q) => p - q), [...SUNDAY_LEAGUE_SLOTS]);
  assert.equal(sunday.filter((m) => m.slotIndex === 4).length, 1, `${label}: one Sunday match in the last slot`);
  assert.equal(sunday.find((m) => m.slotIndex === 4)?.ground, "A", `${label}: Ground B is the buffer in the last slot`);

  // opening match
  const opener = plan.matches.find((m) => m.number === 1) as PlannedMatch;
  assert.equal(opener.startMinutes, 7 * 60 + 30);
  assert.equal(opener.ground, "A");
  assert.equal(opener.date, DAYS[0]);
  assert.ok([opener.teamA.teamId, opener.teamB.teamId].includes(idOf("4s-11")), `${label}: champion opens`);
  assert.ok(plan.matches.filter((m) => m.startsAt < opener.startsAt).length === 0, `${label}: nothing earlier than match 1`);

  // knockouts and total
  assert.equal(plan.matches.filter((m) => m.stage === "quarterfinal").length, 4);
  assert.equal(plan.matches.filter((m) => m.stage === "semifinal").length, 2);
  assert.equal(plan.matches.filter((m) => m.stage === "final").length, 1);
  assert.equal(plan.matches.length, TOTAL_MATCHES);
  for (const stage of ["quarterfinal", "semifinal", "final"] as const) {
    assert.ok(plan.matches.filter((m) => m.stage === stage).every((m) => m.teamA.teamId === null && m.teamB.teamId === null), `${label}: ${stage} holds placeholders`);
  }
  const overs = { league: 6, quarterfinal: 6, semifinal: 8, final: 8 };
  assert.ok(plan.matches.every((m) => m.overs === overs[m.stage]), `${label}: overs per stage`);
}

test("1000 randomized draws all keep every seeded, fixture and schedule promise", () => {
  for (let n = 0; n < 1000; n += 1) {
    const plan = generatePlan({ roster, days: DAYS, entropy: entropyFor(n) });
    assertPlanPromises(plan, `draw ${n}`);
    assert.deepEqual(validatePlan(plan).errors, [], `draw ${n}: the built-in validator agrees`);
  }
});

test("seeded teams are placed by construction, and the randomness is real", () => {
  let championInA = 0;
  let championPool1 = 0;
  let junglesPool1 = 0;
  const groupOf = new Map<string, Record<GroupCode, number>>();
  const runs = 1500;
  for (let n = 0; n < runs; n += 1) {
    const plan = generatePlan({ roster, days: DAYS, entropy: entropyFor(10_000 + n) });
    const find = (name: string) => plan.result.assignments.find((a) => a.teamId === idOf(name)) as NonNullable<DrawPlan["result"]["assignments"][number]>;
    if (find("4s-11").group === "A") championInA += 1;
    if (find("4s-11").subPool === 1) championPool1 += 1;
    if (find("JNV Junglees").subPool === 1) junglesPool1 += 1;
    const free = find("The Elite");
    const tally = groupOf.get("The Elite") ?? { A: 0, B: 0, C: 0 };
    tally[free.group] += 1;
    groupOf.set("The Elite", tally);
  }
  // Fair coin flips: allow a generous six-sigma-ish band so the test is stable but would catch a stuck coin.
  for (const count of [championInA, championPool1, junglesPool1]) assert.ok(count > runs * 0.43 && count < runs * 0.57, `coin ${count}/${runs}`);
  // An unseeded team lands in each group, with Group C the least likely (it holds two seeded teams).
  const tally = groupOf.get("The Elite") as Record<GroupCode, number>;
  assert.ok(tally.A > 0 && tally.B > 0 && tally.C > 0);
  assert.ok(tally.C < tally.A && tally.C < tally.B, "Group C has fewer open positions");
});

test("the same entropy replays the same draw, and the saved plan can be verified", () => {
  const first = generatePlan({ roster, days: DAYS, entropy: entropyFor(7) });
  const again = generatePlan({ roster, days: DAYS, entropy: entropyFor(7) });
  assert.equal(planHash(first), planHash(again));
  assert.equal(verifyPlan(first, DAYS).ok, true);
  const other = generatePlan({ roster, days: DAYS, entropy: entropyFor(8) });
  assert.notEqual(planHash(first), planHash(other));
  const tampered: DrawPlan = JSON.parse(JSON.stringify(first));
  const [a, b] = tampered.result.assignments as [DrawPlan["result"]["assignments"][number], DrawPlan["result"]["assignments"][number]];
  [a.teamId, b.teamId] = [b.teamId, a.teamId];
  assert.equal(verifyPlan(tampered, DAYS).ok, false, "a doctored result no longer matches its entropy");
  assert.ok(validatePlan({ ...first, matches: first.matches.slice(0, 33) }).errors.length > 0);
  assert.throws(() => seededRng("not-hex"));
});

test("random numbers are unbiased and the stream is deterministic", () => {
  const first = seededRng(entropyFor(1));
  const second = seededRng(entropyFor(1));
  assert.deepEqual(
    Array.from({ length: 50 }, () => first.int(1000)),
    Array.from({ length: 50 }, () => second.int(1000)),
  );
  const uniform = seededRng(entropyFor(3));
  const hits = new Array<number>(7).fill(0);
  for (let i = 0; i < 70_000; i += 1) {
    const value = uniform.int(7);
    hits[value] = (hits[value] as number) + 1;
  }
  for (const hit of hits) assert.ok(hit > 9_500 && hit < 10_500, `bucket ${hit}`);
  assert.equal(seededRng(entropyFor(4)).int(1), 0);
  assert.throws(() => seededRng(entropyFor(4)).int(0));
});

test("seeded teams are found by database id across historical spellings, or the draw fails safely", () => {
  assert.equal(normalizeTeamName("4S 11"), normalizeTeamName("4s-11 (2004–2011)"));
  assert.equal(normalizeTeamName("Jnv Junglees"), normalizeTeamName("JNV Junglees"));
  assert.notEqual(normalizeTeamName("Royal Challengers Balehonnur"), normalizeTeamName("RCB United"));

  const spelled: RosterTeam[] = roster.map((team) => {
    const alt: Record<string, string> = {
      "4s-11": "4S 11 (2004–2011)",
      "RCB United": "Rcb-United",
      "JNV Junglees": "Jnv Junglees",
      "Balehonnur Bulls": "Balehonnur Bulls (2005–12)",
    };
    return { ...team, name: alt[team.name] ?? team.name };
  });
  const seeds = resolveSeeds(spelled);
  assert.equal(seeds.championId, idOf("4s-11"));
  assert.equal(seeds.runnerUpId, idOf("RCB United"));
  assert.deepEqual([...seeds.semifinalistIds].sort(), [idOf("JNV Junglees"), idOf("Balehonnur Bulls")].sort());
  // The plan carries ids, not names, as identifiers.
  const plan = generatePlan({ roster: spelled, days: DAYS, entropy: entropyFor(1) });
  assert.equal(plan.seeds.championId, idOf("4s-11"));

  const missing = roster.filter((team) => team.name !== "JNV Junglees");
  assert.throws(() => resolveSeeds(missing), (error: { code?: string }) => error.code === "roster_count");
  const renamed = roster.map((team) => (team.name === "JNV Junglees" ? { ...team, name: "Junglees Cricket Club of Somewhere" } : team));
  assert.throws(() => resolveSeeds(renamed), (error: { code?: string }) => error.code === "seed_missing");
  assert.throws(() => generatePlan({ roster: renamed, days: DAYS }), (error: { code?: string }) => error.code === "seed_missing");

  const duplicated = roster.map((team) => (team.name === "Champions-11" ? { ...team, name: "RCB United" } : team));
  assert.throws(() => resolveSeeds(duplicated), (error: { code?: string }) => error.code === "seed_ambiguous");
  // Two "4s-11" teams: the 2025 batch picks the right one; identical batches stay ambiguous.
  const twins: RosterTeam[] = roster.map((team) =>
    team.name === "GTR" ? { ...team, name: "4s-11", batchAdmissionYear: 2012, batchLeavingYear: 2019 } : team.name === "4s-11" ? { ...team, batchAdmissionYear: 2004, batchLeavingYear: 2011 } : team,
  );
  assert.equal(resolveSeeds(twins).championId, idOf("4s-11"));
  const sameBatch = roster.map((team) =>
    team.name === "GTR"
      ? { ...team, name: "4s-11", batchAdmissionYear: 2004, batchLeavingYear: 2011 }
      : team.name === "4s-11"
        ? { ...team, batchAdmissionYear: 2004, batchLeavingYear: 2011 }
        : team,
  );
  assert.throws(() => resolveSeeds(sameBatch), (error: { code?: string }) => error.code === "seed_ambiguous");
});

test("a roster other than 18 teams is refused before anything is drawn", () => {
  for (const count of [0, 1, 17, 19, 20]) {
    const extra = Array.from({ length: count }, (_, i) => roster[i % roster.length] as RosterTeam).map((team, i) => ({ ...team, id: `x-${i}`, name: i < 4 ? team.name : `Extra ${i}` }));
    assert.throws(() => generatePlan({ roster: extra, days: DAYS }), (error: { code?: string }) => ["roster_count", "roster_invalid"].includes(error.code ?? ""), `count ${count}`);
  }
  const doubled = [...roster.slice(0, 17), roster[0] as RosterTeam];
  assert.throws(() => generatePlan({ roster: doubled, days: DAYS }), (error: { code?: string }) => error.code === "roster_invalid");
});

test("saturday teams get real recovery time, and sunday leaves a ground free in the last slot", () => {
  for (let n = 0; n < 200; n += 1) {
    const plan = generatePlan({ roster, days: DAYS, entropy: entropyFor(50_000 + n) });
    assert.ok(validatePlan(plan).minLeagueRestMinutes >= 100, `draw ${n}: at least two slots between a team's Saturday matches`);
    assert.ok(plan.notes.some((note) => note.includes("qualification window")));
  }
});

test("net run rate counts all-out innings at the full quota and ignores no results", () => {
  const A = "a";
  const B = "b";
  const m1: MatchScore = {
    fixtureId: "f1", teamAId: A, teamBId: B, outcome: "win", firstBats: "a", maxBalls: 36,
    first: { runs: 60, wickets: 3, balls: 36, allOut: false },
    second: { runs: 50, wickets: 6, balls: 36, allOut: false },
  };
  // B bats first and is bowled out for 40 in 26 balls; A chases 41 in 18 balls.
  const m2: MatchScore = {
    fixtureId: "f2", teamAId: A, teamBId: B, outcome: "win", firstBats: "b", maxBalls: 36,
    first: { runs: 40, wickets: 10, balls: 26, allOut: true },
    second: { runs: 41, wickets: 1, balls: 18, allOut: false },
  };
  const nr: MatchScore = { ...m1, fixtureId: "f3", outcome: "no_result" };
  const rows = computeRows([{ teamId: A, group: "A" }, { teamId: B, group: "A" }], [m1, m2, nr]);
  const a = rows.get(A) as StandingRow;
  const b = rows.get(B) as StandingRow;
  assert.equal(a.runsFor, 101);
  assert.equal(a.ballsFor, 36 + 18);
  assert.equal(a.runsAgainst, 90);
  assert.equal(a.ballsAgainst, 36 + 36, "the dismissed side counts as having faced all 6 overs");
  assert.ok(Math.abs(a.nrr - ((101 * 6) / 54 - (90 * 6) / 72)) < 1e-9);
  assert.equal(formatNrr(a.nrr), "+3.722");
  assert.ok(Math.abs(a.nrr + b.nrr) < 1e-9, "two-team NRRs mirror each other");
  assert.equal(a.points, 2 * POINTS.win + POINTS.noResult);
  assert.equal(b.points, POINTS.noResult);
  assert.equal(a.noResult, 1);
  assert.equal(a.played, 3);
  assert.equal(matchWinner(m2), "a");

  const tie: MatchScore = { ...m1, fixtureId: "f4", outcome: "tie", second: { runs: 60, wickets: 4, balls: 36, allOut: false } };
  const tied = computeRows([{ teamId: A, group: "A" }, { teamId: B, group: "A" }], [tie]);
  assert.equal(tied.get(A)?.points, POINTS.tie);
  assert.equal(tied.get(B)?.points, POINTS.tie);
  assert.equal(tied.get(A)?.nrr, 0);
  assert.equal(formatNrr(0), "0.000");
  assert.equal(formatNrr(-1.23456), "-1.235");
});

test("score entry rejects impossible innings and parses overs as balls", () => {
  assert.equal(parseOvers("5.3"), 33);
  assert.equal(parseOvers("6"), 36);
  assert.equal(parseOvers("5.6"), null);
  assert.equal(parseOvers("x"), null);
  const base = { outcome: "win" as const, firstBats: "a" as const, maxBalls: 36 };
  assert.deepEqual(validateScore({ ...base, first: { runs: 50, wickets: 3, balls: 36, allOut: false }, second: { runs: 40, wickets: 5, balls: 36, allOut: false } }), []);
  assert.deepEqual(validateScore({ ...base, first: { runs: 50, wickets: 3, balls: 36, allOut: false }, second: { runs: 51, wickets: 2, balls: 20, allOut: false } }), [], "a chase can end early");
  assert.ok(validateScore({ ...base, first: { runs: 50, wickets: 3, balls: 30, allOut: false }, second: { runs: 40, wickets: 5, balls: 36, allOut: false } }).length > 0, "short first innings without an all out");
  assert.ok(validateScore({ ...base, first: { runs: 50, wickets: 3, balls: 40, allOut: false }, second: { runs: 40, wickets: 5, balls: 36, allOut: false } }).length > 0, "too many balls");
  assert.ok(validateScore({ ...base, outcome: "tie", first: { runs: 50, wickets: 3, balls: 36, allOut: false }, second: { runs: 40, wickets: 5, balls: 36, allOut: false } }).length > 0);
  assert.ok(validateScore({ ...base, outcome: "win", first: { runs: 50, wickets: 3, balls: 36, allOut: false }, second: { runs: 50, wickets: 5, balls: 36, allOut: false } }).length > 0);
  assert.deepEqual(validateScore({ ...base, outcome: "no_result", first: { runs: 0, wickets: 0, balls: 0, allOut: false }, second: { runs: 0, wickets: 0, balls: 0, allOut: false } }), []);
});

function levelRow(teamId: string, group: GroupCode, overrides: Partial<StandingRow> = {}): StandingRow {
  return { teamId, group, played: 3, won: 1, lost: 2, tied: 0, noResult: 0, points: 2, runsFor: 100, ballsFor: 108, runsAgainst: 100, ballsAgainst: 108, nrr: 0, rank: 0, tied_unresolved: false, ...overrides };
}

test("teams level on every published criterion are flagged for the organizers, never picked silently", () => {
  const rows = [levelRow("t1", "A", { points: 6, won: 3, nrr: 1 }), levelRow("t2", "A"), levelRow("t3", "A"), levelRow("t4", "A", { points: 0, won: 0 })];
  const table = rankRows(rows, [], "group:A", [], 3);
  assert.equal(table.rows[0]?.teamId, "t1");
  assert.equal(table.ties.length, 1);
  assert.deepEqual([...(table.ties[0]?.teamIds ?? [])].sort(), ["t2", "t3"]);
  assert.equal(table.ties[0]?.blocking, true);
  assert.ok(table.rows.filter((row) => row.tied_unresolved).length === 2);

  const decided = rankRows(
    [levelRow("t1", "A", { points: 6, won: 3, nrr: 1 }), levelRow("t2", "A"), levelRow("t3", "A"), levelRow("t4", "A", { points: 0, won: 0 })],
    [],
    "group:A",
    [{ scope: "group:A", order: ["t3", "t2"] }],
    3,
  );
  assert.deepEqual(decided.rows.map((row) => row.teamId), ["t1", "t3", "t2", "t4"]);
  assert.equal(decided.ties.length, 0);

  // NRR separates teams that are level on points; head-to-head only settles exactly two level teams that met.
  const byNrr = rankRows([levelRow("x", "A", { nrr: 0.5 }), levelRow("y", "A", { nrr: 1.5 })], [], "group:A");
  assert.equal(byNrr.rows[0]?.teamId, "y");
  const met: MatchScore = { fixtureId: "h", teamAId: "p", teamBId: "q", outcome: "win", firstBats: "a", maxBalls: 36, first: { runs: 30, wickets: 1, balls: 36, allOut: false }, second: { runs: 20, wickets: 4, balls: 36, allOut: false } };
  const h2h = rankRows([levelRow("q", "A"), levelRow("p", "A")], [met], "group:A");
  assert.equal(h2h.rows[0]?.teamId, "p");
  assert.equal(h2h.ties.length, 0);
});

test("qualification takes the top two per group plus the two best third-placed teams", () => {
  const plan = generatePlan({ roster, days: DAYS, entropy: entropyFor(3) });
  const teams = plan.result.assignments.map((a) => ({ teamId: a.teamId, group: a.group }));
  const league = plan.matches.filter((m) => m.stage === "league");
  // Pool 1 teams always win by a margin that depends on group, so tables are decisive and differ across groups.
  const scores: MatchScore[] = league.map((m, index) => ({
    fixtureId: m.code,
    teamAId: m.teamA.teamId as string,
    teamBId: m.teamB.teamId as string,
    outcome: "win",
    firstBats: "a",
    maxBalls: 36,
    first: { runs: 40 + (index % 7) * 3 + (m.group === "A" ? 5 : m.group === "B" ? 2 : 0), wickets: 3, balls: 36, allOut: false },
    second: { runs: 20 + (index % 5), wickets: 6, balls: 36, allOut: false },
  }));
  const partial = computeQualification(teams, scores.slice(0, 10));
  assert.equal(partial.leagueComplete, false);
  assert.equal(partial.qualifiers, null);

  const done = computeQualification(teams, scores);
  assert.equal(done.leagueMatchesPlayed, LEAGUE_MATCHES);
  assert.equal(done.leagueComplete, true);
  assert.ok(done.qualifiers, `qualifiers should be decided: ${done.blockers.join("; ")}`);
  assert.equal(done.qualifiers.length, 8);
  assert.equal(new Set(done.qualifiers.map((q) => q.teamId)).size, 8);
  assert.deepEqual(done.qualifiers.map((q) => q.seed), [1, 2, 3, 4, 5, 6, 7, 8]);
  for (const group of ["A", "B", "C"] as const) {
    const table = done.groups[group].rows;
    assert.equal(table.length, 6);
    assert.ok(done.qualifiers.some((q) => q.teamId === table[0]?.teamId && q.seed <= 3), `${group} winner is seed 1-3`);
    assert.ok(done.qualifiers.some((q) => q.teamId === table[1]?.teamId && q.seed >= 4 && q.seed <= 6), `${group} runner-up is seed 4-6`);
  }
  assert.equal(done.wildcards.rows.filter((w) => w.status === "wildcard").length, 2);
  assert.equal(done.qualifiers.filter((q) => q.seed >= 7).length, 2);
});

test("quarterfinal pairings follow the seeds and avoid same-group rematches whenever that is possible", () => {
  const groups: GroupCode[] = ["A", "B", "C"];
  const permutations = <T,>(items: T[]): T[][] => (items.length <= 1 ? [items] : items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest])));
  let cases = 0;
  for (const winners of permutations(groups)) {
    for (const runners of permutations(groups)) {
      for (const thirds of permutations(groups).map((p) => p.slice(0, 2))) {
        const qualifiers: Qualifier[] = [
          ...winners.map((group, i) => ({ teamId: `W${group}`, group, seed: 1 + i })),
          ...runners.map((group, i) => ({ teamId: `R${group}`, group, seed: 4 + i })),
          ...thirds.map((group, i) => ({ teamId: `T${group}`, group, seed: 7 + i })),
        ];
        const pairs = pairQuarterfinals(qualifiers);
        assert.equal(pairs.length, 4);
        assert.equal(new Set(pairs.flatMap((p) => [p.teamAId, p.teamBId])).size, 8, "every qualifier appears once");
        assert.equal(pairs.filter((p) => p.sameGroup).length, 0, `no same-group quarterfinal for ${winners}/${runners}/${thirds}`);
        cases += 1;
      }
    }
  }
  assert.equal(cases, 216);
  // With no clash, the standard bracket is untouched: 1v8, 4v5, 2v7, 3v6.
  const clean: Qualifier[] = [
    { teamId: "s1", group: "A", seed: 1 }, { teamId: "s2", group: "B", seed: 2 }, { teamId: "s3", group: "C", seed: 3 },
    { teamId: "s4", group: "B", seed: 4 }, { teamId: "s5", group: "C", seed: 5 }, { teamId: "s6", group: "A", seed: 6 },
    { teamId: "s7", group: "C", seed: 7 }, { teamId: "s8", group: "B", seed: 8 },
  ];
  const standard = pairQuarterfinals(clean);
  assert.deepEqual(
    standard.map((p) => [p.teamAId, p.teamBId]),
    QF_PAIRINGS.map((p) => [`s${p.seeds[0]}`, `s${p.seeds[1]}`]),
  );
  assert.equal(standard.some((p) => p.sameGroup), false);
});

test("the reveal timeline covers all 18 teams in order, can be joined part-way, and has a reduced-motion form", () => {
  const plan = generatePlan({ roster, days: DAYS, entropy: entropyFor(11) });
  const normal = buildTimeline(plan);
  const places = normal.beats.filter((beat) => beat.kind === "place");
  assert.equal(places.length, 18);
  assert.deepEqual(places.map((beat) => (beat.kind === "place" ? beat.step.teamId : "")), plan.result.reveal.map((step) => step.teamId));
  assert.deepEqual(normal.beats.slice(0, 3).map((beat) => beat.kind), ["countdown", "opening", "seeds-intro"]);
  assert.equal(normal.beats.at(-1)?.kind, "done");
  // Beats are contiguous, so every device that shares a start time agrees on what is on screen.
  let cursor = 0;
  for (const beat of normal.beats) {
    assert.equal(beat.at, cursor);
    cursor += beat.dur;
  }
  assert.equal(cursor, normal.total);
  // The four seeded teams come before the random draw, each place beat leaves time for the flight.
  assert.ok(places.slice(0, 4).every((beat) => beat.kind === "place" && beat.step.phase === "seed"));
  assert.ok(places.every((beat) => beat.kind === "place" && beat.dur >= beat.revealMs + beat.flyMs));

  // Joining late: the beat at any elapsed time is the one that contains it, and earlier teams are already seated.
  const middle = (places[9] as (typeof places)[number]).at + 10;
  const index = beatIndexAt(normal, middle);
  assert.equal(normal.beats[index]?.kind, "place");
  assert.equal(placedBefore(normal, index).length, 9);
  assert.equal(beatIndexAt(normal, -5000), 0);
  assert.equal(beatIndexAt(normal, normal.total + 99_999), normal.beats.length - 1);

  const reduced = buildTimeline(plan, { reduced: true });
  assert.ok(reduced.total < normal.total / 2);
  assert.ok(reduced.beats.filter((beat) => beat.kind === "place").every((beat) => beat.kind === "place" && beat.flyMs === 0));
  assert.equal(buildTimeline(plan, { countdown: false }).beats[0]?.kind, "opening");
  assert.ok(buildTimeline(plan, { speed: 2 }).total < normal.total * 0.6);
});
