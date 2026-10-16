import { randomBytes } from "node:crypto";
import { upsertProfile } from "./accounts";
import { writeAudit } from "./audit";
import type { Db, Queryable } from "./db";
import { DomainError, isUniqueViolation } from "./errors";
import { cricheroesPlayerId, formatInrFromPaise, formatIst, normalizeName, normalizePhone, slugify } from "./format";
import { bool, num, requiredStr, str, type Row } from "./rows";
import {
  getActiveSeason,
  isRosterLocked,
  lockActiveSeason,
  registrationPhase,
  registrationReadiness,
  type Season,
} from "./season";
import { PLATFORM_PLAYER_CAP, PLAYER_ROLES, type Actor, type PlayerInput } from "./types";

export type RegistrationPlayer = {
  id: string;
  name: string;
  batchLabel: string | null;
  role: PlayerInput["role"];
  jerseyNumber: number | null;
  cricheroesUrl: string | null;
  cricheroesPlayerId: string | null;
  publicState: "included" | "pending_add" | "pending_remove";
  sortOrder: number;
};

export type Registration = {
  id: string;
  seasonId: string;
  captainUserId: string;
  reference: string | null;
  status: string;
  teamName: string;
  slug: string | null;
  batchAdmissionYear: number | null;
  batchLeavingYear: number | null;
  logoPath: string | null;
  cricheroesTeamUrl: string | null;
  captainName: string;
  captainEmail: string;
  captainPhone: string;
  viceCaptainName: string | null;
  viceCaptainPhone: string | null;
  rulesVersion: string | null;
  rulesAcknowledgedAt: string | null;
  publicationConsent: boolean;
  feeConsent: boolean;
  feeConsentAt: string | null;
  feeConsentPaise: number | null;
  feeConsentDueAt: string | null;
  reviewReason: string | null;
  nameReviewRequired: boolean;
  version: number;
  submittedAt: string | null;
  players: RegistrationPlayer[];
};

export type RegistrationPatch = {
  teamName?: string;
  batchAdmissionYear?: number | null;
  batchLeavingYear?: number | null;
  cricheroesTeamUrl?: string | null;
  captainName?: string;
  captainPhone?: string;
  viceCaptainName?: string | null;
  viceCaptainPhone?: string | null;
  publicationConsent?: boolean;
  rulesAcknowledged?: boolean;
};

const EDITABLE = new Set(["draft", "submitted", "changes_requested", "approved", "waitlisted"]);

export function mapPlayer(row: Row): RegistrationPlayer {
  return {
    id: requiredStr(row, "id"),
    name: requiredStr(row, "name"),
    batchLabel: str(row, "batch_label"),
    role: requiredStr(row, "role") as PlayerInput["role"],
    jerseyNumber: num(row, "jersey_number"),
    cricheroesUrl: str(row, "cricheroes_url"),
    cricheroesPlayerId: str(row, "cricheroes_player_id"),
    publicState: requiredStr(row, "public_state") as RegistrationPlayer["publicState"],
    sortOrder: num(row, "sort_order") ?? 0,
  };
}

export function mapRegistration(row: Row, players: RegistrationPlayer[] = []): Registration {
  return {
    id: requiredStr(row, "id"),
    seasonId: requiredStr(row, "season_id"),
    captainUserId: requiredStr(row, "captain_user_id"),
    reference: str(row, "reference"),
    status: requiredStr(row, "status"),
    teamName: requiredStr(row, "team_name"),
    slug: str(row, "slug"),
    batchAdmissionYear: num(row, "batch_admission_year"),
    batchLeavingYear: num(row, "batch_leaving_year"),
    logoPath: str(row, "logo_path"),
    cricheroesTeamUrl: str(row, "cricheroes_team_url"),
    captainName: requiredStr(row, "captain_name"),
    captainEmail: requiredStr(row, "captain_email"),
    captainPhone: requiredStr(row, "captain_phone"),
    viceCaptainName: str(row, "vice_captain_name"),
    viceCaptainPhone: str(row, "vice_captain_phone"),
    rulesVersion: str(row, "rules_version"),
    rulesAcknowledgedAt: str(row, "rules_acknowledged_at"),
    publicationConsent: bool(row, "publication_consent"),
    feeConsent: bool(row, "fee_consent"),
    feeConsentAt: str(row, "fee_consent_at"),
    feeConsentPaise: num(row, "fee_consent_paise"),
    feeConsentDueAt: str(row, "fee_consent_due_at"),
    reviewReason: str(row, "review_reason"),
    nameReviewRequired: bool(row, "name_review_required"),
    version: num(row, "version") ?? 1,
    submittedAt: str(row, "submitted_at"),
    players,
  };
}

async function withPlayers(db: Queryable, row: Row): Promise<Registration> {
  const players = await db.query("select * from registration_players where registration_id = $1 order by sort_order, created_at", [
    row.id,
  ]);
  return mapRegistration(row, players.map(mapPlayer));
}

