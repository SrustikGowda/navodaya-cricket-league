import {
  ACTUAL_MATCHES,
  BYE_CODE,
  BYE_POSITION,
  DAYLIGHT_END_MINUTES,
  EARLIEST_START_MINUTES,
  FIXTURE_ENTRIES,
  GROUP_TEAMS,
  LEAGUE_MATCHES,
  LEAGUE_MATCHES_BY_GROUP,
  MIN_KNOCKOUT_REST_MINUTES,
  MIN_LEAGUE_REST_MINUTES,
  MIN_QUALIFICATION_WINDOW_MINUTES,
  OPPONENT_TEMPLATE,
  OVERS,
  QUALIFIERS_PER_GROUP,
  SATURDAY_TEMPLATE,
  SUNDAY_TEMPLATE,
  TEAM_COUNT,
} from "./config";
import { QF_PAIRINGS, SF_PAIRINGS } from "./bracket";
import { templatePairs } from "./schedule";
import type { DrawPlan, GroundCode, GroupCode, PlannedMatch, Stage } from "./types";

export type PlanReport = { errors: string[]; notes: string[]; minLeagueRestMinutes: number };

/**
 * Checks the fixed templates themselves: opponents are mutual, every team has three entries, the BYE is A9 only,
 * and the two-day order plays each pairing exactly once. Runs in the tests and before every draw.
 */
export function validateTemplates(): string[] {
  const errors: string[] = [];
  const fail = (message: string) => errors.push(message);
  for (const group of ["A", "B"] as const) {
    const table = OPPONENT_TEMPLATE[group];
    const positions = Object.keys(table);
    const expected = GROUP_TEAMS[group];
    if (positions.length !== expected) fail(`Group ${group} must list ${expected} positions.`);
    for (const [position, opponents] of Object.entries(table)) {
      if (opponents.length !== 3) fail(`${position} must have exactly three league entries.`);
      if (new Set(opponents).size !== opponents.length) fail(`${position} lists an opponent twice.`);
      if (opponents.includes(position)) fail(`${position} plays itself.`);
      for (const opponent of opponents) {
        if (opponent === "BYE") {
          if (position !== BYE_POSITION) fail(`Only ${BYE_POSITION} may have the BYE, not ${position}.`);
          continue;
        }
        if (!opponent.startsWith(group)) fail(`${position} meets ${opponent}, which is in another group.`);
        if (!table[opponent]) fail(`${position} meets ${opponent}, which is not a position.`);
        else if (!table[opponent]?.includes(position)) fail(`${position} meets ${opponent}, but ${opponent} does not list ${position}.`);
      }
    }
  }
  const byes = Object.values(OPPONENT_TEMPLATE).flatMap((table) => Object.values(table)).filter((list) => list.includes("BYE")).length;
  if (byes !== 1) fail(`There must be exactly one BYE, found ${byes}.`);

  const pairs = templatePairs();
  for (const group of ["A", "B"] as const) {
    const count = pairs.filter((pair) => pair.group === group).length;
    if (count !== LEAGUE_MATCHES_BY_GROUP[group]) fail(`Group ${group} must have ${LEAGUE_MATCHES_BY_GROUP[group]} matches, found ${count}.`);
  }

  // The two days play each pairing exactly once, with no team twice in one slot.
  const played = new Map<string, number>();
  const rows = [...SATURDAY_TEMPLATE.map((row) => ({ row, day: 1 })), ...SUNDAY_TEMPLATE.map((row) => ({ row, day: 2 }))];
  for (const { row, day } of rows) {
    const inSlot = row.flat();
    if (new Set(inSlot).size !== inSlot.length) fail(`A position plays twice in one slot on day ${day}.`);
    for (const pair of row) {
      const key = [...pair].sort().join("|");
      played.set(key, (played.get(key) ?? 0) + 1);
      if (pair[0].slice(0, 1) !== pair[1].slice(0, 1)) fail(`${pair[0]} v ${pair[1]} crosses groups.`);
    }
  }
  for (const pair of pairs) {
    const key = [pair.a, pair.b].sort().join("|");
    if (played.get(key) !== 1) fail(`${pair.a} v ${pair.b} is played ${played.get(key) ?? 0} times in the order of play.`);
  }
  if (played.size !== pairs.length) fail("The order of play contains a pairing that is not in the opponent template.");
  const sat = SATURDAY_TEMPLATE.length * 2;
  const sun = SUNDAY_TEMPLATE.length * 2;
  if (sat !== 20) fail(`Saturday must have 20 league matches, found ${sat}.`);
  if (sun !== 8) fail(`Sunday must have 8 league matches, found ${sun}.`);
  if (sat + sun !== LEAGUE_MATCHES) fail(`There must be ${LEAGUE_MATCHES} league matches.`);
  const first = SATURDAY_TEMPLATE[0]?.[0];
  if (!first || first[0] !== "A1" || first[1] !== "A2") fail("The first match must be A1 v A2 on Ground A.");
  return errors;
}

