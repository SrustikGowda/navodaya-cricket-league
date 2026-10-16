import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createDb, migrate, type Db } from "../lib/db";
import { seedDatabase } from "../lib/seed";
import { upsertProfile } from "../lib/accounts";
import { buildFixtureCalendar, shouldNotifyScheduleUpdate } from "../lib/calendar";
import { localAuthAllowed, cricheroesSyncAvailable, demoAllowed } from "../lib/integrations";
import { listPaymentsForRegistration, listAllPayments, submitPaymentEvidence, verifyPayment } from "../lib/payments";
import { getPublicFixture, getPublicTeam, listPublicFixtures } from "../lib/public-data";
import {
  createDraft,
  getOwnRegistration,
  replacePlayers,
  reviewRegistration,
  removeRegistration,
  listRegistrations,
  submitPublicRegistration,
  submitRegistration,
  updateRegistration,
  type Registration,
} from "../lib/registration";
import { addGround, addManualFixture, publishDelay, publishSchedule, recordResult } from "../lib/schedule";
import { findScheduleConflicts, planRoundRobin, type EngineFixture } from "../lib/schedule-engine";
import { clearReadCache } from "../lib/read-cache";
import { getActiveSeason, getScheduleSettings, updateSeason } from "../lib/season";
import { publishStandings, getPublishedStandings } from "../lib/standings";
import { adminAction } from "../lib/admin-actions";
import type { Actor } from "../lib/types";

const NOW = new Date("2026-10-06T06:30:00.000Z");

async function freshDb(): Promise<Db> {
  clearReadCache();
  delete process.env.DATABASE_URL;
  delete process.env.PGLITE_DIR;
  process.env.DEMO_MODE = "false";
  Object.assign(process.env, { NODE_ENV: "test" });
  const db = await createDb();
  await migrate(db);
  await seedDatabase(db);
  return db;
}

async function organizer(db: Db): Promise<Actor> {
  const actor = await upsertProfile(db, { email: "organizer@ncl.test", displayName: "Organizer" });
  await db.execute("update profiles set role = 'organizer' where id = $1", [actor.id]);
  return { ...actor, role: "organizer" };
}

async function openSeason(db: Db, admin: Actor, extra: Parameters<typeof updateSeason>[3] = {}) {
  const season = await getActiveSeason(db);
  return updateSeason(db, admin, season.version, {
    rulesVersion: "2026.1",
    rulesText: "Playing conditions used by the automated tests.",
    feePaise: 0,
    registrationOpensAt: "2026-10-01T04:30:00.000Z",
    registrationClosesAt: "2026-11-25T18:29:00.000Z",
    registrationAnnounced: true,
    ...extra,
  });
}

async function submitTeam(db: Db, actor: Actor, name: string, batch = [2005, 2012]): Promise<Registration> {
  const draft = await createDraft(db, actor, NOW);
  const details = await updateRegistration(
    db,
    actor,
    draft.id,
    draft.version,
    {
      teamName: name,
      batchAdmissionYear: batch[0],
      batchLeavingYear: batch[1],
      captainName: `${name} captain`,
      captainPhone: "9845012345",
      publicationConsent: true,
      rulesAcknowledged: true,
    },
    NOW,
  );
  const squad = await replacePlayers(
    db,
    actor,
    details.id,
    details.version,
    [{ name: `${name} player`, role: "batter", batchLabel: "2005-2012", jerseyNumber: 7 }],
    NOW,
  );
  const submitted = await submitRegistration(db, actor, squad.id, crypto.randomUUID(), squad.version, NOW);
  return submitted.registration;
}

