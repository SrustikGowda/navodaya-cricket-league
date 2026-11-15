import { createHash } from "node:crypto";
import type { Db, Queryable } from "./db";
import { clientKey } from "./rate-limit";
import { num, requiredStr, type Row } from "./rows";

/** Actions the site counts, with the words the organizers see. Anything else is refused. */
export const ACTIONS = {
  trial_run: "Trial runs",
  replay: "Reveal replays",
  export_png: "Schedule PNG downloads",
  export_pdf: "Schedule PDF downloads",
  team_image: "Team fixture images saved or shared",
  whatsapp: "WhatsApp shares",
  real_run_opened: "Real Run opened",
  tab_day1: "Fixtures tab: Day 1",
  tab_day2: "Fixtures tab: Day 2",
  tab_groupA: "Fixtures tab: Group A",
  tab_groupB: "Fixtures tab: Group B",
  tab_knockouts: "Fixtures tab: Knockouts",
  tab_team: "Fixtures tab: My team",
  tab_standings: "Fixtures tab: Standings",
} as const;

export type ActionName = keyof typeof ACTIONS;
export const isAction = (value: unknown): value is ActionName => typeof value === "string" && Object.prototype.hasOwnProperty.call(ACTIONS, value);

const IST = "Asia/Kolkata";
const istDate = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

/** A page path with no query or fragment, or null when it is not a public page worth counting. */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const path = raw.split(/[?#]/)[0]?.trim() ?? "";
  if (!path.startsWith("/") || path.length > 120 || path.includes("//")) return null;
  if (!/^\/[A-Za-z0-9/_.%-]*$/.test(path)) return null;
  if (/^\/(admin|api|_next)(\/|$)/.test(path)) return null;
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return trimmed.toLowerCase();
}

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|preview|monitor|uptime/i;

export function looksLikeBot(request: Request): boolean {
  return BOT.test(request.headers.get("user-agent") ?? "");
}

/**
 * An anonymous code for "the same visitor today". It mixes the day, the connection and the browser with a server
 * secret and keeps only a short digest, so the address itself is never stored and tomorrow's code cannot be linked to today's.
 */
export function visitorId(request: Request, now: Date = new Date()): string {
  const salt = process.env.SESSION_SECRET || "ncl-analytics";
  return createHash("sha256")
    .update(`${istDate(now)}|${clientKey(request)}|${request.headers.get("user-agent") ?? ""}|${salt}`)
    .digest("hex")
    .slice(0, 16);
}

export type Device = "phone" | "desktop";

export async function recordView(db: Queryable, input: { path: string; visitor: string; device: Device }): Promise<void> {
  await db.execute("insert into analytics_events (kind, name, visitor, device) values ('view', $1, $2, $3)", [input.path, input.visitor, input.device]);
}

export async function recordAction(db: Queryable, input: { name: ActionName; visitor: string; device: Device }): Promise<void> {
  await db.execute("insert into analytics_events (kind, name, visitor, device) values ('action', $1, $2, $3)", [input.name, input.visitor, input.device]);
}

export type AnalyticsRange = "today" | "7d" | "all";
export const RANGES: { id: AnalyticsRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "all", label: "All time" },
];
export const parseRange = (value: unknown): AnalyticsRange => (value === "today" || value === "all" ? value : "7d");

export type PageRow = { path: string; views: number; visitors: number };
export type ActionRow = { name: ActionName; label: string; count: number; visitors: number };
export type DayRow = { date: string; views: number; visitors: number };

export type AnalyticsSummary = {
  range: AnalyticsRange;
  since: string | null;
  views: number;
  /** Distinct visitors for each day, added up. A person who comes on two days counts twice. */
  visitors: number;
  phoneViews: number;
  pages: PageRow[];
  actions: ActionRow[];
  days: DayRow[];
};

