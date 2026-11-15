import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import type { Db } from "../lib/db";
import { loadBoard } from "../lib/draw/board";
import { planHash, verifyPlan } from "../lib/draw/plan";
import { confirmStandings, parseScoreEntry, recordMatchScore, recordTiebreak, resolveBracketTx } from "../lib/draw/results";
import { moveMatch, previewReschedule, rescheduleOfficialDraw } from "../lib/draw/timetable";
import {
  authorizeDrawPassword,
  getOfficialDraw,
  liveFixtures,
  loadQualification,
  previewTrial,
  resetOfficialDraw,
  RESET_PHRASE,
  runOfficialDraw,
  seasonDays,
} from "../lib/draw/service";
import { listPublicFixtures } from "../lib/public-data";
import { getActiveSeason } from "../lib/season";
import type { Actor } from "../lib/types";
import { captain, counts, DAYS, freshDb, organizer, seedRoster, TEAM_NAMES } from "./helpers/roster";

const PASSWORD = "unit-test-draw-password";
let ipCounter = 0;
const nextIp = () => `203.0.113.${(ipCounter += 1)}`;
let requestCounter = 0;
const nextRequest = () => `request-${Date.now()}-${(requestCounter += 1)}`;

beforeEach(() => {
  process.env.NCL_FIXTURE_RUN_PASSWORD = PASSWORD;
});
afterEach(() => {
  delete process.env.NCL_FIXTURE_RUN_PASSWORD;
});

async function setup(): Promise<{ db: Db; admin: Actor; teams: { id: string; name: string }[] }> {
  const db = await freshDb();
  const admin = await organizer(db);
  const teams = await seedRoster(db);
  return { db, admin, teams };
}

function codeOf(error: unknown): string | undefined {
  return (error as { code?: string }).code;
}

test("the season runs on two consecutive days", async () => {
  const db = await freshDb();
  const season = await getActiveSeason(db);
  assert.deepEqual(seasonDays(season), DAYS);
  assert.throws(() => seasonDays({ startDate: "2026-11-28", endDate: "2026-11-30" }), (e) => codeOf(e) === "season_dates");
  await db.close();
});

test("a trial run uses the real roster and writes nothing, however often it is repeated", async () => {
  const { db } = await setup();
  const before = await counts(db);
  const hashes = new Set<string>();
  for (let i = 0; i < 5; i += 1) {
    const plan = await previewTrial(db);
    assert.equal(plan.roster.length, 19);
    assert.deepEqual([...plan.roster.map((team) => team.name)].sort(), [...TEAM_NAMES].sort());
    assert.equal(plan.matches.length, 35);
    assert.ok(plan.bye.teamId);
    hashes.add(planHash(plan));
  }
  assert.ok(hashes.size > 1, "each trial is a fresh random draw");
  assert.deepEqual(await counts(db), before, "no table changed, including the audit log");
  const board = await loadBoard(db);
  assert.equal(board.official, null);
  assert.equal((await listPublicFixtures(db)).length, 0);
  await db.close();
});

test("a trial is refused, not faked, when the roster is not exactly 19 or a seeded team is missing", async () => {
  const db = await freshDb();
  await seedRoster(db, TEAM_NAMES.slice(0, 18));
  await assert.rejects(() => previewTrial(db), (e) => codeOf(e) === "roster_count");
  await db.close();

  const other = await freshDb();
  await seedRoster(other, TEAM_NAMES.map((name) => (name === "RCB United" ? "Bangalore Royals" : name)));
  await assert.rejects(() => previewTrial(other), (e) => codeOf(e) === "seed_missing");
  await other.close();
});

test("the real run rejects wrong passwords, non-organizers, and a missing server password", async () => {
  const { db, admin } = await setup();
  const player = await captain(db);

  await assert.rejects(() => authorizeDrawPassword(db, player, { password: PASSWORD, ip: nextIp(), purpose: "real_run" }), (e) => codeOf(e) === "forbidden");
  await assert.rejects(() => authorizeDrawPassword(db, admin, { password: "NCL2025", ip: nextIp(), purpose: "real_run" }), (e) => codeOf(e) === "draw_password");
  await assert.rejects(() => authorizeDrawPassword(db, admin, { password: "", ip: nextIp(), purpose: "real_run" }), (e) => codeOf(e) === "draw_password");
  await authorizeDrawPassword(db, admin, { password: PASSWORD, ip: nextIp(), purpose: "real_run" });

  delete process.env.NCL_FIXTURE_RUN_PASSWORD;
  await assert.rejects(
    () => authorizeDrawPassword(db, admin, { password: "any-value-at-all", ip: nextIp(), purpose: "real_run" }),
    (e) => codeOf(e) === "draw_password_unset",
    "no hardcoded fallback: with the variable unset, every password is refused before anything is compared",
  );
  const failed = await db.query<{ n: number }>("select count(*)::int as n from audit_events where action = 'draw.auth_failed'");
  assert.equal(failed[0]?.n, 2, "failed attempts are audited");
  assert.equal((await counts(db)).draws, 0);
  await db.close();
});