test("schedule conflicts report overlaps, rest and knockout order without dropping matches", () => {
  const base: EngineFixture = {
    id: "m1",
    matchNumber: 1,
    groundId: "g1",
    teamAId: "a",
    teamBId: "b",
    teamALabel: "A",
    teamBLabel: "B",
    startsAt: "2026-11-28T03:30:00.000Z",
    durationMinutes: 60,
    status: "scheduled",
  };
  const overlap = findScheduleConflicts(
    [base, { ...base, id: "m2", matchNumber: 2, startsAt: "2026-11-28T04:00:00.000Z", teamAId: "c", teamBId: "d", teamALabel: "C", teamBLabel: "D" }],
    { dayStartMinutes: null, dayEndMinutes: null, breakStartMinutes: null, breakEndMinutes: null, transitionBufferMinutes: null, minRestMinutes: null },
  );
  assert.equal(overlap.conflicts.some((conflict) => conflict.code === "ground_overlap"), true);

  const rest = findScheduleConflicts(
    [base, { ...base, id: "m2", matchNumber: 2, groundId: "g2", startsAt: "2026-11-28T04:20:00.000Z", teamBId: "c", teamBLabel: "C" }],
    { dayStartMinutes: null, dayEndMinutes: null, breakStartMinutes: null, breakEndMinutes: null, transitionBufferMinutes: null, minRestMinutes: 30 },
  );
  assert.equal(rest.conflicts.some((conflict) => conflict.code === "insufficient_rest"), true);

  const dependency = findScheduleConflicts(
    [
      base,
      {
        ...base,
        id: "final",
        matchNumber: 2,
        groundId: "g2",
        teamAId: null,
        teamBId: null,
        teamALabel: "Winner QF1",
        teamBLabel: "Winner QF2",
        startsAt: "2026-11-28T03:45:00.000Z",
        dependsOn: [{ fixtureId: "m1", slot: "winner", teamSlot: "a" }],
      },
    ],
    { dayStartMinutes: null, dayEndMinutes: null, breakStartMinutes: null, breakEndMinutes: null, transitionBufferMinutes: null, minRestMinutes: null },
  );
  assert.equal(dependency.conflicts.some((conflict) => conflict.code === "dependency_order"), true);
});

test("round robin plays each pair once and does not invent a partial schedule", () => {
  const plan = planRoundRobin({
    teams: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
      { id: "d", label: "D" },
    ],
    grounds: [{ id: "g", name: "Ground A" }],
    startDate: "2026-11-28",
    endDate: "2026-11-29",
    dayStartMinutes: 9 * 60,
    dayEndMinutes: 18 * 60,
    durationMinutes: 60,
    bufferMinutes: 10,
    restMinutes: 20,
    breakStartMinutes: null,
    breakEndMinutes: null,
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.fixtures.length, 6);
  const pairs = plan.fixtures.map((fixture) => [fixture.teamAId, fixture.teamBId].sort().join("-")).sort();
  assert.deepEqual(pairs, ["a-b", "a-c", "a-d", "b-c", "b-d", "c-d"]);
  assert.match(plan.assumptions.join(" "), /selected opponents/i);

  const impossible = planRoundRobin({
    teams: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ],
    grounds: [{ id: "g", name: "Ground A" }],
    startDate: "2026-11-28",
    endDate: "2026-11-28",
    dayStartMinutes: 9 * 60,
    dayEndMinutes: 10 * 60,
    durationMinutes: 60,
    bufferMinutes: 0,
    restMinutes: 0,
    breakStartMinutes: null,
    breakEndMinutes: null,
  });
  assert.equal(impossible.ok, false);
  assert.equal(impossible.fixtures.length, 0);
});

test("captains are isolated, submission is idempotent, and capacity is atomic", async () => {
  const db = await freshDb();
  const admin = await organizer(db);
  await openSeason(db, admin, { teamCap: 1, waitlistEnabled: false, feePaise: 0 });
  const captainA = await upsertProfile(db, { email: "a@ncl.test" });
  const captainB = await upsertProfile(db, { email: "b@ncl.test" });
  const first = await submitTeam(db, captainA, "Alpha");
  const second = await submitTeam(db, captainB, "Beta", [2012, 2019]);

  const hidden = await getOwnRegistration(db, captainB, first.id);
  assert.equal(hidden, null);
  const again = await submitRegistration(db, captainA, first.id, crypto.randomUUID(), first.version, NOW);
  assert.equal(again.alreadySubmitted, true);
  assert.equal(again.registration.reference, first.reference);
  const count = await db.query<{ count: number }>("select count(*)::int as count from registrations");
  assert.equal(count[0]?.count, 2);

  const results = await Promise.allSettled([
    reviewRegistration(db, admin, first.id, "approve", ""),
    reviewRegistration(db, admin, second.id, "approve", ""),
  ]);
  const approved = await db.query<{ count: number }>(
    "select count(*)::int as count from registrations where status = 'approved'",
  );
  assert.equal(approved[0]?.count, 1);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);

  await db.tx(async (query) => {
    await query.query("select set_config('ncl.actor_id', $1, true)", [captainB.id]);
    await query.execute("set local role ncl_rls");
    const visible = await query.query<{ id: string }>("select id from registrations");
    assert.equal(visible.some((row) => row.id === first.id), false);
  });
  await db.close();
});

