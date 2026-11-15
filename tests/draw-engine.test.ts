import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { pairQuarterfinals, QF_PAIRINGS, type Qualifier } from "../lib/draw/bracket";
import {
  DEFAULT_TIMETABLE,
  LEAGUE_MATCHES,
  OPPONENT_TEMPLATE,
  POINTS,
  SATURDAY_TEMPLATE,
  SUNDAY_TEMPLATE,
  TEAM_COUNT,
} from "../lib/draw/config";
import { groundShareCounts, groundShareText, positionGroundSplit, teamGroundSplit } from "../lib/draw/grounds";
import { generatePlan, planHash, verifyPlan } from "../lib/draw/plan";
import { seededRng } from "../lib/draw/rng";
import { applyTimetable, leagueSlotStarts, opponentsOfPosition, templatePairs, timeSlots } from "../lib/draw/schedule";
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
import type { DrawPlan, GroupCode } from "../lib/draw/types";
import { checkSchedule, timedMatches, validatePlan, validateTemplates } from "../lib/draw/validate";
import { DAYS, TEAM_NAMES } from "./helpers/roster";

const roster: RosterTeam[] = TEAM_NAMES.map((name, index) => ({ id: `team-${String(index).padStart(2, "0")}`, name }));
const idOf = (name: string) => (roster.find((team) => team.name === name) as RosterTeam).id;
const entropyFor = (n: number) => createHash("sha256").update(`ncl-test-${n}`).digest("hex");
const SEED_IDS = () => [idOf("4s-11"), idOf("RCB United"), idOf("JNV Junglees"), idOf("Balehonnur Bulls")];
const pairKey = (a: string, b: string) => [a, b].sort().join("|");

/** The opponent pattern exactly as the organizers wrote it down from the 2025 spreadsheet. */
const SPEC_A: Record<string, string[]> = {
  A1: ["A2", "A5", "A6"],
  A2: ["A1", "A3", "A7"],
  A3: ["A2", "A4", "A8"],
  A4: ["A3", "A5", "A9"],
  A5: ["A1", "A4", "A6"],
  A6: ["A1", "A5", "A7"],
  A7: ["A2", "A6", "A8"],
  A8: ["A3", "A7", "A9"],
  A9: ["A4", "A8", "BYE"],
};
const SPEC_B: Record<string, string[]> = {
  B1: ["B2", "B6", "B10"],
  B2: ["B1", "B3", "B7"],
  B3: ["B2", "B4", "B8"],
  B4: ["B3", "B5", "B9"],
  B5: ["B4", "B6", "B10"],
  B6: ["B1", "B5", "B7"],
  B7: ["B2", "B6", "B8"],
  B8: ["B3", "B7", "B9"],
  B9: ["B4", "B8", "B10"],
  B10: ["B1", "B5", "B9"],
};

test("the opponent templates are exactly the NCL 2025 pattern, and are internally consistent", () => {
  assert.deepEqual(OPPONENT_TEMPLATE.A, SPEC_A);
  assert.deepEqual(OPPONENT_TEMPLATE.B, SPEC_B);
  assert.deepEqual(validateTemplates(), []);
  const pairs = templatePairs();
  assert.equal(pairs.filter((p) => p.group === "A").length, 13, "13 Group A matches");
  assert.equal(pairs.filter((p) => p.group === "B").length, 15, "15 Group B matches");
  assert.equal(new Set(pairs.map((p) => pairKey(p.a, p.b))).size, 28, "each pairing is generated once even though both teams list it");
  for (const position of [...Object.keys(SPEC_A), ...Object.keys(SPEC_B)]) assert.equal(opponentsOfPosition(position).length, 3, `${position} has three entries`);
  const byes = Object.entries({ ...SPEC_A, ...SPEC_B }).filter(([, list]) => list.includes("BYE"));
  assert.deepEqual(byes.map(([position]) => position), ["A9"], "exactly one BYE, at A9");
  // Group B is circular: each team meets its two neighbours and the team five positions away.
  for (let i = 1; i <= 10; i += 1) {
    const next = (i % 10) + 1;
    const prev = ((i + 8) % 10) + 1;
    const across = ((i + 4) % 10) + 1;
    const wanted = new Set([`B${next}`, `B${prev}`, `B${across}`]);
    // B1 meets B2, B6, B10: the two ring neighbours are B2 and B10 and the opposite is B6, but B4 to B9 and B5 to B10 follow the printed pattern.
    if ([1, 2, 3, 6, 7, 8].includes(i)) assert.deepEqual(new Set(SPEC_B[`B${i}`]), wanted, `B${i} follows the ring`);
  }
});

