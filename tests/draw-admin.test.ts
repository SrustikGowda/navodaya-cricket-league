import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { Db } from "../lib/db";
import { saveAwards, syncEditionHistory } from "../lib/draw/history";
import { setKnockoutMatch } from "../lib/draw/knockouts";
import { parseScoreEntry, recordMatchScore } from "../lib/draw/results";
import { getOfficialDraw, resetOfficialDraw, RESET_PHRASE, runOfficialDraw } from "../lib/draw/service";
import { feeChecklist, feeStatuses, setFeePaid } from "../lib/payments";
import { listArchive } from "../lib/content";
import { toHallEdition } from "../lib/hall";
import { listPublicFixtures, listPublicTeams } from "../lib/public-data";
import { clearReadCache } from "../lib/read-cache";
import { seedDatabase } from "../lib/seed";
import { getActiveSeason } from "../lib/season";
import { captain, freshDb, organizer, seedRoster } from "./helpers/roster";

beforeEach(() => {
  process.env.NCL_FIXTURE_RUN_PASSWORD = "unit-test-draw-password";
});
afterEach(() => {
  delete process.env.NCL_FIXTURE_RUN_PASSWORD;
});

let requests = 0;
const nextRequest = () => `admin-test-${Date.now()}-${(requests += 1)}`;
const code = (error: unknown) => (error as { code?: string }).code;

async function withFee(db: Db, paise: number | null) {
  await db.execute("update seasons set fee_paise = $1 where year = 2026", [paise]);
  clearReadCache();
}

async function published(db: Db) {
  const fixtures = await listPublicFixtures(db);
  const byCode = new Map(fixtures.map((f) => [f.code as string, f]));
  return { fixtures, get: (c: string) => byCode.get(c) as (typeof fixtures)[number] };
}

async function fresh() {
  const db = await freshDb();
  const admin = await organizer(db);
  const teams = await seedRoster(db);
  const id = (name: string) => (teams.find((t) => t.name === name) as { id: string }).id;
  return { db, admin, teams, id };
}