test("payment evidence stays unverified until an organizer checks it", async () => {
  const db = await freshDb();
  const admin = await organizer(db);
  await openSeason(db, admin, {
    feePaise: 50000,
    payeeName: "NCL Alumni",
    upiVpa: "ncl@upi",
  });
  const captain = await upsertProfile(db, { email: "pay@ncl.test" });
  const other = await upsertProfile(db, { email: "other@ncl.test" });
  const registration = await submitTeam(db, captain, "Payees");
  await reviewRegistration(db, admin, registration.id, "approve", "");
  const attempt = await submitPaymentEvidence(db, captain, registration.id, { transactionReference: "UPI123456" });
  assert.equal(attempt.status, "submitted");
  await assert.rejects(() => verifyPayment(db, captain, attempt.id), /organizer/i);
  const still = await listPaymentsForRegistration(db, registration.id);
  assert.equal(still[0]?.status, "submitted");
  const verified = await verifyPayment(db, admin, attempt.id);
  assert.equal(verified.status, "verified");
  const otherRegistration = await submitTeam(db, other, "Second Payee", [1998, 2005]);
  await reviewRegistration(db, admin, otherRegistration.id, "approve", "");
  const duplicate = await submitPaymentEvidence(db, other, otherRegistration.id, { transactionReference: "upi123456" });
  await assert.rejects(() => verifyPayment(db, admin, duplicate.id), /already verified/i);
  const secondAttempt = await submitPaymentEvidence(db, captain, registration.id, { transactionReference: "UPI999888" });

  await db.tx(async (query) => {
    await query.query("select set_config('ncl.actor_id', $1, true)", [captain.id]);
    await query.execute("set local role ncl_rls");
    await assert.rejects(
      () => query.execute("update payment_attempts set status = 'verified' where id = $1", [secondAttempt.id]),
      /row-level security|policy/i,
    );
  });
  await db.close();
});

test("a public form submits once per email without a sign-in", async () => {
  const db = await freshDb();
  const admin = await organizer(db);
  await openSeason(db, admin);
  const input = {
    teamName: "Form XI",
    batchAdmissionYear: 2005,
    batchLeavingYear: 2012,
    captainName: "Form Captain",
    captainEmail: "form@ncl.test",
    captainPhone: "9845012345",
    publicationConsent: true,
    rulesAcknowledged: true,
  };
  const first = await submitPublicRegistration(db, input, NOW);
  assert.equal(first.alreadySubmitted, false);
  assert.equal(first.registration.status, "submitted");
  assert.match(first.registration.reference ?? "", /^NCL26-/);
  const again = await submitPublicRegistration(db, input, NOW);
  assert.equal(again.alreadySubmitted, true);
  assert.equal(again.registration.reference, first.registration.reference);
  const count = await db.query<{ count: number }>("select count(*)::int as count from registrations");
  assert.equal(count[0]?.count, 1);
  await assert.rejects(
    () => submitPublicRegistration(db, { ...input, captainEmail: "other@ncl.test", captainPhone: "123" }, NOW),
    /mobile/i,
  );
});

