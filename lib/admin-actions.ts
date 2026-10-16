import { getDb } from "./db";
import { DomainError } from "./errors";
import { saveAnnouncement, confirmAlias, listAnnouncements, listAudit, listHeritageQueue, listMedia, listSponsors, reviewHeritage, saveSponsor, updateArchive } from "./content";
import { recordRefund, rejectPayment, verifyPayment } from "./payments";
import { listRegistrations, overrideSquad, publishSquadChanges, removeRegistration, reviewRegistration } from "./registration";
import {
  addGround,
  addManualFixture,
  createGroup,
  ensureDraft,
  generateKnockout,
  generateRoundRobin,
  importFixtures,
  listAdminFixtures,
  listGrounds,
  listScheduleVersions,
  previewDelay,
  publishDelay,
  publishSchedule,
  restoreSchedule,
  checkSchedule,
  recordResult,
  clearResolution,
  setGroupMembers,
  updateMatchStatus,
} from "./schedule";
import { buildChecklist, getActiveSeason, getScheduleSettings, updateScheduleSettings, updateSeason, type SeasonPatch } from "./season";
import { publishStandings, standingsFromCsv, type StandingInput } from "./standings";
import type { Actor } from "./types";
import type { PlayerInput } from "./types";

export async function adminAction(actor: Actor, body: Record<string, unknown>) {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const db = await getDb();
  const action = String(body.action ?? "");
  if (action === "settings") {
    const season = await updateSeason(db, actor, numberField(body.version), seasonPatch(body.patch));
    const settings = await getScheduleSettings(db, season.id);
    return { season, checklist: buildChecklist(season, settings) };
  }
  if (action === "schedule-settings") {
    return {
      settings: await updateScheduleSettings(db, actor, numberField(body.version), {
        dayStartMinutes: nullableNumber(body.dayStartMinutes),
        dayEndMinutes: nullableNumber(body.dayEndMinutes),
        breakStartMinutes: nullableNumber(body.breakStartMinutes),
        breakEndMinutes: nullableNumber(body.breakEndMinutes),
        transitionBufferMinutes: nullableNumber(body.transitionBufferMinutes),
        minRestMinutes: nullableNumber(body.minRestMinutes),
      }),
    };
  }
  if (action === "review") {
    const decision = String(body.decision ?? "");
    if (!["approve", "waitlist", "request_changes", "reject"].includes(decision)) throw new DomainError("Choose a review decision.");
    return {
      registration: await reviewRegistration(db, actor, String(body.id), decision as "approve", String(body.reason ?? "")),
    };
  }
  if (action === "remove-registration") {
    await removeRegistration(db, actor, String(body.id));
    return { ok: true };
  }
  if (action === "publish-squad") return { registration: await publishSquadChanges(db, actor, String(body.id)) };
  if (action === "override-squad") {
    return { registration: await overrideSquad(db, actor, String(body.id), players(body.players), String(body.reason ?? "")) };
  }
  if (action === "verify-payment") return { payment: await verifyPayment(db, actor, String(body.attemptId)) };
  if (action === "reject-payment") return { payment: await rejectPayment(db, actor, String(body.attemptId), String(body.reason ?? "")) };
  if (action === "refund") {
    return {
      payment: await recordRefund(db, actor, String(body.attemptId), {
        status: body.status === "refunded" ? "refunded" : "refund_pending",
        reason: String(body.reason ?? ""),
        refundReference: typeof body.refundReference === "string" ? body.refundReference : null,
      }),
    };
  }
  if (action === "ground") return { ground: await addGround(db, actor, String(body.name ?? "")) };
  if (action === "group") return { group: await createGroup(db, actor, String(body.name ?? "")) };
  if (action === "group-members") {
    await setGroupMembers(db, actor, String(body.groupId), stringList(body.registrationIds));
    return { ok: true };
  }
  if (action === "fixture") {
    return {
      fixture: await addManualFixture(db, actor, {
        stage: typeof body.stage === "string" ? body.stage : "league",
        groundId: String(body.groundId ?? ""),
        teamA: String(body.teamA ?? ""),
        teamB: String(body.teamB ?? ""),
        startsAt: String(body.startsAt ?? ""),
        durationMinutes: numberField(body.durationMinutes),
        overs: nullableNumber(body.overs),
        reportingMinutesBefore: nullableNumber(body.reportingMinutesBefore),
        matchNumber: nullableNumber(body.matchNumber),
      }),
    };
  }
  if (action === "import-fixtures") return importFixtures(db, actor, String(body.csv ?? ""), body.replace === true);
  if (action === "round-robin") return generateRoundRobin(db, actor, { groupId: String(body.groupId), replace: body.replace === true, durationMinutes: numberField(body.durationMinutes) });
  if (action === "knockout") {
    return generateKnockout(db, actor, {
      registrationIds: stringList(body.registrationIds),
      groundId: String(body.groundId),
      startAt: String(body.startsAt),
      durationMinutes: numberField(body.durationMinutes),
      replace: body.replace === true,
    });
  }
  if (action === "check-schedule") return checkSchedule(db, actor);
  if (action === "publish-schedule") return publishSchedule(db, actor, String(body.note ?? ""));
  if (action === "restore-schedule") {
    await restoreSchedule(db, actor, String(body.versionId));
    return { ok: true };
  }
  if (action === "preview-delay") return previewDelay(db, actor, { groundId: String(body.groundId), from: String(body.from), delayMinutes: numberField(body.delayMinutes) });
  if (action === "publish-delay") {
    await publishDelay(db, actor, { groundId: String(body.groundId), from: String(body.from), delayMinutes: numberField(body.delayMinutes), note: String(body.note ?? "") });
    return { ok: true };
  }
  if (action === "status") {
    await updateMatchStatus(db, actor, String(body.fixtureId), String(body.status) as "scheduled", numberField(body.version));
    return { ok: true };
  }
  if (action === "result") {
    await recordResult(db, actor, String(body.fixtureId), {
      summary: String(body.summary ?? ""),
      source: body.source === "import" ? "import" : "manual",
      winnerRegistrationId: typeof body.winnerRegistrationId === "string" ? body.winnerRegistrationId : null,
      winnerLabel: typeof body.winnerLabel === "string" ? body.winnerLabel : null,
      scorecardUrl: typeof body.scorecardUrl === "string" ? body.scorecardUrl : null,
      livestreamUrl: typeof body.livestreamUrl === "string" ? body.livestreamUrl : null,
    });
    return { ok: true };
  }
  if (action === "resolve") {
    await clearResolution(db, actor, String(body.fixtureId), String(body.note ?? ""));
    return { ok: true };
  }
  if (action === "standings") {
    const rows = Array.isArray(body.rows) ? (body.rows as StandingInput[]) : standingsFromCsv(String(body.csv ?? "")).rows;
    const csvErrors = Array.isArray(body.rows) ? [] : standingsFromCsv(String(body.csv ?? "")).errors;
    if (csvErrors.length > 0) throw new DomainError(csvErrors.join(" "), 422, "standings");
    await publishStandings(db, actor, { rows, source: body.source === "import" ? "import" : "manual", note: typeof body.note === "string" ? body.note : null });
    return { ok: true };
  }
  if (action === "announcement") return saveAnnouncement(db, actor, { id: typeof body.id === "string" ? body.id : undefined, title: String(body.title ?? ""), body: String(body.body ?? ""), published: body.published === true });
  if (action === "sponsor") {
    await saveSponsor(db, actor, { id: typeof body.id === "string" ? body.id : undefined, name: String(body.name ?? ""), url: typeof body.url === "string" ? body.url : null, published: body.published === true });
    return { ok: true };
  }
  if (action === "archive") {
    const status = String(body.verificationStatus ?? "unverified");
    if (!["verified", "partial", "unverified"].includes(status)) throw new DomainError("Choose a verification status.");
    await updateArchive(db, actor, {
      editionNumber: numberField(body.editionNumber),
      year: nullableNumber(body.year),
      champion: typeof body.champion === "string" ? body.champion : null,
      runnerUp: typeof body.runnerUp === "string" ? body.runnerUp : null,
      venueNote: typeof body.venueNote === "string" ? body.venueNote : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl : null,
      verificationStatus: status as "verified",
    });
    return { ok: true };
  }
  if (action === "heritage") {
    await reviewHeritage(db, actor, String(body.id), body.status === "accepted" ? "accepted" : "rejected", String(body.note ?? ""));
    return { ok: true };
  }
  if (action === "alias") {
    await confirmAlias(db, actor, {
      alias: String(body.alias ?? ""),
      admissionYear: nullableNumber(body.admissionYear),
      leavingYear: nullableNumber(body.leavingYear),
      seasonYear: nullableNumber(body.seasonYear),
      notes: typeof body.notes === "string" ? body.notes : null,
    });
    return { ok: true };
  }
  if (action === "ensure-draft") return { versionId: await ensureDraft(db, actor) };
  throw new DomainError("That organizer action is not available.");
}