test("repeated wrong passwords lock the draw out, even for the right password", async () => {
  const { db, admin } = await setup();
  const ip = nextIp();
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(() => authorizeDrawPassword(db, admin, { password: `wrong-${i}`, ip, purpose: "real_run" }), (e) => codeOf(e) === "draw_password");
  }
  await assert.rejects(() => authorizeDrawPassword(db, admin, { password: PASSWORD, ip, purpose: "real_run" }), (e) => codeOf(e) === "rate_limit");
  const locks = await db.query<{ n: number }>("select count(*)::int as n from audit_events where action = 'draw.auth_locked'");
  assert.equal(locks[0]?.n, 1);
  await db.close();
});

test("the real run saves groups, memberships, 36 fixture entries (35 matches and the BYE) and an audit trail in one go", async () => {
  const { db, admin, teams } = await setup();
  const { draw, replayed } = await runOfficialDraw(db, admin, { requestId: nextRequest() });
  assert.equal(replayed, false);
  assert.match(draw.ref, /^NCL26-[A-Z2-9]{6}$/);
  assert.equal(draw.plan.matches.length, 35);

  const c = await counts(db);
  assert.equal(c.draws, 1);
  assert.equal(c.groups, 2);
  assert.equal(c.group_memberships, 19);
  assert.equal(c.fixtures, 36, "35 matches plus the BYE entry");
  assert.equal(c.fixture_dependencies, 6);
  assert.equal(c.grounds, 2);
  const published = await db.query<{ n: number }>("select count(*)::int as n from schedule_versions where status = 'published'");
  assert.equal(published[0]?.n, 1);

  const stored = await db.query<{ plan_hash: string; entropy: string; published_by: string; reveal_at: Date; published_at: Date }>("select * from draws");
  assert.equal(stored[0]?.plan_hash, planHash(draw.plan));
  assert.equal(stored[0]?.published_by, admin.id, "organizer is recorded");
  assert.ok(stored[0] && stored[0].reveal_at > stored[0].published_at, "viewers are given a shared start time after publication");
  assert.equal(verifyPlan(draw.plan, DAYS).ok, true, "the saved entropy replays to the saved draw");
  const audit = await db.query<{ action: string }>("select action from audit_events where action = 'draw.published'");
  assert.equal(audit.length, 1);

  const fixtures = await listPublicFixtures(db);
  assert.equal(fixtures.length, 35, "the BYE is not a match, so it is not in the match list");
  const opener = fixtures.find((f) => f.matchNumber === 1);
  assert.equal(opener?.code, "M01");
  assert.equal(opener?.groundName, "Ground A");
  assert.equal(opener?.startsAt, "2026-11-28T01:30:00.000Z", "07:00 IST");
  assert.equal(opener?.overs, 6);
  assert.ok([opener?.teamALabel, opener?.teamBLabel].includes("4s-11"), "the defending champion opens");
  assert.equal(fixtures.filter((f) => f.stage === "league").length, 28);
  assert.equal(fixtures.find((f) => f.code === "F")?.overs, 8);
  assert.equal(fixtures.find((f) => f.code === "QF1")?.teamALabel, "Group A #1");
  assert.equal(fixtures.find((f) => f.code === "QF1")?.teamBLabel, "Group B #4");
  assert.ok(fixtures.filter((f) => f.stage === "league").every((f) => f.groupCode && f.teamAId && f.teamBId));
  // Team ids, not names, tie fixtures to the roster.
  assert.ok(fixtures.filter((f) => f.stage === "league").every((f) => teams.some((t) => t.id === f.teamAId) && teams.some((t) => t.id === f.teamBId)));

  // Membership rows carry the position, and nothing else about sub-pools.
  const members = await db.query<{ sub_pool: number | null; slot: number }>("select sub_pool, slot from group_memberships");
  assert.ok(members.every((m) => m.sub_pool === null && m.slot >= 1 && m.slot <= 10));

  // The BYE is a fixture entry for the A9 team: no time, no ground, no second team, already decided, never a score.
  const byeRows = await db.query<{ code: string; team_a_registration_id: string; team_b_registration_id: string | null; starts_at: string | null; ground_id: string | null; status: string; winner_registration_id: string; match_number: number }>(
    "select code, team_a_registration_id, team_b_registration_id, starts_at, ground_id, status, winner_registration_id, match_number from fixtures where is_bye",
  );
  assert.equal(byeRows.length, 1, "exactly one BYE");
  const a9 = draw.plan.result.assignments.find((a) => a.group === "A" && a.slot === 9);
  assert.equal(byeRows[0]?.team_a_registration_id, a9?.teamId);
  assert.equal(byeRows[0]?.team_a_registration_id, draw.plan.bye.teamId);
  assert.deepEqual([byeRows[0]?.team_b_registration_id, byeRows[0]?.starts_at, byeRows[0]?.ground_id], [null, null, null]);
  assert.equal(byeRows[0]?.status, "completed");
  assert.equal(byeRows[0]?.match_number, 36);
  const live = await liveFixtures(db, draw.id);
  assert.equal(live.length, 36);
  assert.equal(live.filter((f) => f.isBye).length, 1);
  assert.equal((await db.query("select 1 from match_scores")).length, 0, "a BYE never has runs or overs");
  const noTeam = (await listPublicFixtures(db)).filter((f) => f.groundName == null);
  assert.equal(noTeam.length, 0, "every listed match has a ground");
  await db.close();
});

