import assert from "node:assert/strict";
import { test } from "node:test";
import { QF_PAIRINGS, SF_PAIRINGS } from "../lib/draw/bracket";
import { DEFAULT_TIMETABLE, OVERS } from "../lib/draw/config";
import { leagueSlotStarts } from "../lib/draw/schedule";
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
  for (const must of ["no LBW", "free hit", "Mankading", "Two bouncers an over", "₹4,000", "2021 or later", "CricHeroes", "30-yard circle", "Powerplay", "Super Over", "Timed Out", "19 teams", "BYE", "4s-11"]) {
    assert.ok(all.includes(must), `mentions ${must}`);
  }
  // Decisions of the organizers that must stay out: the old wording, and any mention of the website.
  for (const gone of [
    /\bsite\b|website|Fixtures page|this page/i,
    /7 players|same batch/i,
    /substitute fielder/i,
    /Most wins|head-to-head|between the two teams/i,
    /one bouncer|one-bouncer|second or later bouncer/i,
    /at least 4 bowlers/i,
    /pitches outside the side edges of the pitch is a wide/i,
  ]) {
    assert.doesNotMatch(all, gone, `no longer in the rules: ${gone}`);
  }
});

test("the stages, overs, ranking and bowling rules say what the organizers decided", () => {
  const book = buildRulebook(base);
  const all = text(book);
  assert.equal(OVERS.league, 6);
  assert.deepEqual([OVERS.quarterfinal, OVERS.semifinal, OVERS.final], [8, 8, 8], "only league matches are 6 overs");
  assert.match(all, /League matches are 6 overs an innings, with a maximum of 55 minutes/);
  assert.match(all, /Quarterfinals, semifinals and the final are 8 overs an innings/);
  assert.equal(book.highlights[0], "6 overs a side in league matches; 8 in the quarterfinals, semifinals and final");
  // Seeding: the champion and the runner-up land in different groups at random, with no fixed place or opening match.
  const seeding = book.sections.find((s) => s.id === "format")?.rules.find((r) => /As per NCL tradition/.test(r.text));
  assert.equal(seeding?.text, "As per NCL tradition, the defending champions, 4s-11, and the runners-up, RCB United, are placed in different groups at random.");
  assert.deepEqual(seeding?.items, ["The other two 2025 semifinalists, JNV Junglees and Balehonnur Bulls, go one to each group at random.", "Every other position is drawn at random."]);
  assert.doesNotMatch(all, /placed at A1|first match of the tournament|placed in Group B/);
  const stages = book.sections.find((s) => s.id === "match")?.tables?.[0]?.rows;
  assert.deepEqual(stages, [
    ["League", "6", "55 minutes", "At least 5"],
    ["Quarterfinals, semifinals and final", "8", "60 minutes", "At least 5"],
  ]);
  // Ranking: points, then net run rate, then a Super Over. A tied knockout is also a Super Over.
  const points = book.sections.find((s) => s.id === "points");
  assert.match(points?.rules[0]?.text ?? "", /ranked by points, then by net run rate/);
  assert.match(points?.rules[1]?.text ?? "", /still level on points and net run rate, a Super Over is played to decide/);
  assert.ok(points?.rules.some((r) => r.text === "A tied knockout match is decided by a Super Over."));
  // One bowler rule for every match.
  const match = book.sections.find((s) => s.id === "match");
  assert.equal(match?.rules.filter((r) => /bowlers/.test(r.text)).length, 1);
  assert.match(match?.rules.find((r) => /bowlers/.test(r.text))?.text ?? "", /^In every match, each team must use at least 5 bowlers in an innings\.$/);
  // The powerplay is the ICC's, shortened for 6- and 8-over innings.
  const fielding = book.sections.find((s) => s.id === "fielding");
  assert.match(fielding?.rules[0]?.text ?? "", /^Powerplay: at the start of each innings, no more than 2 fielders may be outside the 30-yard circle/);
  assert.match(fielding?.rules[1]?.text ?? "", /^After the powerplay, no more than 5 fielders/);
  const balls = (overs: number) => Math.round(overs * 6 * 0.3);
  assert.deepEqual([balls(OVERS.league), balls(OVERS.quarterfinal)], [11, 14], "the ICC table: 1.5 overs for 6, 2.2 overs for 8");
  assert.match(fielding?.rules[0]?.note ?? "", /first 11 balls of a 6-over innings and the first 14 balls of an 8-over innings/);
  // Bowling action (Law 21), bouncers and balls that land off the pitch.
  const bowling = book.sections.find((s) => s.id === "bowling");
  const action = bowling?.rules[0];
  assert.match(action?.text ?? "", /square-leg umpire watches the bowler's action and calls it/);
  assert.match((action?.items ?? []).join(" "), /may leave the ball and appeal to the umpires to check the action/);
  assert.match((action?.items ?? []).join(" "), /first and final warning[^.]*\./);
  assert.match((action?.items ?? []).join(" "), /may not bowl again in that innings/);
  const noBall = (bowling?.rules[1]?.items ?? []).join("\n");
  assert.match(noBall, /third or later bouncer \(above shoulder height\) in the same over: two are allowed per over/);
  assert.match(noBall, /pitches outside the side edges of the pitch/);
  assert.match((bowling?.rules[2]?.items ?? []).join("\n"), /two-bouncers-an-over limit/);
  assert.doesNotMatch((bowling?.rules[2]?.items ?? []).join("\n"), /pitches outside/);
});

test("times, the bracket and overs come from the same data as the fixtures", () => {
  const book = buildRulebook(base);
  const all = text(book);
  assert.equal(all.split("from 7:00 AM to 6:00 PM").length - 1, 2, "both days are announced as 7:00 AM to 6:00 PM, with a buffer");
  // The buffer is real: Saturday's last league match and Sunday's final both finish well before 6:00 PM.
  const saturdayEnd = (leagueSlotStarts(1, DEFAULT_TIMETABLE).at(-1) as number) + DEFAULT_TIMETABLE.leagueMinutes;
  const sundayEnd = DEFAULT_TIMETABLE.final + DEFAULT_TIMETABLE.finalMinutes;
  assert.ok(saturdayEnd <= 17 * 60 + 30 && sundayEnd <= 17 * 60 + 30, `scheduled to finish at ${saturdayEnd} and ${sundayEnd}`);
  assert.ok(all.includes("11:35 AM – 12:00 PM"), "the inauguration");
  assert.ok(all.includes("12:00 PM – 4:35 PM"), "league matches resume at noon");
  const points = book.sections.find((s) => s.id === "points");
  const qf = points?.rules.find((r) => r.text === "Quarterfinals:")?.items;
  assert.deepEqual(qf, QF_PAIRINGS.map((p) => `${p.code}: Group ${p.a.group} #${p.a.rank} v Group ${p.b.group} #${p.b.rank}`));
  const sf = points?.rules.find((r) => r.text === "Semifinals:")?.items;
  assert.deepEqual(sf, SF_PAIRINGS.map((p) => `${p.code}: winner of ${p.from[0]} v winner of ${p.from[1]}`));
  // Recommended bowling splits must add up to the overs. NCL 14's "2–1–1–1" came to 5 overs in a 6-over game.
  const notes = book.sections.find((s) => s.id === "match")?.rules.map((r) => r.note ?? "").join(" ") ?? "";
  const splits = [...notes.matchAll(/(\d(?:–\d)+)/g)].map((m) => m[1] as string);
  assert.deepEqual(splits, ["2–1–1–1–1", "2–2–2–1–1"]);
  const sum = (split: string) => split.split("–").reduce((a, b) => a + Number(b), 0);
  assert.deepEqual(splits.map(sum), [OVERS.league, OVERS.quarterfinal]);
  assert.ok(splits.every((split) => split.split("–").length >= 5), "every recommended split uses the 5 bowlers the rule asks for");

  const later = buildRulebook({ ...base, timetable: { ...DEFAULT_TIMETABLE, saturdayStart: 7 * 60 + 30 } });
  assert.match(text(later), /from 7:30 AM to 6:00 PM/, "a later start flows into the rules");
  const muchLater = buildRulebook({ ...base, timetable: { ...DEFAULT_TIMETABLE, saturdayStart: 9 * 60 + 30 } });
  assert.match(text(muchLater), /from 9:30 AM to 7:30 PM/, "the announced end never comes before the scheduled end (the last match ends at 7:05 PM)");
});

test("a season with no fee or organizer set still reads correctly", () => {
  const book = buildRulebook({ ...base, fee: null, organizer: null, ball: "Stumper tennis balls" });
  const all = text(book);
  assert.ok(all.includes("Each team pays an entry fee, announced by the Organizing Committee before the tournament."));
  assert.ok(all.includes("Stumper tennis balls"));
  assert.equal(book.facts.some((f) => f.label === "Organized by"), false);
});