test("the two-day order of play is the NCL 2025 order, with the break and times as asked", () => {
  const saturday = SATURDAY_TEMPLATE.map((row) => row.map((pair) => pair.join(" v ")));
  // [Ground A, Ground B] in each slot. The fifth, sixth and tenth slots swap grounds compared with 2025, to share Ground A out.
  assert.deepEqual(saturday, [
    ["A1 v A2", "B3 v B8"],
    ["A6 v A7", "B4 v B9"],
    ["B2 v B7", "B10 v B1"],
    ["A3 v A4", "A1 v A6"],
    ["B1 v B6", "B4 v B5"],
    ["B9 v B10", "A3 v A8"],
    ["B3 v B4", "A4 v A9"],
    ["A5 v A6", "A2 v A7"],
    ["B8 v B9", "B6 v B7"],
    ["A8 v A9", "B2 v B3"],
  ]);
  const ncl2025 = [
    ["A1 v A2", "B3 v B8"],
    ["A6 v A7", "B4 v B9"],
    ["B2 v B7", "B10 v B1"],
    ["A3 v A4", "A1 v A6"],
    ["B4 v B5", "B1 v B6"],
    ["A3 v A8", "B9 v B10"],
    ["B3 v B4", "A4 v A9"],
    ["A5 v A6", "A2 v A7"],
    ["B8 v B9", "B6 v B7"],
    ["B2 v B3", "A8 v A9"],
  ];
  assert.deepEqual(
    saturday.map((row) => [...row].sort()),
    ncl2025.map((row) => [...row].sort()),
    "the same matches in the same slots as 2025: only the ground changed",
  );
  assert.deepEqual(
    SUNDAY_TEMPLATE.map((row) => row.map((pair) => pair.join(" v "))),
    [
      ["B5 v B10", "A4 v A5"],
      ["A2 v A3", "B7 v B8"],
      ["B5 v B6", "B1 v B2"],
      ["A7 v A8", "A1 v A5"],
    ],
  );
  const clock = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  assert.deepEqual(leagueSlotStarts(1, DEFAULT_TIMETABLE).map(clock), ["7:00", "7:55", "8:50", "9:45", "10:40", "12:00", "12:55", "13:50", "14:45", "15:40"], "the inauguration covers 11:35 to 12:00 and play resumes at noon");
  assert.deepEqual(leagueSlotStarts(2, DEFAULT_TIMETABLE).map(clock), ["7:00", "7:55", "8:50", "9:45"]);
  const slots = timeSlots();
  assert.equal(slots.filter((s) => s.stage === "league" && s.day === 1).length, 20);
  assert.equal(slots.filter((s) => s.stage === "league" && s.day === 2).length, 8);
  const sunday = Object.fromEntries(slots.filter((s) => s.stage !== "league").map((s) => [s.code, `${clock(s.startMinutes)} ${s.ground} ${s.durationMinutes}m`]));
  assert.deepEqual(sunday, {
    QF1: "11:15 A 75m",
    QF2: "11:15 B 75m",
    QF3: "12:30 A 75m",
    QF4: "12:30 B 75m",
    SF1: "14:15 A 75m",
    SF2: "14:15 B 75m",
    F: "16:00 A 75m",
  });
});