test("an official draw can only ever be published once, including under concurrent and repeated requests", async () => {
  const { db, admin } = await setup();
  // Four simultaneous clicks, each from a different tab.
  const results = await Promise.allSettled([1, 2, 3, 4].map(() => runOfficialDraw(db, admin, { requestId: nextRequest() })));
  const won = results.filter((r) => r.status === "fulfilled");
  const lost = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  assert.equal(won.length, 1);
  assert.equal(lost.length, 3);
  assert.ok(lost.every((r) => codeOf(r.reason) === "draw_exists"));
  let c = await counts(db);
  assert.equal(c.draws, 1);
  assert.equal(c.fixtures, 36);
  assert.equal(c.group_memberships, 19);
  const official = await getOfficialDraw(db);
  const hash = planHash((official as NonNullable<typeof official>).plan);

  // A later attempt with a new request id is refused and changes nothing.
  await assert.rejects(() => runOfficialDraw(db, admin, { requestId: nextRequest() }), (e) => codeOf(e) === "draw_exists");
  c = await counts(db);
  assert.equal(c.draws, 1);
  assert.equal(planHash(((await getOfficialDraw(db)) as NonNullable<typeof official>).plan), hash);

  // A network retry of the original request gets the same saved draw back, not a new one.
  const stored = await db.query<{ request_id: string }>("select request_id from draws");
  const retry = await runOfficialDraw(db, admin, { requestId: stored[0]?.request_id as string });
  assert.equal(retry.replayed, true);
  assert.equal(retry.draw.ref, official?.ref);
  assert.equal((await counts(db)).draws, 1);

  // The database itself refuses a second published draw, with no application check involved.
  await assert.rejects(
    () =>
      db.execute(
        `insert into draws (season_id, ref, status, algorithm, entropy, plan, plan_hash, reveal_at)
         select season_id, 'NCL26-ZZZZZZ', 'published', algorithm, entropy, plan, plan_hash, now() from draws`,
      ),
    (e) => (e as { code?: string }).code === "23505" || /unique|duplicate/i.test((e as Error).message),
  );
  await db.close();
});

test("concurrent retries that share one request id all receive the single saved draw", async () => {
  const { db, admin } = await setup();
  const requestId = nextRequest();
  const results = await Promise.all([1, 2, 3].map(() => runOfficialDraw(db, admin, { requestId })));
  assert.equal(new Set(results.map((r) => r.draw.ref)).size, 1);
  assert.equal(results.filter((r) => !r.replayed).length, 1);
  assert.equal((await counts(db)).draws, 1);
  await db.close();
});

test("reloading shows the same official draw and replaying the reveal never changes it", async () => {
  const { db, admin } = await setup();
  await runOfficialDraw(db, admin, { requestId: nextRequest() });
  const strip = (board: Awaited<ReturnType<typeof loadBoard>>) => JSON.stringify({ ...board, serverTime: null });
  const first = await loadBoard(db);
  const before = await counts(db);
  const hash = await db.query<{ plan_hash: string }>("select plan_hash from draws");
  for (let i = 0; i < 5; i += 1) {
    const reloaded = await loadBoard(db);
    assert.equal(strip(reloaded), strip(first), "same official draw on every load");
    assert.equal(reloaded.official?.ref, first.official?.ref);
  }
  assert.deepEqual(await counts(db), before, "reading (and replaying client-side from this data) writes nothing");
  assert.deepEqual(await db.query("select plan_hash from draws"), hash);
  await db.close();
});

