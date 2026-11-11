import assert from "node:assert/strict";
import { test } from "node:test";
import { compareBatch } from "../lib/batch-order";
import { loadBoard } from "../lib/draw/board";
import { feeChecklist } from "../lib/payments";
import { listPublicTeams } from "../lib/public-data";
import { listRegistrations } from "../lib/registration";
import { clearReadCache } from "../lib/read-cache";
import { getActiveSeason } from "../lib/season";
import { freshDb, organizer, seedRoster } from "./helpers/roster";

test("batches sort oldest first, then by the year they left, then by name, with unknown batches last", () => {
  const teams = [
    { name: "Zeta", admission: 2010, leaving: 2017 },
    { name: "No batch", admission: null, leaving: null },
    { name: "Beta", admission: 1998, leaving: 2005 },
    { name: "Alpha", admission: 2010, leaving: 2017 },
    { name: "Later leaving", admission: 2010, leaving: 2018 },
    { name: "Oldest", admission: 1998, leaving: 2004 },
  ];
  assert.deepEqual(
    [...teams].sort(compareBatch).map((team) => team.name),
    ["Oldest", "Beta", "Alpha", "Zeta", "Later leaving", "No batch"],
  );
});

test("every list of teams is ordered oldest batch first", async () => {
  const db = await freshDb();
  const admin = await organizer(db);
  await seedRoster(db);
  clearReadCache();
  const season = await getActiveSeason(db);
  const years = new Map((await db.query<{ id: string; a: number }>("select id, batch_admission_year as a from registrations")).map((row) => [row.id, row.a]));
  const oldestFirst = (ids: string[]) => {
    const sequence = ids.map((id) => years.get(id) as number);
    assert.deepEqual(sequence, [...sequence].sort((a, b) => a - b));
    assert.ok(new Set(sequence).size > 1);
  };

  oldestFirst((await listPublicTeams(db)).map((team) => team.id));
  oldestFirst((await feeChecklist(db, season.id)).map((team) => team.id));
  oldestFirst((await listRegistrations(db, admin)).map((team) => team.id));
  oldestFirst((await loadBoard(db)).teams.map((team) => team.id));
  await db.close();
});
