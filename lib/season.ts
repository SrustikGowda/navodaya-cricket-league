import type { Db, Queryable } from "./db";
import { clearReadCache, remember } from "./read-cache";
import { DomainError } from "./errors";
import { bool, dateOnly, num, requiredStr, str, type Row } from "./rows";
import type { Actor } from "./types";

export type Season = {
  id: string;
  year: number;
  slug: string;
  name: string;
  shortName: string;
  editionNumber: number;
  community: string;
  organizerCredit: string;
  startDate: string;
  endDate: string;
  fixturesOn: string | null;
  timezone: string;
  venueName: string;
  venueAddress: string;
  mapsUrl: string | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  registrationAnnounced: boolean;
  rosterLockAt: string | null;
  eventStartAt: string | null;
  feePaise: number | null;
  feeDueAt: string | null;
  payeeName: string | null;
  upiVpa: string | null;
  paymentNote: string | null;
  refundPolicy: string | null;
  teamCap: number | null;
  squadMin: number | null;
  squadMax: number | null;
  playingXi: number | null;
  ballType: string | null;
  eligibilityRules: string | null;
  oversByStage: string | null;
  oneTeamPerBatch: boolean;
  waitlistEnabled: boolean;
  rulesVersion: string | null;
  rulesText: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  privacyNote: string | null;
  cricheroesTournamentUrl: string | null;
  active: boolean;
  version: number;
};

export type ScheduleSettings = {
  seasonId: string;
  dayStartMinutes: number | null;
  dayEndMinutes: number | null;
  breakStartMinutes: number | null;
  breakEndMinutes: number | null;
  transitionBufferMinutes: number | null;
  minRestMinutes: number | null;
  version: number;
};

export type ChecklistItem = {
  id: string;
  label: string;
  ok: boolean;
  blocking: boolean;
  detail: string;
};

export function mapSeason(row: Row): Season {
  return {
    id: requiredStr(row, "id"),
    year: num(row, "year") ?? 0,
    slug: requiredStr(row, "slug"),
    name: requiredStr(row, "name"),
    shortName: requiredStr(row, "short_name"),
    editionNumber: num(row, "edition_number") ?? 0,
    community: requiredStr(row, "community"),
    organizerCredit: requiredStr(row, "organizer_credit"),
    startDate: dateOnly(row, "start_date") ?? "",
    endDate: dateOnly(row, "end_date") ?? "",
    fixturesOn: dateOnly(row, "fixtures_on"),
    timezone: requiredStr(row, "timezone") || "Asia/Kolkata",
    venueName: requiredStr(row, "venue_name"),
    venueAddress: requiredStr(row, "venue_address"),
    mapsUrl: str(row, "maps_url"),
    registrationOpensAt: str(row, "registration_opens_at"),
    registrationClosesAt: str(row, "registration_closes_at"),
    registrationAnnounced: bool(row, "registration_announced"),
    rosterLockAt: str(row, "roster_lock_at"),
    eventStartAt: str(row, "event_start_at"),
    feePaise: num(row, "fee_paise"),
    feeDueAt: str(row, "fee_due_at"),
    payeeName: str(row, "payee_name"),
    upiVpa: str(row, "upi_vpa"),
    paymentNote: str(row, "payment_note"),
    refundPolicy: str(row, "refund_policy"),
    teamCap: num(row, "team_cap"),
    squadMin: num(row, "squad_min"),
    squadMax: num(row, "squad_max"),
    playingXi: num(row, "playing_xi"),
    ballType: str(row, "ball_type"),
    eligibilityRules: str(row, "eligibility_rules"),
    oversByStage: str(row, "overs_by_stage"),
    oneTeamPerBatch: bool(row, "one_team_per_batch"),
    waitlistEnabled: bool(row, "waitlist_enabled"),
    rulesVersion: str(row, "rules_version"),
    rulesText: str(row, "rules_text"),
    contactName: str(row, "contact_name"),
    contactEmail: str(row, "contact_email"),
    contactPhone: str(row, "contact_phone"),
    privacyNote: str(row, "privacy_note"),
    cricheroesTournamentUrl: str(row, "cricheroes_tournament_url"),
    active: bool(row, "active"),
    version: num(row, "version") ?? 1,
  };
}