test("publication consent and the fee acknowledgement are recorded separately", async () => {
  const db = await freshDb();
  const admin = await organizer(db);
  await openSeason(db, admin, { feePaise: 400000, feeDueAt: "2026-10-20T18:29:00.000Z" });
  const input = {
    teamName: "Fee XI",
    batchAdmissionYear: 2008,
    batchLeavingYear: 2015,
    captainName: "Fee Captain",
    captainEmail: "fee@ncl.test",
    captainPhone: "9845098765",
    publicationConsent: true,
    feeConsent: false,
    rulesAcknowledged: true,
  };
  await assert.rejects(() => submitPublicRegistration(db, input, NOW), /fee/i);
  await assert.rejects(
    () => submitPublicRegistration(db, { ...input, publicationConsent: false, feeConsent: true }, NOW),
    /publication/i,
  );
  const saved = await submitPublicRegistration(db, { ...input, publicationConsent: true, feeConsent: true }, NOW);
  assert.equal(saved.registration.publicationConsent, true);
  assert.equal(saved.registration.feeConsent, true);
  assert.equal(saved.registration.feeConsentPaise, 400000);
  assert.ok(saved.registration.feeConsentDueAt);
  const row = await db.query<{ publication_consent: boolean; fee_consent: boolean }>(
    "select publication_consent, fee_consent from registrations where id = $1",
    [saved.registration.id],
  );
  assert.equal(row[0]?.publication_consent, true);
  assert.equal(row[0]?.fee_consent, true);
  await removeRegistration(db, admin, saved.registration.id);
  const remaining = await db.query<{ count: number }>("select count(*)::int as count from registrations where id = $1", [saved.registration.id]);
  assert.equal(remaining[0]?.count, 0);
  await db.close();
});

test("registration window and roster lock follow IST instants", async () => {
  const db = await freshDb();
  const admin = await organizer(db);
  await openSeason(db, admin, { rosterLockAt: "2026-11-27T12:30:00.000Z" });
  const captain = await upsertProfile(db, { email: "time@ncl.test" });
  const draft = await createDraft(db, captain, new Date("2026-10-01T04:30:00.000Z"));
  assert.equal(draft.status, "draft");
  await assert.rejects(
    () => submitRegistration(db, captain, draft.id, crypto.randomUUID(), draft.version, new Date("2026-11-25T18:30:00.000Z")),
    /closed/i,
  );
  const open = await updateRegistration(db, captain, draft.id, draft.version, { teamName: "On time" }, NOW);
  await assert.rejects(
    () => updateRegistration(db, captain, open.id, open.version, { teamName: "Locked" }, new Date("2026-11-27T12:30:00.000Z")),
    /locked/i,
  );
  const unchanged = await getOwnRegistration(db, captain);
  assert.equal(unchanged?.teamName, "On time");
  await db.close();
});

test("unpublished fixtures and private contacts stay out of public reads", async () => {
  const db = await freshDb();
  const admin = await organizer(db);
  await openSeason(db, admin);
  const captain = await upsertProfile(db, { email: "public@ncl.test" });
  const registration = await submitTeam(db, captain, "Visible XI");
  await addGround(db, admin, "Ground A");
  const grounds = await db.query<{ id: string }>("select id from grounds");
  const groundId = grounds[0]?.id ?? "";
  await addManualFixture(db, admin, {
    groundId,
    teamA: "Visible XI",
    teamB: "Winner QF1",
    startsAt: "2026-11-28 09:30",
    durationMinutes: 70,
    matchNumber: 1,
  });
  assert.equal((await listPublicFixtures(db)).length, 0);
  await publishSchedule(db, admin, "First publish");
  await reviewRegistration(db, admin, registration.id, "approve", "");
  const fixtures = await listPublicFixtures(db);
  assert.equal(fixtures.length, 1);
  const team = await getPublicTeam(db, "visible-xi");
  assert.equal(team?.squad[0]?.name, "Visible XI player");
  assert.equal(JSON.stringify(team).includes("9845012345"), false);
  assert.equal(JSON.stringify(team).includes("public@ncl.test"), false);
  const season = await db.query("select * from public_season");
  assert.equal(Object.keys(season[0] ?? {}).includes("upi_vpa"), false);

  await db.tx(async (query) => {
    await query.query("select set_config('ncl.actor_id', $1, true)", [crypto.randomUUID()]);
    await query.execute("set local role ncl_rls");
    const direct = await query.query("select id, captain_phone from registrations");
    assert.equal(direct.length, 0);
    const published = await query.query("select id from public_fixtures");
    assert.equal(published.length, 1);
    const privateSeason = await query.query("select * from seasons");
    assert.equal(privateSeason.length, 0);
    await assert.rejects(() => query.execute("insert into audit_events (action, entity_type) values ('x', 'y')"));
  });
  await db.close();
});

