import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { DEFAULT_TIMETABLE } from "../lib/draw/config";
import { FORMAT_19, FORMAT_20, formatFor, formatOfPlan, formatToShow, SUPPORTED_TEAM_COUNTS } from "../lib/draw/formats";
import { groundShareCounts, groundShareText, positionGroundSplit, teamGroundSplit } from "../lib/draw/grounds";
import { generatePlan, verifyPlan } from "../lib/draw/plan";
import { applyTimetable, leagueSlotStarts, templatePairs, timeSlots } from "../lib/draw/schedule";
import { buildTimeline } from "../lib/draw/timeline";
import type { Qualifier } from "../lib/draw/bracket";
import { computeQualification, type MatchScore } from "../lib/draw/standings";
import { checkSchedule, timedMatches, validatePlan, validateTemplates } from "../lib/draw/validate";
import { buildViewBye, teamEntries, buildViewMatches } from "../lib/draw/view";
import { buildRulebook } from "../lib/rules";
import { DAYS, TEAM_NAMES, TEAM_NAMES_20 } from "./helpers/roster";

const roster20 = TEAM_NAMES_20.map((name, index) => ({ id: `team-${String(index).padStart(2, "0")}`, name }));
const roster19 = TEAM_NAMES.map((name, index) => ({ id: `team-${String(index).padStart(2, "0")}`, name }));
const entropyFor = (n: number) => createHash("sha256").update(`ncl-20-${n}`).digest("hex");
const idOf = (name: string) => (roster20.find((team) => team.name === name) as { id: string }).id;

test("the format follows the number of approved teams: 19 keeps the BYE, 20 has none, anything else is refused", () => {
  assert.deepEqual([...SUPPORTED_TEAM_COUNTS], [19, 20]);
  assert.equal(formatFor(19), FORMAT_19);
  assert.equal(formatFor(20), FORMAT_20);
  for (const count of [0, 1, 18, 21, 22]) assert.equal(formatFor(count), null, String(count));
  assert.equal(formatToShow(19), FORMAT_19);
  assert.equal(formatToShow(20), FORMAT_20);
  assert.equal(formatToShow(5), FORMAT_19, "before the roster is complete the page explains the 19-team format");
  assert.deepEqual([FORMAT_19.groupTeams, FORMAT_19.byePosition, FORMAT_19.leagueMatches, FORMAT_19.actualMatches, FORMAT_19.fixtureEntries], [{ A: 9, B: 10 }, "A9", 28, 35, 36], "the 19-team format is as it was");
  assert.deepEqual([FORMAT_20.groupTeams, FORMAT_20.byePosition, FORMAT_20.leagueMatches, FORMAT_20.actualMatches, FORMAT_20.fixtureEntries], [{ A: 10, B: 10 }, null, 30, 37, 37]);
  assert.throws(() => generatePlan({ roster: roster20.slice(0, 18), days: DAYS }), (e: { code?: string; message?: string }) => e.code === "roster_count" && /19 or 20/.test(e.message ?? ""));
  assert.throws(() => generatePlan({ roster: [...roster20, { id: "x", name: "Extra" }], days: DAYS }), (e: { code?: string }) => e.code === "roster_count");
});