export function toPublicSeason(season: Season) {
  return {
    id: season.id,
    year: season.year,
    slug: season.slug,
    name: season.name,
    shortName: season.shortName,
    editionNumber: season.editionNumber,
    community: season.community,
    organizerCredit: season.organizerCredit,
    startDate: season.startDate,
    endDate: season.endDate,
    fixturesOn: season.fixturesOn,
    timezone: season.timezone,
    venueName: season.venueName,
    venueAddress: season.venueAddress,
    mapsUrl: season.mapsUrl,
    registrationOpensAt: season.registrationOpensAt,
    registrationClosesAt: season.registrationClosesAt,
    registrationAnnounced: season.registrationAnnounced,
    rosterLockAt: season.rosterLockAt,
    eventStartAt: season.eventStartAt,
    feePaise: season.feePaise,
    feeDueAt: season.feeDueAt,
    refundPolicy: season.refundPolicy,
    teamCap: season.teamCap,
    squadMin: season.squadMin,
    squadMax: season.squadMax,
    playingXi: season.playingXi,
    ballType: season.ballType,
    eligibilityRules: season.eligibilityRules,
    oversByStage: season.oversByStage,
    oneTeamPerBatch: season.oneTeamPerBatch,
    waitlistEnabled: season.waitlistEnabled,
    rulesVersion: season.rulesVersion,
    rulesText: season.rulesText,
    contactName: season.contactName,
    contactEmail: season.contactEmail,
    contactPhone: season.contactPhone,
    privacyNote: season.privacyNote,
    cricheroesTournamentUrl: season.cricheroesTournamentUrl,
    registrationPhase: registrationPhase(season),
  };
}

export async function getActiveSeason(db: Queryable): Promise<Season> {
  return remember("active-season", 20_000, async () => {
    const rows = await db.query("select * from seasons where active = true order by year desc limit 1");
    if (!rows[0]) throw new DomainError("The active season is not configured.", 500, "missing_season");
    return mapSeason(rows[0]);
  });
}

export async function lockActiveSeason(db: Queryable): Promise<Season> {
  const rows = await db.query("select * from seasons where active = true order by year desc limit 1 for update");
  if (!rows[0]) throw new DomainError("The active season is not configured.", 500, "missing_season");
  return mapSeason(rows[0]);
}

export function registrationPhase(season: Pick<Season, "registrationOpensAt" | "registrationClosesAt"> & { registrationAnnounced?: boolean }, now = new Date()) {
  if (season.registrationClosesAt && now.getTime() > new Date(season.registrationClosesAt).getTime()) return "closed" as const;
  if (season.registrationAnnounced === false) return "soon" as const;
  if (season.registrationAnnounced !== true && !season.registrationClosesAt) return "unscheduled" as const;
  return "open" as const;
}

export function registrationAvailability(season: Season) {
  const phase = registrationPhase(season);
  const readiness = registrationReadiness(season);
  const accepting = phase === "open" && readiness.ok;
  const label = accepting
    ? "Registration is open"
    : phase === "closed"
      ? "Registration is closed"
      : phase === "open"
        ? "Registration is not available yet"
        : "Registration opens soon";
  return { phase, readiness, accepting, label };
}

export function registrationStatusCopy(phase: ReturnType<typeof registrationPhase>): string {
  if (phase === "open") return "Registration is open.";
  if (phase === "closed") return "Registration is closed.";
  return "Registration opens soon.";
}

export function isRosterLocked(season: Pick<Season, "rosterLockAt">, now = new Date()): boolean {
  if (!season.rosterLockAt) return false;
  return now.getTime() >= new Date(season.rosterLockAt).getTime();
}

export function paymentCollectionReady(season: Pick<Season, "feePaise" | "payeeName" | "upiVpa">): boolean {
  return season.feePaise != null && season.feePaise > 0 && Boolean(season.payeeName?.trim() && season.upiVpa?.trim());
}

export function registrationReadiness(season: Season): { ok: boolean; message: string } {
  const checklist = buildChecklist(season);
  const blocking = checklist.filter((item) => item.blocking && !item.ok);
  if (blocking.length === 0) return { ok: true, message: "Registration settings are complete." };
  return {
    ok: false,
    message: `Registration cannot open yet. Still needed: ${blocking.map((item) => item.label).join(", ")}.`,
  };
}

