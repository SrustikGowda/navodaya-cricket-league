import { istParts, istToIso } from "./format";

export type EngineFixture = {
  id: string;
  matchNumber?: number | null;
  groundId: string | null;
  teamAId: string | null;
  teamBId: string | null;
  teamALabel: string;
  teamBLabel: string;
  startsAt: string | null;
  durationMinutes: number | null;
  status: string;
  dependsOn?: { fixtureId: string; slot: "winner" | "loser"; teamSlot: "a" | "b" }[];
};

export type ScheduleConstraints = {
  dayStartMinutes: number | null;
  dayEndMinutes: number | null;
  breakStartMinutes: number | null;
  breakEndMinutes: number | null;
  transitionBufferMinutes: number | null;
  minRestMinutes: number | null;
};

export type ScheduleConflict = {
  code: string;
  message: string;
  fixtureIds: string[];
};

const BLOCKING = new Set(["scheduled", "delayed", "in_progress", "completed", "abandoned"]);

export function findScheduleConflicts(
  fixtures: EngineFixture[],
  constraints: ScheduleConstraints,
): { conflicts: ScheduleConflict[]; assumptions: string[] } {
  const conflicts: ScheduleConflict[] = [];
  const assumptions = [
    "Cancelled matches do not occupy a ground or a team.",
    "Touching start and end times are allowed. A buffer, when configured, extends the ground booking.",
    constraints.minRestMinutes == null
      ? "Minimum rest is not configured, so rest is not enforced."
      : `Minimum rest between a team's matches is ${constraints.minRestMinutes} minutes.`,
    constraints.transitionBufferMinutes == null
      ? "No transition buffer is configured."
      : `Grounds need ${constraints.transitionBufferMinutes} minutes between bookings.`,
    constraints.dayStartMinutes == null || constraints.dayEndMinutes == null
      ? "Daily operating hours are incomplete, so hour limits are not enforced."
      : "Matches must start and finish inside the configured operating hours, in IST.",
    constraints.breakStartMinutes == null || constraints.breakEndMinutes == null
      ? "No break window is configured."
      : "Matches may not overlap the configured break.",
    "Selected opponents are trusted as entered. Generation is a separate, explicit action.",
  ];

  const active = fixtures.filter((fixture) => BLOCKING.has(fixture.status));
  for (const fixture of active) {
    if (!fixture.startsAt || fixture.durationMinutes == null || fixture.durationMinutes <= 0) {
      conflicts.push({
        code: "missing_time",
        message: `${labelOf(fixture)} is missing a start time or duration, so overlap cannot be checked.`,
        fixtureIds: [fixture.id],
      });
    }
    if (fixture.teamAId && fixture.teamAId === fixture.teamBId) {
      conflicts.push({
        code: "team_plays_itself",
        message: `${labelOf(fixture)} lists the same team on both sides.`,
        fixtureIds: [fixture.id],
      });
    }
  }

  const timed = active.flatMap((fixture) => {
    const span = spanOf(fixture);
    return span ? [{ fixture, ...span }] : [];
  });

  for (let left = 0; left < timed.length; left += 1) {
    for (let right = left + 1; right < timed.length; right += 1) {
      const a = timed[left];
      const b = timed[right];
      if (!a || !b) continue;
      const buffer = (constraints.transitionBufferMinutes ?? 0) * 60_000;
      if (
        a.fixture.groundId &&
        a.fixture.groundId === b.fixture.groundId &&
        overlaps(a.start, a.end + buffer, b.start, b.end + buffer)
      ) {
        conflicts.push({
          code: "ground_overlap",
          message: `${labelOf(a.fixture)} and ${labelOf(b.fixture)} use the same ground at overlapping times.`,
          fixtureIds: [a.fixture.id, b.fixture.id],
        });
      }
      const shared = sharedTeam(a.fixture, b.fixture);
      if (shared && overlaps(a.start, a.end, b.start, b.end)) {
        conflicts.push({
          code: "team_overlap",
          message: `${shared} is scheduled in overlapping matches (${labelOf(a.fixture)} and ${labelOf(b.fixture)}).`,
          fixtureIds: [a.fixture.id, b.fixture.id],
        });
      }
    }
  }

  if (constraints.minRestMinutes != null) {
    const byTeam = new Map<string, { id: string; name: string; start: number; end: number; label: string }[]>();
    for (const item of timed) {
      for (const team of teamsOf(item.fixture)) {
        const list = byTeam.get(team.id) ?? [];
        list.push({ id: item.fixture.id, name: team.name, start: item.start, end: item.end, label: labelOf(item.fixture) });
        byTeam.set(team.id, list);
      }
    }
    for (const matches of byTeam.values()) {
      matches.sort((a, b) => a.start - b.start);
      for (let index = 1; index < matches.length; index += 1) {
        const previous = matches[index - 1];
        const next = matches[index];
        if (!previous || !next) continue;
        const gap = (next.start - previous.end) / 60_000;
        if (gap < constraints.minRestMinutes) {
          conflicts.push({
            code: "insufficient_rest",
            message: `${previous.name} has ${Math.max(0, Math.round(gap))} minutes between ${previous.label} and ${next.label}. The configured rest is ${constraints.minRestMinutes} minutes.`,
            fixtureIds: [previous.id, next.id],
          });
        }
      }
    }
  }

  if (constraints.dayStartMinutes != null && constraints.dayEndMinutes != null) {
    for (const item of timed) {
      const start = istParts(new Date(item.start).toISOString());
      const end = istParts(new Date(item.end).toISOString());
      if (start.date !== end.date || start.minutes < constraints.dayStartMinutes || end.minutes > constraints.dayEndMinutes) {
        conflicts.push({
          code: "outside_hours",
          message: `${labelOf(item.fixture)} falls outside the configured operating hours.`,
          fixtureIds: [item.fixture.id],
        });
      }
    }
  }

  if (constraints.breakStartMinutes != null && constraints.breakEndMinutes != null) {
    for (const item of timed) {
      const start = istParts(new Date(item.start).toISOString());
      const end = istParts(new Date(item.end).toISOString());
      if (start.date === end.date && start.minutes < constraints.breakEndMinutes && constraints.breakStartMinutes < end.minutes) {
        conflicts.push({
          code: "during_break",
          message: `${labelOf(item.fixture)} overlaps the configured break.`,
          fixtureIds: [item.fixture.id],
        });
      }
    }
  }

  const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  for (const fixture of active) {
    for (const dependency of fixture.dependsOn ?? []) {
      const earlier = byId.get(dependency.fixtureId);
      if (!earlier) {
        conflicts.push({
          code: "missing_dependency",
          message: `${labelOf(fixture)} depends on a match that is not in this schedule.`,
          fixtureIds: [fixture.id],
        });
        continue;
      }
      if (earlier.status === "cancelled") {
        conflicts.push({
          code: "dependency_cancelled",
          message: `${labelOf(fixture)} depends on ${labelOf(earlier)}, which is cancelled.`,
          fixtureIds: [fixture.id, earlier.id],
        });
        continue;
      }
      const parent = spanOf(earlier);
      const child = spanOf(fixture);
      if (!parent || !child) {
        conflicts.push({
          code: "dependency_missing_time",
          message: `Knockout order for ${labelOf(fixture)} cannot be checked because a start time or duration is missing.`,
          fixtureIds: [fixture.id, earlier.id],
        });
        continue;
      }
      if (child.start < parent.end) {
        conflicts.push({
          code: "dependency_order",
          message: `${labelOf(fixture)} starts before ${labelOf(earlier)} can finish.`,
          fixtureIds: [fixture.id, earlier.id],
        });
      }
    }
  }

  return { conflicts, assumptions };
}

