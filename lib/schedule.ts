import { writeAudit } from "./audit";
import { clearReadCache } from "./read-cache";
import { parseCsv } from "./csv";
import type { Db, Queryable } from "./db";
import { DomainError } from "./errors";
import { parseIstInput } from "./format";
import { num, requiredStr, str, type Row } from "./rows";
import {
  downstreamFixtureIds,
  findScheduleConflicts,
  planKnockout,
  planRoundRobin,
  shiftGround,
  type EngineFixture,
  type PlannedFixture,
} from "./schedule-engine";
import { getActiveSeason, getScheduleSettings, lockActiveSeason, mapSettings, type ScheduleSettings } from "./season";
import type { Actor } from "./types";

export type FixtureRecord = EngineFixture & {
  stage: string;
  seasonId: string;
  scheduleVersionId: string;
  groundName: string | null;
  reportingMinutesBefore: number | null;
  overs: number | null;
  changeNote: string | null;
  calendarSequence: number;
  scorecardUrl: string | null;
  livestreamUrl: string | null;
  summary: string | null;
  summarySource: string | null;
  summaryUpdatedAt: string | null;
  winnerRegistrationId: string | null;
  winnerLabel: string | null;
  needsResolution: boolean;
  resolutionNote: string | null;
  version: number;
  updatedAt: string | null;
};

const STATUSES = ["scheduled", "delayed", "in_progress", "completed", "abandoned", "cancelled"] as const;

export async function ensureDraft(db: Queryable, actor: Actor): Promise<string> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const season = await getActiveSeason(db);
  const existing = await db.query<{ id: string }>(
    "select id from schedule_versions where season_id = $1 and status = 'draft'",
    [season.id],
  );
  if (existing[0]) return existing[0].id;
  const created = await db.query<{ id: string }>(
    "insert into schedule_versions (season_id, status, created_by) values ($1, 'draft', $2) returning id",
    [season.id, actor.id],
  );
  return created[0]?.id ?? "";
}

export async function listAdminFixtures(db: Queryable, actor: Actor, source: "draft" | "published" = "draft"): Promise<FixtureRecord[]> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const season = await getActiveSeason(db);
  return loadVersionFixtures(db, season.id, source);
}

export async function checkSchedule(db: Queryable, actor: Actor) {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const season = await getActiveSeason(db);
  const settings = await getScheduleSettings(db, season.id);
  const fixtures = await loadVersionFixtures(db, season.id, "draft");
  return { ...findScheduleConflicts(fixtures, constraintsOf(settings)), fixtureCount: fixtures.length };
}

export async function publishSchedule(db: Db, actor: Actor, note: string): Promise<{ versionId: string }> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  return db.tx(async (query) => {
    const season = await lockActiveSeason(query);
    const settings = await getScheduleSettings(query, season.id);
    const draft = await query.query<{ id: string }>(
      "select id from schedule_versions where season_id = $1 and status = 'draft' for update",
      [season.id],
    );
    if (!draft[0]) throw new DomainError("There is no draft schedule to publish.");
    const fixtures = await loadFixturesByVersion(query, draft[0].id);
    if (fixtures.length === 0) throw new DomainError("Add at least one match before publishing.");
    const report = findScheduleConflicts(fixtures, constraintsOf(settings));
    if (report.conflicts.length > 0) {
      throw new DomainError("The draft was not published. Resolve the schedule conflicts first.", 422, "schedule_conflict", report);
    }
    await query.execute(
      "update schedule_versions set status = 'archived' where season_id = $1 and status = 'published'",
      [season.id],
    );
    await query.execute(
      "update schedule_versions set status = 'published', note = $1, published_at = now() where id = $2",
      [note.trim() || null, draft[0].id],
    );
    await writeAudit(query, actor.id, "schedule.publish", "schedule_version", draft[0].id, { matches: fixtures.length });
    clearReadCache();
    return { versionId: draft[0].id };
  });
}

