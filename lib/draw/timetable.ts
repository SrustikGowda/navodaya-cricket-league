import { z } from "zod";
import { writeAudit } from "../audit";
import type { Db, Queryable } from "../db";
import { DomainError } from "../errors";
import { istParts } from "../format";
import { clearReadCache } from "../read-cache";
import { num, requiredStr, str, type Row } from "../rows";
import { getActiveSeason, lockActiveSeason } from "../season";
import type { Actor } from "../types";
import { istInstant } from "./bracket";
import { DEFAULT_TIMETABLE, GROUND_NAMES, type Timetable } from "./config";
import { applyTimetable } from "./schedule";
import { canRearrangeMatch, putMatchInSlot, type ScheduleMatch } from "./schedule-editor";
import { getOfficialDraw, parseTimetable, seasonDays } from "./service";
import type { GroundCode, OfficialDrawView, PlannedMatch } from "./types";
import { checkSchedule, clock } from "./validate";

const STARTED = new Set(["in_progress", "completed", "abandoned"]);

export type TimetablePatch = Partial<Timetable>;

export type TimetableChange = { code: string; from: string; to: string; fromGround: GroundCode; toGround: GroundCode };

export type ReschedulePreview = {
  timetable: Timetable;
  changes: TimetableChange[];
  errors: string[];
  notes: string[];
};

type FixtureTime = ScheduleMatch & { startsAt: string; groundId: string | null };

const FIELD_LIMITS: Record<keyof Timetable, [number, number]> = {
  saturdayStart: [360, 900],
  sundayStart: [360, 900],
  slotMinutes: [30, 120],
  leagueMinutes: [20, 120],
  breakAfterSlots: [0, 10],
  breakMinutes: [0, 180],
  quarterfinalMinutes: [20, 120],
  semifinalMinutes: [20, 150],
  finalMinutes: [20, 150],
  qf1: [360, 1080],
  qf2: [360, 1080],
  sf: [360, 1080],
  final: [360, 1080],
};

/** Merges a change into the times in force. Every value must be a whole number of minutes in a sensible range. */
export function mergeTimetable(current: Timetable, patch: TimetablePatch): Timetable {
  const next = { ...current } as Record<string, number>;
  for (const [key, [low, high]] of Object.entries(FIELD_LIMITS)) {
    const raw = (patch as Record<string, unknown>)[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < low || value > high) {
      throw new DomainError(`"${key}" must be a whole number between ${low} and ${high}.`, 422, "timetable");
    }
    next[key] = value;
  }
  return next as unknown as Timetable;
}

async function loadFixtureTimes(query: Queryable, drawId: string, options?: { publishedOnly?: boolean; lock?: boolean }): Promise<FixtureTime[]> {
  const rows = await query.query<Row>(
    `select f.id, f.code, f.stage, f.status, f.version, f.starts_at, f.duration_minutes, f.ground_id, g.name as ground_name,
            f.team_a_registration_id, f.team_b_registration_id, f.team_a_label, f.team_b_label
     from fixtures f join schedule_versions sv on sv.id = f.schedule_version_id left join grounds g on g.id = f.ground_id
     where f.draw_id = $1 and not f.is_bye and f.starts_at is not null
       ${options?.publishedOnly ? "and sv.status = 'published'" : ""}
     order by f.match_number ${options?.lock ? "for update of f" : ""}`,
    [drawId],
  );
  return rows.map((row) => {
    const startsAt = requiredStr(row, "starts_at");
    const parts = istParts(startsAt);
    const groundName = str(row, "ground_name");
    return {
      id: requiredStr(row, "id"),
      code: requiredStr(row, "code"),
      stage: requiredStr(row, "stage") as PlannedMatch["stage"],
      status: requiredStr(row, "status"),
      version: num(row, "version") ?? 1,
      startsAt,
      date: parts.date,
      startMinutes: parts.minutes,
      durationMinutes: num(row, "duration_minutes") ?? 55,
      ground: groundName === GROUND_NAMES.B ? "B" : "A",
      groundId: str(row, "ground_id"),
      teams: [str(row, "team_a_registration_id"), str(row, "team_b_registration_id")].filter((id): id is string => Boolean(id)),
      teamALabel: requiredStr(row, "team_a_label"),
      teamBLabel: requiredStr(row, "team_b_label"),
    };
  });
}

const when = (date: string, minutes: number) => `${date.slice(8)}/${date.slice(5, 7)} ${clock(minutes)}`;