export async function adminSnapshot(actor: Actor) {
  const db = await getDb();
  const season = await getActiveSeason(db);
  const settings = await getScheduleSettings(db, season.id);
  const [registrations, fixtures, grounds, versions, announcements, sponsors, media, heritage, audit] = await Promise.all([
    listRegistrations(db, actor),
    listAdminFixtures(db, actor, "draft"),
    listGrounds(db, season.id),
    listScheduleVersions(db, actor),
    listAnnouncements(db, actor),
    listSponsors(db, actor),
    listMedia(db, actor),
    listHeritageQueue(db, actor),
    listAudit(db, actor),
  ]);
  const published = await listAdminFixtures(db, actor, "published");
  return {
    season,
    settings,
    checklist: buildChecklist(season, settings),
    registrations,
    fixtures,
    published,
    grounds,
    versions,
    announcements,
    sponsors,
    media,
    heritage,
    audit,
  };
}

function seasonPatch(value: unknown): SeasonPatch {
  const row = (value ?? {}) as Record<string, unknown>;
  const patch: SeasonPatch = {};
  const text = [
    "mapsUrl",
    "payeeName",
    "upiVpa",
    "paymentNote",
    "refundPolicy",
    "ballType",
    "eligibilityRules",
    "oversByStage",
    "rulesVersion",
    "rulesText",
    "contactName",
    "contactEmail",
    "contactPhone",
    "privacyNote",
    "cricheroesTournamentUrl",
    "venueName",
    "venueAddress",
    "startDate",
    "endDate",
    "fixturesOn",
  ] as const;
  for (const key of text) {
    if (!(key in row)) continue;
    const value = row[key] == null ? "" : String(row[key]).trim();
    if (key === "venueName" || key === "venueAddress") patch[key] = value;
    else if (key === "startDate" || key === "endDate") {
      if (value) patch[key] = value;
    } else patch[key] = value || null;
  }
  for (const key of ["registrationOpensAt", "registrationClosesAt", "rosterLockAt", "eventStartAt", "feeDueAt"] as const) {
    if (key in row) patch[key] = row[key] ? String(row[key]) : null;
  }
  for (const key of ["feePaise", "teamCap", "squadMin", "squadMax", "playingXi"] as const) {
    if (key in row) patch[key] = nullableNumber(row[key]);
  }
  if ("oneTeamPerBatch" in row) patch.oneTeamPerBatch = row.oneTeamPerBatch === true;
  if ("waitlistEnabled" in row) patch.waitlistEnabled = row.waitlistEnabled === true;
  if ("registrationAnnounced" in row) patch.registrationAnnounced = row.registrationAnnounced === true;
  return patch;
}

function numberField(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new DomainError("A number was missing. Nothing was saved.");
  return number;
}

function nullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new DomainError("Enter a whole number or leave the field blank.");
  return number;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function players(value: unknown): PlayerInput[] {
  if (!Array.isArray(value)) throw new DomainError("The squad could not be read.");
  return value.map((player) => {
    const row = player as Record<string, unknown>;
    return {
      name: String(row.name ?? ""),
      role: String(row.role ?? "batter") as PlayerInput["role"],
      batchLabel: row.batchLabel ? String(row.batchLabel) : null,
      jerseyNumber: row.jerseyNumber == null || row.jerseyNumber === "" ? null : Number(row.jerseyNumber),
      cricheroesUrl: row.cricheroesUrl ? String(row.cricheroesUrl) : null,
    };
  });
}