export async function restoreSchedule(db: Db, actor: Actor, versionId: string): Promise<void> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  await db.tx(async (query) => {
    const season = await lockActiveSeason(query);
    const target = await query.query<{ id: string; status: string }>(
      "select id, status from schedule_versions where id = $1 and season_id = $2 for update",
      [versionId, season.id],
    );
    if (!target[0] || target[0].status === "draft") throw new DomainError("Choose an archived or previously published schedule.");
    await query.execute("update schedule_versions set status = 'archived' where season_id = $1 and status = 'published'", [season.id]);
    await query.execute("update schedule_versions set status = 'published', published_at = now() where id = $1", [versionId]);
    await writeAudit(query, actor.id, "schedule.restore", "schedule_version", versionId, {});
  });
}

export async function addGround(db: Db, actor: Actor, name: string): Promise<{ id: string; name: string }> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new DomainError("Give the ground a name. This does not invent a map location.");
  const season = await getActiveSeason(db);
  const rows = await db.query<{ id: string; name: string }>(
    `insert into grounds (season_id, name, sort_order)
     values ($1, $2, (select coalesce(max(sort_order), 0) + 1 from grounds where season_id = $1))
     returning id, name`,
    [season.id, trimmed],
  );
  const ground = rows[0];
  if (!ground) throw new DomainError("The ground was not saved.");
  return ground;
}

export async function listGrounds(db: Queryable, seasonId: string) {
  return db.query<{ id: string; name: string; sort_order: number }>(
    "select id, name, sort_order from grounds where season_id = $1 order by sort_order, name",
    [seasonId],
  );
}

export async function createGroup(db: Db, actor: Actor, name: string): Promise<{ id: string }> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const season = await getActiveSeason(db);
  const rows = await db.query<{ id: string }>(
    "insert into groups (season_id, name) values ($1, $2) returning id",
    [season.id, name.trim()],
  );
  if (!rows[0]) throw new DomainError("The group was not saved.");
  return rows[0];
}

export async function setGroupMembers(db: Db, actor: Actor, groupId: string, registrationIds: string[]): Promise<void> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const season = await getActiveSeason(db);
  await db.tx(async (query) => {
    const group = await query.query("select id from groups where id = $1 and season_id = $2", [groupId, season.id]);
    if (!group[0]) throw new DomainError("Group not found.", 404, "not_found");
    await query.execute("delete from group_memberships where group_id = $1", [groupId]);
    for (const registrationId of registrationIds) {
      const team = await query.query(
        "select id from registrations where id = $1 and season_id = $2 and status = 'approved'",
        [registrationId, season.id],
      );
      if (!team[0]) throw new DomainError("Only approved teams can be placed in a group.");
      await query.execute("insert into group_memberships (group_id, registration_id) values ($1, $2)", [groupId, registrationId]);
    }
  });
}

export async function addManualFixture(
  db: Db,
  actor: Actor,
  input: {
    stage?: string;
    groundId: string;
    teamA: string;
    teamB: string;
    startsAt: string;
    durationMinutes: number;
    overs?: number | null;
    reportingMinutesBefore?: number | null;
    matchNumber?: number | null;
  },
): Promise<FixtureRecord> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const versionId = await ensureDraft(db, actor);
  const season = await getActiveSeason(db);
  const starts = parseIstInput(input.startsAt);
  if (!starts) throw new DomainError("Enter the start time in IST, such as 2026-11-28 09:30.");
  if (!input.durationMinutes || input.durationMinutes <= 0) throw new DomainError("Enter the match duration in minutes.");
  const sideA = await resolveSide(db, season.id, input.teamA);
  const sideB = await resolveSide(db, season.id, input.teamB);
  const rows = await db.query(
    `insert into fixtures (
      season_id, schedule_version_id, match_number, stage, ground_id,
      team_a_registration_id, team_b_registration_id, team_a_label, team_b_label,
      starts_at, duration_minutes, overs, reporting_minutes_before, status
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'scheduled') returning id`,
    [
      season.id,
      versionId,
      input.matchNumber ?? null,
      input.stage?.trim() || "league",
      input.groundId,
      sideA.id,
      sideB.id,
      sideA.label,
      sideB.label,
      starts,
      input.durationMinutes,
      input.overs ?? null,
      input.reportingMinutesBefore ?? null,
    ],
  );
  const fixtures = await loadFixturesByVersion(db, versionId);
  const saved = fixtures.find((fixture) => fixture.id === rows[0]?.id);
  if (!saved) throw new DomainError("The match was not saved.");
  return saved;
}

