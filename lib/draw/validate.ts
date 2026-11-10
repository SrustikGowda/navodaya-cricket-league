import {
  GROUP_SIZE,
  LEAGUE_MATCHES,
  MIN_KNOCKOUT_REST_MINUTES,
  MIN_LEAGUE_REST_MINUTES,
  MIN_QUALIFICATION_WINDOW_MINUTES,
  OVERS,
  POOL_SIZE,
  TEAM_COUNT,
  TOTAL_MATCHES,
} from "./config";
import type { DrawPlan, GroupCode, PlannedMatch } from "./types";

export type PlanReport = { errors: string[]; notes: string[]; minLeagueRestMinutes: number };

/**
 * Independent re-check of every promise the draw makes. Runs before a plan is shown or saved and is the
 * same function the tests call, so a generator bug cannot hide behind its own assumptions.
 */
export function validatePlan(plan: DrawPlan): PlanReport {
  const errors: string[] = [];
  const notes: string[] = [];
  const fail = (message: string) => errors.push(message);
  const { result, matches } = plan;
  const rosterIds = new Set(plan.roster.map((team) => team.id));

  // 1-4 roster and group structure
  if (plan.roster.length !== TEAM_COUNT || rosterIds.size !== TEAM_COUNT) fail(`Roster must be exactly ${TEAM_COUNT} distinct teams.`);
  const placed = result.assignments.map((a) => a.teamId);
  if (placed.length !== TEAM_COUNT || new Set(placed).size !== TEAM_COUNT) fail("Every team must appear exactly once in the group allocation.");
  for (const id of placed) if (!rosterIds.has(id)) fail(`Allocated team ${id} is not on the roster.`);
  for (const group of ["A", "B", "C"] as const) {
    const members = result.assignments.filter((a) => a.group === group);
    if (members.length !== GROUP_SIZE) fail(`Group ${group} must have ${GROUP_SIZE} teams.`);
    const slots = members.map((a) => a.slot).sort();
    if (slots.join() !== "1,2,3,4,5,6") fail(`Group ${group} must fill positions ${group}1-${group}6 once each.`);
    for (const subPool of [1, 2] as const) {
      if (members.filter((a) => a.subPool === subPool).length !== POOL_SIZE) fail(`Group ${group} sub-pool ${subPool} must have ${POOL_SIZE} teams.`);
    }
    for (const a of members) if ((a.slot <= POOL_SIZE ? 1 : 2) !== a.subPool) fail(`${group}${a.slot} is in the wrong sub-pool.`);
  }

  // 5-6 seeded rules
  const { championId, runnerUpId, semifinalistIds } = plan.seeds;
  const where = (id: string) => result.assignments.find((a) => a.teamId === id);
  const champion = where(championId);
  const runnerUp = where(runnerUpId);
  const semiOne = where(semifinalistIds[0]);
  const semiTwo = where(semifinalistIds[1]);
  if (!champion || !runnerUp || !semiOne || !semiTwo) {
    fail("All four seeded teams must be allocated.");
  } else {
    if (new Set([championId, runnerUpId, ...semifinalistIds]).size !== 4) fail("The four seeded teams must be different.");
    if (champion.group === runnerUp.group) fail("Champion and runner-up must be in different groups.");
    if (!["A", "B"].includes(champion.group) || !["A", "B"].includes(runnerUp.group)) fail("Champion and runner-up must be in Groups A and B.");
    if (semiOne.group !== "C" || semiTwo.group !== "C") fail("Both other semifinalists must be in Group C.");
    if (semiOne.subPool === semiTwo.subPool) fail("The Group C semifinalists must be in opposite sub-pools.");
  }

  // Reveal sequence covers every team once, seeds first.
  if (result.reveal.length !== TEAM_COUNT || new Set(result.reveal.map((r) => r.teamId)).size !== TEAM_COUNT) fail("The reveal sequence must list each team once.");
  result.reveal.forEach((step, index) => {
    const a = where(step.teamId);
    if (!a || a.group !== step.group || a.slot !== step.slot) fail(`Reveal step ${index + 1} disagrees with the allocation.`);
    if ((index < 4) !== (step.phase === "seed")) fail("The four seeded teams must be revealed first.");
  });

  // 7-9 league fixtures
  const league = matches.filter((m) => m.stage === "league");
  if (league.length !== LEAGUE_MATCHES) fail(`Expected ${LEAGUE_MATCHES} league fixtures, found ${league.length}.`);
  const pairs = new Set<string>();
  const faced = new Map<string, Set<string>>();
  for (const m of league) {
    const a = m.teamA.teamId ? where(m.teamA.teamId) : undefined;
    const b = m.teamB.teamId ? where(m.teamB.teamId) : undefined;
    if (!a || !b) {
      fail(`League match ${m.code} has an unknown team.`);
      continue;
    }
    if (a.teamId === b.teamId) fail(`League match ${m.code} pits a team against itself.`);
    if (a.group !== b.group) fail(`League match ${m.code} crosses groups.`);
    if (a.subPool === b.subPool) fail(`League match ${m.code} is inside one sub-pool.`);
    if (m.group !== a.group) fail(`League match ${m.code} is labelled with the wrong group.`);
    const key = [a.teamId, b.teamId].sort().join("|");
    if (pairs.has(key)) fail(`League match ${m.code} duplicates an earlier pairing.`);
    pairs.add(key);
    for (const [x, y] of [[a.teamId, b.teamId], [b.teamId, a.teamId]] as const) {
      const set = faced.get(x) ?? new Set<string>();
      set.add(y);
      faced.set(x, set);
    }
  }
  for (const id of rosterIds) {
    const opponents = faced.get(id);
    const count = league.filter((m) => m.teamA.teamId === id || m.teamB.teamId === id).length;
    if (count !== 3 || !opponents || opponents.size !== 3) fail(`Team ${id} must play exactly three different league opponents (found ${count}).`);
  }

  // 10-12 days
  const sat = league.filter((m) => m.day === 1);
  const sun = league.filter((m) => m.day === 2);
  if (sat.length !== 18) fail(`Expected 18 league matches on Saturday, found ${sat.length}.`);
  if (sun.length !== 9) fail(`Expected 9 league matches on Sunday, found ${sun.length}.`);
  for (const id of rosterIds) {
    const onDay = (list: PlannedMatch[]) => list.filter((m) => m.teamA.teamId === id || m.teamB.teamId === id).length;
    if (onDay(sat) !== 2) fail(`Team ${id} must play twice on Saturday.`);
    if (onDay(sun) !== 1) fail(`Team ${id} must play once on Sunday.`);
  }

  // 13-14 overlaps and rest
  const bySpan = matches.map((m) => ({ m, start: Date.parse(m.startsAt), end: Date.parse(m.startsAt) + m.durationMinutes * 60_000 }));
  for (let i = 0; i < bySpan.length; i += 1) {
    for (let j = i + 1; j < bySpan.length; j += 1) {
      const x = bySpan[i] as (typeof bySpan)[number];
      const y = bySpan[j] as (typeof bySpan)[number];
      const overlap = x.start < y.end && y.start < x.end;
      if (overlap && x.m.ground === y.m.ground) fail(`Ground ${x.m.ground} is double-booked by ${x.m.code} and ${y.m.code}.`);
      if (overlap) {
        const xs = [x.m.teamA.teamId, x.m.teamB.teamId].filter(Boolean);
        const ys = [y.m.teamA.teamId, y.m.teamB.teamId].filter(Boolean);
        if (xs.some((t) => ys.includes(t))) fail(`A team is in overlapping matches ${x.m.code} and ${y.m.code}.`);
      }
    }
  }
  let minRest = Infinity;
  for (const id of rosterIds) {
    const own = bySpan.filter(({ m }) => m.teamA.teamId === id || m.teamB.teamId === id).sort((p, q) => p.start - q.start);
    for (let i = 1; i < own.length; i += 1) {
      const rest = ((own[i] as (typeof own)[number]).start - (own[i - 1] as (typeof own)[number]).end) / 60_000;
      if ((own[i] as (typeof own)[number]).m.date === (own[i - 1] as (typeof own)[number]).m.date) minRest = Math.min(minRest, rest);
      if (rest < MIN_LEAGUE_REST_MINUTES) fail(`Team ${id} has only ${rest} minutes between ${(own[i - 1] as (typeof own)[number]).m.code} and ${(own[i] as (typeof own)[number]).m.code}.`);
    }
  }

  // 15 opening match
  const first = [...matches].sort((p, q) => p.startsAt.localeCompare(q.startsAt) || p.ground.localeCompare(q.ground))[0];
  if (!first || first.number !== 1 || first.day !== 1 || first.ground !== "A" || first.startMinutes !== 7 * 60 + 30) {
    fail("Match 1 must be the first match: Saturday 7:30 AM on Ground A.");
  } else if (first.teamA.teamId !== championId && first.teamB.teamId !== championId) {
    fail("The defending champion must play the opening match.");
  } else if (![first.teamA.teamId, first.teamB.teamId].includes(result.openingOpponentId)) {
    fail("The opening opponent must be the one the draw selected.");
  }

  // 16-17 knockouts and total
  const count = (stage: PlannedMatch["stage"]) => matches.filter((m) => m.stage === stage).length;
  if (count("quarterfinal") !== 4) fail("Expected four quarterfinals.");
  if (count("semifinal") !== 2) fail("Expected two semifinals.");
  if (count("final") !== 1) fail("Expected one final.");
  if (matches.length !== TOTAL_MATCHES) fail(`Expected ${TOTAL_MATCHES} matches in total, found ${matches.length}.`);
  if (new Set(matches.map((m) => m.code)).size !== matches.length) fail("Match codes must be unique.");
  matches.forEach((m, index) => {
    if (m.number !== index + 1 && matches.length === TOTAL_MATCHES) fail(`Match ${m.code} is numbered ${m.number}, expected ${index + 1}.`);
    const expected = OVERS[m.stage];
    if (m.overs !== expected) fail(`${m.code} must be ${expected} overs a side.`);
  });
  for (const m of matches.filter((x) => x.stage !== "league")) {
    if (m.teamA.teamId || m.teamB.teamId) fail(`${m.code} must hold qualification placeholders until results are in.`);
  }

  // Knockout timing: qualification window and recovery.
  const lastLeagueEnd = Math.max(...sun.map((m) => m.startMinutes + m.durationMinutes));
  const qfs = matches.filter((m) => m.stage === "quarterfinal");
  const sfs = matches.filter((m) => m.stage === "semifinal");
  const final = matches.find((m) => m.stage === "final");
  const firstQf = Math.min(...qfs.map((m) => m.startMinutes));
  if (firstQf - lastLeagueEnd < MIN_QUALIFICATION_WINDOW_MINUTES) fail("Not enough time between the last league match and the first quarterfinal to settle qualification.");
  notes.push(`Standings and qualification window: ${firstQf - lastLeagueEnd} minutes after the last league match.`);
  const lateQfEnd = Math.max(...qfs.map((m) => m.startMinutes + m.durationMinutes));
  const sfStart = Math.min(...sfs.map((m) => m.startMinutes));
  const sfEnd = Math.max(...sfs.map((m) => m.startMinutes + m.durationMinutes));
  if (sfStart - lateQfEnd < MIN_KNOCKOUT_REST_MINUTES) fail("Semifinal winners-to-be have too little rest after the later quarterfinals.");
  if (final && final.startMinutes - sfEnd < MIN_KNOCKOUT_REST_MINUTES) fail("Finalists have too little rest after the semifinals.");
  notes.push(`Teams in QF3 and QF4 get ${sfStart - lateQfEnd} minutes before the semifinals; teams in QF1 and QF2 get ${sfStart - Math.min(...qfs.map((m) => m.startMinutes + m.durationMinutes))}.`);
  if (final) notes.push(`Semifinal winners get ${final.startMinutes - sfEnd} minutes before the final.`);
  const groundBuffer = sun.filter((m) => m.slotIndex === 4);
  if (groundBuffer.length !== 1 || groundBuffer[0]?.ground !== "A") fail("Sunday's last league slot must use Ground A only, keeping Ground B free as a buffer.");

  const groups = new Set<GroupCode>(league.map((m) => m.group as GroupCode));
  if (groups.size !== 3) fail("League matches must cover Groups A, B and C.");
  return { errors, notes, minLeagueRestMinutes: Number.isFinite(minRest) ? minRest : 0 };
}
