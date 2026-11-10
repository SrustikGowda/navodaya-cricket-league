import { writeAudit } from "../audit";
import type { Queryable } from "../db";
import { DomainError } from "../errors";
import { formatEventDates, formatIst } from "../format";
import { clearReadCache } from "../read-cache";
import { num, requiredStr, str, type Row } from "../rows";
import { getActiveSeason } from "../season";
import type { Actor } from "../types";
import { AWARD_KEYS, emptyAwards, LABELS, type AwardEntry, type Awards } from "./awards";
import { oversText } from "./standings";

/** Marks a History entry as written by the site from the draw and results. Entries without it are never touched. */
export const GENERATED_SOURCE = "/2026/fixtures";

function clean(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, max);
}

export function parseAwards(raw: unknown): Awards {
  const source = (raw ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const awards = emptyAwards();
  for (const key of AWARD_KEYS) {
    const entry = source[key] ?? {};
    const figure = clean(entry.figure, 8);
    if (figure && !/^\d{1,5}$/.test(figure)) {
      throw new DomainError(`${LABELS[key]}: the number must be whole digits, for example 122.`, 422, "award");
    }
    awards[key] = { name: clean(entry.name, 80), team: clean(entry.team, 80), figure, details: clean(entry.details, 160) };
    if (!awards[key].name && (awards[key].team || figure || awards[key].details)) {
      throw new DomainError(`${LABELS[key]}: add the player's name, or clear the other fields.`, 422, "award");
    }
  }
  return awards;
}

export async function loadAwards(db: Queryable, seasonId: string): Promise<Awards> {
  const rows = await db.query<Row>("select data from season_awards where season_id = $1", [seasonId]);
  const raw = rows[0]?.data;
  return parseAwards(typeof raw === "string" ? JSON.parse(raw) : raw);
}

export async function saveAwards(db: Queryable, actor: Actor, raw: unknown): Promise<Awards> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const awards = parseAwards(raw);
  const season = await getActiveSeason(db);
  await db.query(
    `insert into season_awards (season_id, data, updated_by) values ($1, $2::jsonb, $3)
     on conflict (season_id) do update set data = excluded.data, updated_by = excluded.updated_by, updated_at = now()`,
    [season.id, JSON.stringify(awards), actor.id],
  );
  await writeAudit(db, actor.id, "awards.save", "season", season.id, { awards });
  await syncEditionHistory(db);
  return awards;
}

type KnockoutRow = {
  code: string;
  stage: string;
  aId: string | null;
  bId: string | null;
  aLabel: string;
  bLabel: string;
  winnerId: string | null;
  winnerLabel: string | null;
  ground: string | null;
  date: string | null;
  first: { runs: number; wickets: number; balls: number } | null;
  second: { runs: number; wickets: number; balls: number } | null;
  firstBats: "a" | "b";
  maxBalls: number | null;
};

function withBatch(name: string, admission: number | null, leaving: number | null): string {
  if (/\([^)]*\)\s*$/.test(name) || admission == null || leaving == null) return name;
  return `${name} (${admission}–${leaving})`;
}

/** "X beat Y by 12 runs" / "by 7 balls to spare", from recorded scores when there are any. */
function resultLine(row: KnockoutRow, winnerSide: "a" | "b", names: { a: string; b: string }): { text: string; margin: string | null } {
  const winner = winnerSide === "a" ? names.a : names.b;
  const loser = winnerSide === "a" ? names.b : names.a;
  if (!row.first || !row.second || row.maxBalls == null) return { text: `${winner} beat ${loser}`, margin: null };
  const winnerBatsFirst = row.firstBats === winnerSide;
  const margin = winnerBatsFirst ? `${row.first.runs - row.second.runs} runs` : `${row.maxBalls - row.second.balls} balls to spare`;
  return { text: `${winner} beat ${loser} by ${margin}`, margin };
}

function statLine(entry: AwardEntry, unit: string): string | null {
  if (!entry.name) return null;
  const parts = [entry.name, entry.team].filter(Boolean);
  if (entry.figure) parts.push(`${entry.figure} ${unit}${entry.details ? ` ${entry.details}` : ""}`);
  else if (entry.details) parts.push(entry.details);
  return `${parts.join(", ")}.`;
}

/**
 * Keeps the edition's History entry in step with the draw: champion and runner-up from the final, semifinals from the
 * bracket, the awards organizers typed in, and the final's score when it was entered. Entries an organizer wrote by hand
 * are never overwritten. With no official draw, or no decided final, the generated entry is removed.
 */