export async function getOwnRegistration(db: Queryable, actor: Actor, registrationId?: string): Promise<Registration | null> {
  const season = await getActiveSeason(db);
  const rows = registrationId
    ? await db.query(
        `select * from registrations where id = $1 and season_id = $2 and captain_user_id = $3
         and status not in ('withdrawn', 'rejected')`,
        [registrationId, season.id, actor.id],
      )
    : await db.query(
        `select * from registrations where season_id = $1 and captain_user_id = $2
         and status not in ('withdrawn', 'rejected') order by created_at desc limit 1`,
        [season.id, actor.id],
      );
  return rows[0] ? withPlayers(db, rows[0]) : null;
}

export type PublicRegistrationInput = {
  teamName: string;
  batchAdmissionYear: number | null;
  batchLeavingYear: number | null;
  captainName: string;
  captainEmail: string;
  captainPhone: string;
  publicationConsent: boolean;
  feeConsent?: boolean;
  rulesAcknowledged: boolean;
};

export async function submitPublicRegistration(
  db: Db,
  input: PublicRegistrationInput,
  now = new Date(),
): Promise<{ registration: Registration; alreadySubmitted: boolean }> {
  const cleaned = cleanPublicRegistration(input);
  return db.tx(async (query) => {
    const season = await lockActiveSeason(query);
    assertWindowOpen(season, now);
    const readiness = registrationReadiness(season);
    if (!readiness.ok) throw new DomainError(readiness.message, 422, "checklist");
    let actor;
    try {
      actor = await upsertProfile(query, { email: cleaned.captainEmail, displayName: cleaned.captainName });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      actor = await upsertProfile(query, { email: cleaned.captainEmail, displayName: cleaned.captainName });
    }
    const existingRows = await query.query(
      `select * from registrations
       where season_id = $1 and captain_user_id = $2 and status not in ('withdrawn', 'rejected')
       order by created_at desc limit 1 for update`,
      [season.id, actor.id],
    );
    const existing = existingRows[0] ? mapRegistration(existingRows[0]) : null;
    if (existing && ["submitted", "approved", "waitlisted"].includes(existing.status)) {
      return { registration: await withPlayers(query, existingRows[0] as Row), alreadySubmitted: true };
    }
    const rulesVersion = publishedRulesVersion(season);
    if (rulesVersion && !input.rulesAcknowledged) {
      throw new DomainError("Acknowledge the current playing conditions.", 422, "incomplete");
    }
    const feeCharged = season.feePaise != null && season.feePaise > 0;
    if (feeCharged && input.feeConsent !== true) {
      throw new DomainError("Acknowledge the registration fee.", 422, "incomplete");
    }
    const feeConsent = feeCharged && input.feeConsent === true;
    await assertBatchAvailable(query, season, existing?.id ?? null, cleaned.batchAdmissionYear, cleaned.batchLeavingYear);
    const reference = existing?.reference ?? (await allocateReference(query, season.year));
    const rows = existing
      ? await query.query(
          `update registrations set
            team_name = $1,
            batch_admission_year = $2,
            batch_leaving_year = $3,
            captain_name = $4,
            captain_email = $5,
            captain_phone = $6,
            publication_consent = true,
            fee_consent = $7,
            fee_consent_at = case when $7 then now() else null end,
            fee_consent_paise = $8,
            fee_consent_due_at = $9,
            rules_version = $10,
            rules_acknowledged_at = case when $11 then now() else null end,
            status = 'submitted',
            reference = $12,
            submitted_at = coalesce(submitted_at, now()),
            version = version + 1,
            updated_at = now()
           where id = $13 returning *`,
          [
            cleaned.teamName,
            cleaned.batchAdmissionYear,
            cleaned.batchLeavingYear,
            cleaned.captainName,
            cleaned.captainEmail,
            cleaned.captainPhone,
            feeConsent,
            feeConsent ? season.feePaise : null,
            feeConsent ? season.feeDueAt : null,
            rulesVersion,
            Boolean(rulesVersion),
            reference,
            existing.id,
          ],
        )
      : await query.query(
          `insert into registrations (
            season_id, captain_user_id, reference, status, team_name,
            batch_admission_year, batch_leaving_year, captain_name, captain_email, captain_phone,
            rules_version, rules_acknowledged_at, publication_consent,
            fee_consent, fee_consent_at, fee_consent_paise, fee_consent_due_at, submitted_at
          ) values ($1, $2, $3, 'submitted', $4, $5, $6, $7, $8, $9, $10, case when $11 then now() else null end, true, $12, case when $12 then now() else null end, $13, $14, now())
          returning *`,
          [
            season.id,
            actor.id,
            reference,
            cleaned.teamName,
            cleaned.batchAdmissionYear,
            cleaned.batchLeavingYear,
            cleaned.captainName,
            cleaned.captainEmail,
            cleaned.captainPhone,
            rulesVersion,
            Boolean(rulesVersion),
            feeConsent,
            feeConsent ? season.feePaise : null,
            feeConsent ? season.feeDueAt : null,
          ],
        );
    const saved = mapRegistration(rows[0] as Row);
    if (season.feePaise === 0) {
      await query.query(
        `insert into payment_attempts (season_id, registration_id, amount_paise, status, note)
         select $1, $2, 0, 'not_required', 'The organizer set a zero fee.'
         where not exists (select 1 from payment_attempts where registration_id = $2 and status = 'not_required')`,
        [season.id, saved.id],
      );
    }
    await writeAudit(query, actor.id, "registration.submit", "registration", saved.id, { reference, source: "form" });
    return { registration: await withPlayers(query, rows[0] as Row), alreadySubmitted: false };
  });
}