test("an interrupted draw leaves nothing behind and the real run can still be done afterwards", async () => {
  const { db, admin } = await setup();
  const before = await counts(db);
  await assert.rejects(
    () =>
      runOfficialDraw(db, admin, {
        requestId: nextRequest(),
        hooks: {
          beforeCommit: () => {
            throw new Error("connection dropped");
          },
        },
      }),
    /connection dropped/,
  );
  assert.deepEqual(await counts(db), before, "the transaction rolled back completely");
  assert.equal((await listPublicFixtures(db)).length, 0);
  const { draw } = await runOfficialDraw(db, admin, { requestId: nextRequest() });
  assert.equal((await counts(db)).draws, 1);
  assert.ok(draw.ref);
  await db.close();
});

test("the real run refuses a bad roster, a missing seeded team, a manual schedule and non-organizers, saving nothing", async () => {
  const db = await freshDb();
  const admin = await organizer(db);
  await seedRoster(db, TEAM_NAMES.slice(0, 18));
  const before = await counts(db);
  await assert.rejects(() => runOfficialDraw(db, admin, { requestId: nextRequest() }), (e) => codeOf(e) === "roster_count");
  assert.deepEqual(await counts(db), before);
  await db.close();

  const missing = await freshDb();
  const admin2 = await organizer(missing);
  await seedRoster(missing, TEAM_NAMES.map((name) => (name === "4s-11" ? "Fours Eleven Club" : name)));
  const base = await counts(missing);
  await assert.rejects(() => runOfficialDraw(missing, admin2, { requestId: nextRequest() }), (e) => codeOf(e) === "seed_missing");
  assert.deepEqual(await counts(missing), base);
  await missing.close();

  const { db: db3, admin: admin3 } = await setup();
  const player = await captain(db3);
  await assert.rejects(() => runOfficialDraw(db3, player, { requestId: nextRequest() }), (e) => codeOf(e) === "forbidden");
  await assert.rejects(() => runOfficialDraw(db3, admin3, { requestId: "short" }), (e) => codeOf(e) === "request_id");
  await db3.execute("insert into schedule_versions (season_id, status, note, published_at) select id, 'published', 'manual', now() from seasons");
  await assert.rejects(() => runOfficialDraw(db3, admin3, { requestId: nextRequest() }), (e) => codeOf(e) === "schedule_exists");
  assert.equal((await counts(db3)).draws, 0);
  await db3.close();
});

test("deleting the official run needs the phrase, is audited, keeps history, and asks before taking results off the site", async () => {
  const { db, admin } = await setup();
  const first = await runOfficialDraw(db, admin, { requestId: nextRequest() });
  await assert.rejects(() => resetOfficialDraw(db, admin, { reason: "Wrong roster at the draw", confirmation: "reset" }), (e) => codeOf(e) === "confirmation");
  const player = await captain(db);
  await assert.rejects(() => resetOfficialDraw(db, player, { reason: "Not allowed at all", confirmation: RESET_PHRASE }), (e) => codeOf(e) === "forbidden");
  assert.ok(await getOfficialDraw(db), "still published after refused resets");

  const reset = await resetOfficialDraw(db, admin, { reason: "A team was approved late and the draw was redone", confirmation: RESET_PHRASE });
  assert.equal(reset.ref, first.draw.ref);
  assert.equal(await getOfficialDraw(db), null);
  const row = await db.query<{ status: string; reset_reason: string; reset_by: string }>("select status, reset_reason, reset_by from draws");
  assert.equal(row[0]?.status, "reset");
  assert.equal(row[0]?.reset_by, admin.id);
  assert.equal((await listPublicFixtures(db)).length, 0, "the old schedule is no longer public");
  const audit = await db.query<{ action: string }>("select action from audit_events where action = 'draw.reset'");
  assert.equal(audit.length, 1);
  assert.equal((await counts(db)).group_memberships, 19, "the old allocation is kept as a record");

  const second = await runOfficialDraw(db, admin, { requestId: nextRequest() });
  assert.notEqual(second.draw.ref, first.draw.ref);
  assert.equal((await counts(db)).draws, 2);

  const fixtures = await listPublicFixtures(db);
  const opener = fixtures.find((f) => f.code === "M01");
  await recordMatchScore(db, admin, opener?.id as string, parseScoreEntry({ outcome: "win", firstBats: "a", first: { runs: 40, wickets: 2, balls: 36, allOut: false }, second: { runs: 30, wickets: 5, balls: 36, allOut: false } }));
  await assert.rejects(() => resetOfficialDraw(db, admin, { reason: "Trying to redo after a result", confirmation: RESET_PHRASE }), (e) => codeOf(e) === "results_exist");
  assert.ok(await getOfficialDraw(db));
  await db.close();
});