test("an organizer can tick a team's entry fee as paid, and it shows on the public team card", async () => {
  const { db, admin, teams } = await fresh();
  const [first, second] = teams as [{ id: string; name: string }, { id: string; name: string }];
  await withFee(db, 400_000);
  assert.equal((await listPublicTeams(db)).every((team) => team.feePaid === false), true);
  assert.equal((await feeStatuses(db, (await getActiveSeason(db)).id)).get(first.id), "unpaid");

  assert.equal(await setFeePaid(db, admin, first.id, true), "paid");
  assert.equal(await setFeePaid(db, admin, first.id, true), "paid", "marking twice does not double-count");
  const count = await db.query<{ n: number }>("select count(*)::int as n from payment_attempts where registration_id = $1 and status = 'verified'", [first.id]);
  assert.equal(count[0]?.n, 1);
  const teamsNow = await listPublicTeams(db);
  assert.equal(teamsNow.find((t) => t.id === first.id)?.feePaid, true);
  assert.equal(teamsNow.find((t) => t.id === second.id)?.feePaid, false);

  // Unticking works; the audit trail records both, and the old record is kept.
  assert.equal(await setFeePaid(db, admin, first.id, false), "unpaid");
  assert.equal(await setFeePaid(db, admin, first.id, false), "unpaid", "unticking twice is harmless");
  assert.equal((await listPublicTeams(db)).find((t) => t.id === first.id)?.feePaid, false);
  const audit = await db.query<{ action: string }>("select action from audit_events where action in ('payment.mark_paid','payment.unmark_paid') order by created_at");
  assert.deepEqual(audit.map((a) => a.action), ["payment.mark_paid", "payment.unmark_paid"]);
  const kept = await db.query<{ n: number }>("select count(*)::int as n from payment_attempts where registration_id = $1", [first.id]);
  assert.equal(kept[0]?.n, 1);
  // The Settings list shows every approved team by name.
  const list = await feeChecklist(db, (await getActiveSeason(db)).id);
  assert.equal(list.length, teams.length);
  assert.deepEqual(list.map((row) => row.teamName), [...list.map((row) => row.teamName)].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
  await db.close();
});

test("fee ticks respect exemptions, a missing fee, older payment records and permissions", async () => {
  const { db, admin, teams } = await fresh();
  const [first, second] = teams as unknown as [{ id: string }, { id: string }];
  const player = await captain(db);
  await assert.rejects(() => setFeePaid(db, player, first.id, true), (e) => code(e) === "forbidden");

  await withFee(db, null);
  await assert.rejects(() => setFeePaid(db, admin, first.id, true), (e) => code(e) === "no_fee");
  await withFee(db, 400_000);

  await db.execute("update registrations set batch_leaving_year = 2022 where id = $1", [second.id]);
  assert.equal((await feeStatuses(db, (await getActiveSeason(db)).id)).get(second.id), "exempt");
  await assert.rejects(() => setFeePaid(db, admin, second.id, true), (e) => code(e) === "exempt");

  // An older verified payment record counts as paid, and the box can still be unticked.
  await db.execute(
    "insert into payment_attempts (season_id, registration_id, amount_paise, transaction_reference, status, verified_at) select season_id, id, 400000, 'UPI123456', 'verified', now() from registrations where id = $1",
    [first.id],
  );
  assert.equal((await feeStatuses(db, (await getActiveSeason(db)).id)).get(first.id), "paid");
  assert.equal(await setFeePaid(db, admin, first.id, true), "paid");
  const attempts = await db.query<{ n: number }>("select count(*)::int as n from payment_attempts where registration_id = $1", [first.id]);
  assert.equal(attempts[0]?.n, 1, "ticking a paid team adds nothing");
  assert.equal(await setFeePaid(db, admin, first.id, false), "unpaid");

  await db.execute("update registrations set status = 'submitted' where id = $1", [first.id]);
  await assert.rejects(() => setFeePaid(db, admin, first.id, true), (e) => code(e) === "not_approved");
  await db.close();
});

async function drawn() {
  const base = await fresh();
  await runOfficialDraw(base.db, base.admin, { requestId: nextRequest() });
  const view = await published(base.db);
  return { ...base, ...view };
}

test("knockout teams and winners can be chosen by hand, and winners move forward on their own", async () => {
  const { db, admin, id, get } = await drawn();
  const qf1 = get("QF1");
  const qf2 = get("QF2");
  const A = id("4s-11");
  const B = id("RCB United");
  const C = id("GTR");
  const D = id("The Elite");

  await assert.rejects(() => setKnockoutMatch(db, admin, qf1.id, { teamAId: A, teamBId: A, winner: null }), (e) => code(e) === "same_team");
  await assert.rejects(() => setKnockoutMatch(db, admin, qf1.id, { teamAId: A, teamBId: null, winner: "a" }), (e) => code(e) === "winner_needs_teams");
  await assert.rejects(() => setKnockoutMatch(db, admin, qf1.id, { teamAId: "00000000-0000-0000-0000-000000000000", teamBId: B, winner: null }), (e) => code(e) === "team");
  const league = get("M01");
  await assert.rejects(() => setKnockoutMatch(db, admin, league.id, { teamAId: A, teamBId: B, winner: null }), (e) => code(e) === "not_found");

  await setKnockoutMatch(db, admin, qf1.id, { teamAId: A, teamBId: B, winner: null });
  // A team plays once in each round.
  await assert.rejects(() => setKnockoutMatch(db, admin, qf2.id, { teamAId: A, teamBId: C, winner: null }), (e) => code(e) === "team_twice");
  await setKnockoutMatch(db, admin, qf2.id, { teamAId: C, teamBId: D, winner: null });
  let now = await published(db);
  assert.equal(now.get("QF1").teamALabel, "4s-11");
  assert.equal(now.get("QF1").teamAId, A);
  assert.equal(now.get("SF1").teamALabel, "Winner QF1", "nothing advances until there is a winner");

  // A winner advances into the right semifinal slot, and taking the winner back takes them out again.
  await setKnockoutMatch(db, admin, qf1.id, { teamAId: A, teamBId: B, winner: "a", summary: "by 12 runs" });
  now = await published(db);
  assert.equal(now.get("QF1").status, "completed");
  assert.equal(now.get("QF1").winnerLabel, "4s-11");
  assert.equal(now.get("SF1").teamAId, A);
  assert.equal(now.get("SF1").teamALabel, "4s-11");
  assert.equal(now.get("SF1").teamBId, null);

  await setKnockoutMatch(db, admin, qf1.id, { teamAId: A, teamBId: B, winner: "b" });
  now = await published(db);
  assert.equal(now.get("SF1").teamAId, B, "a corrected winner replaces the one that had advanced");
  await setKnockoutMatch(db, admin, qf1.id, { teamAId: A, teamBId: B, winner: null });
  now = await published(db);
  assert.equal(now.get("QF1").status, "scheduled");
  assert.equal(now.get("QF1").winnerLabel, null);
  assert.equal(now.get("SF1").teamAId, null);
  assert.equal(now.get("SF1").teamALabel, "Winner QF1");

  // Clearing a team restores its placeholder.
  await setKnockoutMatch(db, admin, qf2.id, { teamAId: null, teamBId: null, winner: null });
  assert.equal((await published(db)).get("QF2").teamALabel, "Qualifier Seed 4");
  const player = await captain(db);
  await assert.rejects(() => setKnockoutMatch(db, player, qf1.id, { teamAId: A, teamBId: B, winner: null }), (e) => code(e) === "forbidden");
  await db.close();
});

async function playToFinal(ctx: Awaited<ReturnType<typeof drawn>>) {
  const { db, admin, id } = ctx;
  const t = ["4s-11", "RCB United", "GTR", "The Elite", "Champions-11", "IX-ELEVENS", "Tunga Titans", "Malnad Mavericks"].map(id);
  const view = await published(db);
  const qfs = ["QF1", "QF2", "QF3", "QF4"];
  for (const [index, qf] of qfs.entries()) {
    await setKnockoutMatch(db, admin, view.get(qf).id, { teamAId: t[index * 2] as string, teamBId: t[index * 2 + 1] as string, winner: "a" });
  }
  const afterQf = await published(db);
  assert.equal(afterQf.get("SF1").teamAId, t[0]);
  assert.equal(afterQf.get("SF1").teamBId, t[2]);
  assert.equal(afterQf.get("SF2").teamAId, t[4]);
  assert.equal(afterQf.get("SF2").teamBId, t[6]);
  await setKnockoutMatch(db, admin, afterQf.get("SF1").id, { teamAId: t[0] as string, teamBId: t[2] as string, winner: "a" });
  await setKnockoutMatch(db, admin, afterQf.get("SF2").id, { teamAId: t[4] as string, teamBId: t[6] as string, winner: "b" });
  const afterSf = await published(db);
  assert.equal(afterSf.get("F").teamAId, t[0], "SF1 winner fills the final");
  assert.equal(afterSf.get("F").teamBId, t[6], "SF2 winner fills the final");
  return { t, afterSf };
}

test("the edition's History entry builds itself from the knockouts and the awards", async () => {
  const ctx = await drawn();
  const { db, admin } = ctx;
  const season = await getActiveSeason(db);
  const history = async () => (await listArchive(db)).find((entry) => entry.editionNumber === season.editionNumber);

  assert.equal(await history(), undefined, "no entry until a champion exists");
  const { t, afterSf } = await playToFinal(ctx);
  assert.equal(await history(), undefined, "still none while the final is undecided");

  await saveAwards(db, admin, {
    batter: { name: "Praveen G J", team: "GTR", figure: "122", details: "from 5 innings, average 40.67, strike rate 146.99" },
    bowler: { name: "Deekshith Gowda", team: "The Elite", figure: "11", details: "in 10 overs, economy 5.80" },
    mvp: { name: "Deekshith Gowda", team: "The Elite", details: "" },
    fielder: { name: "Darshan K P", team: "Tunga Titans", figure: "8", details: "" },
  });
  assert.equal(await history(), undefined, "awards alone do not create an edition");

  await setKnockoutMatch(db, admin, afterSf.get("F").id, { teamAId: t[0] as string, teamBId: t[6] as string, winner: "b" });
  const entry = (await history()) as NonNullable<Awaited<ReturnType<typeof history>>>;
  assert.ok(entry);
  assert.equal(entry.year, 2026);
  assert.equal(entry.verificationStatus, "verified");
  assert.match(entry.champion ?? "", /^Tunga Titans/);
  assert.match(entry.runnerUp ?? "", /^4s-11/);

  // The History page's own parser reads it back as a normal edition, with the awards.
  const hall = toHallEdition(entry);
  assert.equal(hall.championName, "Tunga Titans");
  assert.equal(hall.roman, "XV");
  assert.equal(hall.runnerName, "4s-11");
  assert.equal(hall.semis.length, 2);
  assert.ok(hall.semis.some((line) => line.includes("beat")));
  assert.equal(hall.standouts.runs?.name, "Praveen G J");
  assert.equal(hall.standouts.runs?.figure, "122");
  assert.equal(hall.standouts.wickets?.name, "Deekshith Gowda");
  assert.equal(hall.standouts.wickets?.figure, "11");
  assert.equal(hall.standouts.mvp?.name, "Deekshith Gowda");
  assert.equal(hall.standouts.fielder?.name, "Darshan K P");
  assert.ok(hall.details.some((d) => d.label === "Teams" && d.value === "18"));
  assert.ok(hall.details.some((d) => d.label === "Matches" && d.value === "34"));

  // Changing the winner changes the champion straight away; an undecided final removes the entry.
  await setKnockoutMatch(db, admin, afterSf.get("F").id, { teamAId: t[0] as string, teamBId: t[6] as string, winner: "a" });
  assert.match((await history())?.champion ?? "", /^4s-11/);
  await setKnockoutMatch(db, admin, afterSf.get("F").id, { teamAId: t[0] as string, teamBId: t[6] as string, winner: null });
  assert.equal(await history(), undefined);
  await setKnockoutMatch(db, admin, afterSf.get("F").id, { teamAId: t[0] as string, teamBId: t[6] as string, winner: "a" });

  // A restart (the seed runs on startup) must not delete it.
  await seedDatabase(db);
  clearReadCache();
  assert.ok(await history(), "the edition survives a restart");

  // Awards are validated.
  await assert.rejects(() => saveAwards(db, admin, { batter: { name: "X", figure: "12.5" } }), (e) => code(e) === "award");
  await assert.rejects(() => saveAwards(db, admin, { bowler: { team: "Only a team" } }), (e) => code(e) === "award");
  await db.close();
});

test("a final score feeds the History entry's final line, and hand-written entries are never overwritten", async () => {
  const ctx = await drawn();
  const { db, admin } = ctx;
  const season = await getActiveSeason(db);
  const { t, afterSf } = await playToFinal(ctx);
  await setKnockoutMatch(db, admin, afterSf.get("F").id, { teamAId: t[0] as string, teamBId: t[6] as string, winner: null });
  await recordMatchScore(db, admin, afterSf.get("F").id, parseScoreEntry({ outcome: "win", firstBats: "a", first: { runs: 61, wickets: 4, balls: 48, allOut: false }, second: { runs: 55, wickets: 7, balls: 48, allOut: false } }));
  clearReadCache();
  const entry = (await listArchive(db)).find((e) => e.editionNumber === season.editionNumber);
  assert.ok(entry, "scoring the final decides the champion");
  const hall = toHallEdition(entry as NonNullable<typeof entry>);
  assert.equal(hall.final.first?.score, "61/4");
  assert.equal(hall.final.second?.score, "55/7");
  assert.match(hall.final.result, /won by 6 runs/);
  assert.equal(hall.final.venue, "Ground A");

  // An organizer-written entry for this edition is left alone.
  await db.execute("update archive_entries set source_url = 'https://example.org/own-write-up', champion = 'Written by hand' where edition_number = $1", [season.editionNumber]);
  await syncEditionHistory(db);
  clearReadCache();
  assert.equal((await listArchive(db)).find((e) => e.editionNumber === season.editionNumber)?.champion, "Written by hand");
  await db.close();
});

test("an admin can delete the official run, with results only after they confirm, and then run it again", async () => {
  const ctx = await drawn();
  const { db, admin, get } = ctx;
  const player = await captain(db);
  const first = await getOfficialDraw(db);
  await assert.rejects(() => resetOfficialDraw(db, player, { reason: "I would like to redo it", confirmation: RESET_PHRASE }), (e) => code(e) === "forbidden");
  await assert.rejects(() => resetOfficialDraw(db, admin, { reason: "A long enough reason", confirmation: "delete" }), (e) => code(e) === "confirmation");

  // With a recorded result, deleting needs an explicit tick and keeps the data.
  await recordMatchScore(db, admin, get("M01").id, parseScoreEntry({ outcome: "win", firstBats: "a", first: { runs: 40, wickets: 2, balls: 36, allOut: false }, second: { runs: 30, wickets: 5, balls: 36, allOut: false } }));
  await assert.rejects(
    () => resetOfficialDraw(db, admin, { reason: "Wrong roster at the draw", confirmation: RESET_PHRASE }),
    (e) => code(e) === "results_exist",
  );
  assert.ok(await getOfficialDraw(db), "nothing was deleted without the tick");

  const deleted = await resetOfficialDraw(db, admin, { reason: "Wrong roster at the draw", confirmation: RESET_PHRASE, acknowledgeResults: true });
  assert.equal(deleted.ref, first?.ref);
  assert.equal(deleted.archivedResults, 1);
  assert.equal(await getOfficialDraw(db), null);
  assert.equal((await listPublicFixtures(db)).length, 0, "the old fixtures are off the site");
  const kept = await db.query<{ n: number }>("select count(*)::int as n from match_scores");
  assert.equal(kept[0]?.n, 1, "the score is archived, not destroyed");

  // The Real Run is available again and makes a fresh draw.
  const second = await runOfficialDraw(db, admin, { requestId: nextRequest() });
  assert.notEqual(second.draw.ref, first?.ref);
  assert.equal((await listPublicFixtures(db)).length, 34);
  const standings = await db.query<{ n: number }>("select count(*)::int as n from match_scores ms join fixtures f on f.id = ms.fixture_id where f.draw_id = $1", [second.draw.id]);
  assert.equal(standings[0]?.n, 0, "the new draw starts with no results");
  await db.close();
});

test("deleting the official run also removes the History entry it created", async () => {
  const ctx = await drawn();
  const { db, admin } = ctx;
  const season = await getActiveSeason(db);
  const { t, afterSf } = await playToFinal(ctx);
  await setKnockoutMatch(db, admin, afterSf.get("F").id, { teamAId: t[0] as string, teamBId: t[6] as string, winner: "a" });
  assert.ok((await listArchive(db)).some((e) => e.editionNumber === season.editionNumber));
  // The reason is optional; a default goes in the audit log.
  await resetOfficialDraw(db, admin, { confirmation: RESET_PHRASE, acknowledgeResults: true });
  const audit = await db.query<{ payload: unknown }>("select payload from audit_events where action = 'draw.reset'");
  assert.match(JSON.stringify(audit[0]?.payload), /redo the Real Run/);
  clearReadCache();
  assert.equal((await listArchive(db)).some((e) => e.editionNumber === season.editionNumber), false);
  await db.close();
});