export type TimedMatch = {
  code: string;
  stage: Stage;
  /** IST calendar date, so the two days are never compared by minutes alone. */
  date: string;
  startMinutes: number;
  durationMinutes: number;
  ground: GroundCode;
  /** Known team ids. Empty for a knockout that still holds placeholders. */
  teams: string[];
};

export type ScheduleReport = { errors: string[]; notes: string[]; minLeagueRestMinutes: number };

const span = (m: TimedMatch) => ({ start: m.startMinutes, end: m.startMinutes + m.durationMinutes });

/**
 * Checks times alone: ground and team clashes, rest between a team's matches, daylight, and the order of the
 * knockouts. Used for the draw and again whenever an organizer changes the times, so both obey the same rules.
 */
export function checkSchedule(matches: TimedMatch[]): ScheduleReport {
  const errors: string[] = [];
  const notes: string[] = [];
  const fail = (message: string) => errors.push(message);

  for (const m of matches) {
    const { start, end } = span(m);
    if (m.durationMinutes <= 0) fail(`${m.code} needs a length of more than zero minutes.`);
    if (start < EARLIEST_START_MINUTES) fail(`${m.code} starts too early. Play begins no earlier than 6:30 AM.`);
    if (end > DAYLIGHT_END_MINUTES) fail(`${m.code} finishes after 5:45 PM. Every match must finish in daylight.`);
  }

  for (let i = 0; i < matches.length; i += 1) {
    for (let j = i + 1; j < matches.length; j += 1) {
      const x = matches[i] as TimedMatch;
      const y = matches[j] as TimedMatch;
      if (x.date !== y.date) continue;
      const a = span(x);
      const b = span(y);
      if (!(a.start < b.end && b.start < a.end)) continue;
      if (x.ground === y.ground) fail(`Ground ${x.ground} is double-booked by ${x.code} and ${y.code}.`);
      if (x.teams.some((team) => y.teams.includes(team))) fail(`A team is in overlapping matches ${x.code} and ${y.code}.`);
    }
  }

  const ids = new Set(matches.flatMap((m) => m.teams));
  let minRest = Infinity;
  for (const id of ids) {
    const own = matches.filter((m) => m.teams.includes(id)).sort((p, q) => p.date.localeCompare(q.date) || p.startMinutes - q.startMinutes);
    for (let i = 1; i < own.length; i += 1) {
      const before = own[i - 1] as TimedMatch;
      const after = own[i] as TimedMatch;
      if (before.date !== after.date) continue;
      const rest = after.startMinutes - (before.startMinutes + before.durationMinutes);
      const needed = before.stage === "league" && after.stage === "league" ? MIN_LEAGUE_REST_MINUTES : MIN_KNOCKOUT_REST_MINUTES;
      if (before.stage === "league" && after.stage === "league") minRest = Math.min(minRest, rest);
      if (rest < needed) fail(`A team has only ${rest} minutes between ${before.code} and ${after.code}. It needs at least ${needed}.`);
    }
  }

  // Knockout order: qualification window, then feeders before the matches they feed.
  const byCode = new Map(matches.map((m) => [m.code, m]));
  const leagueEnd = Math.max(0, ...matches.filter((m) => m.stage === "league" && m.date === (byCode.get("QF1")?.date ?? m.date)).map((m) => m.startMinutes + m.durationMinutes));
  for (const pairing of QF_PAIRINGS) {
    const qf = byCode.get(pairing.code);
    if (!qf) continue;
    const window = qf.startMinutes - leagueEnd;
    if (leagueEnd > 0 && window < MIN_QUALIFICATION_WINDOW_MINUTES) fail(`${qf.code} starts only ${window} minutes after the last league match. Standings need at least ${MIN_QUALIFICATION_WINDOW_MINUTES}.`);
  }
  const after = (code: string, feeders: readonly string[], what: string) => {
    const m = byCode.get(code);
    if (!m) return;
    for (const feeder of feeders) {
      const f = byCode.get(feeder);
      if (!f) continue;
      const gap = m.startMinutes - (f.startMinutes + f.durationMinutes);
      if (f.date === m.date && gap < MIN_KNOCKOUT_REST_MINUTES) fail(`${code} starts only ${gap} minutes after ${feeder}. ${what} need at least ${MIN_KNOCKOUT_REST_MINUTES}.`);
      if (f.date > m.date) fail(`${code} is before ${feeder}.`);
    }
  };
  for (const sf of SF_PAIRINGS) after(sf.code, sf.from, "Semifinalists");
  after("F", ["SF1", "SF2"], "Finalists");

  const qfs = matches.filter((m) => m.stage === "quarterfinal");
  const final = byCode.get("F");
  if (qfs.length > 0 && leagueEnd > 0) notes.push(`Standings window: ${Math.min(...qfs.map((m) => m.startMinutes)) - leagueEnd} minutes after the last league match.`);
  if (final) notes.push(`The final is booked ${Math.floor(final.durationMinutes)} minutes and is scheduled to end at ${clock(final.startMinutes + final.durationMinutes)}.`);
  return { errors, notes, minLeagueRestMinutes: Number.isFinite(minRest) ? minRest : 0 };
}