/** Deliberately independent of lib/draw/validate.ts: these are the promises the organizers asked for. */
function assertPlanPromises(plan: DrawPlan, label: string) {
  const at = (id: string) => plan.result.assignments.find((a) => a.teamId === id);
  const league = plan.matches.filter((m) => m.stage === "league");
  const ids = plan.roster.map((team) => team.id);
  const [champion, runnerUp, semiOne, semiTwo] = [at(idOf("4s-11")), at(idOf("RCB United")), at(idOf("JNV Junglees")), at(idOf("Balehonnur Bulls"))];

  assert.equal(plan.roster.length, 19, `${label}: 19 teams`);
  assert.deepEqual([...plan.result.assignments.map((a) => a.teamId)].sort(), [...ids].sort(), `${label}: each team once`);
  assert.equal(plan.result.assignments.filter((a) => a.group === "A").length, 9, `${label}: nine in Group A`);
  assert.equal(plan.result.assignments.filter((a) => a.group === "B").length, 10, `${label}: ten in Group B`);

  // seeds
  assert.notEqual(champion?.group, runnerUp?.group, `${label}: champion and runner-up in different groups`);
  for (const seed of [champion, runnerUp, semiOne, semiTwo]) assert.ok(!(seed?.group === "A" && seed.slot === 9), `${label}: no seed at A9`);
  assert.notEqual(semiOne?.group, semiTwo?.group, `${label}: one losing semifinalist per group`);
  assert.equal([champion, runnerUp, semiOne, semiTwo].filter((a) => a?.group === "A").length, 2);
  assert.equal([champion, runnerUp, semiOne, semiTwo].filter((a) => a?.group === "B").length, 2);

  // BYE
  const byeHolder = plan.result.assignments.find((a) => a.group === "A" && a.slot === 9);
  assert.ok(byeHolder, `${label}: A9 is filled`);
  assert.ok(!SEED_IDS().includes(byeHolder?.teamId as string), `${label}: A9 is not a seeded team`);
  assert.equal(plan.bye.teamId, byeHolder?.teamId);

  // league
  assert.equal(league.length, 28);
  assert.equal(league.filter((m) => m.group === "A").length, 13);
  assert.equal(league.filter((m) => m.group === "B").length, 15);
  const seen = new Set<string>();
  const count = new Map<string, number>();
  for (const m of league) {
    const a = at(m.teamA.teamId as string);
    const b = at(m.teamB.teamId as string);
    assert.ok(a && b && a.teamId !== b.teamId, `${label}: ${m.code} is between two different teams`);
    assert.equal(a?.group, b?.group, `${label}: ${m.code} stays in one group`);
    const key = pairKey(a?.teamId as string, b?.teamId as string);
    assert.ok(!seen.has(key), `${label}: no duplicate pairing`);
    seen.add(key);
    for (const id of [a?.teamId, b?.teamId]) count.set(id as string, (count.get(id as string) ?? 0) + 1);
  }
  for (const id of ids) {
    const matches = count.get(id) ?? 0;
    assert.equal(matches + (id === plan.bye.teamId ? 1 : 0), 3, `${label}: three league entries`);
    assert.equal(matches, id === plan.bye.teamId ? 2 : 3, `${label}: only the BYE team has two matches`);
  }
  assert.equal(league.filter((m) => m.day === 1).length, 20);
  assert.equal(league.filter((m) => m.day === 2).length, 8);

  // opening match
  assert.equal(league[0]?.number, 1);
  assert.equal(league[0]?.teamA.slot, "A1");
  assert.equal(league[0]?.teamB.slot, "A2");
  assert.equal(league[0]?.teamB.teamId, plan.result.openingOpponentId);
  assert.equal(league[0]?.startMinutes, 7 * 60);
  assert.equal(league[0]?.ground, "A");

  // knockouts and totals
  assert.equal(plan.matches.filter((m) => m.stage === "quarterfinal").length, 4);
  assert.equal(plan.matches.filter((m) => m.stage === "semifinal").length, 2);
  assert.equal(plan.matches.filter((m) => m.stage === "final").length, 1);
  assert.equal(plan.matches.length + 1, 36, `${label}: 36 fixture entries including the BYE`);
  assert.equal(plan.matches.length, 35);
  for (const m of plan.matches) {
    assert.equal(m.overs, m.stage === "league" ? 6 : 8, `${m.code} overs: only league matches are 6 overs`);
    if (m.stage !== "league") assert.ok(m.teamA.placeholder && m.teamB.placeholder && !m.teamA.teamId && !m.teamB.teamId, `${m.code} holds placeholders`);
  }

  // no team in two places at once, no ground double-booked
  const spans = plan.matches.map((m) => ({ m, s: m.startMinutes + (m.day - 1) * 1440, e: m.startMinutes + (m.day - 1) * 1440 + m.durationMinutes }));
  for (let i = 0; i < spans.length; i += 1) {
    for (let j = i + 1; j < spans.length; j += 1) {
      const x = spans[i] as (typeof spans)[number];
      const y = spans[j] as (typeof spans)[number];
      if (!(x.s < y.e && y.s < x.e)) continue;
      assert.notEqual(x.m.ground, y.m.ground, `${label}: ${x.m.code} and ${y.m.code} share a ground at the same time`);
      const xs = [x.m.teamA.teamId, x.m.teamB.teamId];
      const ys = [y.m.teamA.teamId, y.m.teamB.teamId];
      assert.ok(!xs.some((t) => t && ys.includes(t)), `${label}: a team plays ${x.m.code} and ${y.m.code} at once`);
    }
  }
  assert.deepEqual(validatePlan(plan).errors, [], `${label}: the engine's own validation agrees`);
}