export function registrationFollowUp(season: Pick<Season, "feePaise" | "feeDueAt">, alreadySubmitted: boolean): string {
  if (alreadySubmitted) {
    return "No second application was created. Keep this reference and contact the organizers if a detail needs to change.";
  }
  if (season.feePaise != null && season.feePaise > 0) {
    const deadline = season.feeDueAt
      ? `Pay it by ${formatIst(season.feeDueAt)}.`
      : "The payment deadline has not been set.";
    return `Pay ${formatInrFromPaise(season.feePaise)} per team. ${deadline} Keep this reference.`;
  }
  if (season.feePaise === 0) return "No registration fee is due. Keep this reference for match day.";
  return "The registration fee has not been decided. Keep this reference. The organizers will confirm payment separately.";
}

function cleanPublicRegistration(input: PublicRegistrationInput) {
  const teamName = input.teamName.trim();
  const captainName = input.captainName.trim();
  const captainEmail = input.captainEmail.trim().toLowerCase();
  const captainPhone = normalizePhone(input.captainPhone);
  const problems: string[] = [];
  if (teamName.length < 2) problems.push("Add the team name.");
  if (!validYear(input.batchAdmissionYear) || !validYear(input.batchLeavingYear)) {
    problems.push("Add the batch admission and leaving years.");
  } else if (input.batchLeavingYear < input.batchAdmissionYear) {
    problems.push("The leaving year cannot be earlier than the admission year.");
  }
  if (captainName.length < 2) problems.push("Add the captain's name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(captainEmail)) problems.push("Enter a valid email address.");
  if (!captainPhone) problems.push("Add a valid Indian mobile number.");
  if (!input.publicationConsent) problems.push("Publication consent is required.");
  if (problems.length > 0 || !captainPhone || !validYear(input.batchAdmissionYear) || !validYear(input.batchLeavingYear)) {
    throw new DomainError(problems.join(" ") || "The form is incomplete.", 422, "incomplete");
  }
  return {
    teamName,
    captainName,
    captainEmail,
    captainPhone,
    batchAdmissionYear: input.batchAdmissionYear,
    batchLeavingYear: input.batchLeavingYear,
  };
}

function validYear(value: number | null): value is number {
  return value != null && Number.isInteger(value) && value >= 1960 && value <= 2100;
}

async function assertBatchAvailable(
  query: Queryable,
  season: Season,
  registrationId: string | null,
  admission: number | null,
  leaving: number | null,
) {
  if (!season.oneTeamPerBatch || admission == null || leaving == null) return;
  const clash = await query.query(
    `select id from registrations
     where season_id = $1 and ($2::uuid is null or id <> $2) and batch_admission_year = $3 and batch_leaving_year = $4
       and status not in ('withdrawn', 'rejected')`,
    [season.id, registrationId, admission, leaving],
  );
  if (clash.length > 0) {
    throw new DomainError("Another active application already uses this batch, and the organizer has limited the season to one team per batch.");
  }
}

export async function createDraft(db: Db, actor: Actor, now = new Date()): Promise<Registration> {
  const season = await getActiveSeason(db);
  assertWindowOpen(season, now);
  const existing = await getOwnRegistration(db, actor);
  if (existing) return existing;
  try {
    const rows = await db.query(
      `insert into registrations (season_id, captain_user_id, captain_email, status)
       values ($1, $2, $3, 'draft') returning *`,
      [season.id, actor.id, actor.email],
    );
    await writeAudit(db, actor.id, "registration.draft", "registration", String(rows[0]?.id ?? ""), {});
    return mapRegistration(rows[0] as Row, []);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await getOwnRegistration(db, actor);
    if (raced) return raced;
    throw error;
  }
}

export async function updateRegistration(
  db: Db,
  actor: Actor,
  registrationId: string,
  version: number,
  patch: RegistrationPatch,
  now = new Date(),
): Promise<Registration> {
  return db.tx(async (query) => {
    const season = await lockActiveSeason(query);
    const current = await lockOwn(query, season.id, actor.id, registrationId);
    assertEditable(season, current, now);
    const phone = patch.captainPhone !== undefined ? normalizePhone(patch.captainPhone) : current.captainPhone;
    if (patch.captainPhone !== undefined && !phone) throw new DomainError("Enter a valid Indian mobile number.");
    const vicePhone =
      patch.viceCaptainPhone !== undefined
        ? patch.viceCaptainPhone
          ? normalizePhone(patch.viceCaptainPhone)
          : null
        : current.viceCaptainPhone;
    if (patch.viceCaptainPhone && !vicePhone) throw new DomainError("The vice-captain number is not a valid Indian mobile number.");
    if (patch.cricheroesTeamUrl) assertCricheroesUrl(patch.cricheroesTeamUrl, "team");
    const years = {
      admission: patch.batchAdmissionYear === undefined ? current.batchAdmissionYear : patch.batchAdmissionYear,
      leaving: patch.batchLeavingYear === undefined ? current.batchLeavingYear : patch.batchLeavingYear,
    };
    if (years.admission != null && years.leaving != null && years.leaving < years.admission) {
      throw new DomainError("The leaving year cannot be earlier than the admission year.");
    }
    const acknowledge = patch.rulesAcknowledged === true;
    const rows = await query.query(
      `update registrations set
        team_name = $1,
        batch_admission_year = $2,
        batch_leaving_year = $3,
        cricheroes_team_url = $4,
        captain_name = $5,
        captain_email = $6,
        captain_phone = $7,
        vice_captain_name = $8,
        vice_captain_phone = $9,
        publication_consent = $10,
        rules_version = case when $11 then $12 else rules_version end,
        rules_acknowledged_at = case when $11 then now() else rules_acknowledged_at end,
        version = version + 1,
        updated_at = now()
       where id = $13 and version = $14
       returning *`,
      [
        patch.teamName?.trim() ?? current.teamName,
        years.admission,
        years.leaving,
        patch.cricheroesTeamUrl === undefined ? current.cricheroesTeamUrl : blankToNull(patch.cricheroesTeamUrl),
        patch.captainName?.trim() ?? current.captainName,
        actor.email,
        phone,
        patch.viceCaptainName === undefined ? current.viceCaptainName : blankToNull(patch.viceCaptainName),
        vicePhone,
        patch.publicationConsent ?? current.publicationConsent,
        acknowledge,
        season.rulesVersion,
        current.id,
        version,
      ],
    );
    if (!rows[0]) throw new DomainError("This registration changed while saving. Nothing new was saved.", 409, "version_conflict");
    return withPlayers(query, rows[0]);
  });
}

export async function replacePlayers(
  db: Db,
  actor: Actor,
  registrationId: string,
  version: number,
  players: PlayerInput[],
  now = new Date(),
): Promise<Registration> {
  return db.tx(async (query) => {
    const season = await lockActiveSeason(query);
    const current = await lockOwn(query, season.id, actor.id, registrationId);
    assertEditable(season, current, now);
    const clean = validatePlayerList(players, season);
    await assertUniqueCricheroes(query, season.id, current.id, clean);
    if (current.status === "approved") {
      await diffPublicPlayers(query, season.id, current.id, clean);
    } else {
      await query.execute("delete from registration_players where registration_id = $1", [current.id]);
      await insertPlayers(query, season.id, current.id, clean, "pending_add");
    }
    const review = await hasNameReview(query, season.id, current.id);
    const rows = await query.query(
      `update registrations set name_review_required = $1, version = version + 1, updated_at = now()
       where id = $2 and version = $3 returning *`,
      [review, current.id, version],
    );
    if (!rows[0]) throw new DomainError("This registration changed while saving. The squad was not replaced.", 409, "version_conflict");
    return withPlayers(query, rows[0]);
  });
}

export async function submitRegistration(
  db: Db,
  actor: Actor,
  registrationId: string,
  idempotencyKey: string,
  version: number,
  now = new Date(),
): Promise<{ registration: Registration; alreadySubmitted: boolean }> {
  return db.tx(async (query) => {
    const season = await lockActiveSeason(query);
    assertWindowOpen(season, now);
    const readiness = registrationReadiness(season);
    if (!readiness.ok) throw new DomainError(readiness.message, 422, "checklist");
    const current = await lockOwn(query, season.id, actor.id, registrationId);
    if (["submitted", "approved", "waitlisted"].includes(current.status)) {
      return { registration: await withPlayers(query, await reload(query, current.id)), alreadySubmitted: true };
    }
    if (current.status !== "draft" && current.status !== "changes_requested") {
      throw new DomainError("This application cannot be submitted from its current state.");
    }
    if (current.version !== version && current.status === "draft") {
      throw new DomainError("This registration changed while saving. Nothing was submitted and no reference was issued.", 409, "version_conflict");
    }
    const players = await loadPlayers(query, current.id);
    const problems = completenessProblems(current, players, season, actor);
    if (problems.length > 0) {
      throw new DomainError(`${problems.join(" ")} Nothing was submitted and no reference was issued.`, 422, "incomplete");
    }
    await assertUniqueCricheroes(
      query,
      season.id,
      current.id,
      players.map((player) => ({
        name: player.name,
        role: player.role,
        batchLabel: player.batchLabel,
        jerseyNumber: player.jerseyNumber,
        cricheroesUrl: player.cricheroesUrl,
      })),
    );
    if (season.oneTeamPerBatch && current.batchAdmissionYear != null && current.batchLeavingYear != null) {
      const clash = await query.query(
        `select id from registrations
         where season_id = $1 and id <> $2 and batch_admission_year = $3 and batch_leaving_year = $4
           and status not in ('withdrawn', 'rejected')`,
        [season.id, current.id, current.batchAdmissionYear, current.batchLeavingYear],
      );
      if (clash.length > 0) {
        throw new DomainError("Another active application already uses this batch, and the organizer has limited the season to one team per batch.");
      }
    }
    const review = await hasNameReview(query, season.id, current.id);
    const reference = current.reference ?? (await allocateReference(query, season.year));
    const rows = await query.query(
      `update registrations set
        status = 'submitted',
        reference = $1,
        idempotency_key = coalesce(idempotency_key, $2),
        submitted_at = coalesce(submitted_at, now()),
        name_review_required = $3,
        version = version + 1,
        updated_at = now()
       where id = $4 returning *`,
      [reference, idempotencyKey, review, current.id],
    );
    if (season.feePaise === 0) {
      const existing = await query.query(
        "select id from payment_attempts where registration_id = $1 and status = 'not_required'",
        [current.id],
      );
      if (existing.length === 0) {
        await query.query(
          `insert into payment_attempts (season_id, registration_id, amount_paise, status, note)
           values ($1, $2, 0, 'not_required', 'The organizer set a zero fee.')`,
          [season.id, current.id],
        );
      }
    }
    await writeAudit(query, actor.id, "registration.submit", "registration", current.id, { reference });
    return { registration: await withPlayers(query, rows[0] as Row), alreadySubmitted: false };
  });
}

export async function withdrawRegistration(db: Db, actor: Actor, registrationId: string, now = new Date()): Promise<Registration> {
  return db.tx(async (query) => {
    const season = await lockActiveSeason(query);
    const current = await lockOwn(query, season.id, actor.id, registrationId);
    if (isRosterLocked(season, now)) {
      throw new DomainError("The roster is locked. Ask an organizer if this application needs to be withdrawn.");
    }
    const rows = await query.query(
      `update registrations set status = 'withdrawn', version = version + 1, updated_at = now()
       where id = $1 returning *`,
      [current.id],
    );
    await writeAudit(query, actor.id, "registration.withdraw", "registration", current.id, {});
    return withPlayers(query, rows[0] as Row);
  });
}

export async function reviewRegistration(
  db: Db,
  actor: Actor,
  registrationId: string,
  action: "approve" | "waitlist" | "request_changes" | "reject",
  reason: string,
): Promise<Registration> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  if (action !== "approve" && reason.trim().length < 3) {
    throw new DomainError("A reason is required for this review decision.");
  }
  return db.tx(async (query) => {
    const season = await lockActiveSeason(query);
    const rows = await query.query("select * from registrations where id = $1 and season_id = $2 for update", [
      registrationId,
      season.id,
    ]);
    if (!rows[0]) throw new DomainError("Registration not found.", 404, "not_found");
    const current = mapRegistration(rows[0]);
    if (action === "approve" && current.status === "approved") {
      throw new DomainError("This team is already approved.");
    }
    if (current.status === action || (action === "approve" && current.status === "approved")) {
      return withPlayers(query, rows[0]);
    }
    let nextStatus = action === "approve" ? "approved" : action === "waitlist" ? "waitlisted" : action === "reject" ? "rejected" : "changes_requested";
    let reviewReason = reason.trim();
    if (action === "approve") {
      const countRows = await query.query<{ count: number }>(
        "select count(*)::int as count from registrations where season_id = $1 and status = 'approved' and id <> $2",
        [season.id, current.id],
      );
      const approved = countRows[0]?.count ?? 0;
      if (season.teamCap != null && approved >= season.teamCap) {
        if (!season.waitlistEnabled) {
          throw new DomainError("The approved-team limit has been reached. This application was not approved.", 409, "capacity");
        }
        nextStatus = "waitlisted";
        reviewReason = reviewReason || "The approved-team limit has been reached.";
      }
    }
    let slug = current.slug;
    if (nextStatus === "approved") {
      slug = await allocateSlug(query, season.id, current.id, current.teamName);
      await query.execute(
        `update registration_players set public_state = 'included' where registration_id = $1 and public_state = 'pending_add'`,
        [current.id],
      );
      await query.execute("delete from registration_players where registration_id = $1 and public_state = 'pending_remove'", [current.id]);
      if (season.feePaise === 0) {
        await query.execute(
          `insert into payment_attempts (season_id, registration_id, amount_paise, status, note)
           select $1, $2, 0, 'not_required', 'The organizer set a zero fee.'
           where not exists (select 1 from payment_attempts where registration_id = $2 and status = 'not_required')`,
          [season.id, current.id],
        );
      }
    }
    const updated = await query.query(
      `update registrations set
        status = $1, slug = $2, review_reason = $3, reviewed_by = $4, reviewed_at = now(),
        version = version + 1, updated_at = now()
       where id = $5 returning *`,
      [nextStatus, slug, reviewReason || null, actor.id, current.id],
    );
    await writeAudit(query, actor.id, `registration.${nextStatus}`, "registration", current.id, { reason: reviewReason });
    return withPlayers(query, updated[0] as Row);
  });
}