test("the 20-team templates are sound: two groups of ten, three opponents each, 30 matches in 15 slots, A1 v A2 first", () => {
  assert.deepEqual(validateTemplates(FORMAT_20), []);
  assert.deepEqual(validateTemplates(FORMAT_19), [], "and the 19-team templates still are");
  for (const group of ["A", "B"] as const) {
    const table = FORMAT_20.opponents[group];
    assert.equal(Object.keys(table).length, 10);
    for (const [position, opponents] of Object.entries(table)) {
      assert.equal(opponents.length, 3, position);
      assert.ok(!opponents.includes("BYE"));
      for (const opponent of opponents) assert.ok(table[opponent]?.includes(position), `${position} v ${opponent} is mutual`);
    }
  }
  const pairs = templatePairs(FORMAT_20);
  assert.equal(pairs.filter((p) => p.group === "A").length, 15);
  assert.equal(pairs.filter((p) => p.group === "B").length, 15);
  assert.equal(FORMAT_20.saturday.length + FORMAT_20.sunday.length, 15, "one match on each ground in each of 15 slots");
  assert.deepEqual([FORMAT_20.saturday.length * 2, FORMAT_20.sunday.length * 2], [22, 8]);
  assert.deepEqual(FORMAT_20.saturday[0]?.[0], ["A1", "A2"]);
  // Ground A is shared out: everyone plays on both grounds, ten teams twice on Ground A and ten twice on Ground B.
  const split = positionGroundSplit(FORMAT_20);
  assert.equal(split.size, 20);
  for (const [position, entry] of split) {
    assert.equal(entry.A + entry.B, 3, position);
    assert.ok(entry.A >= 1 && entry.B >= 1, `${position} plays on both grounds`);
  }
  assert.deepEqual(groundShareCounts(FORMAT_20), { twoOnA: 10, twoOnB: 10 });
  assert.match(groundShareText(FORMAT_20), /10 teams play two of their three on Ground A and 10 play two on Ground B\. The draw decides which team gets which\./);
  assert.doesNotMatch(groundShareText(FORMAT_20), /BYE/);
  assert.match(groundShareText(FORMAT_19), /9 teams play two of their three on Ground A and 9 play two on Ground B\. The BYE team plays one on each/);
  // The times: Saturday's eleven slots end at 5:30 PM, and the Sunday and knockout times are the same as with 19 teams.
  const clock = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  assert.deepEqual(leagueSlotStarts(1, DEFAULT_TIMETABLE, FORMAT_20).map(clock), ["7:00", "7:55", "8:50", "9:45", "10:40", "12:00", "12:55", "13:50", "14:45", "15:40", "16:35"]);
  assert.deepEqual(leagueSlotStarts(2, DEFAULT_TIMETABLE, FORMAT_20).map(clock), ["7:00", "7:55", "8:50", "9:45"]);
  const slots = timeSlots(DEFAULT_TIMETABLE, FORMAT_20);
  assert.equal(slots.length, 37);
  assert.deepEqual(slots.slice(-7).map((s) => s.code), ["QF1", "QF2", "QF3", "QF4", "SF1", "SF2", "F"]);
  assert.equal(slots.at(-1)?.number, 37);
});

