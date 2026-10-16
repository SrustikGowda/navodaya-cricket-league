import { parseCsv } from "./csv";
import { getDb } from "./db";
import { DomainError } from "./errors";
import { listPaymentsForRegistration, recordRefund, rejectPayment, submitPaymentEvidence, verifyPayment } from "./payments";
import {
  createDraft,
  getOwnRegistration,
  replacePlayers,
  submitRegistration,
  updateRegistration,
  validatePlayerList,
  withdrawRegistration,
} from "./registration";
import { getActiveSeason, paymentCollectionReady } from "./season";
import { PLAYER_ROLES, type Actor, type PlayerInput } from "./types";
import { upiDeepLink } from "./upi";

export async function captainAction(actor: Actor, body: Record<string, unknown>) {
  const db = await getDb();
  const action = String(body.action ?? "");
  if (action === "draft") {
    const registration = await createDraft(db, actor);
    return { registration };
  }
  if (action === "save") {
    const registration = await updateRegistration(db, actor, requiredId(body), requiredVersion(body), {
      teamName: optionalString(body.teamName),
      batchAdmissionYear: optionalNumber(body.batchAdmissionYear),
      batchLeavingYear: optionalNumber(body.batchLeavingYear),
      cricheroesTeamUrl: optionalNullableString(body.cricheroesTeamUrl),
      captainName: optionalString(body.captainName),
      captainPhone: optionalString(body.captainPhone),
      viceCaptainName: optionalNullableString(body.viceCaptainName),
      viceCaptainPhone: optionalNullableString(body.viceCaptainPhone),
      publicationConsent: typeof body.publicationConsent === "boolean" ? body.publicationConsent : undefined,
      rulesAcknowledged: body.rulesAcknowledged === true,
    });
    return { registration };
  }
  if (action === "players") {
    const registration = await replacePlayers(db, actor, requiredId(body), requiredVersion(body), playersFrom(body.players));
    return { registration };
  }
  if (action === "preview-csv") {
    const season = await getActiveSeason(db);
    const parsed = parseCsv(String(body.csv ?? ""));
    if (parsed.errors.length > 0) throw new DomainError(parsed.errors.join(" "), 422, "csv");
    const players = parsed.rows.map((row) => ({
      name: row.name ?? "",
      batchLabel: row.batch || null,
      role: row.role as PlayerInput["role"],
      jerseyNumber: row.jersey ? Number(row.jersey) : null,
      cricheroesUrl: row.cricheroes_url || null,
    }));
    return { players: validatePlayerList(players, season) };
  }
  if (action === "submit") {
    const result = await submitRegistration(db, actor, requiredId(body), String(body.idempotencyKey ?? ""), requiredVersion(body));
    return result;
  }
  if (action === "withdraw") {
    return { registration: await withdrawRegistration(db, actor, requiredId(body)) };
  }
  if (action === "payment") {
    const attempt = await submitPaymentEvidence(db, actor, requiredId(body), {
      transactionReference: String(body.transactionReference ?? ""),
      receiptPath: typeof body.receiptPath === "string" ? body.receiptPath : null,
      note: typeof body.note === "string" ? body.note : null,
    });
    return { attempt };
  }
  throw new DomainError("That action is not available.");
}

export async function captainDashboard(actor: Actor) {
  const db = await getDb();
  const season = await getActiveSeason(db);
  const registration = await getOwnRegistration(db, actor);
  const payments = registration ? await listPaymentsForRegistration(db, registration.id) : [];
  const instructions =
    registration && season.feePaise && season.feePaise > 0 && paymentCollectionReady(season) && registration.status === "approved"
      ? {
          payeeName: season.payeeName,
          upiVpa: season.upiVpa,
          amountPaise: season.feePaise,
          note: registration.reference ? `NCL ${registration.reference}` : "NCL 2026",
          link: upiDeepLink({
            vpa: season.upiVpa ?? "",
            payee: season.payeeName ?? "",
            paise: season.feePaise,
            note: registration.reference ? `NCL ${registration.reference}` : "NCL 2026",
          }),
        }
      : null;
  return { season, registration, payments, instructions, roles: PLAYER_ROLES };
}

function requiredId(body: Record<string, unknown>): string {
  const id = String(body.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DomainError("The registration could not be found.", 404, "not_found");
  return id;
}

function requiredVersion(body: Record<string, unknown>): number {
  const version = Number(body.version);
  if (!Number.isInteger(version)) throw new DomainError("Refresh the page and try again. Nothing was saved.", 409, "version_conflict");
  return version;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value == null) return value as null | undefined;
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value == null || value === "") return value === "" ? null : (value as null | undefined);
  const number = Number(value);
  return Number.isInteger(number) ? number : undefined;
}

function playersFrom(value: unknown): PlayerInput[] {
  if (!Array.isArray(value)) throw new DomainError("The squad could not be read. Nothing was saved.");
  return value.map((player) => {
    const row = player as Record<string, unknown>;
    return {
      name: String(row.name ?? ""),
      batchLabel: row.batchLabel ? String(row.batchLabel) : null,
      role: String(row.role ?? "") as PlayerInput["role"],
      jerseyNumber: row.jerseyNumber == null || row.jerseyNumber === "" ? null : Number(row.jerseyNumber),
      cricheroesUrl: row.cricheroesUrl ? String(row.cricheroesUrl) : null,
    };
  });
}

export async function refundAction(actor: Actor, body: Record<string, unknown>) {
  return recordRefund(await getDb(), actor, String(body.attemptId ?? ""), {
    status: body.status === "refunded" ? "refunded" : "refund_pending",
    reason: String(body.reason ?? ""),
    refundReference: typeof body.refundReference === "string" ? body.refundReference : null,
  });
}

export async function verifyAction(actor: Actor, attemptId: string) {
  return verifyPayment(await getDb(), actor, attemptId);
}

export async function rejectAction(actor: Actor, attemptId: string, reason: string) {
  return rejectPayment(await getDb(), actor, attemptId, reason);
}