export async function removeRegistration(db: Db, actor: Actor, registrationId: string): Promise<void> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  await db.tx(async (query) => {
    const season = await lockActiveSeason(query);
    const rows = await query.query("select id, reference from registrations where id = $1 and season_id = $2 for update", [
      registrationId,
      season.id,
    ]);
    if (!rows[0]) throw new DomainError("Registration not found.", 404, "not_found");
    const used = await query.query(
      `select 1 as hit from fixtures where team_a_registration_id = $1 or team_b_registration_id = $1 or winner_registration_id = $1
       union all select 1 from group_memberships where registration_id = $1
       union all select 1 from standings_rows where registration_id = $1
       limit 1`,
      [registrationId],
    );
    if (used[0]) throw new DomainError("This team is already on a fixture or in the table, so it was not removed.");
    await query.execute("delete from payment_attempts where registration_id = $1", [registrationId]);
    await query.execute("delete from registrations where id = $1", [registrationId]);
    await writeAudit(query, actor.id, "registration.remove", "registration", registrationId, { reference: rows[0].reference ?? null });
  });
}

export async function publishSquadChanges(db: Db, actor: Actor, registrationId: string): Promise<Registration> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  return db.tx(async (query) => {
    await query.execute("delete from registration_players where registration_id = $1 and public_state = 'pending_remove'", [registrationId]);
    await query.execute(
      "update registration_players set public_state = 'included' where registration_id = $1 and public_state = 'pending_add'",
      [registrationId],
    );
    const rows = await query.query("select * from registrations where id = $1", [registrationId]);
    if (!rows[0]) throw new DomainError("Registration not found.", 404, "not_found");
    await writeAudit(query, actor.id, "registration.squad_published", "registration", registrationId, {});
    return withPlayers(query, rows[0]);
  });
}