export async function syncEditionHistory(db: Queryable): Promise<void> {
  const season = await getActiveSeason(db);
  const existing = await db.query<Row>("select source_url from archive_entries where edition_number = $1", [season.editionNumber]);
  const generated = existing.length === 0 || existing[0]?.source_url === GENERATED_SOURCE;
  if (!generated) return;
  const remove = async () => {
    if (existing.length > 0) await db.execute("delete from archive_entries where edition_number = $1", [season.editionNumber]);
    clearReadCache();
  };

  const draws = await db.query<Row>("select id from draws where season_id = $1 and status = 'published'", [season.id]);
  const drawId = draws[0] ? requiredStr(draws[0], "id") : null;
  if (!drawId) return remove();

  const rows = (
    await db.query<Row>(
      `select f.code, f.stage, f.team_a_registration_id, f.team_b_registration_id, f.team_a_label, f.team_b_label,
              f.winner_registration_id, f.winner_label, f.starts_at, g.name as ground_name,
              ms.first_bats, ms.first_runs, ms.first_wickets, ms.first_balls,
              ms.second_runs, ms.second_wickets, ms.second_balls, ms.max_balls
       from fixtures f left join grounds g on g.id = f.ground_id left join match_scores ms on ms.fixture_id = f.id
       where f.draw_id = $1 and f.stage <> 'league'`,
      [drawId],
    )
  ).map(
    (row): KnockoutRow => ({
      code: requiredStr(row, "code"),
      stage: requiredStr(row, "stage"),
      aId: str(row, "team_a_registration_id"),
      bId: str(row, "team_b_registration_id"),
      aLabel: requiredStr(row, "team_a_label"),
      bLabel: requiredStr(row, "team_b_label"),
      winnerId: str(row, "winner_registration_id"),
      winnerLabel: str(row, "winner_label"),
      ground: str(row, "ground_name"),
      date: str(row, "starts_at"),
      first: num(row, "first_runs") == null ? null : { runs: num(row, "first_runs") ?? 0, wickets: num(row, "first_wickets") ?? 0, balls: num(row, "first_balls") ?? 0 },
      second: num(row, "second_runs") == null ? null : { runs: num(row, "second_runs") ?? 0, wickets: num(row, "second_wickets") ?? 0, balls: num(row, "second_balls") ?? 0 },
      firstBats: str(row, "first_bats") === "b" ? "b" : "a",
      maxBalls: num(row, "max_balls"),
    }),
  );
  const final = rows.find((row) => row.stage === "final");
  if (!final?.winnerId || !final.aId || !final.bId) return remove();

  const registrations = await db.query<Row>(
    "select id, team_name, batch_admission_year, batch_leaving_year from registrations where id = $1 or id = $2",
    [final.aId, final.bId],
  );
  const display = (id: string, fallback: string) => {
    const row = registrations.find((candidate) => requiredStr(candidate, "id") === id);
    return row ? withBatch(requiredStr(row, "team_name"), num(row, "batch_admission_year"), num(row, "batch_leaving_year")) : fallback;
  };
  const aName = display(final.aId, final.aLabel);
  const bName = display(final.bId, final.bLabel);
  const winnerSide: "a" | "b" = final.winnerId === final.aId ? "a" : "b";
  const champion = winnerSide === "a" ? aName : bName;
  const runnerUp = winnerSide === "a" ? bName : aName;

  const lines: string[] = [`Dates: ${formatEventDates(season.startDate, season.endDate)}`];
  if (season.ballType) lines.push(`Ball: ${season.ballType}`);
  const counts = await db.query<{ teams: number; matches: number }>(
    `select (select count(*) from registrations where season_id = $1 and status = 'approved')::int as teams,
            (select count(*) from fixtures where draw_id = $2)::int as matches`,
    [season.id, drawId],
  );
  lines.push(`Teams: ${counts[0]?.teams ?? 0}`, `Matches: ${counts[0]?.matches ?? 0}`);

  const day = final.date ? formatIst(final.date, false).replace(/\s+\d{4}$/, "") : null;
  const { text } = resultLine(final, winnerSide, { a: aName, b: bName });
  const fi = final.first && final.second && final.maxBalls != null;
  if (fi && final.first && final.second) {
    const battingFirst = final.firstBats === "a" ? aName : bName;
    const battingSecond = final.firstBats === "a" ? bName : aName;
    lines.push(
      `Final: ${text}${day ? ` on ${day}` : ""}. ${battingFirst} made ${final.first.runs}/${final.first.wickets} in ${oversText(final.first.balls)} overs and ${battingSecond} finished on ${final.second.runs}/${final.second.wickets} in ${oversText(final.second.balls)} overs at ${final.ground ?? "the ground"}.`,
    );
  } else {
    lines.push(`Final: ${text}${day ? ` on ${day}` : ""}.`);
  }

  const semis = rows
    .filter((row) => row.stage === "semifinal" && row.winnerId && row.aId && row.bId)
    .sort((x, y) => x.code.localeCompare(y.code))
    .map((row) => {
      const side: "a" | "b" = row.winnerId === row.aId ? "a" : "b";
      return `${resultLine(row, side, { a: row.aLabel, b: row.bLabel }).text}.`;
    });
  if (semis.length > 0) lines.push(`Semi-finals: ${semis.join(" ")}`);

  const awards = await loadAwards(db, season.id);
  const batter = statLine(awards.batter, "runs");
  const bowler = statLine(awards.bowler, "wickets");
  const fielder = statLine(awards.fielder, "dismissals");
  const mvp = awards.mvp.name ? `${[awards.mvp.name, awards.mvp.team].filter(Boolean).join(", ")}.${awards.mvp.details ? ` ${awards.mvp.details}.` : ""}` : null;
  if (batter) lines.push(`Leading run-scorer: ${batter}`);
  if (bowler) lines.push(`Leading wicket-taker: ${bowler}`);
  if (mvp) lines.push(`Most valuable player: ${mvp}`);
  if (fielder) lines.push(`Leading fielder: ${fielder}`);

  await db.execute(
    `insert into archive_entries (
       edition_number, year, start_date, end_date, champion, runner_up, venue_note, notes, source_url, verification_status
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'verified')
     on conflict (edition_number) do update set
       year = excluded.year, start_date = excluded.start_date, end_date = excluded.end_date,
       champion = excluded.champion, runner_up = excluded.runner_up, venue_note = excluded.venue_note,
       notes = excluded.notes, source_url = excluded.source_url, verification_status = excluded.verification_status,
       updated_at = now()`,
    [season.editionNumber, season.year, season.startDate, season.endDate, champion, runnerUp, season.venueName.trim(), lines.join("\n"), GENERATED_SOURCE],
  );
  clearReadCache();
}