test("Ground A is shared out: every team plays a league match on each ground, and the draw decides who gets two on A", () => {
  const split = positionGroundSplit();
  assert.equal(split.size, 19);
  for (const [position, entry] of split) {
    if (position === "A9") assert.deepEqual(entry, { A: 1, B: 1 }, "the BYE position plays one match on each ground");
    else {
      assert.equal(entry.A + entry.B, 3, position);
      assert.ok(entry.A >= 1 && entry.B >= 1, `${position} plays on both grounds`);
    }
  }
  assert.deepEqual(groundShareCounts(), { twoOnA: 9, twoOnB: 9 });
  assert.match(groundShareText(), /9 teams play two of their three on Ground A and 9 play two on Ground B/);
  assert.equal(
    [...SATURDAY_TEMPLATE, ...SUNDAY_TEMPLATE].length * 2,
    28,
    "one match on each ground in every slot: both grounds are equally busy",
  );

  const twoOnA = new Map<string, number>();
  const draws = 400;
  for (let n = 0; n < draws; n += 1) {
    const plan = generatePlan({ roster, days: DAYS, entropy: entropyFor(5000 + n) });
    const grounds = teamGroundSplit(plan.matches.map((m) => ({ stage: m.stage, ground: m.ground, teamIds: [m.teamA.teamId, m.teamB.teamId] })));
    let teamsWithTwoOnA = 0;
    for (const team of roster) {
      const entry = grounds.get(team.id) ?? { A: 0, B: 0 };
      assert.ok(entry.A >= 1 && entry.B >= 1, `draw ${n}: ${team.name} plays on both grounds`);
      if (team.id === plan.result.byeTeamId) assert.deepEqual(entry, { A: 1, B: 1 });
      if (entry.A === 2) {
        teamsWithTwoOnA += 1;
        twoOnA.set(team.id, (twoOnA.get(team.id) ?? 0) + 1);
      }
    }
    assert.equal(teamsWithTwoOnA, 9);
  }
  // Which teams get two on Ground A is drawn, for the champion as for everyone else.
  for (const team of roster) {
    const times = twoOnA.get(team.id) ?? 0;
    assert.ok(times > 0 && times < draws, `${team.name} gets two on Ground A in some draws and not in others (${times}/${draws})`);
  }

  // An organizer may move a match to the other ground; the change is allowed, but noted when it leaves a team on one ground.
  const plan = generatePlan({ roster, days: DAYS, entropy: entropyFor(12) });
  const base = timedMatches(plan.matches);
  assert.ok(!checkSchedule(base).notes.some((note) => note.includes("same ground")));
  const shares = teamGroundSplit(base.map((m) => ({ stage: m.stage, ground: m.ground, teamIds: m.teams })));
  const target = [...shares].find(([, share]) => share.A === 1)?.[0];
  const moveAway = base.find((m) => m.stage === "league" && m.ground === "A" && target && m.teams.includes(target));
  assert.ok(moveAway, "a team with one match on Ground A");
  const swapped = base.map((m) => {
    if (m.code === moveAway.code) return { ...m, ground: "B" as const };
    if (m.date === moveAway.date && m.startMinutes === moveAway.startMinutes && m.code !== moveAway.code) return { ...m, ground: "A" as const };
    return m;
  });
  const report = checkSchedule(swapped);
  assert.deepEqual(report.errors, []);
  assert.ok(report.notes.some((note) => /every league match on the same ground/.test(note)));
});

test("2000 randomized draws all keep every seeded, fixture, BYE and schedule promise", () => {
  for (let n = 0; n < 2000; n += 1) assertPlanPromises(generatePlan({ roster, days: DAYS, entropy: entropyFor(n) }), `draw ${n}`);
});

test("seeded teams are placed by construction, A9 is a fair draw among the 15 unseeded teams, and the randomness is real", () => {
  const draws = 6000;
  const byeCount = new Map<string, number>();
  const runnerAt = new Map<string, number>();
  const championAt = new Map<string, number>();
  let championInA = 0;
  let semiInA = 0;
  const places = new Map<string, Set<string>>();
  for (let n = 0; n < draws; n += 1) {
    const plan = generatePlan({ roster, days: DAYS, entropy: entropyFor(100_000 + n) });
    byeCount.set(plan.bye.teamId, (byeCount.get(plan.bye.teamId) ?? 0) + 1);
    const runner = plan.result.assignments.find((a) => a.teamId === idOf("RCB United"));
    const champ = plan.result.assignments.find((a) => a.teamId === idOf("4s-11"));
    runnerAt.set(`${runner?.group}${runner?.slot}`, (runnerAt.get(`${runner?.group}${runner?.slot}`) ?? 0) + 1);
    championAt.set(`${champ?.group}${champ?.slot}`, (championAt.get(`${champ?.group}${champ?.slot}`) ?? 0) + 1);
    if (champ?.group === "A") championInA += 1;
    if (plan.result.assignments.find((a) => a.teamId === idOf("JNV Junglees"))?.group === "A") semiInA += 1;
    for (const a of plan.result.assignments) {
      const set = places.get(a.teamId) ?? new Set<string>();
      set.add(`${a.group}${a.slot}`);
      places.set(a.teamId, set);
    }
  }
  const unseeded = roster.filter((team) => !SEED_IDS().includes(team.id));
  assert.equal(unseeded.length, 15);
  for (const team of unseeded) {
    const got = byeCount.get(team.id) ?? 0;
    assert.ok(got > 300 && got < 500, `${team.name} had the BYE ${got} times of ${draws} (expected about 400)`);
  }
  for (const id of SEED_IDS()) assert.equal(byeCount.get(id) ?? 0, 0, "a seeded team never has the BYE");
  // A seed is in either group about half the time, and takes any position of that group (A9 is the BYE's, so A1 to A8).
  for (const [label, counts] of [["the champion", championAt], ["the runner-up", runnerAt]] as const) {
    for (let slot = 1; slot <= 8; slot += 1) assert.ok((counts.get(`A${slot}`) ?? 0) > 250 && (counts.get(`A${slot}`) ?? 0) < 500, `${label} at A${slot}: ${counts.get(`A${slot}`)} of ${draws} (expected about 375)`);
    assert.equal(counts.get("A9") ?? 0, 0, `${label} is never at A9`);
    for (let slot = 1; slot <= 10; slot += 1) assert.ok((counts.get(`B${slot}`) ?? 0) > 200 && (counts.get(`B${slot}`) ?? 0) < 400, `${label} at B${slot}: ${counts.get(`B${slot}`)} of ${draws} (expected about 300)`);
  }
  assert.ok(championInA > 2700 && championInA < 3300, `the champion in Group A ${championInA} of ${draws}`);
  assert.ok(semiInA > 2700 && semiInA < 3300, `JNV Junglees in Group A ${semiInA} of ${draws}`);
  // An unseeded team can end up in many different positions.
  for (const team of unseeded) assert.ok((places.get(team.id)?.size ?? 0) >= 15, `${team.name} landed in many positions`);
});