export function downstreamFixtureIds(fixtures: { id: string; dependsOn: { fixtureId: string }[] }[], rootId: string): string[] {
  const found: string[] = [];
  const queue = [rootId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const fixture of fixtures) {
      if (seen.has(fixture.id)) continue;
      if (fixture.dependsOn.some((item) => item.fixtureId === current)) {
        seen.add(fixture.id);
        found.push(fixture.id);
        queue.push(fixture.id);
      }
    }
  }
  return found;
}

export type PlannedFixture = {
  matchNumber: number;
  stage: string;
  groundId: string;
  teamAId: string | null;
  teamBId: string | null;
  teamALabel: string;
  teamBLabel: string;
  startsAt: string;
  durationMinutes: number;
  dependsOn: { matchNumber: number; slot: "winner" | "loser"; teamSlot: "a" | "b" }[];
};

export function planRoundRobin(input: {
  teams: { id: string; label: string }[];
  grounds: { id: string; name: string }[];
  startDate: string;
  endDate: string;
  dayStartMinutes: number | null;
  dayEndMinutes: number | null;
  durationMinutes: number | null;
  bufferMinutes: number | null;
  restMinutes: number | null;
  breakStartMinutes: number | null;
  breakEndMinutes: number | null;
}): { ok: boolean; fixtures: PlannedFixture[]; conflicts: ScheduleConflict[]; assumptions: string[] } {
  const assumptions = [
    "This generates a full round robin: every team plays every other team in the selected group once.",
    "It does not copy a previous edition and does not decide the 2026 format.",
    "Matches against selected opponents only must be entered manually or by CSV.",
    "If every match cannot be placed inside the configured dates, hours, rest and buffers, nothing is saved.",
  ];
  if (input.teams.length < 2) {
    return { ok: false, fixtures: [], assumptions, conflicts: [issue("need_teams", "A round robin needs at least two teams.")] };
  }
  if (input.grounds.length === 0) {
    return { ok: false, fixtures: [], assumptions, conflicts: [issue("need_ground", "Add a ground before generating matches.")] };
  }
  if (input.dayStartMinutes == null || input.dayEndMinutes == null || input.durationMinutes == null || input.durationMinutes <= 0) {
    return {
      ok: false,
      fixtures: [],
      assumptions,
      conflicts: [
        issue(
          "need_constraints",
          "Set the daily opening time, closing time and match duration before generating a round robin. Selected matches can still be entered manually.",
        ),
      ],
    };
  }

  const pairings = roundRobinRounds(input.teams.map((team) => team.id));
  const labels = new Map(input.teams.map((team) => [team.id, team.label]));
  const fixtures: PlannedFixture[] = [];
  let matchNumber = 1;
  for (const pair of pairings) {
    const [teamA, teamB] = pair;
    if (!teamA || !teamB) continue;
    const slot = findSlot(fixtures, input, teamA, teamB);
    if (!slot) {
      return {
        ok: false,
        fixtures: [],
        assumptions,
        conflicts: [
          issue(
            "cannot_place",
            `Could not place ${labels.get(teamA)} vs ${labels.get(teamB)} inside the event dates without breaking the configured hours, rest or ground gap. No matches were created.`,
          ),
        ],
      };
    }
    fixtures.push({
      matchNumber,
      stage: "league",
      groundId: slot.groundId,
      teamAId: teamA,
      teamBId: teamB,
      teamALabel: labels.get(teamA) ?? teamA,
      teamBLabel: labels.get(teamB) ?? teamB,
      startsAt: istToIso(slot.date, slot.minutes),
      durationMinutes: input.durationMinutes,
      dependsOn: [],
    });
    matchNumber += 1;
  }
  return { ok: true, fixtures, assumptions, conflicts: [] };
}