test("public views expose the draw and fixtures, while direct table access stays closed", async () => {
  const { db, admin } = await setup();
  await runOfficialDraw(db, admin, { requestId: nextRequest() });
  await db.tx(async (query) => {
    await query.query("select set_config('ncl.actor_id', $1, true)", [crypto.randomUUID()]);
    await query.execute("set local role ncl_rls");
    assert.equal((await query.query("select id from public_draw")).length, 1);
    assert.equal((await query.query("select id from public_fixtures")).length, 36, "35 matches and the BYE entry");
    await assert.rejects(() => query.query("select * from draws"));
  });
  await db.tx(async (query) => {
    await query.execute("set local role ncl_rls");
    await assert.rejects(() => query.execute("insert into match_scores (fixture_id, outcome, max_balls) values (gen_random_uuid(), 'win', 36)"));
  });
  await db.close();
});

function scoreFor(index: number): Parameters<typeof parseScoreEntry>[0] {
  return {
    outcome: "win",
    firstBats: "a",
    first: { runs: 31 + index * 2 + (index % 3), wickets: 3, balls: 36, allOut: false },
    second: { runs: 18 + ((index * 5) % 13), wickets: 6, balls: 36, allOut: false },
  };
}

/** Records an organizer decision for every tie that blocks qualification, the way the admin desk does. */
async function settleTies(db: Db, admin: Actor, draw: NonNullable<Awaited<ReturnType<typeof getOfficialDraw>>>): Promise<number> {
  let decided = 0;
  for (let guard = 0; guard < 12; guard += 1) {
    const state = await loadQualification(db, draw);
    const tie = state.blockingTies[0];
    if (!tie) break;
    await recordTiebreak(db, admin, { scope: tie.scope, order: [...tie.teamIds].sort(), note: "Decided by the organizers by draw of lots" });
    decided += 1;
  }
  return decided;
}