function assertPlan20(plan: ReturnType<typeof generatePlan>, label: string) {
  assert.deepEqual(validatePlan(plan).errors, [], `${label}: the engine's own validation agrees`);
  assert.equal(formatOfPlan(plan), FORMAT_20);
  assert.equal(plan.bye, null, `${label}: no BYE entry`);
  assert.equal(plan.result.byeTeamId, null, `${label}: no BYE team`);
  assert.equal(plan.roster.length, 20);
  assert.equal(plan.result.assignments.filter((a) => a.group === "A").length, 10);
  assert.equal(plan.result.assignments.filter((a) => a.group === "B").length, 10);
  const positions = new Set(plan.result.assignments.map((a) => `${a.group}${a.slot}`));
  assert.equal(positions.size, 20, `${label}: every position A1-A10 and B1-B10 filled once`);
  assert.equal(plan.matches.length, 37);
  const league = plan.matches.filter((m) => m.stage === "league");
  assert.equal(league.length, 30);
  assert.deepEqual([league.filter((m) => m.group === "A").length, league.filter((m) => m.group === "B").length], [15, 15]);
  assert.deepEqual([league.filter((m) => m.day === 1).length, league.filter((m) => m.day === 2).length], [22, 8]);
  const grounds = teamGroundSplit(league.map((m) => ({ stage: m.stage, ground: m.ground, teamIds: [m.teamA.teamId, m.teamB.teamId] })));
  const seen = new Map<string, Set<string>>();
  for (const team of plan.roster) {
    const own = league.filter((m) => m.teamA.teamId === team.id || m.teamB.teamId === team.id);
    assert.equal(own.length, 3, `${label}: ${team.name} plays three league matches`);
    for (const m of own) {
      const opponent = m.teamA.teamId === team.id ? m.teamB.teamId : m.teamA.teamId;
      const set = seen.get(team.id) ?? new Set<string>();
      assert.ok(!set.has(opponent as string), `${label}: ${team.name} meets nobody twice`);
      set.add(opponent as string);
      seen.set(team.id, set);
    }
    const split = grounds.get(team.id) ?? { A: 0, B: 0 };
    assert.ok(split.A >= 1 && split.B >= 1, `${label}: ${team.name} plays on both grounds`);
  }
  // Seeds: champion and runner-up in different groups, one semifinalist per group, each group has two.
  const at = (name: string) => plan.result.assignments.find((a) => a.teamId === idOf(name));
  const [champion, runnerUp, semiOne, semiTwo] = [at("4s-11"), at("RCB United"), at("JNV Junglees"), at("Balehonnur Bulls")];
  assert.notEqual(champion?.group, runnerUp?.group);
  assert.notEqual(semiOne?.group, semiTwo?.group);
  assert.equal([champion, runnerUp, semiOne, semiTwo].filter((a) => a?.group === "A").length, 2);
  // Reveal: four seeds, then sixteen drawn teams, and no BYE step.
  assert.deepEqual(plan.result.reveal.map((r) => r.phase), [...Array(4).fill("seed"), ...Array(16).fill("draw")]);
  assert.equal(plan.result.reveal[0]?.teamId, idOf("4s-11"));
  // The opening match is A1 v A2 on Ground A at 7:00 AM.
  assert.deepEqual([league[0]?.teamA.slot, league[0]?.teamB.slot, league[0]?.ground, league[0]?.startMinutes], ["A1", "A2", "A", 420]);
  assert.equal(league[0]?.teamB.teamId, plan.result.openingOpponentId);
  const timing = checkSchedule(timedMatches(plan.matches));
  assert.deepEqual(timing.errors, []);
  assert.ok(timing.minLeagueRestMinutes >= 55);
}

test("300 random 20-team draws keep every seeded, fixture, ground and schedule promise, and replay exactly", () => {
  for (let n = 0; n < 300; n += 1) assertPlan20(generatePlan({ roster: roster20, days: DAYS, entropy: entropyFor(n) }), `draw ${n}`);
  const plan = generatePlan({ roster: roster20, days: DAYS, entropy: entropyFor(7) });
  assert.equal(verifyPlan(plan, DAYS).ok, true);
  assert.equal(generatePlan({ roster: roster20, days: DAYS, entropy: entropyFor(7) }).result.assignments.map((a) => a.teamId).join(), plan.result.assignments.map((a) => a.teamId).join());
  const other = generatePlan({ roster: roster20, days: DAYS, entropy: entropyFor(8) });
  assert.notEqual(other.result.assignments.map((a) => a.teamId).join(), plan.result.assignments.map((a) => a.teamId).join());
});

test("with 20 teams the seeds land in either group at any position, and all 20 positions are drawn fairly", () => {
  const draws = 3000;
  const inA = new Map<string, number>();
  const places = new Map<string, Set<string>>();
  for (let n = 0; n < draws; n += 1) {
    const plan = generatePlan({ roster: roster20, days: DAYS, entropy: entropyFor(10_000 + n) });
    for (const a of plan.result.assignments) {
      if (a.group === "A") inA.set(a.teamId, (inA.get(a.teamId) ?? 0) + 1);
      const set = places.get(a.teamId) ?? new Set<string>();
      set.add(`${a.group}${a.slot}`);
      places.set(a.teamId, set);
    }
  }
  // Every team is in Group A about half of the time: 1500 of 3000.
  for (const team of roster20) assert.ok((inA.get(team.id) ?? 0) > 1300 && (inA.get(team.id) ?? 0) < 1700, `${team.name} in Group A ${inA.get(team.id)} of ${draws}`);
  // Seeds can take any of the 20 positions; unseeded teams too.
  for (const team of roster20) assert.ok((places.get(team.id)?.size ?? 0) >= 19, `${team.name} landed in ${places.get(team.id)?.size} different positions`);
});

