import { writeAudit } from "./audit";
import type { Db, Queryable } from "./db";
import { DomainError } from "./errors";
import { dateOnly, num, requiredStr, str, type Row } from "./rows";
import { remember } from "./read-cache";
import { getActiveSeason } from "./season";
import type { Actor } from "./types";

function assertOrganizer(actor: Actor) {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
}

export async function saveAnnouncement(
  db: Db,
  actor: Actor,
  input: { id?: string; title: string; body: string; published: boolean },
) {
  assertOrganizer(actor);
  const season = await getActiveSeason(db);
  if (input.title.trim().length < 2 || input.body.trim().length < 2) throw new DomainError("Add a title and a message.");
  if (input.id) {
    const rows = await db.query(
      `update announcements set title = $1, body = $2, published = $3,
        published_at = case when $3 then coalesce(published_at, now()) else null end, updated_at = now()
       where id = $4 and season_id = $5 returning id`,
      [input.title.trim(), input.body.trim(), input.published, input.id, season.id],
    );
    if (!rows[0]) throw new DomainError("Announcement not found.", 404, "not_found");
    return rows[0];
  }
  const rows = await db.query(
    `insert into announcements (season_id, title, body, published, published_at, created_by)
     values ($1,$2,$3,$4, case when $4 then now() else null end, $5) returning id`,
    [season.id, input.title.trim(), input.body.trim(), input.published, actor.id],
  );
  return rows[0];
}

export async function listAnnouncements(db: Queryable, actor: Actor) {
  assertOrganizer(actor);
  const season = await getActiveSeason(db);
  return db.query("select * from announcements where season_id = $1 order by created_at desc", [season.id]);
}

export async function saveSponsor(
  db: Db,
  actor: Actor,
  input: { id?: string; name: string; url?: string | null; logoPath?: string | null; published: boolean },
) {
  assertOrganizer(actor);
  const season = await getActiveSeason(db);
  if (input.name.trim().length < 2) throw new DomainError("A sponsor needs a name. Do not add a placeholder sponsor.");
  if (input.id) {
    await db.execute(
      `update sponsors set name = $1, url = $2, logo_path = coalesce($3, logo_path), published = $4 where id = $5 and season_id = $6`,
      [input.name.trim(), blank(input.url), input.logoPath ?? null, input.published, input.id, season.id],
    );
    return;
  }
  await db.execute(
    "insert into sponsors (season_id, name, url, logo_path, published) values ($1,$2,$3,$4,$5)",
    [season.id, input.name.trim(), blank(input.url), input.logoPath ?? null, input.published],
  );
}

export async function listSponsors(db: Queryable, actor: Actor) {
  assertOrganizer(actor);
  const season = await getActiveSeason(db);
  return db.query("select * from sponsors where season_id = $1 order by sort_order, name", [season.id]);
}

export async function saveMedia(
  db: Db,
  actor: Actor,
  input: { path: string; caption?: string | null; consent: boolean; published: boolean },
) {
  assertOrganizer(actor);
  if (!input.consent) throw new DomainError("A photograph can be saved only with a record that the people in it consented.");
  const season = await getActiveSeason(db);
  await db.execute(
    `insert into media_assets (season_id, kind, path, caption, consent, published, created_by)
     values ($1, 'gallery', $2, $3, true, $4, $5)`,
    [season.id, input.path, blank(input.caption), input.published, actor.id],
  );
}

export async function listMedia(db: Queryable, actor: Actor) {
  assertOrganizer(actor);
  const season = await getActiveSeason(db);
  return db.query("select * from media_assets where season_id = $1 order by created_at desc", [season.id]);
}