/** The start of the range as an instant: midnight in India, today or six days back. Null for all time. */
export function rangeStart(range: AnalyticsRange, now: Date = new Date()): Date | null {
  if (range === "all") return null;
  const today = istDate(now);
  const start = new Date(`${today}T00:00:00+05:30`);
  if (range === "7d") start.setUTCDate(start.getUTCDate() - 6);
  return start;
}

export async function analyticsSummary(db: Queryable, range: AnalyticsRange, now: Date = new Date()): Promise<AnalyticsSummary> {
  const start = rangeStart(range, now);
  const since = start ? start.toISOString() : null;
  const where = "occurred_at >= coalesce($1::timestamptz, '-infinity'::timestamptz)";
  const day = `to_char(occurred_at at time zone '${IST}', 'YYYY-MM-DD')`;

  const pageRows = await db.query<Row>(
    `select name, count(*)::int as views, count(distinct (${day} || visitor))::int as visitors
     from analytics_events where kind = 'view' and ${where} group by name order by views desc, name limit 200`,
    [since],
  );
  const actionRows = await db.query<Row>(
    `select name, count(*)::int as count, count(distinct (${day} || visitor))::int as visitors
     from analytics_events where kind = 'action' and ${where} group by name`,
    [since],
  );
  const dayRows = await db.query<Row>(
    `select ${day} as date, count(*)::int as views, count(distinct visitor)::int as visitors
     from analytics_events where kind = 'view' and ${where} group by 1 order by 1`,
    [since],
  );
  const totals = await db.query<Row>(
    `select count(*)::int as views, count(distinct (${day} || visitor))::int as visitors,
            count(*) filter (where device = 'phone')::int as phone
     from analytics_events where kind = 'view' and ${where}`,
    [since],
  );

  const byAction = new Map(actionRows.map((row) => [requiredStr(row, "name"), row]));
  const actions: ActionRow[] = (Object.keys(ACTIONS) as ActionName[]).map((name) => ({
    name,
    label: ACTIONS[name],
    count: num(byAction.get(name) ?? {}, "count") ?? 0,
    visitors: num(byAction.get(name) ?? {}, "visitors") ?? 0,
  }));

  // Every day in the range appears, so a quiet day shows as an empty bar rather than a gap.
  const seen = new Map(dayRows.map((row) => [requiredStr(row, "date"), row]));
  const first = start ? istDate(start) : (dayRows[0] ? requiredStr(dayRows[0], "date") : istDate(now));
  const days: DayRow[] = [];
  for (let cursor = new Date(`${first}T12:00:00+05:30`); istDate(cursor) <= istDate(now) && days.length < 400; cursor = new Date(cursor.getTime() + 86_400_000)) {
    const key = istDate(cursor);
    const row = seen.get(key);
    days.push({ date: key, views: num(row ?? {}, "views") ?? 0, visitors: num(row ?? {}, "visitors") ?? 0 });
  }

  const total = totals[0] ?? {};
  return {
    range,
    since,
    views: num(total, "views") ?? 0,
    visitors: num(total, "visitors") ?? 0,
    phoneViews: num(total, "phone") ?? 0,
    pages: pageRows.map((row) => ({ path: requiredStr(row, "name"), views: num(row, "views") ?? 0, visitors: num(row, "visitors") ?? 0 })),
    actions,
    days,
  };
}

/** Wrong draw passwords in the range, from the audit log. Shown beside the analytics because it is the same kind of question. */
export async function drawPasswordFailures(db: Queryable, range: AnalyticsRange, now: Date = new Date()): Promise<number> {
  const start = rangeStart(range, now);
  const rows = await db.query<Row>(
    "select count(*)::int as n from audit_events where action in ('draw.auth_failed', 'draw.auth_locked') and created_at >= coalesce($1::timestamptz, '-infinity'::timestamptz)",
    [start ? start.toISOString() : null],
  );
  return num(rows[0] ?? {}, "n") ?? 0;
}

export type { Db };