/** Works out what new times would do, without saving anything. Matches already started keep their times. */
async function plan(query: Queryable, draw: OfficialDrawView, patch: TimetablePatch): Promise<ReschedulePreview & { fixtures: FixtureTime[]; next: FixtureTime[] }> {
  const timetable = mergeTimetable(draw.timetable, patch);
  const days = seasonDays(await getActiveSeason(query));
  const wanted = new Map(applyTimetable(draw.plan.matches, days, timetable).map((m) => [m.code, m]));
  const fixtures = await loadFixtureTimes(query, draw.id);
  const next = fixtures.map((fixture) => {
    const target = wanted.get(fixture.code);
    if (!target || STARTED.has(fixture.status)) return fixture;
    return { ...fixture, date: target.date, startMinutes: target.startMinutes, durationMinutes: target.durationMinutes, ground: target.ground };
  });
  const changes: TimetableChange[] = [];
  for (const [index, fixture] of fixtures.entries()) {
    const after = next[index] as FixtureTime;
    if (after.date !== fixture.date || after.startMinutes !== fixture.startMinutes || after.durationMinutes !== fixture.durationMinutes || after.ground !== fixture.ground) {
      changes.push({ code: fixture.code, from: when(fixture.date, fixture.startMinutes), to: when(after.date, after.startMinutes), fromGround: fixture.ground, toGround: after.ground });
    }
  }
  const report = checkSchedule(next);
  return { timetable, changes, errors: report.errors, notes: report.notes, fixtures, next };
}

function summary(full: ReschedulePreview): ReschedulePreview {
  return { timetable: full.timetable, changes: full.changes, errors: full.errors, notes: full.notes };
}

async function currentDraw(query: Queryable): Promise<OfficialDrawView> {
  const draw = await getOfficialDraw(query);
  if (!draw) throw new DomainError("There is no official draw to reschedule.", 404, "no_draw");
  return draw;
}

export async function previewReschedule(db: Db, actor: Actor, patch: TimetablePatch): Promise<ReschedulePreview> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const draw = await currentDraw(db);
  return summary(await plan(db, draw, patch));
}

async function groundIds(query: Queryable, seasonId: string): Promise<Map<GroundCode, string>> {
  const rows = await query.query<Row>("select id, name from grounds where season_id = $1", [seasonId]);
  const map = new Map<GroundCode, string>();
  for (const row of rows) {
    const name = requiredStr(row, "name");
    if (name === GROUND_NAMES.A) map.set("A", requiredStr(row, "id"));
    if (name === GROUND_NAMES.B) map.set("B", requiredStr(row, "id"));
  }
  return map;
}

/**
 * Changes the times of the unplayed matches. Opponents never change: the plan, the groups and the pairings are not
 * touched. The same rules as the draw apply (ground and team clashes, rest, daylight, knockout order); any breach
 * refuses the whole change. Public pages show the new times and a "rescheduled" note straight away.
 */
export async function rescheduleOfficialDraw(db: Db, actor: Actor, input: { patch: TimetablePatch; note: string }): Promise<ReschedulePreview> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const note = input.note.trim().slice(0, 200) || "New match times";
  const result = await db.tx(async (query) => {
    const season = await lockActiveSeason(query);
    const draw = await currentDraw(query);
    const preview = await plan(query, draw, input.patch);
    if (preview.errors.length > 0) throw new DomainError(`These times break the rules: ${preview.errors.join(" ")} Nothing was changed.`, 422, "timetable_invalid", preview.errors);
    const grounds = await groundIds(query, season.id);
    for (const [index, fixture] of preview.fixtures.entries()) {
      const after = preview.next[index] as FixtureTime;
      const moved = preview.changes.some((change) => change.code === fixture.code);
      if (!moved) continue;
      await query.execute(
        `update fixtures set starts_at = $1, duration_minutes = $2, ground_id = $3, change_note = $4,
           updated_at = now(), version = version + 1, calendar_sequence = calendar_sequence + 1 where id = $5`,
        [istInstant(after.date, after.startMinutes), after.durationMinutes, grounds.get(after.ground), `Rescheduled: ${note}`, fixture.id],
      );
    }
    await query.execute("update draws set timetable = $1::jsonb where id = $2", [JSON.stringify(preview.timetable), draw.id]);
    await writeAudit(query, actor.id, "draw.reschedule", "draw", draw.id, {
      note,
      before: draw.timetable,
      after: preview.timetable,
      changed: preview.changes.length,
      changes: preview.changes,
    });
    return summary(preview);
  });
  clearReadCache();
  return result;
}