test("league results flow into group tables, the quarterfinals wait for confirmation, and winners advance", async () => {
  const { db, admin } = await setup();
  const { draw } = await runOfficialDraw(db, admin, { requestId: nextRequest() });
  const fixtures = await listPublicFixtures(db);
  const league = fixtures.filter((f) => f.stage === "league").sort((a, b) => (a.matchNumber as number) - (b.matchNumber as number));
  assert.equal(league.length, 28);

  for (const [index, fixture] of league.slice(0, 27).entries()) {
    const out = await recordMatchScore(db, admin, fixture.id, parseScoreEntry(scoreFor(index)));
    assert.equal(out.bracketResolved, false);
  }
  // Match cards show each side's innings, from the batting order the organizer entered.
  const firstCard = (await liveFixtures(db, draw.id)).find((f) => f.id === league[0]?.id);
  assert.equal(firstCard?.scoreA, "31/3 (6.0)");
  assert.equal(firstCard?.scoreB, "18/6 (6.0)");

  const midway = await loadQualification(db, draw);
  assert.equal(midway.leagueMatchesPlayed, 27);
  assert.equal(midway.qualifiers, null);
  await assert.rejects(() => confirmStandings(db, admin), (e) => codeOf(e) === "league_incomplete");
  assert.ok((await listPublicFixtures(db)).filter((f) => f.stage === "quarterfinal").every((f) => f.teamALabel.startsWith("Group ")), "placeholders stay until all 28 results are in");

  const last = league[27] as (typeof league)[number];
  await assert.rejects(
    () => recordMatchScore(db, admin, last.id, parseScoreEntry({ ...scoreFor(27), first: { runs: 40, wickets: 3, balls: 30, allOut: false } })),
    (e) => codeOf(e) === "score",
  );
  assert.equal((await loadQualification(db, draw)).leagueMatchesPlayed, 27);
  const out = await recordMatchScore(db, admin, last.id, parseScoreEntry(scoreFor(27)));
  assert.equal(out.bracketResolved, false, "even with every result in, the bracket waits for an organizer");
  await settleTies(db, admin, draw);

  const done = await loadQualification(db, draw);
  assert.equal(done.leagueComplete, true);
  assert.equal(done.qualifiers?.length, 8);
  assert.ok((await listPublicFixtures(db)).filter((f) => f.stage === "quarterfinal").every((f) => !f.teamAId), "nothing is filled before confirmation");

  // A player cannot confirm. An organizer's confirmation fills the quarterfinals from the table.
  const player = await captain(db);
  await assert.rejects(() => confirmStandings(db, player), (e) => codeOf(e) === "forbidden");
  const confirmed = await confirmStandings(db, admin);
  assert.equal(confirmed.bracketResolved, true);
  const again = await confirmStandings(db, admin);
  assert.equal(again.bracketResolved, false, "confirming twice changes nothing");
  assert.ok((await getOfficialDraw(db))?.standingsConfirmedAt, "who and when are recorded");

  const rank = (group: "A" | "B", r: number) => done.qualifiers?.find((q) => q.group === group && q.rank === r)?.teamId;
  const qfs = (await listPublicFixtures(db)).filter((f) => f.stage === "quarterfinal");
  const by = (code: string) => qfs.find((f) => f.code === code) as (typeof qfs)[number];
  assert.deepEqual([by("QF1").teamAId, by("QF1").teamBId], [rank("A", 1), rank("B", 4)]);
  assert.deepEqual([by("QF2").teamAId, by("QF2").teamBId], [rank("A", 2), rank("B", 3)]);
  assert.deepEqual([by("QF3").teamAId, by("QF3").teamBId], [rank("A", 3), rank("B", 2)]);
  assert.deepEqual([by("QF4").teamAId, by("QF4").teamBId], [rank("A", 4), rank("B", 1)]);
  assert.equal(new Set(qfs.flatMap((f) => [f.teamAId, f.teamBId])).size, 8);
  assert.equal((await db.query("select 1 from audit_events where action = 'draw.bracket'")).length, 1);
  assert.equal((await db.query("select 1 from audit_events where action = 'draw.standings_confirmed'")).length, 2);

  // Quarterfinal result: the winner moves into the right semifinal slot; a tie is refused in a knockout.
  const qf1 = by("QF1");
  await assert.rejects(
    () => recordMatchScore(db, admin, qf1.id, parseScoreEntry({ outcome: "tie", firstBats: "a", first: { runs: 30, wickets: 2, balls: 36, allOut: false }, second: { runs: 30, wickets: 4, balls: 36, allOut: false } })),
    (e) => codeOf(e) === "knockout_tie",
  );
  await recordMatchScore(db, admin, qf1.id, parseScoreEntry({ outcome: "win", firstBats: "b", first: { runs: 30, wickets: 2, balls: 36, allOut: false }, second: { runs: 25, wickets: 4, balls: 36, allOut: false } }));
  const sf1 = (await listPublicFixtures(db)).find((f) => f.code === "SF1") as (typeof qfs)[number];
  assert.equal(sf1.teamAId, qf1.teamBId, "batting first with the higher score, side b won QF1");
  assert.equal(sf1.teamBId, null, "the other semifinal slot waits for QF2");
  await assert.rejects(() => recordMatchScore(db, admin, sf1.id, parseScoreEntry(scoreFor(0))), (e) => codeOf(e) === "teams_unknown");
  await db.close();
});

test("a BYE cannot be scored, and a correction that changes the table after confirmation is flagged, not silently applied", async () => {
  const { db, admin } = await setup();
  const { draw } = await runOfficialDraw(db, admin, { requestId: nextRequest() });
  const bye = (await liveFixtures(db, draw.id)).find((f) => f.isBye);
  assert.ok(bye);
  await assert.rejects(() => recordMatchScore(db, admin, bye?.id as string, parseScoreEntry(scoreFor(0))), (e) => codeOf(e) === "bye");

  const league = (await listPublicFixtures(db)).filter((f) => f.stage === "league").sort((a, b) => (a.matchNumber as number) - (b.matchNumber as number));
  for (const [index, fixture] of league.entries()) await recordMatchScore(db, admin, fixture.id, parseScoreEntry(scoreFor(index)));
  await settleTies(db, admin, draw);
  await confirmStandings(db, admin);
  assert.ok((await listPublicFixtures(db)).filter((f) => f.stage === "quarterfinal").every((f) => f.teamAId));
  // Pretend the table moved after the confirmation: the quarterfinals are flagged and left as they are.
  await db.execute("update draws set standings_confirmed_hash = 'changed' where id = $1", [draw.id]);
  await db.tx((query) => resolveBracketTx(query, admin, draw.id));
  const flagged = await db.query<{ n: number }>("select count(*)::int as n from fixtures where draw_id = $1 and stage = 'quarterfinal' and needs_resolution", [draw.id]);
  assert.equal(flagged[0]?.n, 4);
  const filled = await db.query<{ n: number }>("select count(*)::int as n from fixtures where draw_id = $1 and stage = 'quarterfinal' and team_a_registration_id is not null", [draw.id]);
  assert.equal(filled[0]?.n, 4, "teams were not changed automatically");
  await db.close();
});

