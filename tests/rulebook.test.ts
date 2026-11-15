import assert from "node:assert/strict";
import { test } from "node:test";
import { DomainError } from "../lib/errors";
import { clearReadCache } from "../lib/read-cache";
import { contentHash, publicRulebook, rulebookEditorState, sanitizeRulebook, saveRulebook, slugify, type RulebookContent } from "../lib/rulebook";
import { captain, freshDb, organizer } from "./helpers/roster";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const rejects = (value: unknown, message: RegExp) =>
  assert.throws(
    () => sanitizeRulebook(value),
    (error: unknown) => error instanceof DomainError && message.test(error.message) && /Nothing was saved\.$/.test(error.message),
  );

test("an edited rulebook is tidied: spaces trimmed, empty rules and rows dropped, links kept and made unique", () => {
  const tidy = sanitizeRulebook({
    highlights: ["  Six overs  a side ", "", "No LBW"],
    sections: [
      {
        id: "timing",
        title: "  Timing   and penalties ",
        summary: "When to arrive",
        rules: [{ text: "Report\n30 minutes early.\u0007", items: [" one ", "", "two"], note: "  " }, { text: "   " }],
        tables: [
          {
            caption: "Late start",
            head: ["When", "What"],
            rows: [
              ["Up to 5 minutes", "Warning", "extra cell is ignored"],
              ["", ""],
              ["Sunday", ""],
            ],
          },
        ],
      },
      { title: "Timing", rules: [{ text: "Same title, different link." }] },
      { title: "Main", rules: [{ text: "A reserved link name is not used as is." }] },
      { title: "15 years", summary: "", rules: [{ text: "A link must start with a letter." }] },
    ],
  });
  assert.deepEqual(tidy.highlights, ["Six overs a side", "No LBW"]);
  const [timing, again, main, years] = tidy.sections;
  assert.deepEqual(timing, {
    id: "timing",
    title: "Timing and penalties",
    summary: "When to arrive",
    rules: [{ text: "Report 30 minutes early.", items: ["one", "two"] }],
    tables: [
      {
        caption: "Late start",
        head: ["When", "What"],
        rows: [
          ["Up to 5 minutes", "Warning"],
          ["Sunday", ""],
        ],
      },
    ],
  });
  assert.equal(again?.id, "timing-2", "a second section with the same link gets its own");
  assert.equal(again?.tables, undefined);
  assert.equal(main?.id, "s-main");
  assert.equal(years?.id, "s-15-years");
  assert.equal(slugify("Fielding & bowling — rules!"), "fielding-bowling-rules");
  assert.deepEqual(sanitizeRulebook(tidy), tidy, "tidying twice changes nothing");
});

test("an edited rulebook that cannot be shown is refused with a message the organizers can act on", () => {
  const ok = { title: "General", rules: [{ text: "A rule." }] };
  rejects(null, /could not be read/);
  rejects({ highlights: [], sections: [] }, /at least one section/);
  rejects({ sections: [{ title: "  ", rules: [{ text: "x" }] }] }, /Section 1 needs a title/);
  rejects({ sections: [ok, { title: "Empty", rules: [{ text: "" }] }] }, /Section 2 \(Empty\) is empty/);
  rejects({ sections: [{ title: "General", rules: [{ text: "", items: ["a point"] }] }] }, /Rule 1\.1 has points or a note but no text/);
  rejects({ sections: [{ title: "General", rules: [{ text: 42 }] }] }, /Rule 1\.1 could not be read/);
  rejects({ sections: [{ title: "General", rules: [{ text: "x".repeat(1501) }] }] }, /Rule 1\.1 is too long: at most 1500/);
  rejects({ highlights: Array.from({ length: 13 }, (_, i) => `Point ${i}`), sections: [ok] }, /at most 12 points/);
  rejects({ sections: Array.from({ length: 21 }, () => ok) }, /at most 20 sections/);
  rejects({ sections: [{ ...ok, tables: [{ caption: "", head: ["a"], rows: [["b"]] }] }] }, /Table 1 in section 1 \(general\) needs a title/);
  rejects({ sections: [{ ...ok, tables: [{ caption: "T", head: ["a", "b", "c", "d", "e"], rows: [["b"]] }] }] }, /between 1 and 4 columns/);
  rejects({ sections: [{ ...ok, tables: [{ caption: "T", head: ["a"], rows: [[""]] }] }] }, /has no rows/);
});