test("the same entropy replays the same draw, and the saved plan can be verified", () => {
  const plan = generatePlan({ roster, days: DAYS, entropy: entropyFor(7) });
  const again = generatePlan({ roster, days: DAYS, entropy: entropyFor(7) });
  assert.equal(planHash(plan), planHash(again));
  assert.deepEqual(plan.result, again.result);
  const check = verifyPlan(JSON.parse(JSON.stringify(plan)) as DrawPlan, DAYS);
  assert.equal(check.ok, true);
  const other = generatePlan({ roster, days: DAYS, entropy: entropyFor(8) });
  assert.notEqual(planHash(plan), planHash(other));
  const tampered = JSON.parse(JSON.stringify(plan)) as DrawPlan;
  const a = tampered.result.assignments[3] as DrawPlan["result"]["assignments"][number];
  const b = tampered.result.assignments[4] as DrawPlan["result"]["assignments"][number];
  [a.teamId, b.teamId] = [b.teamId, a.teamId];
  assert.equal(verifyPlan(tampered, DAYS).ok, false, "a changed allocation no longer matches the entropy");
  // The reveal is the saved allocation: seeds first, the BYE team last.
  assert.deepEqual(plan.result.reveal.map((s) => s.phase), ["seed", "seed", "seed", "seed", ...Array(14).fill("draw"), "bye"]);
  assert.equal(plan.result.reveal[0]?.teamId, idOf("4s-11"));
  assert.equal(plan.result.reveal.at(-1)?.teamId, plan.bye.teamId);
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
  assert.equal(normalizeTeamName("Jnv junglees"), normalizeTeamName("JNV Junglees"));
  assert.notEqual(normalizeTeamName("Royal Challengers Balehonnur"), normalizeTeamName("RCB United"));

  const spelled: RosterTeam[] = roster.map((team) => {
    const alt: Record<string, string> = {
      "4s-11": "4S 11 (2004–2011)",
      "RCB United": "Rcb-United",
      "JNV Junglees": "Jnv junglees",
      "Balehonnur Bulls": "Balehonnur Bulls (2005–12)",
    };
    return { ...team, name: alt[team.name] ?? team.name };
  });
  const seeds = resolveSeeds(spelled);
  assert.equal(seeds.championId, idOf("4s-11"));
  assert.equal(seeds.runnerUpId, idOf("RCB United"));
  assert.deepEqual([...seeds.semifinalistIds].sort(), [idOf("JNV Junglees"), idOf("Balehonnur Bulls")].sort());
  assert.equal(generatePlan({ roster: spelled, days: DAYS, entropy: entropyFor(1) }).seeds.championId, idOf("4s-11"));

  const renamed = roster.map((team) => (team.name === "JNV Junglees" ? { ...team, name: "Junglees Cricket Club of Somewhere" } : team));
  assert.throws(() => resolveSeeds(renamed), (error: { code?: string }) => error.code === "seed_missing");
  assert.throws(() => generatePlan({ roster: renamed, days: DAYS }), (error: { code?: string }) => error.code === "seed_missing");
  const duplicated = roster.map((team) => (team.name === "Champions-11" ? { ...team, name: "RCB United" } : team));
  assert.throws(() => resolveSeeds(duplicated), (error: { code?: string }) => error.code === "seed_ambiguous");
  const twins: RosterTeam[] = roster.map((team) =>
    team.name === "GTR" ? { ...team, name: "4s-11", batchAdmissionYear: 2012, batchLeavingYear: 2019 } : team.name === "4s-11" ? { ...team, batchAdmissionYear: 2004, batchLeavingYear: 2011 } : team,
  );
  assert.equal(resolveSeeds(twins).championId, idOf("4s-11"));
});

test("exactly 19 approved teams are required, and a bad roster is refused before anything is drawn", () => {
  assert.equal(TEAM_COUNT, 19);
  for (const count of [0, 1, 17, 18, 20, 21]) {
    const base = count <= roster.length ? roster.slice(0, count) : [...roster, ...Array.from({ length: count - roster.length }, (_, i) => ({ id: `x-${i}`, name: `Extra ${i}` }))];
    assert.throws(() => generatePlan({ roster: base, days: DAYS }), (error: { code?: string }) => ["roster_count", "roster_invalid"].includes(error.code ?? ""), `count ${count}`);
  }
  const doubled = [...roster.slice(0, 18), roster[0] as RosterTeam];
  assert.throws(() => generatePlan({ roster: doubled, days: DAYS }), (error: { code?: string }) => error.code === "roster_invalid");
});