export function clock(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes % 60).padStart(2, "0")} ${suffix}`;
}

export function timedMatches(matches: PlannedMatch[]): TimedMatch[] {
  return matches.map((m) => ({
    code: m.code,
    stage: m.stage,
    date: m.date,
    startMinutes: m.startMinutes,
    durationMinutes: m.durationMinutes,
    ground: m.ground,
    teams: [m.teamA.teamId, m.teamB.teamId].filter((id): id is string => Boolean(id)),
  }));
}

/**
 * Independent re-check of every promise the draw makes. Runs before a plan is shown or saved and is the
 * same function the tests call, so a generator bug cannot hide behind its own assumptions.
 */
export function validatePlan(plan: DrawPlan): PlanReport {
  const errors: string[] = [];
  const fail = (message: string) => errors.push(message);
  const { result, matches } = plan;
  const rosterIds = new Set(plan.roster.map((team) => team.id));
  for (const message of validateTemplates()) fail(`Template: ${message}`);

  // Roster and groups
  if (plan.roster.length !== TEAM_COUNT || rosterIds.size !== TEAM_COUNT) fail(`Roster must be exactly ${TEAM_COUNT} distinct teams.`);
  const placed = result.assignments.map((a) => a.teamId);
  if (placed.length !== TEAM_COUNT || new Set(placed).size !== TEAM_COUNT) fail("Every team must appear exactly once in the group allocation.");
  for (const id of placed) if (!rosterIds.has(id)) fail(`Allocated team ${id} is not on the roster.`);
  for (const group of ["A", "B"] as const) {
    const members = result.assignments.filter((a) => a.group === group);
    if (members.length !== GROUP_TEAMS[group]) fail(`Group ${group} must have ${GROUP_TEAMS[group]} real teams.`);
    const slots = members.map((a) => a.slot).sort((x, y) => x - y);
    if (slots.join() !== Array.from({ length: GROUP_TEAMS[group] }, (_, i) => i + 1).join()) fail(`Group ${group} must fill positions ${group}1-${group}${GROUP_TEAMS[group]} once each.`);
  }

  // Seeded rules
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
    if (champion.group !== "A" || champion.slot !== 1) fail("The defending champion must be at A1.");
    if (runnerUp.group !== "B") fail("The runner-up must be in Group B.");
    if (champion.group === runnerUp.group) fail("Champion and runner-up must be in different groups.");
    if (semiOne.group === semiTwo.group) fail("The two other semifinalists must be in different groups.");
    for (const seed of [champion, runnerUp, semiOne, semiTwo]) {
      if (seed.group === "A" && seed.slot === 9) fail("A seeded team cannot be at A9.");
    }
    const inGroup = (group: GroupCode) => [champion, runnerUp, semiOne, semiTwo].filter((a) => a.group === group).length;
    if (inGroup("A") !== 2 || inGroup("B") !== 2) fail("Each group must start with exactly two seeded teams.");
  }

  // BYE
  const nine = result.assignments.find((a) => a.group === "A" && a.slot === 9);
  if (!nine || nine.teamId !== result.byeTeamId) fail("A9 must hold the BYE team.");
  if (nine?.seed) fail("The BYE team must not be a seeded team.");
  if (plan.bye.teamId !== result.byeTeamId || plan.bye.slot !== BYE_POSITION || plan.bye.code !== BYE_CODE) fail("The BYE entry must belong to the A9 team.");

  // Reveal covers every team once: seeds, draw, then the BYE.
  if (result.reveal.length !== TEAM_COUNT || new Set(result.reveal.map((r) => r.teamId)).size !== TEAM_COUNT) fail("The reveal sequence must list each team once.");
  result.reveal.forEach((step, index) => {
    const a = where(step.teamId);
    if (!a || a.group !== step.group || a.slot !== step.slot) fail(`Reveal step ${index + 1} disagrees with the allocation.`);
    const expected = index < 4 ? "seed" : index === TEAM_COUNT - 1 ? "bye" : "draw";
    if (step.phase !== expected) fail(`Reveal step ${index + 1} must be a ${expected} step.`);
  });
  if (result.reveal[0]?.teamId !== championId) fail("The defending champion must be revealed first.");
  if (result.reveal[TEAM_COUNT - 1]?.teamId !== result.byeTeamId) fail("The BYE team must be revealed last.");

  // League fixtures
  const league = matches.filter((m) => m.stage === "league");
  if (league.length !== LEAGUE_MATCHES) fail(`Expected ${LEAGUE_MATCHES} league fixtures, found ${league.length}.`);
  for (const group of ["A", "B"] as const) {
    const count = league.filter((m) => m.group === group).length;
    if (count !== LEAGUE_MATCHES_BY_GROUP[group]) fail(`Group ${group} must have ${LEAGUE_MATCHES_BY_GROUP[group]} league matches, found ${count}.`);
  }
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
    if (m.group !== a.group) fail(`League match ${m.code} is labelled with the wrong group.`);
    if (m.teamA.slot !== `${a.group}${a.slot}` || m.teamB.slot !== `${b.group}${b.slot}`) fail(`League match ${m.code} disagrees with the allocation.`);
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
    const own = league.filter((m) => m.teamA.teamId === id || m.teamB.teamId === id).length;
    const entries = own + (id === result.byeTeamId ? 1 : 0);
    const wanted = id === result.byeTeamId ? 2 : 3;
    if (entries !== 3) fail(`Team ${id} must have exactly three league fixture entries (found ${entries}).`);
    if (own !== wanted) fail(`Team ${id} must play ${wanted} league matches (found ${own}).`);
    if ((faced.get(id)?.size ?? 0) !== own) fail(`Team ${id} meets an opponent twice.`);
  }

  // Days
  const sat = league.filter((m) => m.day === 1);
  const sun = league.filter((m) => m.day === 2);
  if (sat.length !== 20) fail(`Expected 20 league matches on Saturday, found ${sat.length}.`);
  if (sun.length !== 8) fail(`Expected 8 league matches on Sunday, found ${sun.length}.`);

  // Total, knockouts, numbering, overs
  const count = (stage: Stage) => matches.filter((m) => m.stage === stage).length;
  if (count("quarterfinal") !== 4) fail("Expected four quarterfinals.");
  if (count("semifinal") !== 2) fail("Expected two semifinals.");
  if (count("final") !== 1) fail("Expected one final.");
  if (matches.length !== ACTUAL_MATCHES) fail(`Expected ${ACTUAL_MATCHES} matches, found ${matches.length}.`);
  if (matches.length + 1 !== FIXTURE_ENTRIES) fail(`Expected ${FIXTURE_ENTRIES} fixture entries including the BYE.`);
  if (new Set(matches.map((m) => m.code)).size !== matches.length) fail("Match codes must be unique.");
  matches.forEach((m, index) => {
    if (m.number !== index + 1) fail(`Match ${m.code} is numbered ${m.number}, expected ${index + 1}.`);
    if (m.overs !== OVERS[m.stage]) fail(`${m.code} must be ${OVERS[m.stage]} overs a side.`);
  });
  for (const m of matches.filter((x) => x.stage !== "league")) {
    if (m.teamA.teamId || m.teamB.teamId) fail(`${m.code} must hold qualification placeholders until the standings are confirmed.`);
    if (!m.teamA.placeholder || !m.teamB.placeholder) fail(`${m.code} needs placeholders on both sides.`);
  }
  for (const pairing of QF_PAIRINGS) {
    const qf = matches.find((m) => m.code === pairing.code);
    const want = [`rank:${pairing.a.group}:${pairing.a.rank}`, `rank:${pairing.b.group}:${pairing.b.rank}`];
    if (qf?.teamA.placeholder !== want[0] || qf?.teamB.placeholder !== want[1]) fail(`${pairing.code} must be Group ${pairing.a.group} #${pairing.a.rank} v Group ${pairing.b.group} #${pairing.b.rank}.`);
  }
  if (QUALIFIERS_PER_GROUP * 2 !== 8) fail("Eight teams must qualify.");

  // The opening match
  const first = [...matches].sort((p, q) => p.startsAt.localeCompare(q.startsAt) || p.ground.localeCompare(q.ground))[0];
  if (!first || first.number !== 1 || first.ground !== "A") fail("Match 1 must be the first match, on Ground A.");
  else if (first.teamA.slot !== "A1" || first.teamB.slot !== "A2" || first.teamA.teamId !== championId) fail("The opening match must be the defending champion at A1 against A2.");
  else if (first.teamB.teamId !== result.openingOpponentId) fail("The opening opponent must be the team at A2.");

  // Times, grounds, rest
  const timing = checkSchedule(timedMatches(matches));
  for (const message of timing.errors) fail(message);
  return { errors, notes: timing.notes, minLeagueRestMinutes: timing.minLeagueRestMinutes };
}