test("a 20-team draw has no BYE anywhere: page models, team lists and the reveal", () => {
  const plan = generatePlan({ roster: roster20, days: DAYS, entropy: entropyFor(3) });
  assert.equal(buildViewBye(plan), null);
  const matches = buildViewMatches(plan);
  for (const team of plan.roster) {
    const entries = teamEntries(matches, null, team.id);
    assert.equal(entries.length, 3);
    assert.ok(entries.every((entry) => entry.kind === "match"));
  }
  const kinds = buildTimeline(plan, { countdown: false }).beats.map((beat) => beat.kind);
  assert.ok(!kinds.includes("bye"));
  assert.equal(kinds.filter((kind) => kind === "place").length, 20);
  // And the 19-team reveal still ends with its BYE.
  const plan19 = generatePlan({ roster: roster19, days: DAYS, entropy: entropyFor(3) });
  assert.ok(buildTimeline(plan19, { countdown: false }).beats.some((beat) => beat.kind === "bye"));
  assert.equal(buildTimeline(plan19, { countdown: false }).beats.filter((beat) => beat.kind === "place").length, 18);
});

test("rescheduling a 20-team draw keeps every opponent, and Saturday's longer day is guarded by the daylight rule", () => {
  const plan = generatePlan({ roster: roster20, days: DAYS, entropy: entropyFor(11) });
  const sameOpponents = (a: typeof plan.matches, b: typeof plan.matches) => a.map((m) => `${m.code}:${m.teamA.teamId}|${m.teamB.teamId}|${m.ground}`).join(";") === b.map((m) => `${m.code}:${m.teamA.teamId}|${m.teamB.teamId}|${m.ground}`).join(";");
  // Sunday later by 30 minutes: opponents and grounds untouched, and every rule still holds.
  const sundayLater = { ...DEFAULT_TIMETABLE, sundayStart: 7 * 60 + 30, qf1: 11 * 60 + 45, qf2: 13 * 60, sf: 14 * 60 + 45, final: 16 * 60 + 30 };
  const moved = applyTimetable(plan.matches, DAYS, sundayLater);
  assert.ok(sameOpponents(moved, plan.matches));
  assert.equal(moved.length, 37, "the 37 matches of the 20-team format are all rescheduled");
  assert.deepEqual(checkSchedule(timedMatches(moved)).errors, []);
  // Saturday starting at 7:30 runs past 5:45 PM with eleven slots: refused, not silently accepted.
  const tooLate = applyTimetable(plan.matches, DAYS, { ...DEFAULT_TIMETABLE, saturdayStart: 7 * 60 + 30 });
  assert.ok(checkSchedule(timedMatches(tooLate)).errors.some((e) => e.includes("daylight")));
});

function leagueScores(plan: ReturnType<typeof generatePlan>): MatchScore[] {
  const strength = new Map(plan.result.assignments.map((a, index) => [a.teamId, (index * 7) % 20]));
  return plan.matches
    .filter((m) => m.stage === "league")
    .map((m, index) => {
      const a = m.teamA.teamId as string;
      const b = m.teamB.teamId as string;
      const aWins = (strength.get(a) ?? 0) >= (strength.get(b) ?? 0);
      const inn = (runs: number) => ({ runs, wickets: 3, balls: 36, allOut: false });
      return { fixtureId: m.code, teamAId: a, teamBId: b, outcome: "win", firstBats: "a", maxBalls: 36, first: inn(aWins ? 50 + (index % 9) : 38 + (index % 5)), second: inn(aWins ? 36 + (index % 7) : 51 + (index % 6)) } as MatchScore;
    });
}