test("organizers edit the rules, the public page follows, and saving the standard rules hands dates and times back to the timetable", async () => {
  const db = await freshDb();
  const admin = await organizer(db);

  const first = await rulebookEditorState(db);
  assert.equal(first.edited, false);
  assert.equal(first.version, 0);
  assert.deepEqual(first.content, first.standard);
  assert.equal(
    first.content.sections.reduce((n, s) => n + s.rules.length, 0),
    52,
  );
  const standardBook = (await publicRulebook(db)).book;

  // A captain cannot change the rules.
  await assert.rejects(saveRulebook(db, await captain(db), 0, first.content), (error: unknown) => error instanceof DomainError && error.status === 403);

  // Edit: reword LBW, add a point at a glance, and add a section.
  const edited: RulebookContent = clone(first.content);
  const dismissals = edited.sections.find((s) => s.id === "dismissals");
  assert.ok(dismissals);
  dismissals.rules[0] = { text: "LBW is not given in NCL 2026, as agreed at the captains' meeting." };
  edited.highlights.push("Bring your own whites");
  edited.sections.push({ id: "", title: "Code of conduct", summary: "", rules: [{ text: "Respect the umpires." }] });
  const saved = await saveRulebook(db, admin, 0, edited);
  assert.equal(saved.edited, true);
  assert.equal(saved.version, 1);
  assert.equal(saved.stale, false);
  assert.equal(saved.updatedBy, "Organizer");
  assert.match(saved.updatedLabel ?? "", /\d/);
  assert.equal(saved.content.sections.at(-1)?.id, "code-of-conduct");

  const live = await publicRulebook(db);
  assert.equal(live.book.sections.find((s) => s.id === "dismissals")?.rules[0]?.text, "LBW is not given in NCL 2026, as agreed at the captains' meeting.");
  assert.equal(live.book.highlights.at(-1), "Bring your own whites");
  assert.equal(live.book.sections.length, 11);
  assert.deepEqual(live.book.facts, standardBook.facts, "dates, venue and organizers still come from the season");

  // A second session that loaded the page before this save cannot overwrite it.
  await assert.rejects(saveRulebook(db, admin, 0, first.content), (error: unknown) => error instanceof DomainError && error.code === "version_conflict" && error.status === 409);

  // The season changes after the save: the editor says the copy needs checking, and saving again clears that.
  await db.execute("update seasons set start_date = '2026-12-05', end_date = '2026-12-06' where year = 2026");
  clearReadCache();
  const stale = await rulebookEditorState(db);
  assert.equal(stale.stale, true);
  assert.notEqual(contentHash(stale.standard), contentHash(first.standard), "the standard rules now carry the new dates");
  assert.match(JSON.stringify(stale.content), /28 November/, "the organizers' copy keeps their text until they change it");
  const checked = await saveRulebook(db, admin, stale.version, stale.content);
  assert.equal(checked.stale, false);
  assert.equal(checked.version, 2);

  // Saving the standard rules removes the organizers' copy, so the page follows the timetable by itself again.
  const reset = await saveRulebook(db, admin, checked.version, checked.standard);
  assert.equal(reset.edited, false);
  assert.equal(reset.version, 0);
  assert.equal((await db.query("select 1 from rulebooks")).length, 0);
  assert.match(JSON.stringify((await publicRulebook(db)).book.sections), /5 December/);

  const audit = await db.query<{ action: string; payload: { rules: number; sections: number } }>(
    "select action, payload from audit_events where entity_type = 'rulebook' order by created_at, id",
  );
  assert.deepEqual(
    audit.map((row) => row.action),
    ["rules.update", "rules.update", "rules.reset"],
  );
  assert.equal(audit[0]?.payload.sections, 11);
  assert.equal(audit[0]?.payload.rules, 53);
  await db.close();
});