export async function overrideSquad(
  db: Db,
  actor: Actor,
  registrationId: string,
  players: PlayerInput[],
  reason: string,
): Promise<Registration> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  if (reason.trim().length < 3) throw new DomainError("An override reason is required.");
  return db.tx(async (query) => {
    const season = await lockActiveSeason(query);
    const rows = await query.query("select * from registrations where id = $1 and season_id = $2 for update", [
      registrationId,
      season.id,
    ]);
    if (!rows[0]) throw new DomainError("Registration not found.", 404, "not_found");
    const current = mapRegistration(rows[0]);
    const clean = validatePlayerList(players, season);
    await assertUniqueCricheroes(query, season.id, current.id, clean);
    await query.execute("delete from registration_players where registration_id = $1", [current.id]);
    await insertPlayers(query, season.id, current.id, clean, current.status === "approved" ? "included" : "pending_add");
    await writeAudit(query, actor.id, "registration.override", "registration", current.id, { reason: reason.trim() });
    const updated = await query.query(
      "update registrations set version = version + 1, updated_at = now() where id = $1 returning *",
      [current.id],
    );
    return withPlayers(query, updated[0] as Row);
  });
}

export async function listRegistrations(
  db: Queryable,
  actor: Actor,
  filters: { status?: string; q?: string } = {},
): Promise<Registration[]> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const season = await getActiveSeason(db);
  const params: unknown[] = [season.id];
  let where = "season_id = $1";
  if (filters.status) {
    params.push(filters.status);
    where += ` and status = $${params.length}`;
  }
  if (filters.q?.trim()) {
    params.push(`%${filters.q.trim().toLowerCase()}%`);
    where += ` and (lower(team_name) like $${params.length} or lower(captain_name) like $${params.length} or lower(captain_email) like $${params.length} or lower(coalesce(reference, '')) like $${params.length})`;
  }
  const rows = await db.query(`select * from registrations where ${where} order by updated_at desc`, params);
  const result: Registration[] = [];
  for (const row of rows) result.push(await withPlayers(db, row));
  return result;
}

