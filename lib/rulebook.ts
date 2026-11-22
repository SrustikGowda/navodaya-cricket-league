// The rules as the site shows them: the standard rules built from the season and the timetable, or the organizers' own
// edited copy from Admin › Rules. The facts at the top (dates, venue, organizers, teams) always come from the season.

import { createHash } from "node:crypto";
import { writeAudit } from "./audit";
import type { Db, Queryable } from "./db";
import { DEFAULT_TIMETABLE } from "./draw/config";
import { formatOfPlan, formatToShow } from "./draw/formats";
import { drawReadiness, getOfficialDraw } from "./draw/service";
import { DomainError } from "./errors";
import { formatEventDates, formatInrFromPaise } from "./format";
import { buildRulebook, type Rule, type RuleSection, type RuleTable, type Rulebook } from "./rules";
import { getActiveSeason, type Season } from "./season";
import type { Actor } from "./types";

/** The part of the rulebook the organizers can edit. */
export type RulebookContent = Pick<Rulebook, "highlights" | "sections">;

export const RULEBOOK_LIMITS = {
  highlights: 12,
  highlight: 200,
  sections: 20,
  title: 80,
  summary: 240,
  rules: 40,
  text: 1500,
  items: 20,
  item: 500,
  note: 500,
  tables: 6,
  caption: 80,
  columns: 4,
  rows: 40,
  cell: 200,
} as const;

const L = RULEBOOK_LIMITS;
const RESERVED_IDS = new Set(["main", "content", "top", "rules"]);

export type RulebookEditorState = {
  /** What the editor starts with: the organizers' copy, or the standard rules when there is none. */
  content: RulebookContent;
  /** The standard rules for the current season and timetable, for "Start again from the standard rules". */
  standard: RulebookContent;
  /** 0 while the standard rules are shown. */
  version: number;
  edited: boolean;
  updatedAt: string | null;
  /** When the copy was last saved, in India time, ready to show ("15 Nov, 3:20 pm"). */
  updatedLabel: string | null;
  updatedBy: string | null;
  /** The season or the timetable changed after the organizers' copy was saved. */
  stale: boolean;
};

type Loaded = {
  season: Season;
  /** What the public page shows. */
  book: Rulebook;
  standard: RulebookContent;
  custom: { content: RulebookContent; version: number; updatedAt: string; updatedBy: string | null; stale: boolean } | null;
};

function fail(message: string): never {
  throw new DomainError(`${message} Nothing was saved.`);
}

/** One line of plain text: surrounding spaces, line breaks and control characters removed. */
function line(value: unknown, max: number, what: string): string {
  if (value == null) return "";
  if (typeof value !== "string") fail(`${what} could not be read.`);
  const text = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > max) fail(`${what} is too long: at most ${max} characters.`);
  return text;
}

