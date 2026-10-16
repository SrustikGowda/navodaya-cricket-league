import { writeAudit } from "./audit";
import { parseCsv } from "./csv";
import type { Db, Queryable } from "./db";
import { DomainError } from "./errors";
import { num, requiredStr, str, type Row } from "./rows";
import { getActiveSeason, lockActiveSeason } from "./season";
import type { Actor } from "./types";

export type StandingInput = {
  teamLabel: string;
  registrationId?: string | null;
  played: number;
  won: number;
  lost: number;
  tied: number;
  noResult: number;
  points: number;
  nrr?: string | null;
  rank?: number | null;
};

export function validateStandings(rows: StandingInput[]): { rows: StandingInput[]; errors: string[] } {
  const errors: string[] = [];
  const ranks = new Set<number>();
  const clean = rows.map((row, index) => {
    const line = index + 1;
    const numbers = [row.played, row.won, row.lost, row.tied, row.noResult, row.points];
    if (numbers.some((value) => !Number.isInteger(value) || value < 0)) {
      errors.push(`Row ${line}: played, results and points must be whole numbers.`);
    }
    if (row.played !== row.won + row.lost + row.tied + row.noResult) {
      errors.push(`Row ${line}: played must equal won + lost + tied + no result. NRR is not calculated from this.`);
    }
    if (!row.teamLabel?.trim()) errors.push(`Row ${line}: a team label is required.`);
    const nrr = row.nrr?.trim() || null;
    if (nrr && !/^[+-]?\d+(\.\d+)?$/.test(nrr)) errors.push(`Row ${line}: NRR must be the value supplied by the organizer, or left blank.`);
    if (row.rank != null) {
      if (!Number.isInteger(row.rank) || row.rank < 1) errors.push(`Row ${line}: rank must be a positive whole number or blank.`);
      if (ranks.has(row.rank)) errors.push(`Row ${line}: rank ${row.rank} is repeated. Ranks are not filled in automatically.`);
      ranks.add(row.rank);
    }
    return {
      ...row,
      teamLabel: row.teamLabel?.trim() ?? "",
      nrr,
      rank: row.rank ?? null,
      registrationId: row.registrationId ?? null,
    };
  });
  return { rows: clean, errors };
}

export async function publishStandings(
  db: Db,
  actor: Actor,
  input: { rows: StandingInput[]; source: "manual" | "import"; note?: string | null },
): Promise<void> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const checked = validateStandings(input.rows);
  if (checked.errors.length > 0) throw new DomainError(checked.errors.join(" "), 422, "standings");
  if (checked.rows.length === 0) throw new DomainError("Add at least one standings row. An empty table is shown as awaiting results.");
  await db.tx(async (query) => {
    const season = await lockActiveSeason(query);
    await query.execute("update standings_versions set status = 'archived' where season_id = $1 and status = 'published'", [season.id]);
    const version = await query.query<{ id: string }>(
      `insert into standings_versions (season_id, status, source, note, needs_review, created_by, published_at)
       values ($1, 'published', $2, $3, false, $4, now()) returning id`,
      [season.id, input.source, input.note ?? null, actor.id],
    );
    const versionId = version[0]?.id;
    if (!versionId) throw new DomainError("The standings were not published.");
    for (const [index, row] of checked.rows.entries()) {
      await query.query(
        `insert into standings_rows (
          version_id, registration_id, team_label, played, won, lost, tied, no_result, points, nrr, rank, sort_order
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          versionId,
          row.registrationId,
          row.teamLabel,
          row.played,
          row.won,
          row.lost,
          row.tied,
          row.noResult,
          row.points,
          row.nrr,
          row.rank,
          index,
        ],
      );
    }
    await writeAudit(query, actor.id, "standings.publish", "standings_version", versionId, { source: input.source, rows: checked.rows.length });
  });
}

export function standingsFromCsv(csv: string): { rows: StandingInput[]; errors: string[] } {
  const parsed = parseCsv(csv);
  if (parsed.errors.length > 0) return { rows: [], errors: parsed.errors };
  const rows = parsed.rows.map((row) => ({
    teamLabel: row.team ?? row.team_label ?? "",
    played: Number(row.played ?? 0),
    won: Number(row.won ?? 0),
    lost: Number(row.lost ?? 0),
    tied: Number(row.tied ?? 0),
    noResult: Number(row.no_result ?? 0),
    points: Number(row.points ?? 0),
    nrr: row.nrr || null,
    rank: row.rank ? Number(row.rank) : null,
  }));
  return validateStandings(rows);
}

export async function getPublishedStandings(db: Queryable) {
  const season = await getActiveSeason(db);
  const rows = await db.query("select * from public_standings where season_id = $1 order by sort_order", [season.id]);
  return {
    needsReview: rows.some((row) => row.needs_review === true || row.needs_review === "t"),
    source: rows[0] ? str(rows[0], "source") : null,
    publishedAt: rows[0] ? str(rows[0], "published_at") : null,
    note: rows[0] ? str(rows[0], "note") : null,
    rows: rows.map((row) => ({
      teamLabel: requiredStr(row, "team_label"),
      played: num(row, "played") ?? 0,
      won: num(row, "won") ?? 0,
      lost: num(row, "lost") ?? 0,
      tied: num(row, "tied") ?? 0,
      noResult: num(row, "no_result") ?? 0,
      points: num(row, "points") ?? 0,
      nrr: str(row, "nrr"),
      rank: num(row, "rank"),
    })),
  };
}

export type { Row };