export async function setLogoPath(db: Db, actor: Actor, registrationId: string, logoPath: string | null): Promise<void> {
  const season = await getActiveSeason(db);
  const current = await getOwnRegistration(db, actor, registrationId);
  if (!current || current.seasonId !== season.id) throw new DomainError("Registration not found.", 404, "not_found");
  if (isRosterLocked(season)) throw new DomainError("The roster is locked.");
  await db.execute("update registrations set logo_path = $1, updated_at = now() where id = $2 and captain_user_id = $3", [
    logoPath,
    registrationId,
    actor.id,
  ]);
}

async function lockOwn(query: Queryable, seasonId: string, actorId: string, registrationId: string): Promise<Registration> {
  const rows = await query.query(
    "select * from registrations where id = $1 and season_id = $2 and captain_user_id = $3 for update",
    [registrationId, seasonId, actorId],
  );
  if (!rows[0]) throw new DomainError("Registration not found.", 404, "not_found");
  return mapRegistration(rows[0]);
}

async function reload(query: Queryable, id: string): Promise<Row> {
  const rows = await query.query("select * from registrations where id = $1", [id]);
  return rows[0] as Row;
}

function assertWindowOpen(season: Season, now: Date) {
  const phase = registrationPhase(season, now);
  if (phase === "closed") throw new DomainError("Registration is closed.", 403, "registration_closed");
  if (phase !== "open") throw new DomainError("Registration opens soon.", 403, "registration_closed");
}