export function planKnockout(input: {
  teams: { id: string; label: string }[];
  groundId: string;
  startIso: string;
  durationMinutes: number;
  bufferMinutes: number;
}): { ok: boolean; fixtures: PlannedFixture[]; conflicts: ScheduleConflict[]; assumptions: string[] } {
  const assumptions = [
    "This builds a single-elimination bracket from the listed seeds.",
    "The field must already be a power of two. Byes are not invented.",
    "Later rounds use winner labels such as Winner SF1. They are not fictional teams.",
    "Nothing is saved when the generated times break the schedule checks.",
  ];
  const count = input.teams.length;
  if (count < 2 || (count & (count - 1)) !== 0) {
    return {
      ok: false,
      fixtures: [],
      assumptions,
      conflicts: [issue("knockout_field", "Knockout generation needs 2, 4, 8 or 16 teams. Add an explicit bye match manually instead of expecting one to be invented.")],
    };
  }
  const fixtures: PlannedFixture[] = [];
  let cursor = new Date(input.startIso).getTime();
  let matchNumber = 1;
  let entrants: { id: string | null; label: string; from?: number }[] = input.teams.map((team) => ({
    id: team.id,
    label: team.label,
  }));
  while (entrants.length >= 2) {
    const meta = roundMeta(entrants.length);
    const next: { id: string | null; label: string; from?: number }[] = [];
    for (let index = 0; index < entrants.length; index += 2) {
      const left = entrants[index];
      const right = entrants[index + 1];
      if (!left || !right) continue;
      const code = `${meta.code}${meta.code === "F" ? "" : fixtures.filter((fixture) => fixture.stage === meta.stage).length + 1}`;
      const number = matchNumber;
      fixtures.push({
        matchNumber: number,
        stage: meta.stage,
        groundId: input.groundId,
        teamAId: left.id,
        teamBId: right.id,
        teamALabel: left.label,
        teamBLabel: right.label,
        startsAt: new Date(cursor).toISOString(),
        durationMinutes: input.durationMinutes,
        dependsOn: [left.from, right.from].flatMap((from, slot) =>
          from
            ? [{ matchNumber: from, slot: "winner" as const, teamSlot: slot === 0 ? ("a" as const) : ("b" as const) }]
            : [],
        ),
      });
      next.push({ id: null, label: `Winner ${code}`, from: number });
      matchNumber += 1;
      cursor += (input.durationMinutes + input.bufferMinutes) * 60_000;
    }
    entrants = next;
  }
  return { ok: true, fixtures, assumptions, conflicts: [] };
}