export async function updateArchive(
  db: Db,
  actor: Actor,
  input: {
    editionNumber: number;
    year?: number | null;
    champion?: string | null;
    runnerUp?: string | null;
    venueNote?: string | null;
    notes?: string | null;
    sourceUrl?: string | null;
    verificationStatus: "verified" | "partial" | "unverified";
  },
) {
  assertOrganizer(actor);
  if (!input.sourceUrl?.trim() && input.verificationStatus !== "unverified") {
    throw new DomainError("A source URL is required before an archive entry is marked partial or verified.");
  }
  await db.execute(
    `insert into archive_entries (
      edition_number, year, champion, runner_up, venue_note, notes, source_url, verification_status
    ) values ($1,$2,$3,$4,$5,$6,$7,$8)
    on conflict (edition_number) do update set
      year = excluded.year,
      champion = excluded.champion,
      runner_up = excluded.runner_up,
      venue_note = excluded.venue_note,
      notes = excluded.notes,
      source_url = excluded.source_url,
      verification_status = excluded.verification_status,
      updated_at = now()`,
    [
      input.editionNumber,
      input.year ?? null,
      blank(input.champion),
      blank(input.runnerUp),
      blank(input.venueNote),
      blank(input.notes),
      blank(input.sourceUrl),
      input.verificationStatus,
    ],
  );
  await writeAudit(db, actor.id, "archive.update", "archive", String(input.editionNumber), {
    status: input.verificationStatus,
  });
}

export async function listArchive(db: Queryable) {
  return remember("archive", 60_000, () => listArchiveRows(db));
}

async function listArchiveRows(db: Queryable) {
  const rows = await db.query<Row>("select * from archive_entries order by edition_number");
  return rows.map((row) => ({
    id: requiredStr(row, "id"),
    editionNumber: num(row, "edition_number") ?? 0,
    year: num(row, "year"),
    startDate: dateOnly(row, "start_date"),
    endDate: dateOnly(row, "end_date"),
    champion: str(row, "champion"),
    runnerUp: str(row, "runner_up"),
    organizerBatch: str(row, "organizer_batch"),
    venueNote: str(row, "venue_note"),
    notes: str(row, "notes"),
    sourceUrl: str(row, "source_url"),
    verificationStatus: requiredStr(row, "verification_status"),
  }));
}

export function archiveGaps(editions: number[]): number[] {
  const known = new Set(editions);
  return Array.from({ length: 14 }, (_, index) => index + 1).filter((edition) => !known.has(edition));
}

export async function submitHeritage(
  db: Db,
  input: { editionNumber?: number | null; year?: number | null; claim: string; sourceUrl?: string | null; name?: string | null; email?: string | null },
) {
  if (input.claim.trim().length < 10) throw new DomainError("Describe the result or detail you can source.");
  await db.execute(
    `insert into heritage_submissions (edition_number, year, claim, source_url, submitter_name, submitter_email)
     values ($1,$2,$3,$4,$5,$6)`,
    [input.editionNumber ?? null, input.year ?? null, input.claim.trim(), blank(input.sourceUrl), blank(input.name), blank(input.email)],
  );
}

export async function reviewHeritage(db: Db, actor: Actor, id: string, status: "accepted" | "rejected", note: string) {
  assertOrganizer(actor);
  await db.execute("update heritage_submissions set status = $1, review_note = $2 where id = $3", [status, note.trim(), id]);
  await writeAudit(db, actor.id, "heritage.review", "heritage_submission", id, { status });
}

export async function listHeritageQueue(db: Queryable, actor: Actor) {
  assertOrganizer(actor);
  return db.query("select * from heritage_submissions order by created_at desc");
}

export async function confirmAlias(
  db: Db,
  actor: Actor,
  input: { alias: string; admissionYear?: number | null; leavingYear?: number | null; seasonYear?: number | null; notes?: string | null },
) {
  assertOrganizer(actor);
  if (input.alias.trim().length < 2) throw new DomainError("An alias needs a name.");
  await db.execute(
    `insert into team_aliases (alias, batch_admission_year, batch_leaving_year, season_year, notes, confirmed_by, confirmed_at)
     values ($1,$2,$3,$4,$5,$6, now())`,
    [input.alias.trim(), input.admissionYear ?? null, input.leavingYear ?? null, input.seasonYear ?? null, blank(input.notes), actor.id],
  );
  await writeAudit(db, actor.id, "alias.confirm", "team_alias", null, { alias: input.alias.trim() });
}

export async function listAudit(db: Queryable, actor: Actor) {
  assertOrganizer(actor);
  return db.query(
    `select a.id, a.action, a.entity_type, a.entity_id, a.payload, a.created_at, p.email as actor_email
     from audit_events a
     left join profiles p on p.id = a.actor_id
     order by a.created_at desc limit 200`,
  );
}

function blank(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}