function assertEditable(season: Season, registration: Registration, now: Date) {
  if (!EDITABLE.has(registration.status)) throw new DomainError("This application can no longer be edited.");
  if (isRosterLocked(season, now)) {
    throw new DomainError("The roster is locked. An organizer can apply an override with a recorded reason.", 423, "roster_locked");
  }
}

function publishedRulesVersion(season: Pick<Season, "rulesVersion" | "rulesText">): string | null {
  const version = season.rulesVersion?.trim() ?? "";
  if (!version || !season.rulesText?.trim()) return null;
  return version;
}

function completenessProblems(registration: Registration, players: RegistrationPlayer[], season: Season, actor: Actor): string[] {
  const problems: string[] = [];
  if (registration.teamName.trim().length < 2) problems.push("Add the team name.");
  if (registration.batchAdmissionYear == null || registration.batchLeavingYear == null) problems.push("Add the batch admission and leaving years.");
  if (
    registration.batchAdmissionYear != null &&
    registration.batchLeavingYear != null &&
    registration.batchLeavingYear < registration.batchAdmissionYear
  ) {
    problems.push("The leaving year cannot be earlier than the admission year.");
  }
  if (registration.captainName.trim().length < 2) problems.push("Add the captain's name.");
  if (registration.captainEmail.toLowerCase() !== actor.email.toLowerCase()) problems.push("The captain email must be the verified sign-in email.");
  if (!normalizePhone(registration.captainPhone)) problems.push("Add the captain's mobile number.");
  if (!registration.publicationConsent) problems.push("Publication consent is required before submission.");
  const rulesVersion = publishedRulesVersion(season);
  if (rulesVersion && registration.rulesVersion !== rulesVersion) problems.push("Acknowledge the current playing conditions.");
  const activePlayers = players.filter((player) => player.publicState !== "pending_remove");
  if (season.squadMin != null && activePlayers.length < season.squadMin) problems.push(`The squad needs at least ${season.squadMin} players.`);
  if (season.squadMax != null && activePlayers.length > season.squadMax) problems.push(`The squad cannot have more than ${season.squadMax} players.`);
  if (activePlayers.length > PLATFORM_PLAYER_CAP) problems.push(`A squad cannot contain more than ${PLATFORM_PLAYER_CAP} players in this system.`);
  return problems;
}

export function validatePlayerList(players: PlayerInput[], season?: Pick<Season, "squadMax">): PlayerInput[] {
  const limit = Math.min(season?.squadMax ?? PLATFORM_PLAYER_CAP, PLATFORM_PLAYER_CAP);
  if (players.length > limit) throw new DomainError(`A squad cannot contain more than ${limit} players.`);
  return players.map((player, index) => {
    const name = player.name?.trim() ?? "";
    if (name.length < 2) throw new DomainError(`Player ${index + 1} needs a name.`);
    if (!PLAYER_ROLES.includes(player.role)) throw new DomainError(`Player ${index + 1} needs a cricket role.`);
    if (player.jerseyNumber != null && (!Number.isInteger(player.jerseyNumber) || player.jerseyNumber < 0 || player.jerseyNumber > 999)) {
      throw new DomainError(`Player ${index + 1} has an invalid jersey number.`);
    }
    if (player.cricheroesUrl) assertCricheroesUrl(player.cricheroesUrl, "player");
    return {
      name,
      role: player.role,
      batchLabel: blankToNull(player.batchLabel),
      jerseyNumber: player.jerseyNumber ?? null,
      cricheroesUrl: blankToNull(player.cricheroesUrl),
    };
  });
}

function assertCricheroesUrl(value: string, kind: "team" | "player") {
  if (/^\d+$/.test(value.trim()) && kind === "player") return;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DomainError(`The CricHeroes ${kind} link must be a full https URL or, for a player, a numeric profile id.`);
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith("cricheroes.com")) {
    throw new DomainError("CricHeroes links must use https://cricheroes.com.");
  }
}

async function assertUniqueCricheroes(query: Queryable, seasonId: string, registrationId: string, players: PlayerInput[]) {
  const ids = players.map((player) => cricheroesPlayerId(player.cricheroesUrl)).filter((id): id is string => Boolean(id));
  if (new Set(ids).size !== ids.length) throw new DomainError("The same CricHeroes player id is listed twice in this squad.");
  if (ids.length === 0) return;
  const rows = await query.query<{ cricheroes_player_id: string }>(
    `select p.cricheroes_player_id
     from registration_players p
     join registrations r on r.id = p.registration_id
     where p.season_id = $1 and p.registration_id <> $2 and p.cricheroes_player_id is not null
       and r.status not in ('withdrawn', 'rejected')`,
    [seasonId, registrationId],
  );
  const taken = new Set(rows.map((row) => row.cricheroes_player_id));
  const clash = ids.find((id) => taken.has(id));
  if (clash) throw new DomainError(`CricHeroes player ${clash} is already listed on another active application this season.`);
}