export function shiftGround(input: {
  fixtures: EngineFixture[];
  groundId: string;
  fromIso: string;
  delayMinutes: number;
}): EngineFixture[] {
  const from = new Date(input.fromIso).getTime();
  return input.fixtures.map((fixture) => {
    if (fixture.groundId !== input.groundId || !fixture.startsAt) return fixture;
    if (fixture.status !== "scheduled" && fixture.status !== "delayed") return fixture;
    if (new Date(fixture.startsAt).getTime() < from) return fixture;
    return {
      ...fixture,
      startsAt: new Date(new Date(fixture.startsAt).getTime() + input.delayMinutes * 60_000).toISOString(),
      status: "delayed",
    };
  });
}

function roundRobinRounds(ids: string[]): string[][] {
  const list = [...ids];
  if (list.length % 2 === 1) list.push("BYE");
  const count = list.length;
  const rounds: string[][] = [];
  for (let round = 0; round < count - 1; round += 1) {
    for (let index = 0; index < count / 2; index += 1) {
      const left = list[index];
      const right = list[count - 1 - index];
      if (left && right && left !== "BYE" && right !== "BYE") rounds.push([left, right]);
    }
    const next = list.pop();
    if (next) list.splice(1, 0, next);
  }
  return rounds;
}

function findSlot(
  existing: PlannedFixture[],
  input: {
    grounds: { id: string }[];
    startDate: string;
    endDate: string;
    dayStartMinutes: number | null;
    dayEndMinutes: number | null;
    durationMinutes: number | null;
    bufferMinutes: number | null;
    restMinutes: number | null;
    breakStartMinutes: number | null;
    breakEndMinutes: number | null;
  },
  teamA: string,
  teamB: string,
): { date: string; minutes: number; groundId: string } | null {
  const duration = input.durationMinutes ?? 0;
  const buffer = input.bufferMinutes ?? 0;
  const rest = input.restMinutes ?? 0;
  const dayStart = input.dayStartMinutes ?? 0;
  const dayEnd = input.dayEndMinutes ?? 0;
  for (const date of eachDate(input.startDate, input.endDate)) {
    for (let minutes = dayStart; minutes + duration <= dayEnd; minutes += 5) {
      const end = minutes + duration;
      if (
        input.breakStartMinutes != null &&
        input.breakEndMinutes != null &&
        minutes < input.breakEndMinutes &&
        input.breakStartMinutes < end
      ) {
        continue;
      }
      for (const ground of input.grounds) {
        const startIso = istToIso(date, minutes);
        const startMs = new Date(startIso).getTime();
        const endMs = startMs + duration * 60_000;
        const groundBusy = existing.some((fixture) => {
          if (fixture.groundId !== ground.id) return false;
          const otherStart = new Date(fixture.startsAt).getTime();
          const otherEnd = otherStart + fixture.durationMinutes * 60_000 + buffer * 60_000;
          return overlaps(startMs, endMs + buffer * 60_000, otherStart, otherEnd);
        });
        if (groundBusy) continue;
        const teamBusy = existing.some((fixture) => {
          const involved = [fixture.teamAId, fixture.teamBId];
          if (!involved.includes(teamA) && !involved.includes(teamB)) return false;
          const otherStart = new Date(fixture.startsAt).getTime();
          const otherEnd = otherStart + fixture.durationMinutes * 60_000;
          return overlaps(startMs, endMs + rest * 60_000, otherStart, otherEnd + rest * 60_000);
        });
        if (teamBusy) continue;
        return { date, minutes, groundId: ground.id };
      }
    }
  }
  return null;
}