export function buildChecklist(season: Season, settings?: ScheduleSettings | null): ChecklistItem[] {
  const bothWindowTimes = Boolean(season.registrationOpensAt && season.registrationClosesAt);
  const windowOrdered =
    bothWindowTimes &&
    new Date(season.registrationOpensAt ?? 0).getTime() < new Date(season.registrationClosesAt ?? 0).getTime();
  const feeChosen = season.feePaise != null;
  const upiReady = season.feePaise === 0 || (feeChosen && paymentCollectionReady(season));
  return [
    item("opens", "Registration opening time", Boolean(season.registrationOpensAt), false, "Registration opens from the switch. This time is not required."),
    item("closes", "Registration closing time", Boolean(season.registrationClosesAt), true, "Closing time is separate from the roster lock and the first ball."),
    item("window-order", "Opening time before closing time", windowOrdered, bothWindowTimes, "Both times are compared in IST once they are entered."),
    item("fee", "Fee decided, including a deliberate zero for a free event", feeChosen, false, "A blank fee is not free. Registration can open before a fee is set, and no payment is collected until then."),
    item(
      "upi",
      "Payee and UPI ID when a fee is charged",
      upiReady,
      false,
      "Payment details are optional. No payment QR is shown until the fee, payee and UPI ID are saved.",
    ),
    item("rules", "Versioned playing conditions", Boolean(season.rulesVersion?.trim() && season.rulesText?.trim()), false, "Optional. When both a version and the text are saved, the form asks captains to acknowledge them."),
    item("lock", "Roster lock time", Boolean(season.rosterLockAt), false, "Until this is set, captains can keep editing before approval rules stop them."),
    item("cap", "Approved team limit", season.teamCap != null, false, "With no limit, capacity is not mentioned publicly."),
    item("squad", "Squad minimum and maximum", season.squadMin != null && season.squadMax != null, false, "Limits are enforced only after they are set."),
    item("eligibility", "Eligibility note", Boolean(season.eligibilityRules?.trim()), false, "The organizing batch is not treated as an eligibility rule."),
    item("hours", "Daily operating hours", Boolean(settings && settings.dayStartMinutes != null && settings.dayEndMinutes != null), false, "Needed before automatic placement. Manual fixtures can still be checked for overlaps."),
    item("duration", "Rest or transition settings", Boolean(settings && (settings.minRestMinutes != null || settings.transitionBufferMinutes != null)), false, "Unset checks are reported as assumptions, not invented numbers."),
  ];
}

function item(id: string, label: string, ok: boolean, blocking: boolean, detail: string): ChecklistItem {
  return { id, label, ok, blocking, detail };
}

export type SeasonPatch = Partial<{
  mapsUrl: string | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  registrationAnnounced: boolean;
  rosterLockAt: string | null;
  eventStartAt: string | null;
  feePaise: number | null;
  feeDueAt: string | null;
  payeeName: string | null;
  upiVpa: string | null;
  paymentNote: string | null;
  refundPolicy: string | null;
  teamCap: number | null;
  squadMin: number | null;
  squadMax: number | null;
  playingXi: number | null;
  ballType: string | null;
  eligibilityRules: string | null;
  oversByStage: string | null;
  oneTeamPerBatch: boolean;
  waitlistEnabled: boolean;
  rulesVersion: string | null;
  rulesText: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  privacyNote: string | null;
  cricheroesTournamentUrl: string | null;
  venueName: string;
  venueAddress: string;
  startDate: string;
  endDate: string;
  fixturesOn: string | null;
}>;

const seasonColumns: Record<keyof SeasonPatch, string> = {
  mapsUrl: "maps_url",
  registrationOpensAt: "registration_opens_at",
  registrationClosesAt: "registration_closes_at",
  registrationAnnounced: "registration_announced",
  rosterLockAt: "roster_lock_at",
  eventStartAt: "event_start_at",
  feePaise: "fee_paise",
  feeDueAt: "fee_due_at",
  payeeName: "payee_name",
  upiVpa: "upi_vpa",
  paymentNote: "payment_note",
  refundPolicy: "refund_policy",
  teamCap: "team_cap",
  squadMin: "squad_min",
  squadMax: "squad_max",
  playingXi: "playing_xi",
  ballType: "ball_type",
  eligibilityRules: "eligibility_rules",
  oversByStage: "overs_by_stage",
  oneTeamPerBatch: "one_team_per_batch",
  waitlistEnabled: "waitlist_enabled",
  rulesVersion: "rules_version",
  rulesText: "rules_text",
  contactName: "contact_name",
  contactEmail: "contact_email",
  contactPhone: "contact_phone",
  privacyNote: "privacy_note",
  cricheroesTournamentUrl: "cricheroes_tournament_url",
  venueName: "venue_name",
  venueAddress: "venue_address",
  startDate: "start_date",
  endDate: "end_date",
  fixturesOn: "fixtures_on",
};