test("the 20-team league completes after 30 results, every team's table has 3 matches, and eight qualify", () => {
  const plan = generatePlan({ roster: roster20, days: DAYS, entropy: entropyFor(21) });
  const teams = plan.result.assignments.map((a) => ({ teamId: a.teamId, group: a.group }));
  const scores = leagueScores(plan);
  assert.equal(scores.length, 30);
  const partial = computeQualification(teams, scores.slice(0, 29), [], [], FORMAT_20.leagueMatchesByGroup);
  assert.equal(partial.leagueComplete, false);
  assert.equal(partial.leagueMatchesTotal, 30);
  assert.equal(partial.qualifiers, null);
  let table = computeQualification(teams, scores, [], [], FORMAT_20.leagueMatchesByGroup);
  assert.equal(table.leagueComplete, true);
  // Break any tie a Super Over would decide, the way an organizer records it.
  const decisions: { scope: string; order: string[] }[] = [];
  for (let guard = 0; guard < 12 && table.blockingTies.length > 0; guard += 1) {
    const tie = table.blockingTies[0] as (typeof table.blockingTies)[number];
    decisions.push({ scope: tie.scope, order: [...tie.teamIds].sort() });
    table = computeQualification(teams, scores, decisions, [], FORMAT_20.leagueMatchesByGroup);
  }
  assert.equal(table.qualifiers?.length, 8);
  for (const group of ["A", "B"] as const) {
    assert.equal(table.groups[group].rows.length, 10);
    for (const row of table.groups[group].rows) {
      assert.equal(row.played, 3, "every team plays all three");
      assert.equal(row.byes, 0);
      assert.equal(row.points, row.won * 2 + row.tied + row.noResult, "no BYE points");
    }
    assert.equal((table.qualifiers as Qualifier[]).filter((q) => q.group === group).length, 4);
  }
});

test("the rules for 20 teams say two groups of ten, no BYE, 30 league matches and 37 in all", () => {
  const base = { editionNumber: 15, dates: "28–29 November 2026", days: ["2026-11-28", "2026-11-29"] as [string, string], venue: "Loyala School Ground", organizer: null, fee: null, ball: null, timetable: DEFAULT_TIMETABLE };
  const book20 = buildRulebook({ ...base, format: FORMAT_20 });
  const all20 = book20.sections.flatMap((s) => [s.summary, ...s.rules.flatMap((r) => [r.text, r.note ?? "", ...(r.items ?? [])]), ...(s.tables ?? []).flatMap((t) => t.rows.flat())]).join("\n");
  assert.match(all20, /20 teams, two groups/);
  assert.match(all20, /The 20 teams are drawn into two groups of 10\./);
  assert.match(all20, /\(A1 to A10, B1 to B10\)/);
  assert.match(all20, /37 matches are played in all: 30 league matches \(15 in Group A and 15 in Group B\), 4 quarterfinals, 2 semifinals and the final\./);
  assert.match(all20, /10 teams play two of their three on Ground A and 10 play two on Ground B/);
  assert.doesNotMatch(all20, /BYE/);
  assert.equal(book20.facts.find((f) => f.label === "Teams")?.value, "20 teams · 2 groups");
  assert.match(all20, /from 7:00 AM to 6:00 PM, and Sunday, 29 November, from 7:00 AM to 6:00 PM/, "Saturday's 5:30 PM finish still sits inside the announced 6:00 PM");
  // Without a format the rules are the 19-team ones, exactly as before.
  const book19 = buildRulebook(base);
  const all19 = book19.sections.flatMap((s) => [s.summary, ...s.rules.flatMap((r) => [r.text, ...(r.items ?? [])])]).join("\n");
  assert.match(all19, /19 teams, two groups/);
  assert.match(all19, /Group A has 9 teams and one BYE, and Group B has 10 teams/);
  assert.match(all19, /35 matches are played in all: 28 league matches \(13 in Group A and 15 in Group B\)/);
  assert.equal(book19.sections.flatMap((s) => s.rules).length - book20.sections.flatMap((s) => s.rules).length, 1, "the BYE rule is the one rule 20 teams do not have");
});