export async function importFixtures(db: Db, actor: Actor, csv: string, replace: boolean): Promise<{ count: number }> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const parsed = parseCsv(csv);
  if (parsed.errors.length > 0) throw new DomainError(parsed.errors.join(" "), 422, "csv");
  const season = await getActiveSeason(db);
  const grounds = await listGrounds(db, season.id);
  const planned: (PlannedFixture & { overs: number | null; reporting: number | null })[] = [];
  const errors: string[] = [];
  parsed.rows.forEach((row, index) => {
    const line = index + 2;
    const ground = grounds.find((item) => item.name.toLowerCase() === (row.ground ?? "").toLowerCase());
    const starts = parseIstInput(row.starts_at ?? "");
    const duration = Number(row.duration_minutes);
    if (!ground) errors.push(`Row ${line}: ground "${row.ground ?? ""}" has not been added.`);
    if (!starts) errors.push(`Row ${line}: start time must be an IST date and time.`);
    if (!Number.isInteger(duration) || duration <= 0) errors.push(`Row ${line}: duration_minutes must be a positive whole number.`);
    if (!row.team_a || !row.team_b) errors.push(`Row ${line}: both teams are required. Use a label such as Winner QF1 when the side is not a team yet.`);
    if (errors.length > 0 || !ground || !starts) return;
    planned.push({
      matchNumber: Number(row.match_number) || index + 1,
      stage: row.stage || "league",
      groundId: ground.id,
      teamAId: null,
      teamBId: null,
      teamALabel: row.team_a ?? "",
      teamBLabel: row.team_b ?? "",
      startsAt: starts,
      durationMinutes: duration,
      overs: row.overs ? Number(row.overs) : null,
      reporting: row.reporting_minutes_before ? Number(row.reporting_minutes_before) : null,
      dependsOn:
        row.depends_on_match && row.dependency_slot && row.dependency_team_slot
          ? [
              {
                matchNumber: Number(row.depends_on_match),
                slot: row.dependency_slot === "loser" ? "loser" : "winner",
                teamSlot: row.dependency_team_slot === "b" ? "b" : "a",
              },
            ]
          : [],
    });
  });
  if (errors.length > 0) throw new DomainError(errors.join(" "), 422, "csv");
  return savePlanned(db, actor, planned, replace, "import");
}

export async function generateRoundRobin(
  db: Db,
  actor: Actor,
  input: { groupId: string; replace: boolean; durationMinutes: number },
): Promise<{ count: number; assumptions: string[] }> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const season = await getActiveSeason(db);
  const settings = await getScheduleSettings(db, season.id);
  const members = await db.query<{ id: string; team_name: string }>(
    `select r.id, r.team_name from group_memberships m
     join registrations r on r.id = m.registration_id
     where m.group_id = $1 and r.status = 'approved'`,
    [input.groupId],
  );
  const grounds = await listGrounds(db, season.id);
  const plan = planRoundRobin({
    teams: members.map((team) => ({ id: team.id, label: team.team_name })),
    grounds,
    startDate: season.startDate,
    endDate: season.endDate,
    dayStartMinutes: settings.dayStartMinutes,
    dayEndMinutes: settings.dayEndMinutes,
    durationMinutes: input.durationMinutes,
    bufferMinutes: settings.transitionBufferMinutes,
    restMinutes: settings.minRestMinutes,
    breakStartMinutes: settings.breakStartMinutes,
    breakEndMinutes: settings.breakEndMinutes,
  });
  if (!plan.ok) {
    throw new DomainError(plan.conflicts.map((conflict) => conflict.message).join(" "), 422, "schedule_conflict", plan);
  }
  const saved = await savePlanned(
    db,
    actor,
    plan.fixtures.map((fixture) => ({ ...fixture, overs: null, reporting: null })),
    input.replace,
    "round-robin",
  );
  return { ...saved, assumptions: plan.assumptions };
}

