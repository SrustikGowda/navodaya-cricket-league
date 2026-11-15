import assert from "node:assert/strict";
import { test } from "node:test";
import { QF_PAIRINGS, SF_PAIRINGS } from "../lib/draw/bracket";
import { DEFAULT_TIMETABLE, OVERS } from "../lib/draw/config";
import { buildRulebook, type RulebookInput } from "../lib/rules";

const base: RulebookInput = {
  editionNumber: 15,
  dates: "28–29 November 2026",
  days: ["2026-11-28", "2026-11-29"],
  venue: "Loyala School Ground, Bengaluru",
  organizer: "Alumni batch 2005 - 2012",
  fee: "₹4,000",
  ball: null,
  timetable: DEFAULT_TIMETABLE,
};

const text = (book: ReturnType<typeof buildRulebook>) =>
  book.sections.flatMap((s) => [s.title, s.summary, ...s.rules.flatMap((r) => [r.text, ...(r.items ?? []), r.note ?? ""]), ...(s.tables ?? []).flatMap((t) => [t.caption, ...t.head, ...t.rows.flat()])]).join("\n");

test("the rulebook is NCL 15's: no dates, numbers or names left over from NCL 14", () => {
  const book = buildRulebook(base);
  const all = `${text(book)}\n${book.highlights.join("\n")}\n${book.facts.map((f) => f.value).join("\n")}`;
  assert.match(book.edition, /Navodaya Cricket League 15 · NCL XV/);
  for (const stale of [/NCL[ -]?14/, /22nd|23rd/, /November 2025/, /2025-11/, /Jagadeesh/, /22 teams/, /40 matches/, /12 teams/, /Clause/, /1\.12/, /3\.11\.[58]/]) {
    assert.doesNotMatch(all, stale, `left over: ${stale}`);
  }
  assert.deepEqual(book.sections.map((s) => s.id), ["general", "format", "points", "match", "fielding", "bowling", "runs", "timing", "dismissals", "awards"]);
  assert.ok(book.sections.every((s) => s.rules.length > 0));
  assert.equal(new Set(book.sections.map((s) => s.id)).size, book.sections.length);
  for (const must of ["no LBW", "free hit", "Mankading", "One bouncer an over", "₹4,000", "2021 or later", "CricHeroes", "30-yard circle", "Timed Out", "19 teams", "BYE", "4s-11"]) {
    assert.ok(all.includes(must), `mentions ${must}`);
  }
});

test("times, the bracket and overs come from the same data as the fixtures", () => {
  const book = buildRulebook(base);
  const all = text(book);
  assert.match(all, /from 7:00 AM to about 5:05 PM/, "Saturday: 7:00 AM to the last league match ending at 5:05 PM");
  assert.match(all, /from 7:00 AM to about 4:45 PM/, "Sunday: until the final ends");
  assert.ok(all.includes("11:35 AM – 12:30 PM"), "the inauguration break");
  const points = book.sections.find((s) => s.id === "points");
  const qf = points?.rules.find((r) => r.text === "Quarterfinals:")?.items;
  assert.deepEqual(qf, QF_PAIRINGS.map((p) => `${p.code}: Group ${p.a.group} #${p.a.rank} v Group ${p.b.group} #${p.b.rank}`));
  const sf = points?.rules.find((r) => r.text === "Semifinals:")?.items;
  assert.deepEqual(sf, SF_PAIRINGS.map((p) => `${p.code}: winner of ${p.from[0]} v winner of ${p.from[1]}`));
  // Recommended bowling splits must add up to the overs. NCL 14's "2–1–1–1" came to 5 overs in a 6-over game.
  const notes = book.sections.find((s) => s.id === "match")?.rules.map((r) => r.note ?? "").join(" ") ?? "";
  const splits = [...notes.matchAll(/(\d(?:–\d)+)/g)].map((m) => m[1] as string);
  assert.deepEqual(splits, ["2–2–1–1", "2–1–1–1–1", "2–2–2–1–1"]);
  const sum = (split: string) => split.split("–").reduce((a, b) => a + Number(b), 0);
  assert.deepEqual(splits.map(sum), [OVERS.league, OVERS.league, OVERS.semifinal]);

  const later = buildRulebook({ ...base, timetable: { ...DEFAULT_TIMETABLE, saturdayStart: 7 * 60 + 30 } });
  assert.match(text(later), /from 7:30 AM to about 5:35 PM/, "rescheduled times flow into the rules");
});

test("a season with no fee or organizer set still reads correctly", () => {
  const book = buildRulebook({ ...base, fee: null, organizer: null, ball: "Stumper tennis balls" });
  const all = text(book);
  assert.ok(all.includes("Each team pays an entry fee, announced by the Organizing Committee before the tournament."));
  assert.ok(all.includes("Stumper tennis balls"));
  assert.equal(book.facts.some((f) => f.label === "Organized by"), false);
});