/** Moves one unplayed match to another time or ground, under the same rules. */
export async function moveMatch(db: Db, actor: Actor, input: { code: string; startMinutes?: number; ground?: GroundCode; note: string }): Promise<{ code: string }> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const note = input.note.trim().slice(0, 200) || "Match moved";
  await db.tx(async (query) => {
    const season = await lockActiveSeason(query);
    const draw = await currentDraw(query);
    const fixtures = await loadFixtureTimes(query, draw.id);
    const target = fixtures.find((fixture) => fixture.code === input.code);
    if (!target) throw new DomainError("That match is not part of the official draw.", 404, "not_found");
    if (STARTED.has(target.status)) throw new DomainError("This match has started. Its time cannot be changed.", 409, "started");
    const startMinutes = input.startMinutes ?? target.startMinutes;
    if (!Number.isInteger(startMinutes) || startMinutes < 0 || startMinutes > 1439) throw new DomainError("Enter a valid start time.", 422, "time");
    const ground = input.ground ?? target.ground;
    const next = fixtures.map((fixture) => (fixture.id === target.id ? { ...fixture, startMinutes, ground } : fixture));
    const report = checkSchedule(next);
    if (report.errors.length > 0) throw new DomainError(`That change breaks the rules: ${report.errors.join(" ")} Nothing was changed.`, 422, "timetable_invalid", report.errors);
    const grounds = await groundIds(query, season.id);
    await query.execute(
      `update fixtures set starts_at = $1, ground_id = $2, change_note = $3, updated_at = now(), version = version + 1,
         calendar_sequence = calendar_sequence + 1 where id = $4`,
      [istInstant(target.date, startMinutes), grounds.get(ground), `Rescheduled: ${note}`, target.id],
    );
    await writeAudit(query, actor.id, "draw.move_match", "fixture", target.id, {
      code: target.code,
      from: when(target.date, target.startMinutes),
      to: when(target.date, startMinutes),
      fromGround: target.ground,
      toGround: ground,
      note,
    });
  });
  clearReadCache();
  return { code: input.code };
}

export async function loadScheduleEditor(db: Queryable) {
  const draw = await getOfficialDraw(db);
  if (!draw) return null;
  const matches = await loadFixtureTimes(db, draw.id, { publishedOnly: true });
  if (matches.length === 0) return null;
  const days = [...new Set([...draw.plan.matches, ...matches].map((match) => match.date))].sort();
  return { drawId: draw.id, matches, days, teams: draw.plan.roster };
}

const reorderSchema = z.strictObject({
  drawId: z.uuid(),
  moves: z.array(z.strictObject({ fixtureId: z.uuid(), slotId: z.uuid(), version: z.number().int().positive() })).min(2),
});

/** Publish a permutation of existing slots. The request cannot change a fixture's teams or duration. */
export async function reorderOfficialSchedule(db: Db, actor: Actor, input: unknown): Promise<{ count: number; matches: ScheduleMatch[] }> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) throw new DomainError("Choose at least two matches to rearrange.", 422, "invalid_reorder");
  const { drawId, moves } = parsed.data;
  const byFixture = new Map(moves.map((move) => [move.fixtureId, move]));
  const destinations = new Set(moves.map((move) => move.slotId));
  if (byFixture.size !== moves.length || destinations.size !== moves.length || moves.some((move) => move.fixtureId === move.slotId || !byFixture.has(move.slotId))) {
    throw new DomainError("Each match must be assigned to a different slot from the same set of matches.", 422, "invalid_reorder");
  }

  const result = await db.tx(async (query) => {
    await lockActiveSeason(query);
    const draw = await currentDraw(query);
    const fixtures = await loadFixtureTimes(query, draw.id, { publishedOnly: true, lock: true });
    const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
    if (drawId !== draw.id || moves.some((move) => byId.get(move.fixtureId)?.version !== move.version)) {
      throw new DomainError("The schedule changed while you were editing. Reload this page to use the latest schedule.", 409, "version_conflict");
    }
    const changes = moves.map(({ fixtureId, slotId }) => ({ before: byId.get(fixtureId)!, slot: byId.get(slotId)! }));
    if (changes.some(({ before, slot }) => !before.groundId || !slot.groundId || !canRearrangeMatch(before))) {
      throw new DomainError("Only scheduled or delayed matches with a time and ground can be rearranged.", 422, "locked_match");
    }

    const next = fixtures.map((match) => {
      const move = byFixture.get(match.id);
      return move ? putMatchInSlot(match, byId.get(move.slotId)!) : match;
    });
    const { errors } = checkSchedule(next);
    if (errors.length > 0) throw new DomainError(`The proposed schedule has conflicts. ${errors.join(" ")}`, 422, "timetable_invalid", errors);

    for (const { before, slot } of changes) {
      await query.execute(
        `update fixtures set starts_at = $1, ground_id = $2, change_note = 'Rescheduled: match slots rearranged',
           updated_at = now(), version = version + 1, calendar_sequence = calendar_sequence + 1 where id = $3`,
        [slot.startsAt, slot.groundId, before.id],
      );
    }
    await writeAudit(query, actor.id, "draw.reorder_schedule", "draw", draw.id, {
      changes: changes.map(({ before, slot }) => ({ code: before.code, from: before.startsAt, to: slot.startsAt, fromGround: before.ground, toGround: slot.ground })),
    });
    return { count: changes.length, matches: await loadFixtureTimes(query, draw.id, { publishedOnly: true }) };
  });
  clearReadCache();
  return result;
}

export { DEFAULT_TIMETABLE, parseTimetable };