export async function generateKnockout(
  db: Db,
  actor: Actor,
  input: { registrationIds: string[]; groundId: string; startAt: string; durationMinutes: number; replace: boolean },
): Promise<{ count: number; assumptions: string[] }> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const season = await getActiveSeason(db);
  const settings = await getScheduleSettings(db, season.id);
  const starts = parseIstInput(input.startAt);
  if (!starts) throw new DomainError("Enter the first knockout start time in IST.");
  const teams = [];
  for (const id of input.registrationIds) {
    const rows = await db.query<{ id: string; team_name: string }>(
      "select id, team_name from registrations where id = $1 and season_id = $2 and status = 'approved'",
      [id, season.id],
    );
    if (!rows[0]) throw new DomainError("Every knockout seed must be an approved team.");
    teams.push({ id: rows[0].id, label: rows[0].team_name });
  }
  const plan = planKnockout({
    teams,
    groundId: input.groundId,
    startIso: starts,
    durationMinutes: input.durationMinutes,
    bufferMinutes: settings.transitionBufferMinutes ?? 0,
  });
  if (!plan.ok) throw new DomainError(plan.conflicts.map((conflict) => conflict.message).join(" "), 422, "schedule_conflict", plan);
  const engine = plan.fixtures.map((fixture, index) => toEngine(fixture, `plan-${index}`));
  const report = findScheduleConflicts(engine, constraintsOf(settings));
  if (report.conflicts.length > 0) {
    throw new DomainError("The bracket was not saved. " + report.conflicts.map((conflict) => conflict.message).join(" "), 422, "schedule_conflict", report);
  }
  const saved = await savePlanned(
    db,
    actor,
    plan.fixtures.map((fixture) => ({ ...fixture, overs: null, reporting: null })),
    input.replace,
    "knockout",
  );
  return { ...saved, assumptions: plan.assumptions };
}

export async function previewDelay(db: Queryable, actor: Actor, input: { groundId: string; from: string; delayMinutes: number }) {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const season = await getActiveSeason(db);
  const settings = await getScheduleSettings(db, season.id);
  const from = parseIstInput(input.from);
  if (!from || !Number.isInteger(input.delayMinutes)) throw new DomainError("Enter the delay in whole minutes and the time it applies from.");
  const fixtures = await loadVersionFixtures(db, season.id, "published");
  const proposed = shiftGround({ fixtures, groundId: input.groundId, fromIso: from, delayMinutes: input.delayMinutes });
  const report = findScheduleConflicts(proposed, constraintsOf(settings));
  const changed = proposed.filter((fixture, index) => fixture.startsAt !== fixtures[index]?.startsAt);
  return {
    ...report,
    changed: changed.map((fixture) => ({ id: fixture.id, startsAt: fixture.startsAt, teams: `${fixture.teamALabel} vs ${fixture.teamBLabel}` })),
    leftUnchanged: fixtures
      .filter((fixture) => fixture.groundId === input.groundId && (fixture.status === "in_progress" || fixture.status === "completed"))
      .map((fixture) => fixture.id),
  };
}

export async function publishDelay(
  db: Db,
  actor: Actor,
  input: { groundId: string; from: string; delayMinutes: number; note: string },
): Promise<void> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  if (input.note.trim().length < 3) throw new DomainError("Add a short public note explaining the delay.");
  const preview = await previewDelay(db, actor, input);
  if (preview.conflicts.length > 0) {
    throw new DomainError("The delay was not published. " + preview.conflicts.map((conflict) => conflict.message).join(" "), 422, "schedule_conflict", preview);
  }
  await db.tx(async (query) => {
    const season = await lockActiveSeason(query);
    const from = parseIstInput(input.from);
    const fixtures = await loadVersionFixtures(query, season.id, "published");
    const proposed = shiftGround({
      fixtures,
      groundId: input.groundId,
      fromIso: from ?? "",
      delayMinutes: input.delayMinutes,
    });
    const versionId = fixtures[0]?.scheduleVersionId;
    if (!versionId) throw new DomainError("There is no published schedule to delay.");
    const changed: { id: string; from: string | null; to: string | null }[] = [];
    for (const fixture of proposed) {
      const original = fixtures.find((item) => item.id === fixture.id);
      if (!original || original.startsAt === fixture.startsAt) continue;
      await query.execute(
        `update fixtures set starts_at = $1, status = 'delayed', change_note = $2, calendar_sequence = calendar_sequence + 1, updated_at = now(), version = version + 1
         where id = $3`,
        [fixture.startsAt, input.note.trim(), fixture.id],
      );
      changed.push({ id: fixture.id, from: original.startsAt, to: fixture.startsAt });
    }
    await query.query(
      `insert into schedule_revisions (schedule_version_id, note, payload, created_by) values ($1, $2, $3::jsonb, $4)`,
      [versionId, input.note.trim(), JSON.stringify({ changed }), actor.id],
    );
    await writeAudit(query, actor.id, "schedule.delay", "schedule_version", versionId, { note: input.note.trim(), changed });
    clearReadCache();
  });
}