test("changing the times never changes who plays whom, and the same rules guard every change", () => {
  const plan = generatePlan({ roster, days: DAYS, entropy: entropyFor(11) });
  const opponents = (matches: DrawPlan["matches"]) => matches.map((m) => `${m.code}:${m.teamA.teamId ?? m.teamA.label}|${m.teamB.teamId ?? m.teamB.label}|${m.ground}`).join(";");
  const later = { ...DEFAULT_TIMETABLE, saturdayStart: 7 * 60 + 30, sundayStart: 7 * 60 + 30, slotMinutes: 55, qf1: 11 * 60 + 45, qf2: 13 * 60, sf: 14 * 60 + 45, final: 16 * 60 + 30 };
  const moved = applyTimetable(plan.matches, DAYS, later);
  assert.equal(opponents(moved), opponents(plan.matches), "opponents, codes and grounds are untouched");
  assert.notEqual(moved[0]?.startMinutes, plan.matches[0]?.startMinutes);
  assert.deepEqual(checkSchedule(timedMatches(moved)).errors, []);
  assert.equal(moved[0]?.teamA.teamId, plan.matches[0]?.teamA.teamId, "the same teams still open");

  const base = timedMatches(plan.matches);
  assert.deepEqual(checkSchedule(base).errors, []);
  // Two matches on one ground at once.
  const clash = base.map((m) => (m.code === "M02" ? { ...m, ground: "A" as const } : m));
  assert.ok(checkSchedule(clash).errors.some((e) => e.includes("double-booked")));
  // A team in two matches at once.
  const m01 = base.find((m) => m.code === "M01");
  const twice = base.map((m) => (m.code === "M08" ? { ...m, startMinutes: (m01?.startMinutes as number) + 10, ground: "B" as const } : m));
  assert.ok(checkSchedule(twice).errors.some((e) => e.includes("overlapping")));
  // Back to back with no rest.
  const tight = base.map((m) => (m.code === "M08" ? { ...m, startMinutes: (m01?.startMinutes as number) + 55, ground: "B" as const } : m));
  assert.ok(checkSchedule(tight).errors.some((e) => e.includes("minutes between")));
  // Daylight.
  const dark = applyTimetable(plan.matches, DAYS, { ...DEFAULT_TIMETABLE, saturdayStart: 9 * 60 });
  assert.ok(checkSchedule(timedMatches(dark)).errors.some((e) => e.includes("daylight")));
  // The qualification window and knockout order.
  const early = applyTimetable(plan.matches, DAYS, { ...DEFAULT_TIMETABLE, qf1: 10 * 60 + 50 });
  assert.ok(checkSchedule(timedMatches(early)).errors.some((e) => e.includes("last league match")));
  const crowded = applyTimetable(plan.matches, DAYS, { ...DEFAULT_TIMETABLE, sf: 12 * 60 + 40 });
  assert.ok(checkSchedule(timedMatches(crowded)).errors.length > 0);
});

function score(teamAId: string, teamBId: string, winner: "a" | "b" | "tie" | "nr", fixtureId = `${teamAId}-${teamBId}`): MatchScore {
  const inn = (runs: number) => ({ runs, wickets: 3, balls: 36, allOut: false });
  if (winner === "nr") return { fixtureId, teamAId, teamBId, outcome: "no_result", firstBats: "a", maxBalls: 36, first: inn(0), second: inn(0) };
  if (winner === "tie") return { fixtureId, teamAId, teamBId, outcome: "tie", firstBats: "a", maxBalls: 36, first: inn(40), second: inn(40) };
  return { fixtureId, teamAId, teamBId, outcome: "win", firstBats: "a", maxBalls: 36, first: inn(winner === "a" ? 50 : 40), second: inn(winner === "a" ? 40 : 50) };
}

test("net run rate counts all-out innings at the full quota and ignores no results", () => {
  const A = "a";
  const B = "b";
  const m1: MatchScore = { fixtureId: "f1", teamAId: A, teamBId: B, outcome: "win", firstBats: "a", maxBalls: 36, first: { runs: 60, wickets: 3, balls: 36, allOut: false }, second: { runs: 50, wickets: 6, balls: 36, allOut: false } };
  const m2: MatchScore = { fixtureId: "f2", teamAId: A, teamBId: B, outcome: "win", firstBats: "b", maxBalls: 36, first: { runs: 40, wickets: 10, balls: 26, allOut: true }, second: { runs: 41, wickets: 1, balls: 18, allOut: false } };
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
  assert.ok(Math.abs(a.nrr + b.nrr) < 1e-9);
  assert.equal(a.points, 2 * POINTS.win + POINTS.noResult);
  assert.equal(b.points, POINTS.noResult);
  assert.equal(a.played, 3);
  assert.equal(matchWinner(m2), "a");
  const tied = computeRows([{ teamId: A, group: "A" }, { teamId: B, group: "A" }], [{ ...m1, fixtureId: "f4", outcome: "tie", second: { runs: 60, wickets: 4, balls: 36, allOut: false } }]);
  assert.equal(tied.get(A)?.points, POINTS.tie);
  assert.equal(formatNrr(0), "0.000");
  assert.equal(formatNrr(-1.23456), "-1.235");
});