function list(value: unknown, what: string): unknown[] {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(`${what} could not be read.`);
  return value;
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${what} could not be read.`);
  return value as Record<string, unknown>;
}

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  if (!slug) return "";
  return /^[a-z]/.test(slug) ? slug : `s-${slug}`.slice(0, 40);
}

function rule(value: unknown, label: string): Rule | null {
  const raw = record(value, label);
  const text = line(raw.text, L.text, label);
  const items = list(raw.items, `The points under ${label.toLowerCase()}`)
    .map((item, index) => line(item, L.item, `Point ${index + 1} under ${label.toLowerCase()}`))
    .filter(Boolean);
  const note = line(raw.note, L.note, `The note under ${label.toLowerCase()}`);
  if (!text) {
    if (items.length > 0 || note) fail(`${label} has points or a note but no text.`);
    return null;
  }
  if (items.length > L.items) fail(`${label} has more than ${L.items} points.`);
  return { text, ...(items.length > 0 ? { items } : {}), ...(note ? { note } : {}) };
}

function table(value: unknown, label: string): RuleTable {
  const raw = record(value, label);
  const caption = line(raw.caption, L.caption, `The title of ${label.toLowerCase()}`);
  if (!caption) fail(`${label} needs a title.`);
  const head = list(raw.head, `The column names of ${label.toLowerCase()}`).map((cell, index) => line(cell, L.cell, `Column ${index + 1} of ${label.toLowerCase()}`));
  if (head.length < 1 || head.length > L.columns) fail(`${label} must have between 1 and ${L.columns} columns.`);
  const rows = list(raw.rows, `The rows of ${label.toLowerCase()}`)
    .map((row, rowIndex) => {
      const cells = list(row, `Row ${rowIndex + 1} of ${label.toLowerCase()}`);
      return head.map((_, column) => line(cells[column], L.cell, `Row ${rowIndex + 1}, column ${column + 1} of ${label.toLowerCase()}`));
    })
    .filter((row) => row.some(Boolean));
  if (rows.length === 0) fail(`${label} has no rows.`);
  if (rows.length > L.rows) fail(`${label} has more than ${L.rows} rows.`);
  return { caption, head, rows };
}

function section(value: unknown, index: number, used: Set<string>): RuleSection {
  const n = index + 1;
  const raw = record(value, `Section ${n}`);
  const title = line(raw.title, L.title, `The title of section ${n}`);
  if (!title) fail(`Section ${n} needs a title.`);
  const name = `Section ${n} (${title})`;
  const summary = line(raw.summary, L.summary, `The summary of ${name.toLowerCase()}`);
  const rawRules = list(raw.rules, `The rules of ${name.toLowerCase()}`);
  const rules = rawRules.map((entry, ruleIndex) => rule(entry, `Rule ${n}.${ruleIndex + 1}`)).filter((entry): entry is Rule => entry !== null);
  if (rules.length > L.rules) fail(`${name} has more than ${L.rules} rules.`);
  const tables = list(raw.tables, `The tables of ${name.toLowerCase()}`).map((entry, tableIndex) => table(entry, `Table ${tableIndex + 1} in ${name.toLowerCase()}`));
  if (tables.length > L.tables) fail(`${name} has more than ${L.tables} tables.`);
  if (rules.length === 0 && tables.length === 0) fail(`${name} is empty. Add a rule, or delete the section.`);

  // Keep a section's link (rules#timing) when it is renamed, so links shared earlier still work.
  const wanted = typeof raw.id === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(raw.id) ? raw.id : slugify(title) || `section-${n}`;
  const base = RESERVED_IDS.has(wanted) ? `s-${wanted}` : wanted;
  let id = base;
  for (let k = 2; used.has(id); k += 1) id = `${base}-${k}`;
  used.add(id);
  return { id, title, summary, rules, ...(tables.length > 0 ? { tables } : {}) };
}

/** Checks and tidies an edited rulebook. Throws a message an organizer can act on when something is wrong. */
export function sanitizeRulebook(value: unknown): RulebookContent {
  const raw = record(value, "The rules");
  const highlights = list(raw.highlights, "At a glance")
    .map((item, index) => line(item, L.highlight, `At a glance point ${index + 1}`))
    .filter(Boolean);
  if (highlights.length > L.highlights) fail(`At a glance can have at most ${L.highlights} points.`);
  const rawSections = list(raw.sections, "The sections");
  if (rawSections.length === 0) fail("Add at least one section.");
  if (rawSections.length > L.sections) fail(`There can be at most ${L.sections} sections.`);
  const used = new Set<string>();
  const content = { highlights, sections: rawSections.map((entry, index) => section(entry, index, used)) };
  if (JSON.stringify(content).length > 200_000) fail("The rules are too long.");
  return content;
}

export function contentHash(content: RulebookContent): string {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex").slice(0, 32);
}

export function countRules(content: RulebookContent): number {
  return content.sections.reduce((sum, entry) => sum + entry.rules.length, 0);
}

/** The standard rules for a season: last year's rules brought up to date, with dates and times from the timetable. */
export async function standardRulebook(db: Queryable, season: Season): Promise<Rulebook> {
  // Times follow the official draw once it is published, including any rescheduling by the organizers.
  const official = await getOfficialDraw(db);
  // The format follows the draw once it exists, and the number of approved teams until then: 19 or 20.
  const format = official ? formatOfPlan(official.plan) : formatToShow((await drawReadiness(db)).teamCount);
  const organizer = season.organizerCredit?.replace(/^organi[sz]ed by\s+/i, "").trim() || null;
  return buildRulebook({
    editionNumber: season.editionNumber,
    dates: formatEventDates(season.startDate, season.endDate),
    days: [season.startDate, season.endDate],
    venue: [season.venueName, season.venueAddress]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(", "),
    organizer: organizer ? organizer.charAt(0).toUpperCase() + organizer.slice(1) : null,
    fee: season.feePaise != null && season.feePaise > 0 ? formatInrFromPaise(season.feePaise) : null,
    ball: season.ballType,
    timetable: official?.timetable ?? DEFAULT_TIMETABLE,
    format,
  });
}

const asIso = (value: unknown) => (value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString());

async function load(db: Queryable): Promise<Loaded> {
  const season = await getActiveSeason(db);
  const built = await standardRulebook(db, season);
  const standard = sanitizeRulebook({ highlights: built.highlights, sections: built.sections });
  const rows = await db.query<{ content: unknown; base_hash: string; version: number; updated_at: unknown; updated_by: string | null }>(
    `select r.content, r.base_hash, r.version, r.updated_at, coalesce(nullif(p.display_name, ''), p.email) as updated_by
       from rulebooks r left join profiles p on p.id = r.updated_by
      where r.season_id = $1`,
    [season.id],
  );
  const row = rows[0];
  if (!row) return { season, book: built, standard, custom: null };
  let content: RulebookContent;
  try {
    content = sanitizeRulebook(typeof row.content === "string" ? JSON.parse(row.content) : row.content);
  } catch {
    // A copy that can no longer be read never takes the page down: the standard rules are shown, and the next save replaces it.
    content = standard;
  }
  const custom = { content, version: Number(row.version), updatedAt: asIso(row.updated_at), updatedBy: row.updated_by, stale: row.base_hash !== contentHash(standard) };
  return { season, book: { ...built, highlights: content.highlights, sections: content.sections }, standard, custom };
}

/** The rulebook the public Rules page shows. */
export async function publicRulebook(db: Queryable): Promise<{ season: Season; book: Rulebook }> {
  const { season, book } = await load(db);
  return { season, book };
}

const savedLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export async function rulebookEditorState(db: Queryable): Promise<RulebookEditorState> {
  const { standard, custom } = await load(db);
  return {
    content: custom?.content ?? standard,
    standard,
    version: custom?.version ?? 0,
    edited: custom !== null,
    updatedAt: custom?.updatedAt ?? null,
    updatedLabel: custom ? savedLabel(custom.updatedAt) : null,
    updatedBy: custom?.updatedBy ?? null,
    stale: custom?.stale ?? false,
  };
}

const conflict = () => new DomainError("The rules were changed in another session. Reload the page to see the latest version. Nothing was saved.", 409, "version_conflict");

/**
 * Saves the organizers' wording. Saving the standard rules unchanged removes the organizers' copy instead, so the dates
 * and times go back to following the timetable by themselves.
 */
export async function saveRulebook(db: Db, actor: Actor, version: number, value: unknown): Promise<RulebookEditorState> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const content = sanitizeRulebook(value);
  const current = await load(db);
  const currentVersion = current.custom?.version ?? 0;
  if (version !== currentVersion) throw conflict();
  const standardHash = contentHash(current.standard);
  const standard = contentHash(content) === standardHash;
  const seasonId = current.season.id;

  await db.tx(async (q) => {
    let changed: number;
    if (standard) {
      changed = currentVersion === 0 ? 1 : await q.execute("delete from rulebooks where season_id = $1 and version = $2", [seasonId, currentVersion]);
    } else if (currentVersion === 0) {
      changed = await q.execute(
        `insert into rulebooks (season_id, content, base_hash, updated_by) values ($1, $2::jsonb, $3, $4)
         on conflict (season_id) do nothing`,
        [seasonId, JSON.stringify(content), standardHash, actor.id],
      );
    } else {
      changed = await q.execute(
        `update rulebooks set content = $2::jsonb, base_hash = $3, updated_by = $4, version = version + 1, updated_at = now()
          where season_id = $1 and version = $5`,
        [seasonId, JSON.stringify(content), standardHash, actor.id, currentVersion],
      );
    }
    if (changed !== 1) throw conflict();
    if (standard && currentVersion === 0) return;
    await writeAudit(q, actor.id, standard ? "rules.reset" : "rules.update", "rulebook", seasonId, {
      sections: content.sections.length,
      rules: countRules(content),
      highlights: content.highlights.length,
    });
  });
  return rulebookEditorState(db);
}