test("a reschedule updates the fixture and calendar sequence together", async () => {
  const db = await freshDb();
  const admin = await organizer(db);
  await openSeason(db, admin);
  const captainA = await upsertProfile(db, { email: "cal-a@ncl.test" });
  const captainB = await upsertProfile(db, { email: "cal-b@ncl.test" });
  const alpha = await submitTeam(db, captainA, "Calendar A");
  const beta = await submitTeam(db, captainB, "Calendar B", [2012, 2019]);
  await reviewRegistration(db, admin, alpha.id, "approve", "");
  await reviewRegistration(db, admin, beta.id, "approve", "");
  const ground = await addGround(db, admin, "Ground A");
  await addManualFixture(db, admin, {
    groundId: ground.id,
    teamA: "Calendar A",
    teamB: "Calendar B",
    startsAt: "2026-11-28 09:30",
    durationMinutes: 60,
    reportingMinutesBefore: 20,
    matchNumber: 1,
  });
  await publishSchedule(db, admin, "Published");
  const before = await listPublicFixtures(db);
  const previous = before[0];
  assert.ok(previous);
  await publishDelay(db, admin, {
    groundId: ground.id,
    from: "2026-11-28 09:00",
    delayMinutes: 30,
    note: "Rain delay on Ground A",
  });
  const after = await getPublicFixture(db, previous.id);
  assert.ok(after);
  assert.equal(after.calendarSequence, previous.calendarSequence + 1);
  assert.notEqual(after.startsAt, previous.startsAt);
  assert.equal(shouldNotifyScheduleUpdate(
    { sequence: previous.calendarSequence, updatedAt: previous.updatedAt },
    { sequence: after.calendarSequence, updatedAt: after.updatedAt },
  ), true);
  const calendar = buildFixtureCalendar(after, "Loyala School Ground");
  assert.match(calendar, new RegExp(`SEQUENCE:${after.calendarSequence}`));
  assert.match(calendar, /DTSTART;TZID=Asia\/Kolkata:20261128T100000/);
  assert.match(calendar, new RegExp(`UID:fixture-${after.id}@ncl.jnvckm.org`));
  await db.close();
});

test("a failed submit keeps the draft and does not issue a reference", async () => {
  const db = await freshDb();
  const admin = await organizer(db);
  await openSeason(db, admin);
  const captain = await upsertProfile(db, { email: "draft@ncl.test" });
  const draft = await createDraft(db, captain, NOW);
  const saved = await updateRegistration(db, captain, draft.id, draft.version, { teamName: "Kept", captainName: "Kept Captain", captainPhone: "9845012345" }, NOW);
  await assert.rejects(
    () => submitRegistration(db, captain, saved.id, crypto.randomUUID(), saved.version, NOW),
    /no reference was issued/i,
  );
  const reloaded = await getOwnRegistration(db, captain);
  assert.equal(reloaded?.status, "draft");
  assert.equal(reloaded?.reference, null);
  assert.equal(reloaded?.teamName, "Kept");
  await db.close();
});

test("duplicate player ids are blocked and shared names are only flagged", async () => {
  const db = await freshDb();
  const admin = await organizer(db);
  await openSeason(db, admin);
  const captainA = await upsertProfile(db, { email: "dup-a@ncl.test" });
  const captainB = await upsertProfile(db, { email: "dup-b@ncl.test" });
  const first = await createDraft(db, captainA, NOW);
  const named = await updateRegistration(db, captainA, first.id, first.version, {
    teamName: "First",
    batchAdmissionYear: 2005,
    batchLeavingYear: 2012,
    captainName: "Captain A",
    captainPhone: "9845012345",
    publicationConsent: true,
    rulesAcknowledged: true,
  }, NOW);
  const squad = await replacePlayers(db, captainA, named.id, named.version, [
    { name: "Shared Sharma", role: "batter", cricheroesUrl: "https://cricheroes.com/player-profile/111/shared" },
  ], NOW);
  await submitRegistration(db, captainA, squad.id, crypto.randomUUID(), squad.version, NOW);

  const second = await createDraft(db, captainB, NOW);
  const other = await updateRegistration(db, captainB, second.id, second.version, {
    teamName: "Second",
    batchAdmissionYear: 2012,
    batchLeavingYear: 2019,
    captainName: "Captain B",
    captainPhone: "9845098765",
    publicationConsent: true,
    rulesAcknowledged: true,
  }, NOW);
  await assert.rejects(
    () => replacePlayers(db, captainB, other.id, other.version, [
      { name: "Someone Else", role: "bowler", cricheroesUrl: "https://cricheroes.com/player-profile/111/other" },
    ], NOW),
    /already listed/i,
  );
  const flagged = await replacePlayers(db, captainB, other.id, other.version, [
    { name: "Shared Sharma", role: "bowler" },
  ], NOW);
  const submitted = await submitRegistration(db, captainB, flagged.id, crypto.randomUUID(), flagged.version, NOW);
  assert.equal(submitted.registration.status, "submitted");
  assert.equal(submitted.registration.nameReviewRequired, true);
  await db.close();
});