test("a BYE is worth 2 points but is not a match: no played, runs, balls or net run rate", () => {
  const rows = computeRows([{ teamId: "x", group: "A" }, { teamId: "y", group: "A" }], [score("x", "y", "a")], ["x"]);
  const x = rows.get("x") as StandingRow;
  assert.equal(x.points, POINTS.win + POINTS.bye);
  assert.equal(x.played, 1, "the BYE is not a match played");
  assert.equal(x.byes, 1);
  assert.equal(x.won, 1, "wins count real matches only");
  const alone = computeRows([{ teamId: "z", group: "A" }], [], ["z"]).get("z") as StandingRow;
  assert.deepEqual([alone.points, alone.played, alone.runsFor, alone.ballsFor, alone.runsAgainst, alone.ballsAgainst, alone.nrr], [2, 0, 0, 0, 0, 0, 0]);
  assert.equal(POINTS.bye, 2);
});

test("score entry rejects impossible innings and parses overs as balls", () => {
  assert.equal(parseOvers("5.3"), 33);
  assert.equal(parseOvers("6"), 36);
  assert.equal(parseOvers("5.6"), null);
  const base = { outcome: "win" as const, firstBats: "a" as const, maxBalls: 36 };
  assert.deepEqual(validateScore({ ...base, first: { runs: 50, wickets: 3, balls: 36, allOut: false }, second: { runs: 40, wickets: 5, balls: 36, allOut: false } }), []);
  assert.ok(validateScore({ ...base, first: { runs: 50, wickets: 3, balls: 40, allOut: false }, second: { runs: 40, wickets: 5, balls: 36, allOut: false } }).length > 0, "too many balls");
  assert.ok(validateScore({ ...base, outcome: "tie", first: { runs: 50, wickets: 3, balls: 36, allOut: false }, second: { runs: 40, wickets: 5, balls: 36, allOut: false } }).length > 0);
});

function levelRow(teamId: string, group: GroupCode, overrides: Partial<StandingRow> = {}): StandingRow {
  return { teamId, group, played: 3, won: 1, lost: 2, tied: 0, noResult: 0, byes: 0, points: 2, runsFor: 100, ballsFor: 108, runsAgainst: 100, ballsAgainst: 108, nrr: 0, rank: 0, tied_unresolved: false, ...overrides };
}

test("teams level on points and net run rate are flagged for a Super Over, never picked silently", () => {
  const rows = [levelRow("t1", "A", { points: 6, won: 3, nrr: 1 }), levelRow("t2", "A"), levelRow("t3", "A"), levelRow("t4", "A", { points: 0, won: 0 })];
  const table = rankRows(rows, [], "group:A", [], 4);
  assert.equal(table.rows[0]?.teamId, "t1");
  assert.equal(table.ties.length, 1);
  assert.equal(table.ties[0]?.blocking, true);
  const decided = rankRows(
    [levelRow("t1", "A", { points: 6, won: 3, nrr: 1 }), levelRow("t2", "A"), levelRow("t3", "A"), levelRow("t4", "A", { points: 0, won: 0 })],
    [],
    "group:A",
    [{ scope: "group:A", order: ["t3", "t2"] }],
    4,
  );
  assert.deepEqual(decided.rows.map((row) => row.teamId), ["t1", "t3", "t2", "t4"]);
  assert.equal(decided.ties.length, 0);
  // Only points and net run rate rank teams. Most wins and the result between two teams no longer break a tie.
  const met = score("p", "q", "a", "h");
  const metBefore = rankRows([levelRow("q", "A"), levelRow("p", "A")], [met], "group:A");
  assert.equal(metBefore.ties.length, 1, "they met and p won, but a Super Over decides");
  assert.ok(metBefore.rows.every((row) => row.tied_unresolved));
  const moreWins = rankRows([levelRow("m", "A", { won: 2, tied: 0 }), levelRow("n", "A", { won: 1 })], [], "group:A");
  assert.equal(moreWins.ties.length, 1, "more wins does not separate teams level on points and net run rate");
  const closeNrr = rankRows([levelRow("x", "A", { nrr: 0.5 }), levelRow("y", "A", { nrr: 0.25 })], [], "group:A");
  assert.deepEqual(closeNrr.rows.map((row) => row.teamId), ["x", "y"], "net run rate still ranks teams level on points");
  assert.equal(closeNrr.ties.length, 0);
  // The Super Over's result is recorded as an order, and the table uses it.
  const afterSuperOver = rankRows([levelRow("q", "A"), levelRow("p", "A")], [met], "group:A", [{ scope: "group:A", order: ["q", "p"] }]);
  assert.deepEqual(afterSuperOver.rows.map((row) => row.teamId), ["q", "p"]);
  assert.equal(afterSuperOver.ties.length, 0);
});

/** Plays the whole 28-match league: team strength decides most results, with some ties and no results. */
function playLeague(plan: DrawPlan, strength: (slot: string) => number, seed = 1) {
  const rng = seededRng(entropyFor(seed));
  const scores: MatchScore[] = [];
  for (const m of plan.matches.filter((x) => x.stage === "league")) {
    const roll = rng.int(100);
    const diff = strength(m.teamA.slot as string) - strength(m.teamB.slot as string);
    const winner = roll < 4 ? "nr" : roll < 8 ? "tie" : diff === 0 ? (rng.int(2) === 0 ? "a" : "b") : diff > 0 ? "a" : "b";
    scores.push(score(m.teamA.teamId as string, m.teamB.teamId as string, winner, m.code));
  }
  return scores;
}

