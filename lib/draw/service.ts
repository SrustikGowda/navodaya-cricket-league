import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { writeAudit } from "../audit";
import type { Db, Queryable } from "../db";
import { DomainError, isUniqueViolation } from "../errors";
import { clearReadCache } from "../read-cache";
import { rateLimit } from "../rate-limit";
import { bool, num, requiredStr, str, type Row } from "../rows";
import { getActiveSeason, lockActiveSeason, type Season } from "../season";
import type { Actor } from "../types";
import { ALGORITHM, GROUND_NAMES, REVEAL_LEAD_MS } from "./config";
import { syncEditionHistory } from "./history";
import { generatePlan, planHash } from "./plan";
import { resolveSeeds, type RosterTeam } from "./seeds";
import { computeQualification, oversText, type MatchScore, type OrganizerDecision, type Qualification } from "./standings";
import type { DrawPlan, GroupCode, LiveFixture, OfficialDrawView, PublicTeam } from "./types";

export const RESET_PHRASE = "DELETE NCL 2026 DRAW";
const PASSWORD_ENV = "NCL_FIXTURE_RUN_PASSWORD";

// ---------------------------------------------------------------------------------------------
// Roster and dates
// ---------------------------------------------------------------------------------------------

export async function loadRoster(db: Queryable, seasonId: string): Promise<RosterTeam[]> {
  const rows = await db.query<Row>(
    `select id, team_name, batch_admission_year, batch_leaving_year
     from registrations where season_id = $1 and status = 'approved' order by id`,
    [seasonId],
  );
  return rows.map((row) => ({
    id: requiredStr(row, "id"),
    name: requiredStr(row, "team_name"),
    batchAdmissionYear: num(row, "batch_admission_year"),
    batchLeavingYear: num(row, "batch_leaving_year"),
  }));
}