test("waitlisted teams are not charged and a zero fee needs no payment", async () => {
  const db = await freshDb();
  const admin = await organizer(db);
  await openSeason(db, admin, { teamCap: 1, waitlistEnabled: true, feePaise: 25000, payeeName: "NCL", upiVpa: "ncl@upi" });
  const captainA = await upsertProfile(db, { email: "wait-a@ncl.test" });
  const captainB = await upsertProfile(db, { email: "wait-b@ncl.test" });
  const approved = await reviewRegistration(db, admin, (await submitTeam(db, captainA, "In")).id, "approve", "");
  const waiting = await reviewRegistration(db, admin, (await submitTeam(db, captainB, "Out", [2013, 2020])).id, "approve", "");
  assert.equal(approved.status === "approved" || waiting.status === "approved", true);
  assert.equal([approved.status, waiting.status].includes("waitlisted"), true);
  const waitlisted = approved.status === "waitlisted" ? approved : waiting;
  const payments = await listPaymentsForRegistration(db, waitlisted.id);
  assert.equal(payments.length, 0);
  await assert.rejects(() => submitPaymentEvidence(db, captainB, waitlisted.id, { transactionReference: "NOPE1234" }), /waitlisted|approved/i);

  const freeDb = await freshDb();
  const freeAdmin = await organizer(freeDb);
  await openSeason(freeDb, freeAdmin, { feePaise: 0 });
  const freeCaptain = await upsertProfile(freeDb, { email: "free@ncl.test" });
  const free = await submitTeam(freeDb, freeCaptain, "Free XI");
  const freePayments = await listPaymentsForRegistration(freeDb, free.id);
  assert.equal(freePayments[0]?.status, "not_required");
  await freeDb.close();
  await db.close();
});

test("result corrections flag downstream matches and standings without changing participants", async () => {
  const db = await freshDb();
  const admin = await organizer(db);
  await openSeason(db, admin);
  const captainA = await upsertProfile(db, { email: "res-a@ncl.test" });
  const captainB = await upsertProfile(db, { email: "res-b@ncl.test" });
  await reviewRegistration(db, admin, (await submitTeam(db, captainA, "Side A")).id, "approve", "");
  await reviewRegistration(db, admin, (await submitTeam(db, captainB, "Side B", [2012, 2019])).id, "approve", "");
  const ground = await addGround(db, admin, "Ground A");
  await addManualFixture(db, admin, {
    groundId: ground.id,
    teamA: "Side A",
    teamB: "Side B",
    startsAt: "2026-11-28 09:00",
    durationMinutes: 60,
    matchNumber: 1,
  });
  await addManualFixture(db, admin, {
    groundId: ground.id,
    teamA: "Winner of match 1",
    teamB: "Winner of match 2",
    startsAt: "2026-11-28 12:00",
    durationMinutes: 60,
    matchNumber: 2,
  });
  const draft = await db.query<{ id: string }>("select id from fixtures order by match_number");
  await db.execute(
    "insert into fixture_dependencies (fixture_id, depends_on_fixture_id, slot, team_slot) values ($1,$2,'winner','a')",
    [draft[1]?.id, draft[0]?.id],
  );
  await db.execute("update fixtures set status = 'in_progress' where id = $1", [draft[1]?.id]);
  await publishSchedule(db, admin, "Knockout day");
  await publishStandings(db, admin, {
    source: "manual",
    rows: [{ teamLabel: "Side A", played: 1, won: 1, lost: 0, tied: 0, noResult: 0, points: 2, nrr: null, rank: 1 }],
  });
  const settings = await getScheduleSettings(db, (await getActiveSeason(db)).id);
  assert.equal(settings.version > 0, true);
  await recordResult(db, admin, draft[0]?.id ?? "", {
    summary: "Side A won by 4 wickets.",
    source: "manual",
    winnerLabel: "Side A",
  });
  await recordResult(db, admin, draft[0]?.id ?? "", {
    summary: "Corrected: Side B won by 1 run.",
    source: "manual",
    winnerLabel: "Side B",
  });
  const downstream = await db.query<{ team_a_label: string; needs_resolution: boolean; status: string }>(
    "select team_a_label, needs_resolution, status from fixtures where match_number = 2",
  );
  assert.equal(downstream[0]?.team_a_label, "Winner of match 1");
  assert.equal(downstream[0]?.needs_resolution, true);
  assert.equal(downstream[0]?.status, "in_progress");
  const table = await getPublishedStandings(db);
  assert.equal(table.needsReview, true);
  await db.close();
});

