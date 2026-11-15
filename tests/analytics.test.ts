import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTIONS, analyticsSummary, drawPasswordFailures, isAction, looksLikeBot, normalizePath, rangeStart, recordAction, recordView, visitorId } from "../lib/analytics";
import { writeAudit } from "../lib/audit";
import { freshDb } from "./helpers/roster";

const NOW = new Date("2026-11-20T10:00:00+05:30");
const req = (ip: string, ua = "Mozilla/5.0 Chrome") => new Request("https://example.org/api/track", { headers: { "x-forwarded-for": ip, "user-agent": ua } });

test("only real public pages are counted, with no query, fragment or admin path", () => {
  assert.equal(normalizePath("/2026/fixtures?tab=day2#top"), "/2026/fixtures");
  assert.equal(normalizePath("/2026/fixtures/"), "/2026/fixtures");
  assert.equal(normalizePath("/2026/Teams/GTR-1"), "/2026/teams/gtr-1");
  assert.equal(normalizePath("/"), "/");
  for (const bad of ["/admin", "/admin/analytics", "/api/track", "/_next/static/x", "//evil.example", "https://evil.example/x", "2026/fixtures", "/a b", "/<script>", "/" + "x".repeat(130), 42, null, undefined]) {
    assert.equal(normalizePath(bad), null, String(bad));
  }
});

test("a visitor code is anonymous, steady within a day, and cannot be followed to the next day", () => {
  const a = visitorId(req("203.0.113.7"), NOW);
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(visitorId(req("203.0.113.7"), NOW), a, "the same visitor gets the same code all day");
  assert.notEqual(visitorId(req("203.0.113.8"), NOW), a, "another connection is another visitor");
  assert.notEqual(visitorId(req("203.0.113.7", "Safari"), NOW), a, "another browser is another visitor");
  assert.notEqual(visitorId(req("203.0.113.7"), new Date("2026-11-21T10:00:00+05:30")), a, "tomorrow's code differs");
  assert.ok(!a.includes("203") || !/203\.0\.113\.7/.test(a), "the address is not in the code");
  assert.equal(looksLikeBot(req("1.1.1.1", "Googlebot/2.1")), true);
  assert.equal(looksLikeBot(req("1.1.1.1", "Mozilla/5.0 HeadlessChrome")), false, "test browsers are counted");
});

test("only the listed actions are accepted", () => {
  for (const name of Object.keys(ACTIONS)) assert.equal(isAction(name), true);
  for (const bad of ["", "toString", "constructor", "__proto__", "delete", "trial_run ", 7, null, undefined]) assert.equal(isAction(bad), false, String(bad));
});

test("the summary counts views, visitors, actions and days for each range, in India time", async () => {
  const db = await freshDb();
  const at = (iso: string) => new Date(iso).toISOString();
  const view = (iso: string, path: string, visitor: string, device = "desktop") =>
    db.execute("insert into analytics_events (occurred_at, kind, name, visitor, device) values ($1,'view',$2,$3,$4)", [at(iso), path, visitor, device]);
  const action = (iso: string, name: string, visitor: string) => db.execute("insert into analytics_events (occurred_at, kind, name, visitor) values ($1,'action',$2,$3)", [at(iso), name, visitor]);

  await view("2026-11-12T09:00:00+05:30", "/2026", "old1"); // eight days ago: outside the last 7 days
  await view("2026-11-17T09:00:00+05:30", "/2026/fixtures", "a");
  await view("2026-11-17T09:05:00+05:30", "/2026/fixtures", "a"); // the same visitor again
  await view("2026-11-17T09:10:00+05:30", "/2026/teams", "b", "phone");
  await view("2026-11-20T00:30:00+05:30", "/2026/fixtures", "c", "phone"); // just after midnight in India: today
  await view("2026-11-19T23:30:00+05:30", "/2026", "d"); // before midnight: yesterday, even though it is 18:00 UTC either way
  await action("2026-11-17T09:20:00+05:30", "trial_run", "a");
  await action("2026-11-17T09:30:00+05:30", "trial_run", "a");
  await action("2026-11-20T01:00:00+05:30", "trial_run", "c");
  await action("2026-11-20T01:05:00+05:30", "export_pdf", "c");

  const all = await analyticsSummary(db, "all", NOW);
  assert.equal(all.views, 6);
  assert.deepEqual(all.pages.map((p) => [p.path, p.views, p.visitors]), [["/2026/fixtures", 3, 2], ["/2026", 2, 2], ["/2026/teams", 1, 1]]);
  assert.equal(all.days.length, 9, "every day from the first visit to today, quiet days included");
  assert.equal(all.days.find((d) => d.date === "2026-11-14")?.views, 0);

  const week = await analyticsSummary(db, "7d", NOW);
  assert.equal(week.views, 5, "the visit eight days ago is outside the range");
  assert.equal(week.visitors, 4, "a, b, d and c: one each day, the repeat is not counted twice");
  assert.equal(week.phoneViews, 2);
  assert.equal(week.days.length, 7);
  assert.equal(week.days[0]?.date, "2026-11-14");
  assert.equal(week.days.at(-1)?.date, "2026-11-20");
  assert.equal(week.actions.find((a) => a.name === "trial_run")?.count, 3);
  assert.equal(week.actions.find((a) => a.name === "trial_run")?.visitors, 2);
  assert.equal(week.actions.length, Object.keys(ACTIONS).length, "every action is listed, even at zero");
  assert.equal(week.actions.find((a) => a.name === "replay")?.count, 0);

  const today = await analyticsSummary(db, "today", NOW);
  assert.equal(today.views, 1);
  assert.deepEqual(today.pages.map((p) => p.path), ["/2026/fixtures"]);
  assert.equal(today.actions.find((a) => a.name === "export_pdf")?.count, 1);
  assert.equal(rangeStart("all", NOW), null);
  assert.equal(rangeStart("today", NOW)?.toISOString(), "2026-11-19T18:30:00.000Z");

  // The helpers that the site uses write the same rows.
  await recordView(db, { path: "/history", visitor: "z", device: "desktop" });
  await recordAction(db, { name: "replay", visitor: "z", device: "phone" });
  const live = await analyticsSummary(db, "all", new Date());
  assert.ok(live.pages.some((p) => p.path === "/history"));
  assert.equal(live.actions.find((a) => a.name === "replay")?.count, 1);
  await db.close();
});

test("wrong draw passwords are counted from the audit log, and the public database role cannot read analytics", async () => {
  const db = await freshDb();
  await writeAudit(db, null, "draw.auth_failed", "draw", null, { client: "x" });
  await writeAudit(db, null, "draw.auth_locked", "draw", null, { client: "x" });
  await writeAudit(db, null, "draw.authorized", "draw", null, { client: "x" });
  assert.equal(await drawPasswordFailures(db, "all", new Date()), 2);
  assert.equal(await drawPasswordFailures(db, "today", new Date("2030-01-01T10:00:00+05:30")), 0);

  await recordView(db, { path: "/2026", visitor: "v", device: "desktop" });
  await db.tx(async (query) => {
    await query.query("select set_config('ncl.actor_id', $1, true)", [crypto.randomUUID()]);
    await query.execute("set local role ncl_rls");
    await assert.rejects(() => query.query("select id from analytics_events"), /permission denied/, "visitors cannot read analytics");
  });
  await db.tx(async (query) => {
    await query.execute("set local role ncl_rls");
    await assert.rejects(() => query.execute("insert into analytics_events (kind, name, visitor) values ('view', '/x', 'y')"));
  });
  await db.close();
});