export async function updateMatchStatus(
  db: Db,
  actor: Actor,
  fixtureId: string,
  status: (typeof STATUSES)[number],
  version: number,
): Promise<void> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  if (!STATUSES.includes(status)) throw new DomainError("That match status is not recognised.");
  const count = await db.execute(
    "update fixtures set status = $1, updated_at = now(), version = version + 1 where id = $2 and version = $3",
    [status, fixtureId, version],
  );
  if (count === 0) throw new DomainError("This match changed while saving. Nothing was updated.", 409, "version_conflict");
  await writeAudit(db, actor.id, "fixture.status", "fixture", fixtureId, { status });
}

export async function recordResult(
  db: Db,
  actor: Actor,
  fixtureId: string,
  input: { summary: string; source: "manual" | "import"; winnerRegistrationId?: string | null; winnerLabel?: string | null; scorecardUrl?: string | null; livestreamUrl?: string | null },
): Promise<void> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  if (input.summary.trim().length < 3) throw new DomainError("Enter the result summary. This is an organizer entry, not a live score.");
  await db.tx(async (query) => {
    const season = await lockActiveSeason(query);
    const currentRows = await query.query("select * from fixtures where id = $1 and season_id = $2 for update", [fixtureId, season.id]);
    if (!currentRows[0]) throw new DomainError("Match not found.", 404, "not_found");
    const current = mapFixture(currentRows[0], []);
    const winnerChanged = (input.winnerRegistrationId ?? null) !== current.winnerRegistrationId || (input.winnerLabel ?? null) !== current.winnerLabel;
    await query.execute(
      `update fixtures set
        summary = $1, summary_source = $2, summary_updated_at = now(), status = 'completed',
        winner_registration_id = $3, winner_label = $4, scorecard_url = $5, livestream_url = $6,
        updated_at = now(), version = version + 1
       where id = $7`,
      [
        input.summary.trim(),
        input.source,
        input.winnerRegistrationId ?? null,
        input.winnerLabel ?? null,
        blank(input.scorecardUrl),
        blank(input.livestreamUrl),
        fixtureId,
      ],
    );
    if (winnerChanged && (current.winnerLabel || current.winnerRegistrationId)) {
      const versionFixtures = await loadFixturesByVersion(query, current.scheduleVersionId);
      const downstream = downstreamFixtureIds(
        versionFixtures.map((fixture) => ({ id: fixture.id, dependsOn: fixture.dependsOn ?? [] })),
        fixtureId,
      );
      for (const downstreamId of downstream) {
        const downstreamFixture = versionFixtures.find((fixture) => fixture.id === downstreamId);
        if (!downstreamFixture) continue;
        const started = downstreamFixture.status === "in_progress" || downstreamFixture.status === "completed";
        await query.execute(
          `update fixtures set needs_resolution = true, resolution_note = $2 where id = $1`,
          [
            downstreamId,
            started
              ? "An upstream result changed. Participants in this started or completed match were left unchanged."
              : "An upstream result changed. Confirm the participants before this match is played. They were not changed automatically.",
          ],
        );
      }
      await query.execute(
        "update standings_versions set needs_review = true where season_id = $1 and status = 'published'",
        [season.id],
      );
    }
    await writeAudit(query, actor.id, "fixture.result", "fixture", fixtureId, {
      source: input.source,
      winnerChanged,
    });
  });
}

export async function clearResolution(db: Db, actor: Actor, fixtureId: string, note: string): Promise<void> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  if (note.trim().length < 3) throw new DomainError("Record how the downstream match was resolved.");
  await db.execute(
    "update fixtures set needs_resolution = false, resolution_note = $1, updated_at = now() where id = $2",
    [note.trim(), fixtureId],
  );
  await writeAudit(db, actor.id, "fixture.resolve", "fixture", fixtureId, { note: note.trim() });
}