export async function updateSeason(db: Db, actor: Actor, version: number, patch: SeasonPatch): Promise<Season> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  return db.tx(async (query) => {
    const current = await lockActiveSeason(query);
    if (current.version !== version) {
      throw new DomainError("These settings were updated in another session. Refresh and try again. Nothing was saved.", 409, "version_conflict");
    }
    const next = { ...current, ...patch };
    if (next.startDate && next.endDate && next.startDate > next.endDate) {
      throw new DomainError("The match start date cannot be after the match end date.");
    }
    if (next.squadMin != null && next.squadMax != null && next.squadMin > next.squadMax) {
      throw new DomainError("The squad minimum cannot be higher than the maximum.");
    }
    if (next.feePaise != null && next.feePaise < 0) throw new DomainError("The fee cannot be negative.");
    if ((next.registrationOpensAt && next.registrationClosesAt) || patch.registrationOpensAt || patch.registrationClosesAt) {
      if (next.registrationOpensAt && next.registrationClosesAt) {
        const readiness = registrationReadiness(next);
        if (!readiness.ok) throw new DomainError(readiness.message, 422, "checklist");
      }
    }
    const keys = Object.keys(patch) as (keyof SeasonPatch)[];
    if (keys.length === 0) return current;
    const assignments = keys.map((key, index) => `${seasonColumns[key]} = $${index + 1}`);
    const params = keys.map((key) => patch[key] ?? null);
    params.push(current.id, version);
    const rows = await query.query(
      `update seasons set ${assignments.join(", ")}, version = version + 1, updated_at = now()
       where id = $${params.length - 1} and version = $${params.length} returning *`,
      params,
    );
    if (!rows[0]) throw new DomainError("These settings changed while saving. Nothing was saved.", 409, "version_conflict");
    const { writeAudit } = await import("./audit");
    await writeAudit(query, actor.id, "season.update", "season", current.id, { fields: keys });
    clearReadCache();
    return mapSeason(rows[0]);
  });
}

export async function getScheduleSettings(db: Queryable, seasonId: string): Promise<ScheduleSettings> {
  const rows = await db.query("select * from schedule_settings where season_id = $1", [seasonId]);
  if (!rows[0]) {
    return {
      seasonId,
      dayStartMinutes: null,
      dayEndMinutes: null,
      breakStartMinutes: null,
      breakEndMinutes: null,
      transitionBufferMinutes: null,
      minRestMinutes: null,
      version: 1,
    };
  }
  return mapSettings(rows[0]);
}

export function mapSettings(row: Row): ScheduleSettings {
  return {
    seasonId: requiredStr(row, "season_id"),
    dayStartMinutes: num(row, "day_start_minutes"),
    dayEndMinutes: num(row, "day_end_minutes"),
    breakStartMinutes: num(row, "break_start_minutes"),
    breakEndMinutes: num(row, "break_end_minutes"),
    transitionBufferMinutes: num(row, "transition_buffer_minutes"),
    minRestMinutes: num(row, "min_rest_minutes"),
    version: num(row, "version") ?? 1,
  };
}

export async function updateScheduleSettings(
  db: Db,
  actor: Actor,
  version: number,
  patch: Partial<Omit<ScheduleSettings, "seasonId" | "version">>,
): Promise<ScheduleSettings> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const season = await getActiveSeason(db);
  const rows = await db.query(
    `update schedule_settings set
      day_start_minutes = $1,
      day_end_minutes = $2,
      break_start_minutes = $3,
      break_end_minutes = $4,
      transition_buffer_minutes = $5,
      min_rest_minutes = $6,
      version = version + 1
     where season_id = $7 and version = $8
     returning *`,
    [
      patch.dayStartMinutes ?? null,
      patch.dayEndMinutes ?? null,
      patch.breakStartMinutes ?? null,
      patch.breakEndMinutes ?? null,
      patch.transitionBufferMinutes ?? null,
      patch.minRestMinutes ?? null,
      season.id,
      version,
    ],
  );
  if (!rows[0]) throw new DomainError("Schedule settings changed while saving. Nothing was saved.", 409, "version_conflict");
  return mapSettings(rows[0]);
}