async function hasNameReview(query: Queryable, seasonId: string, registrationId: string): Promise<boolean> {
  const own = await query.query<{ name: string }>(
    "select name from registration_players where registration_id = $1 and public_state <> 'pending_remove'",
    [registrationId],
  );
  const normalized = own.map((row) => normalizeName(row.name));
  if (new Set(normalized).size !== normalized.length) return true;
  const others = await query.query<{ name: string }>(
    `select p.name from registration_players p
     join registrations r on r.id = p.registration_id
     where p.season_id = $1 and p.registration_id <> $2 and r.status not in ('withdrawn', 'rejected')`,
    [seasonId, registrationId],
  );
  const otherNames = new Set(others.map((row) => normalizeName(row.name)));
  return normalized.some((name) => otherNames.has(name));
}

async function insertPlayers(
  query: Queryable,
  seasonId: string,
  registrationId: string,
  players: PlayerInput[],
  publicState: RegistrationPlayer["publicState"],
) {
  for (const [index, player] of players.entries()) {
    await query.query(
      `insert into registration_players (
        season_id, registration_id, name, batch_label, role, jersey_number, cricheroes_url, cricheroes_player_id, public_state, sort_order
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        seasonId,
        registrationId,
        player.name,
        player.batchLabel ?? null,
        player.role,
        player.jerseyNumber ?? null,
        player.cricheroesUrl ?? null,
        cricheroesPlayerId(player.cricheroesUrl),
        publicState,
        index,
      ],
    );
  }
}

async function diffPublicPlayers(query: Queryable, seasonId: string, registrationId: string, players: PlayerInput[]) {
  const existing = (await query.query("select * from registration_players where registration_id = $1", [registrationId])).map(mapPlayer);
  const matched = new Set<string>();
  for (const [index, player] of players.entries()) {
    const found = existing.find((item) => !matched.has(item.id) && samePlayer(item, player));
    if (found) {
      matched.add(found.id);
      const nextState = found.publicState === "pending_add" ? "pending_add" : "included";
      await query.execute("update registration_players set sort_order = $1, public_state = $2 where id = $3", [
        index,
        nextState,
        found.id,
      ]);
      continue;
    }
    await query.query(
      `insert into registration_players (
        season_id, registration_id, name, batch_label, role, jersey_number, cricheroes_url, cricheroes_player_id, public_state, sort_order
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,'pending_add',$9)`,
      [
        seasonId,
        registrationId,
        player.name,
        player.batchLabel ?? null,
        player.role,
        player.jerseyNumber ?? null,
        player.cricheroesUrl ?? null,
        cricheroesPlayerId(player.cricheroesUrl),
        index,
      ],
    );
  }
  for (const item of existing) {
    if (!matched.has(item.id) && item.publicState === "included") {
      await query.execute("update registration_players set public_state = 'pending_remove' where id = $1", [item.id]);
    }
    if (!matched.has(item.id) && item.publicState === "pending_add") {
      await query.execute("delete from registration_players where id = $1", [item.id]);
    }
  }
}

function samePlayer(existing: RegistrationPlayer, next: PlayerInput): boolean {
  return (
    normalizeName(existing.name) === normalizeName(next.name) &&
    existing.role === next.role &&
    (existing.jerseyNumber ?? null) === (next.jerseyNumber ?? null) &&
    (existing.cricheroesPlayerId ?? "") === (cricheroesPlayerId(next.cricheroesUrl) ?? "")
  );
}

async function loadPlayers(query: Queryable, registrationId: string): Promise<RegistrationPlayer[]> {
  const rows = await query.query("select * from registration_players where registration_id = $1 order by sort_order", [registrationId]);
  return rows.map(mapPlayer);
}

async function allocateReference(query: Queryable, year: number): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reference = makeReference(year);
    const existing = await query.query("select id from registrations where reference = $1", [reference]);
    if (existing.length === 0) return reference;
  }
  throw new DomainError("A registration reference could not be reserved. Nothing was submitted.", 500, "reference");
}

async function allocateSlug(query: Queryable, seasonId: string, registrationId: string, teamName: string): Promise<string> {
  const base = slugify(teamName);
  let slug = base;
  let suffix = 2;
  while (true) {
    const existing = await query.query(
      "select id from registrations where season_id = $1 and slug = $2 and id <> $3",
      [seasonId, slug, registrationId],
    );
    if (existing.length === 0) return slug;
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
}

function makeReference(year: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let code = "";
  for (const byte of bytes) code += alphabet[byte % alphabet.length] ?? "A";
  return `NCL${String(year).slice(-2)}-${code}`;
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}