export function seasonDays(season: Pick<Season, "startDate" | "endDate">): [string, string] {
  const next = new Date(`${season.startDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  if (next.toISOString().slice(0, 10) !== season.endDate) {
    throw new DomainError("The draw needs a two-day season (Saturday and Sunday). Check the season dates. Nothing was drawn.", 422, "season_dates");
  }
  return [season.startDate, season.endDate];
}

export async function publicTeams(db: Queryable, seasonId: string): Promise<PublicTeam[]> {
  const rows = await db.query<Row>("select id, team_name, slug, logo_path from public_teams where season_id = $1", [seasonId]);
  return rows.map((row) => {
    const logo = str(row, "logo_path")?.split(":").at(-1);
    return { id: requiredStr(row, "id"), name: requiredStr(row, "team_name"), slug: str(row, "slug"), logoUrl: logo ? `/api/media/${logo}` : null };
  });
}

/** Whether a draw can run right now, with a plain-language reason when it cannot. Read-only. */
export async function drawReadiness(db: Queryable): Promise<{ ready: boolean; message: string | null; teamCount: number }> {
  const season = await getActiveSeason(db);
  const roster = await loadRoster(db, season.id);
  try {
    seasonDays(season);
    resolveSeeds(roster);
    return { ready: true, message: null, teamCount: roster.length };
  } catch (error) {
    const message = error instanceof DomainError ? error.message.replace(/ Nothing was drawn\.$/, "") : "The draw cannot run yet.";
    return { ready: false, message, teamCount: roster.length };
  }
}

// ---------------------------------------------------------------------------------------------
// Trial run: read-only. Nothing in this function writes.
// ---------------------------------------------------------------------------------------------

export async function previewTrial(db: Queryable): Promise<DrawPlan> {
  const season = await getActiveSeason(db);
  const roster = await loadRoster(db, season.id);
  return generatePlan({ roster, days: seasonDays(season) });
}

// ---------------------------------------------------------------------------------------------
// Password and abuse protection
// ---------------------------------------------------------------------------------------------

export function drawPasswordConfigured(): boolean {
  return Boolean((process.env[PASSWORD_ENV] ?? "").length > 0);
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function clientHash(ip: string): string {
  return createHash("sha256").update(`ncl-draw:${ip}`).digest("hex").slice(0, 16);
}

const FAILURES_PER_CLIENT = 5;
const FAILURES_GLOBAL = 20;
const LOCKOUT_MINUTES = 15;

/**
 * Checks the draw password for an organizer. The password lives only in NCL_FIXTURE_RUN_PASSWORD; when it is
 * not set the operation is refused (there is no fallback value). Failed attempts are rate limited in memory
 * and, so that a restart or a second server cannot reset the counter, from the audit log.
 */
export async function authorizeDrawPassword(
  db: Queryable,
  actor: Actor,
  input: { password: string; ip: string; purpose: "real_run" | "reset" },
): Promise<void> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const configured = process.env[PASSWORD_ENV] ?? "";
  if (!configured) {
    await writeAudit(db, actor.id, "draw.auth_unavailable", "draw", null, { purpose: input.purpose });
    throw new DomainError(
      `The draw password is not configured on the server (${PASSWORD_ENV}). The official draw is disabled until it is set.`,
      503,
      "draw_password_unset",
    );
  }
  const client = clientHash(input.ip);
  if (!rateLimit(`draw-auth:${client}`, 12, 10 * 60_000)) {
    throw new DomainError("Too many password attempts. Wait and try again. Nothing was drawn.", 429, "rate_limit");
  }
  const recent = await db.query<{ mine: number; total: number }>(
    `select
       count(*) filter (where payload->>'client' = $1)::int as mine,
       count(*)::int as total
     from audit_events
     where action = 'draw.auth_failed' and created_at > now() - ($2::int * interval '1 minute')`,
    [client, LOCKOUT_MINUTES],
  );
  const counts = recent[0] ?? { mine: 0, total: 0 };
  if (counts.mine >= FAILURES_PER_CLIENT || counts.total >= FAILURES_GLOBAL) {
    await writeAudit(db, actor.id, "draw.auth_locked", "draw", null, { client, purpose: input.purpose });
    throw new DomainError("Too many incorrect passwords. The official draw is locked for 15 minutes. Nothing was drawn.", 429, "rate_limit");
  }
  const ok = timingSafeEqual(digest(input.password), digest(configured));
  if (!ok) {
    await writeAudit(db, actor.id, "draw.auth_failed", "draw", null, { client, purpose: input.purpose });
    throw new DomainError("That draw password is not correct.", 401, "draw_password");
  }
  await writeAudit(db, actor.id, "draw.authorized", "draw", null, { client, purpose: input.purpose });
}

// ---------------------------------------------------------------------------------------------
// Reading the official draw
// ---------------------------------------------------------------------------------------------

function mapOfficial(row: Row): OfficialDrawView {
  const plan = typeof row.plan === "string" ? (JSON.parse(row.plan) as DrawPlan) : (row.plan as DrawPlan);
  return {
    id: requiredStr(row, "id"),
    ref: requiredStr(row, "ref"),
    publishedAt: str(row, "published_at") ?? "",
    revealAt: str(row, "reveal_at") ?? "",
    publishedByLabel: str(row, "display_name") ?? "NCL organizers",
    plan,
    scheduleVersionId: requiredStr(row, "schedule_version_id"),
  };
}

export async function getOfficialDraw(db: Queryable): Promise<OfficialDrawView | null> {
  const season = await getActiveSeason(db);
  const rows = await db.query<Row>(
    `select d.*, p.display_name from draws d left join profiles p on p.id = d.published_by
     where d.season_id = $1 and d.status = 'published'`,
    [season.id],
  );
  return rows[0] ? mapOfficial(rows[0]) : null;
}

/** A small, cheap record of the draw's state for the live stream and polling fallback. */
export async function getDrawState(db: Queryable): Promise<{ state: "none" | "published"; id: string | null; publishedAt: string | null; revealAt: string | null }> {
  const season = await getActiveSeason(db);
  const rows = await db.query<Row>("select id, published_at, reveal_at from draws where season_id = $1 and status = 'published'", [season.id]);
  const row = rows[0];
  if (!row) return { state: "none", id: null, publishedAt: null, revealAt: null };
  return { state: "published", id: requiredStr(row, "id"), publishedAt: str(row, "published_at"), revealAt: str(row, "reveal_at") };
}

export async function liveFixtures(db: Queryable, drawId: string): Promise<LiveFixture[]> {
  const rows = await db.query<Row>(
    `select f.*, g.name as ground_name, gr.code as group_code,
       ms.outcome as score_outcome, ms.first_bats, ms.first_runs, ms.first_wickets, ms.first_balls,
       ms.second_runs, ms.second_wickets, ms.second_balls
     from fixtures f
     join schedule_versions sv on sv.id = f.schedule_version_id
     left join grounds g on g.id = f.ground_id
     left join groups gr on gr.id = f.group_id
     left join match_scores ms on ms.fixture_id = f.id
     where f.draw_id = $1 and sv.status = 'published'
     order by f.match_number`,
    [drawId],
  );
  const innings = (row: Row, which: "first" | "second"): string | null => {
    const runs = num(row, `${which}_runs`);
    const balls = num(row, `${which}_balls`);
    if (runs == null || balls == null) return null;
    return `${runs}/${num(row, `${which}_wickets`) ?? 0} (${oversText(balls)})`;
  };
  return rows.map((row) => {
    const scored = str(row, "score_outcome") && str(row, "score_outcome") !== "no_result";
    const aFirst = str(row, "first_bats") !== "b";
    return {
      id: requiredStr(row, "id"),
      code: str(row, "code"),
      number: num(row, "match_number"),
      stage: requiredStr(row, "stage"),
      group: (str(row, "group_code") as GroupCode | null) ?? null,
      startsAt: str(row, "starts_at"),
      durationMinutes: num(row, "duration_minutes"),
      overs: num(row, "overs"),
      ground: str(row, "ground_name"),
      teamAId: str(row, "team_a_registration_id"),
      teamBId: str(row, "team_b_registration_id"),
      teamALabel: requiredStr(row, "team_a_label"),
      teamBLabel: requiredStr(row, "team_b_label"),
      status: requiredStr(row, "status"),
      winnerLabel: str(row, "winner_label"),
      summary: str(row, "summary"),
      scoreA: scored ? innings(row, aFirst ? "first" : "second") : null,
      scoreB: scored ? innings(row, aFirst ? "second" : "first") : null,
    };
  });
}

export async function loadLeagueScores(db: Queryable, drawId: string): Promise<MatchScore[]> {
  const rows = await db.query<Row>(
    `select ms.*, f.team_a_registration_id, f.team_b_registration_id
     from match_scores ms join fixtures f on f.id = ms.fixture_id
     where f.draw_id = $1 and f.stage = 'league'`,
    [drawId],
  );
  return rows.map(mapScore);
}

export function mapScore(row: Row): MatchScore {
  return {
    fixtureId: requiredStr(row, "fixture_id"),
    teamAId: requiredStr(row, "team_a_registration_id"),
    teamBId: requiredStr(row, "team_b_registration_id"),
    outcome: requiredStr(row, "outcome") as MatchScore["outcome"],
    firstBats: (str(row, "first_bats") as "a" | "b" | null) ?? "a",
    first: { runs: num(row, "first_runs") ?? 0, wickets: num(row, "first_wickets") ?? 0, balls: num(row, "first_balls") ?? 0, allOut: bool(row, "first_all_out") },
    second: { runs: num(row, "second_runs") ?? 0, wickets: num(row, "second_wickets") ?? 0, balls: num(row, "second_balls") ?? 0, allOut: bool(row, "second_all_out") },
    maxBalls: num(row, "max_balls") ?? 36,
  };
}

export async function loadDecisions(db: Queryable, drawId: string): Promise<OrganizerDecision[]> {
  const rows = await db.query<Row>("select scope, ordered_ids from draw_tiebreaks where draw_id = $1", [drawId]);
  return rows.map((row) => ({
    scope: requiredStr(row, "scope"),
    order: (typeof row.ordered_ids === "string" ? JSON.parse(row.ordered_ids) : row.ordered_ids) as string[],
  }));
}

export function qualificationFor(plan: DrawPlan, scores: MatchScore[], decisions: OrganizerDecision[]): Qualification {
  const teams = plan.result.assignments.map((a) => ({ teamId: a.teamId, group: a.group }));
  return computeQualification(teams, scores, decisions);
}

export async function loadQualification(db: Queryable, official: OfficialDrawView): Promise<Qualification> {
  const [scores, decisions] = await Promise.all([loadLeagueScores(db, official.id), loadDecisions(db, official.id)]);
  return qualificationFor(official.plan, scores, decisions);
}

// ---------------------------------------------------------------------------------------------
// Real run: once, atomically
// ---------------------------------------------------------------------------------------------

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newRef(): string {
  const bytes = randomBytes(6);
  let out = "";
  for (const byte of bytes) out += REF_ALPHABET[byte % REF_ALPHABET.length];
  return `NCL26-${out}`;
}

export type RunHooks = { beforeCommit?: () => Promise<void> | void };

/**
 * Generates and publishes the official draw. Everything below happens in one database transaction while
 * the season row is locked, and a partial unique index on `draws` rejects a second published draw even if
 * every application check were bypassed. A retry carrying the same request id gets the saved draw back.
 */
export async function runOfficialDraw(
  db: Db,
  actor: Actor,
  input: { requestId: string; hooks?: RunHooks },
): Promise<{ draw: OfficialDrawView; replayed: boolean }> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const requestId = input.requestId.trim();
  if (!/^[A-Za-z0-9._:-]{8,100}$/.test(requestId)) throw new DomainError("The request identifier is not valid. Nothing was drawn.", 400, "request_id");

  let replayed = false;
  try {
    await db.tx(async (query) => {
      const season = await lockActiveSeason(query);
      const days = seasonDays(season);

      const existing = await query.query<Row>("select id, request_id from draws where season_id = $1 and status = 'published' for update", [season.id]);
      if (existing[0]) {
        if (existing[0].request_id === requestId) {
          replayed = true;
          return;
        }
        throw new DomainError("The official draw has already been published and cannot be run again without an organizer reset.", 409, "draw_exists");
      }
      const scheduled = await query.query("select id from schedule_versions where season_id = $1 and status = 'published'", [season.id]);
      if (scheduled[0]) {
        throw new DomainError("A schedule is already published for this season. Archive it before the official draw. Nothing was drawn.", 409, "schedule_exists");
      }

      const roster = await loadRoster(query, season.id);
      const plan = generatePlan({ roster, days });

      const drawId = randomUUID();
      const ref = newRef();
      const publishedAt = new Date();
      const revealAt = new Date(publishedAt.getTime() + REVEAL_LEAD_MS);
      await query.query(
        `insert into draws (id, season_id, ref, status, algorithm, entropy, plan, plan_hash, request_id, published_by, published_at, reveal_at)
         values ($1,$2,$3,'published',$4,$5,$6::jsonb,$7,$8,$9,$10,$11)`,
        [drawId, season.id, ref, ALGORITHM, plan.seed, JSON.stringify(plan), planHash(plan), requestId, actor.id, publishedAt.toISOString(), revealAt.toISOString()],
      );

      const groundIds = new Map<string, string>();
      for (const [index, code] of (["A", "B"] as const).entries()) {
        const rows = await query.query<{ id: string }>(
          `insert into grounds (season_id, name, sort_order) values ($1,$2,$3)
           on conflict (season_id, name) do update set name = excluded.name returning id`,
          [season.id, GROUND_NAMES[code], index],
        );
        groundIds.set(code, (rows[0] as { id: string }).id);
      }

      const groupIds = new Map<GroupCode, string>();
      for (const code of ["A", "B", "C"] as const) {
        const name = `Group ${code}`;
        const found = await query.query<{ id: string }>("select id from groups where season_id = $1 and name = $2 for update", [season.id, name]);
        if (found[0]) {
          const members = await query.query("select 1 from group_memberships where group_id = $1 limit 1", [found[0].id]);
          if (members[0]) throw new DomainError(`${name} already has teams placed manually. Clear it before the official draw. Nothing was drawn.`, 409, "groups_exist");
          await query.execute("update groups set code = $1, draw_id = $2, stage = 'league' where id = $3", [code, drawId, found[0].id]);
          groupIds.set(code, found[0].id);
        } else {
          const created = await query.query<{ id: string }>(
            "insert into groups (season_id, name, stage, code, draw_id) values ($1,$2,'league',$3,$4) returning id",
            [season.id, name, code, drawId],
          );
          groupIds.set(code, (created[0] as { id: string }).id);
        }
      }
      for (const a of plan.result.assignments) {
        await query.execute(
          `insert into group_memberships (group_id, registration_id, sub_pool, slot, seeded_as) values ($1,$2,$3,$4,$5)`,
          [groupIds.get(a.group), a.teamId, a.subPool, a.slot, a.seed],
        );
      }

      const version = await query.query<{ id: string }>(
        `insert into schedule_versions (season_id, status, note, created_by, published_at)
         values ($1,'published',$2,$3,$4) returning id`,
        [season.id, `Official NCL 2026 draw ${ref}`, actor.id, publishedAt.toISOString()],
      );
      const versionId = (version[0] as { id: string }).id;

      const fixtureIds = new Map<string, string>();
      for (const match of plan.matches) {
        const rows = await query.query<{ id: string }>(
          `insert into fixtures (
             season_id, schedule_version_id, match_number, stage, ground_id,
             team_a_registration_id, team_b_registration_id, team_a_label, team_b_label,
             starts_at, duration_minutes, overs, status, code, group_id, draw_id, sort_order
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'scheduled',$13,$14,$15,$3) returning id`,
          [
            season.id,
            versionId,
            match.number,
            match.stage,
            groundIds.get(match.ground),
            match.teamA.teamId,
            match.teamB.teamId,
            match.teamA.label,
            match.teamB.label,
            match.startsAt,
            match.durationMinutes,
            match.overs,
            match.code,
            match.group ? groupIds.get(match.group) : null,
            drawId,
          ],
        );
        fixtureIds.set(match.code, (rows[0] as { id: string }).id);
      }
      for (const match of plan.matches) {
        for (const [teamSlot, side] of [["a", match.teamA], ["b", match.teamB]] as const) {
          const parent = side.placeholder?.startsWith("winner:") ? side.placeholder.slice("winner:".length) : null;
          if (!parent) continue;
          await query.execute(
            `insert into fixture_dependencies (fixture_id, depends_on_fixture_id, slot, team_slot) values ($1,$2,'winner',$3)`,
            [fixtureIds.get(match.code), fixtureIds.get(parent), teamSlot],
          );
        }
      }

      await query.execute("update draws set schedule_version_id = $1 where id = $2", [versionId, drawId]);
      await writeAudit(query, actor.id, "draw.published", "draw", drawId, {
        ref,
        planHash: planHash(plan),
        matches: plan.matches.length,
        teams: plan.roster.length,
      });
      await input.hooks?.beforeCommit?.();
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError("The official draw has already been published and cannot be run again without an organizer reset.", 409, "draw_exists");
    }
    throw error;
  }
  clearReadCache();
  const draw = await getOfficialDraw(db);
  if (!draw) throw new DomainError("The official draw was not saved.", 500, "draw_missing");
  return { draw, replayed };
}

// ---------------------------------------------------------------------------------------------
// Deleting the official run (admin only), so the Real Run can be done again. Never destructive: the old draw, its
// fixtures and any scores stay in the database as an archived record.
// ---------------------------------------------------------------------------------------------

/** What deleting the current official run would take out of public view. */
export async function drawResultCounts(db: Queryable, drawId: string): Promise<{ started: number; scores: number }> {
  const rows = await db.query<{ started: number; scores: number }>(
    `select
       (select count(*) from fixtures where draw_id = $1 and status in ('in_progress','completed','abandoned'))::int as started,
       (select count(*) from match_scores ms join fixtures f on f.id = ms.fixture_id where f.draw_id = $1)::int as scores`,
    [drawId],
  );
  return rows[0] ?? { started: 0, scores: 0 };
}

export async function resetOfficialDraw(
  db: Db,
  actor: Actor,
  input: { reason?: string | null; confirmation: string; acknowledgeResults?: boolean },
): Promise<{ ref: string; archivedResults: number }> {
  if (actor.role !== "organizer") throw new DomainError("Only an admin can delete the official run.", 403, "forbidden");
  if (input.confirmation.trim() !== RESET_PHRASE) throw new DomainError(`Type ${RESET_PHRASE} exactly to confirm.`, 422, "confirmation");
  const reason = input.reason?.trim().slice(0, 300) || "Deleted in Settings to redo the Real Run.";
  const outcome = await db.tx(async (query) => {
    const season = await lockActiveSeason(query);
    const rows = await query.query<Row>("select * from draws where season_id = $1 and status = 'published' for update", [season.id]);
    const draw = rows[0];
    if (!draw) throw new DomainError("There is no official run to delete.", 404, "no_draw");
    const drawId = requiredStr(draw, "id");
    const counts = await drawResultCounts(query, drawId);
    const archivedResults = Math.max(counts.started, counts.scores);
    if (archivedResults > 0 && !input.acknowledgeResults) {
      throw new DomainError(
        `${archivedResults} ${archivedResults === 1 ? "match has" : "matches have"} a result. Deleting the run takes them off the site (they stay in the database). Tick the box to confirm. Nothing was changed.`,
        409,
        "results_exist",
        { results: archivedResults },
      );
    }
    const drawRef = requiredStr(draw, "ref");
    await query.execute("update draws set status = 'reset', reset_by = $1, reset_at = now(), reset_reason = $2 where id = $3", [actor.id, reason, drawId]);
    if (draw.schedule_version_id) await query.execute("update schedule_versions set status = 'archived' where id = $1", [draw.schedule_version_id]);
    // Keep the old groups and memberships as a record; free their names for the next draw.
    await query.execute("update groups set name = name || ' (deleted ' || $2 || ')', code = null where draw_id = $1", [drawId, drawRef]);
    await writeAudit(query, actor.id, "draw.reset", "draw", drawId, { ref: drawRef, reason, planHash: str(draw, "plan_hash"), archivedResults });
    // The edition's History entry came from this run, so it goes with it.
    await syncEditionHistory(query);
    return { ref: drawRef, archivedResults };
  });
  clearReadCache();
  return outcome;
}