function eachDate(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00+05:30`);
  const last = new Date(`${end}T00:00:00+05:30`);
  while (cursor.getTime() <= last.getTime() && dates.length < 14) {
    const parts = istParts(cursor.toISOString());
    dates.push(parts.date);
    cursor.setTime(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return dates;
}

function roundMeta(teamCount: number): { stage: string; code: string } {
  if (teamCount === 2) return { stage: "final", code: "F" };
  if (teamCount === 4) return { stage: "semi-final", code: "SF" };
  if (teamCount === 8) return { stage: "quarter-final", code: "QF" };
  return { stage: "knockout", code: "KO" };
}

function spanOf(fixture: EngineFixture): { start: number; end: number } | null {
  if (!fixture.startsAt || fixture.durationMinutes == null || fixture.durationMinutes <= 0) return null;
  const start = new Date(fixture.startsAt).getTime();
  if (Number.isNaN(start)) return null;
  return { start, end: start + fixture.durationMinutes * 60_000 };
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function teamsOf(fixture: EngineFixture): { id: string; name: string }[] {
  const teams: { id: string; name: string }[] = [];
  if (fixture.teamAId) teams.push({ id: fixture.teamAId, name: fixture.teamALabel });
  if (fixture.teamBId) teams.push({ id: fixture.teamBId, name: fixture.teamBLabel });
  return teams;
}

function sharedTeam(a: EngineFixture, b: EngineFixture): string | null {
  for (const team of teamsOf(a)) {
    if (b.teamAId === team.id || b.teamBId === team.id) return team.name;
  }
  return null;
}

function labelOf(fixture: EngineFixture): string {
  const number = fixture.matchNumber ? `Match ${fixture.matchNumber}` : "A match";
  return `${number} (${fixture.teamALabel} vs ${fixture.teamBLabel})`;
}

function issue(code: string, message: string): ScheduleConflict {
  return { code, message, fixtureIds: [] };
}