async function savePlanned(
  db: Db,
  actor: Actor,
  planned: (PlannedFixture & { overs: number | null; reporting: number | null })[],
  replace: boolean,
  source: string,
): Promise<{ count: number }> {
  const season = await getActiveSeason(db);
  const settings = await getScheduleSettings(db, season.id);
  const versionId = await ensureDraft(db, actor);
  const existing = replace ? [] : await loadFixturesByVersion(db, versionId);
  if (!replace && existing.length > 0 && source !== "manual") {
    throw new DomainError("The draft already has matches. Tick replace to overwrite the draft, or enter selected matches manually. Nothing was generated.", 422, "draft_not_empty");
  }
  const resolved: (PlannedFixture & { overs: number | null; reporting: number | null })[] = [];
  for (const fixture of planned) {
    const sideA = fixture.teamAId ? { id: fixture.teamAId, label: fixture.teamALabel } : await resolveSide(db, season.id, fixture.teamALabel);
    const sideB = fixture.teamBId ? { id: fixture.teamBId, label: fixture.teamBLabel } : await resolveSide(db, season.id, fixture.teamBLabel);
    resolved.push({ ...fixture, teamAId: sideA.id, teamBId: sideB.id, teamALabel: sideA.label, teamBLabel: sideB.label });
  }
  const idByNumber = new Map(resolved.map((fixture, index) => [fixture.matchNumber, `new-${index}`]));
  const prospective = [
    ...existing,
    ...resolved.map((fixture, index) => ({
      ...toEngine(fixture, `new-${index}`),
      dependsOn: fixture.dependsOn.map((dependency) => ({
        fixtureId: idByNumber.get(dependency.matchNumber) ?? `missing-${dependency.matchNumber}`,
        slot: dependency.slot,
        teamSlot: dependency.teamSlot,
      })),
    })),
  ];
  const report = findScheduleConflicts(prospective, constraintsOf(settings));
  if (report.conflicts.length > 0) {
    throw new DomainError("No matches were saved. " + report.conflicts.map((conflict) => conflict.message).join(" "), 422, "schedule_conflict", report);
  }
  await db.tx(async (query) => {
    if (replace) await query.execute("delete from fixtures where schedule_version_id = $1", [versionId]);
    const ids = new Map<number, string>();
    for (const fixture of resolved) {
      const rows = await query.query<{ id: string }>(
        `insert into fixtures (
          season_id, schedule_version_id, match_number, stage, ground_id,
          team_a_registration_id, team_b_registration_id, team_a_label, team_b_label,
          starts_at, duration_minutes, overs, reporting_minutes_before, status
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'scheduled') returning id`,
        [
          season.id,
          versionId,
          fixture.matchNumber,
          fixture.stage,
          fixture.groundId,
          fixture.teamAId,
          fixture.teamBId,
          fixture.teamALabel,
          fixture.teamBLabel,
          fixture.startsAt,
          fixture.durationMinutes,
          fixture.overs,
          fixture.reporting,
        ],
      );
      if (rows[0]) ids.set(fixture.matchNumber, rows[0].id);
    }
    for (const fixture of resolved) {
      const fixtureId = ids.get(fixture.matchNumber);
      if (!fixtureId) continue;
      for (const dependency of fixture.dependsOn) {
        const parentId = ids.get(dependency.matchNumber);
        if (!parentId) throw new DomainError(`Match ${fixture.matchNumber} depends on match ${dependency.matchNumber}, which was not imported.`);
        await query.execute(
          `insert into fixture_dependencies (fixture_id, depends_on_fixture_id, slot, team_slot) values ($1,$2,$3,$4)`,
          [fixtureId, parentId, dependency.slot, dependency.teamSlot],
        );
      }
    }
    await writeAudit(query, actor.id, `schedule.${source}`, "schedule_version", versionId, { count: resolved.length, replace });
  });
  return { count: resolved.length };
}

async function resolveSide(db: Queryable, seasonId: string, label: string): Promise<{ id: string | null; label: string }> {
  const trimmed = label.trim();
  const rows = await db.query<{ id: string; team_name: string }>(
    "select id, team_name from registrations where season_id = $1 and status = 'approved' and lower(team_name) = lower($2)",
    [seasonId, trimmed],
  );
  if (rows[0]) return { id: rows[0].id, label: rows[0].team_name };
  return { id: null, label: trimmed };
}