test("level teams stop the bracket until organizers decide; each decision is recorded, then confirmation fills the bracket", async () => {
  const { db, admin } = await setup();
  const { draw } = await runOfficialDraw(db, admin, { requestId: nextRequest() });
  const league = (await listPublicFixtures(db)).filter((f) => f.stage === "league");
  // Every match is a tie: Group B is level on everything, and Group A is level except the BYE team's two extra points.
  const tie = { outcome: "tie", firstBats: "a", first: { runs: 30, wickets: 4, balls: 36, allOut: false }, second: { runs: 30, wickets: 5, balls: 36, allOut: false } } as const;
  for (const fixture of league) assert.equal((await recordMatchScore(db, admin, fixture.id, parseScoreEntry(tie))).bracketResolved, false);

  let state = await loadQualification(db, draw);
  assert.equal(state.leagueComplete, true);
  assert.equal(state.qualifiers, null, "the site does not pick between level teams");
  assert.equal(state.blockingTies.length, 2, "one tie to settle in each group");
  assert.ok(state.blockers.every((b) => /Organizer decision required/.test(b)));
  const a = state.groups.A.rows;
  assert.equal(a[0]?.teamId, draw.plan.bye.teamId, "the BYE team's two points lift it above teams that tied every match");
  assert.deepEqual([a[0]?.points, a[0]?.played, a[0]?.byes], [4, 2, 1]);
  assert.equal(a[1]?.points, 3);
  await assert.rejects(() => confirmStandings(db, admin), (e) => codeOf(e) === "tie_unresolved");
  assert.ok((await listPublicFixtures(db)).filter((f) => f.stage === "quarterfinal").every((f) => !f.teamAId));

  await assert.rejects(() => recordTiebreak(db, admin, { scope: "group:A", order: ["nobody", "nobody-else"], note: "Bogus decision here" }), (e) => codeOf(e) === "no_tie");
  const first = state.blockingTies[0] as (typeof state.blockingTies)[number];
  await assert.rejects(() => recordTiebreak(db, admin, { scope: first.scope, order: first.teamIds, note: "x" }), (e) => codeOf(e) === "note");
  const decided = await settleTies(db, admin, draw);
  assert.equal(decided, 2);
  state = await loadQualification(db, draw);
  assert.equal(state.blockingTies.length, 0);
  assert.equal(state.qualifiers?.length, 8);
  assert.ok((await listPublicFixtures(db)).filter((f) => f.stage === "quarterfinal").every((f) => !f.teamAId), "decisions alone do not fill the bracket");
  assert.equal((await confirmStandings(db, admin)).bracketResolved, true);
  assert.ok((await listPublicFixtures(db)).filter((f) => f.stage === "quarterfinal").every((f) => f.teamAId && f.teamBId));
  assert.equal((await db.query("select 1 from audit_events where action = 'draw.tiebreak'")).length, 2);
  await db.close();
});