test("qualification takes the top four of each group, eight in all, and the bracket crosses A and B", () => {
  for (let n = 0; n < 60; n += 1) {
    const plan = generatePlan({ roster, days: DAYS, entropy: entropyFor(900 + n) });
    const teams = plan.result.assignments.map((a) => ({ teamId: a.teamId, group: a.group }));
    const scores = playLeague(plan, (slot) => (slot.startsWith("A") ? 10 - Number(slot.slice(1)) : 11 - Number(slot.slice(1))), n);
    const q = computeQualification(teams, scores, [], [plan.bye.teamId]);
    assert.equal(q.leagueComplete, true);
    const decisions = q.blockingTies.map((tie) => ({ scope: tie.scope, order: [...tie.teamIds].sort() }));
    const settled = computeQualification(teams, scores, decisions, [plan.bye.teamId]);
    assert.ok(settled.qualifiers, `draw ${n}: qualifiers once any tie is decided`);
    const list = settled.qualifiers as Qualifier[];
    assert.equal(list.length, 8);
    for (const group of ["A", "B"] as const) assert.deepEqual(list.filter((x) => x.group === group).map((x) => x.rank).sort(), [1, 2, 3, 4]);
    const bye = settled.groups.A.rows.find((row) => row.teamId === plan.bye.teamId) as StandingRow;
    assert.equal(bye.byes, 1);
    assert.equal(bye.played, 2, "the BYE team played two real matches");
    const rank = (group: GroupCode, r: number) => list.find((x) => x.group === group && x.rank === r)?.teamId;
    assert.deepEqual(
      pairQuarterfinals(list),
      [
        { code: "QF1", teamAId: rank("A", 1), teamBId: rank("B", 4) },
        { code: "QF2", teamAId: rank("A", 2), teamBId: rank("B", 3) },
        { code: "QF3", teamAId: rank("A", 3), teamBId: rank("B", 2) },
        { code: "QF4", teamAId: rank("A", 4), teamBId: rank("B", 1) },
      ],
    );
  }
  assert.equal(QF_PAIRINGS.length, 4);
});

test("nothing qualifies until all 28 league matches have a result", () => {
  const plan = generatePlan({ roster, days: DAYS, entropy: entropyFor(31) });
  const teams = plan.result.assignments.map((a) => ({ teamId: a.teamId, group: a.group }));
  const scores = playLeague(plan, () => 0, 3);
  const partial = computeQualification(teams, scores.slice(0, LEAGUE_MATCHES - 1), [], [plan.bye.teamId]);
  assert.equal(partial.leagueComplete, false);
  assert.equal(partial.qualifiers, null);
  assert.ok(Object.values(partial.status).every((s) => s === "pending" || s === "qualified" || s === "eliminated"));
});

test("the reveal timeline covers all 19 teams in order, ends with the BYE, can be joined part-way, and has a reduced-motion form", () => {
  const plan = generatePlan({ roster, days: DAYS, entropy: entropyFor(5) });
  const timeline = buildTimeline(plan);
  const placed = timeline.beats.flatMap((beat) => (beat.kind === "place" || beat.kind === "bye" ? [beat.step.teamId] : []));
  assert.deepEqual(placed, plan.result.reveal.map((step) => step.teamId));
  assert.equal(timeline.beats.filter((b) => b.kind === "place").length, 18);
  assert.equal(timeline.beats.filter((b) => b.kind === "bye").length, 1);
  const kinds = timeline.beats.map((b) => b.kind);
  assert.equal(kinds[0], "countdown");
  assert.ok(kinds.indexOf("seeds-intro") < kinds.indexOf("draw-intro") && kinds.indexOf("draw-intro") < kinds.indexOf("bye") && kinds.indexOf("bye") < kinds.indexOf("groups"));
  assert.deepEqual(timeline.beats.filter((b) => b.kind === "fixtures").map((b) => (b as { group: string }).group), ["A", "B"]);
  assert.deepEqual(timeline.beats.filter((b) => b.kind === "schedule").map((b) => (b as { day: number }).day), [1, 2]);
  assert.equal(kinds.at(-1), "done");
  const mid = beatIndexAt(timeline, timeline.total / 2);
  assert.ok(mid > 0 && mid < timeline.beats.length - 1);
  assert.ok(placedBefore(timeline, mid).length > 0);
  assert.equal(beatIndexAt(timeline, timeline.total + 10_000), timeline.beats.length - 1);
  const reduced = buildTimeline(plan, { reduced: true });
  assert.ok(reduced.total < timeline.total / 2);
  const skipCountdown = buildTimeline(plan, { countdown: false });
  assert.notEqual(skipCountdown.beats[0]?.kind, "countdown");
});