async function loadVersionFixtures(db: Queryable, seasonId: string, status: "draft" | "published"): Promise<FixtureRecord[]> {
  const versions = await db.query<{ id: string }>(
    "select id from schedule_versions where season_id = $1 and status = $2",
    [seasonId, status],
  );
  if (!versions[0]) return [];
  return loadFixturesByVersion(db, versions[0].id);
}

async function loadFixturesByVersion(db: Queryable, versionId: string): Promise<FixtureRecord[]> {
  const rows = await db.query(
    `select f.*, g.name as ground_name
     from fixtures f
     left join grounds g on g.id = f.ground_id
     where f.schedule_version_id = $1
     order by f.starts_at nulls last, f.match_number`,
    [versionId],
  );
  const dependencies = await db.query(
    `select d.* from fixture_dependencies d
     join fixtures f on f.id = d.fixture_id
     where f.schedule_version_id = $1`,
    [versionId],
  );
  return rows.map((row) => mapFixture(row, dependencies));
}

function mapFixture(row: Row, dependencies: Row[]): FixtureRecord {
  const id = requiredStr(row, "id");
  return {
    id,
    matchNumber: num(row, "match_number"),
    seasonId: requiredStr(row, "season_id"),
    scheduleVersionId: requiredStr(row, "schedule_version_id"),
    stage: requiredStr(row, "stage"),
    groundId: str(row, "ground_id"),
    groundName: str(row, "ground_name"),
    teamAId: str(row, "team_a_registration_id"),
    teamBId: str(row, "team_b_registration_id"),
    teamALabel: requiredStr(row, "team_a_label"),
    teamBLabel: requiredStr(row, "team_b_label"),
    startsAt: str(row, "starts_at"),
    durationMinutes: num(row, "duration_minutes"),
    reportingMinutesBefore: num(row, "reporting_minutes_before"),
    overs: num(row, "overs"),
    status: requiredStr(row, "status"),
    changeNote: str(row, "change_note"),
    calendarSequence: num(row, "calendar_sequence") ?? 0,
    scorecardUrl: str(row, "scorecard_url"),
    livestreamUrl: str(row, "livestream_url"),
    summary: str(row, "summary"),
    summarySource: str(row, "summary_source"),
    summaryUpdatedAt: str(row, "summary_updated_at"),
    winnerRegistrationId: str(row, "winner_registration_id"),
    winnerLabel: str(row, "winner_label"),
    needsResolution: row.needs_resolution === true || row.needs_resolution === "t",
    resolutionNote: str(row, "resolution_note"),
    version: num(row, "version") ?? 1,
    updatedAt: str(row, "updated_at"),
    dependsOn: dependencies
      .filter((dependency) => dependency.fixture_id === id)
      .map((dependency) => ({
        fixtureId: requiredStr(dependency, "depends_on_fixture_id"),
        slot: requiredStr(dependency, "slot") as "winner" | "loser",
        teamSlot: requiredStr(dependency, "team_slot") as "a" | "b",
      })),
  };
}

function constraintsOf(settings: ScheduleSettings) {
  return {
    dayStartMinutes: settings.dayStartMinutes,
    dayEndMinutes: settings.dayEndMinutes,
    breakStartMinutes: settings.breakStartMinutes,
    breakEndMinutes: settings.breakEndMinutes,
    transitionBufferMinutes: settings.transitionBufferMinutes,
    minRestMinutes: settings.minRestMinutes,
  };
}

function toEngine(fixture: PlannedFixture, id: string): EngineFixture {
  return {
    id,
    matchNumber: fixture.matchNumber,
    groundId: fixture.groundId,
    teamAId: fixture.teamAId,
    teamBId: fixture.teamBId,
    teamALabel: fixture.teamALabel,
    teamBLabel: fixture.teamBLabel,
    startsAt: fixture.startsAt,
    durationMinutes: fixture.durationMinutes,
    status: "scheduled",
    dependsOn: [],
  };
}

function blank(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export async function listScheduleVersions(db: Queryable, actor: Actor) {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const season = await getActiveSeason(db);
  return db.query("select id, status, note, published_at, created_at from schedule_versions where season_id = $1 order by created_at desc", [
    season.id,
  ]);
}

export { mapSettings };