test("organizers can change the times of unplayed matches without touching a single opponent, under the same rules", async () => {
  const { db, admin } = await setup();
  const player = await captain(db);
  const { draw } = await runOfficialDraw(db, admin, { requestId: nextRequest() });
  const opponents = async () => (await liveFixtures(db, draw.id)).filter((f) => !f.isBye).map((f) => `${f.code}:${f.teamAId}|${f.teamBId}`).join(";");
  const before = await opponents();
  const hash = (await db.query<{ plan_hash: string }>("select plan_hash from draws"))[0]?.plan_hash;
  const startOf = async (code: string) => (await liveFixtures(db, draw.id)).find((f) => f.code === code)?.startsAt;
  const originalM01 = await startOf("M01");

  await assert.rejects(() => rescheduleOfficialDraw(db, player, { patch: { saturdayStart: 450 }, note: "x" }), (e) => codeOf(e) === "forbidden");
  const preview = await previewReschedule(db, admin, { saturdayStart: 7 * 60 + 30, sundayStart: 7 * 60 + 30, qf1: 11 * 60 + 45, qf2: 12 * 60 + 50, sf: 14 * 60 + 15, final: 16 * 60 });
  assert.deepEqual(preview.errors, []);
  assert.ok(preview.changes.length > 20);
  assert.equal(await startOf("M01"), originalM01, "a preview saves nothing");

  // Breaking a rule refuses the whole change.
  await assert.rejects(() => rescheduleOfficialDraw(db, admin, { patch: { saturdayStart: 12 * 60 }, note: "Too late in the day" }), (e) => codeOf(e) === "timetable_invalid");
  await assert.rejects(() => rescheduleOfficialDraw(db, admin, { patch: { slotMinutes: 5 }, note: "x" }), (e) => codeOf(e) === "timetable");
  await assert.rejects(() => rescheduleOfficialDraw(db, admin, { patch: { qf1: 10 * 60 + 40 }, note: "Quarterfinals too early" }), (e) => codeOf(e) === "timetable_invalid");
  assert.equal(await startOf("M01"), originalM01, "nothing changed after refusals");

  // M01 is played first, so it keeps its time when the others move.
  await recordMatchScore(db, admin, (await listPublicFixtures(db)).find((f) => f.code === "M01")?.id as string, parseScoreEntry(scoreFor(0)));
  const applied = await rescheduleOfficialDraw(db, admin, { patch: { saturdayStart: 7 * 60 + 30, sundayStart: 7 * 60 + 30, qf1: 11 * 60 + 45, qf2: 12 * 60 + 50, sf: 14 * 60 + 15, final: 16 * 60 }, note: "Start half an hour later" });
  assert.ok(applied.changes.length > 20);
  assert.equal(await startOf("M01"), originalM01, "a match already played is not moved");
  assert.equal(await startOf("M02"), "2026-11-28T02:00:00.000Z", "07:30 IST");
  assert.equal(await opponents(), before, "not one opponent changed");
  assert.equal((await db.query<{ plan_hash: string }>("select plan_hash from draws"))[0]?.plan_hash, hash, "the saved draw record is untouched");
  assert.equal(verifyPlan((await getOfficialDraw(db))?.plan as never, DAYS).ok, true);
  const moved = (await liveFixtures(db, draw.id)).find((f) => f.code === "M02");
  assert.match(moved?.changeNote ?? "", /Rescheduled: Start half an hour later/);
  assert.equal((await getOfficialDraw(db))?.timetable.saturdayStart, 450);
  assert.equal((await db.query("select 1 from audit_events where action = 'draw.reschedule'")).length, 1);

  // One match at a time, under the same rules.
  const m03 = (await liveFixtures(db, draw.id)).find((f) => f.code === "M03");
  await assert.rejects(() => moveMatch(db, admin, { code: "M03", startMinutes: 7 * 60 + 30, ground: "A", note: "Clash with M02" }), (e) => codeOf(e) === "timetable_invalid");
  await assert.rejects(() => moveMatch(db, admin, { code: "M01", startMinutes: 8 * 60, note: "Already played" }), (e) => codeOf(e) === "started");
  assert.equal((await liveFixtures(db, draw.id)).find((f) => f.code === "M03")?.startsAt, m03?.startsAt);
  await moveMatch(db, admin, { code: "M03", startMinutes: 8 * 60 + 25, ground: "A", note: "Ground B pitch repair" });
  assert.equal((await liveFixtures(db, draw.id)).find((f) => f.code === "M03")?.startsAt, "2026-11-28T02:55:00.000Z");
  assert.equal(await opponents(), before);
  await db.close();
});

function walk(directory: string, found: string[] = []): string[] {
  for (const name of readdirSync(directory)) {
    const full = path.join(directory, name);
    if (name === "node_modules" || name === ".next" || name === ".data" || name === ".git") continue;
    if (statSync(full).isDirectory()) walk(full, found);
    else if (/\.(ts|tsx|js|mjs|css|json|md|toml|sql)$/.test(name)) found.push(full);
  }
  return found;
}

test("the draw password is read only from the environment and never appears in source", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const sources = [...walk(path.join(root, "lib")), ...walk(path.join(root, "app")), ...walk(path.join(root, "components")), ...walk(path.join(root, "supabase"))];
  for (const file of sources) {
    const text = readFileSync(file, "utf8");
    // The agreed password has the shape NCL + four digits. No source file may carry anything of that shape.
    assert.equal(/NCL\d{4}(?!\d)/.test(text), false, `${path.relative(root, file)} must not contain a hardcoded draw password`);
  }
  const service = readFileSync(path.join(root, "lib/draw/service.ts"), "utf8");
  assert.match(service, /process\.env\[PASSWORD_ENV\]/);
  assert.match(service, /NCL_FIXTURE_RUN_PASSWORD/);
});