test("production flags disable demo data, local auth and invented integrations", () => {
  const previous = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "production", DEMO_MODE: "true", ALLOW_LOCAL_AUTH: "true" });
  assert.equal(demoAllowed(), false);
  assert.equal(localAuthAllowed(), false);
  assert.equal(cricheroesSyncAvailable(), false);
  Object.assign(process.env, { NODE_ENV: previous });
});

test("playing conditions are optional when registration opens", async () => {
  const db = await freshDb();
  const admin = await organizer(db);
  const season = await getActiveSeason(db);
  const saved = await updateSeason(db, admin, season.version, {
    registrationOpensAt: "2026-10-01T04:30:00.000Z",
    registrationClosesAt: "2026-11-25T18:29:00.000Z",
    registrationAnnounced: true,
  });
  assert.equal(saved.rulesVersion, null);
  const submitted = await submitPublicRegistration(db, {
    teamName: "Open Lions",
    batchAdmissionYear: 2005,
    batchLeavingYear: 2012,
    captainName: "Captain",
    captainEmail: "open@ncl.test",
    captainPhone: "9845012345",
    publicationConsent: true,
    rulesAcknowledged: false,
  }, NOW);
  assert.equal(submitted.registration.rulesVersion, null);
  await db.close();
});

test("blank fee is not free, and registration can still open", async () => {
  const db = await freshDb();
  const admin = await organizer(db);
  const season = await getActiveSeason(db);
  const saved = await updateSeason(db, admin, season.version, {
    rulesVersion: "2026.1",
    rulesText: "Conditions",
    registrationOpensAt: "2026-10-01T04:30:00.000Z",
    registrationClosesAt: "2026-11-25T18:29:00.000Z",
    registrationAnnounced: true,
  });
  assert.equal(saved.feePaise, null);
  assert.ok(saved.registrationOpensAt);
  const submitted = await submitPublicRegistration(db, {
    teamName: "Unpaid Lions",
    batchAdmissionYear: 2005,
    batchLeavingYear: 2012,
    captainName: "Captain",
    captainEmail: "unpaid@ncl.test",
    captainPhone: "9845012345",
    publicationConsent: true,
    rulesAcknowledged: true,
  }, NOW);
  const payments = await listPaymentsForRegistration(db, submitted.registration.id);
  assert.equal(payments.length, 0);
  await db.close();
});

test("public signup cannot open the organizer desk", async () => {
  const db = await freshDb();
  process.env.ADMIN_EMAILS = "signup@ncl.test";
  const captain = await upsertProfile(db, { email: "signup@ncl.test", displayName: "Signup" });
  assert.equal(captain.role, "captain");
  await assert.rejects(() => listRegistrations(db, captain), /organizer/i);
  await assert.rejects(() => listAllPayments(db, captain), /organizer/i);
  await assert.rejects(() => adminAction(captain, { action: "settings", version: 1, patch: {} }), /organizer/i);
  const admin = await organizer(db);
  assert.equal(admin.role, "organizer");
  assert.equal(Array.isArray(await listRegistrations(db, admin)), true);
  await db.close();
});

beforeEach(() => {
  process.env.ADMIN_EMAILS = "organizer@ncl.test";
});
