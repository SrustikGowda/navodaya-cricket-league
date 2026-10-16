import { writeAudit } from "./audit";
import type { Db, Queryable } from "./db";
import { DomainError, isUniqueViolation } from "./errors";
import { num, requiredStr, str, type Row } from "./rows";
import { getActiveSeason, paymentCollectionReady } from "./season";
import type { Actor } from "./types";

export type PaymentAttempt = {
  id: string;
  seasonId: string;
  registrationId: string;
  amountPaise: number;
  transactionReference: string | null;
  receiptPath: string | null;
  status: string;
  note: string | null;
  rejectionReason: string | null;
  refundReference: string | null;
  verifiedAt: string | null;
  createdAt: string | null;
};

export function mapPayment(row: Row): PaymentAttempt {
  return {
    id: requiredStr(row, "id"),
    seasonId: requiredStr(row, "season_id"),
    registrationId: requiredStr(row, "registration_id"),
    amountPaise: num(row, "amount_paise") ?? 0,
    transactionReference: str(row, "transaction_reference"),
    receiptPath: str(row, "receipt_path"),
    status: requiredStr(row, "status"),
    note: str(row, "note"),
    rejectionReason: str(row, "rejection_reason"),
    refundReference: str(row, "refund_reference"),
    verifiedAt: str(row, "verified_at"),
    createdAt: str(row, "created_at"),
  };
}

export async function listPaymentsForRegistration(db: Queryable, registrationId: string): Promise<PaymentAttempt[]> {
  const rows = await db.query(
    "select * from payment_attempts where registration_id = $1 order by created_at desc",
    [registrationId],
  );
  return rows.map(mapPayment);
}

export async function submitPaymentEvidence(
  db: Db,
  actor: Actor,
  registrationId: string,
  input: { transactionReference: string; receiptPath?: string | null; note?: string | null },
): Promise<PaymentAttempt> {
  const reference = input.transactionReference.trim();
  if (reference.length < 4) throw new DomainError("Enter the UPI transaction reference. A screenshot alone is not proof of payment.");
  return db.tx(async (query) => {
    const season = await getActiveSeason(query);
    if (!paymentCollectionReady(season) || season.feePaise == null) {
      throw new DomainError("Payment collection is not open. No fee, payee and UPI ID are configured.", 422, "payment_unconfigured");
    }
    const registrations = await query.query(
      "select id, status, captain_user_id from registrations where id = $1 and season_id = $2 and captain_user_id = $3",
      [registrationId, season.id, actor.id],
    );
    const registration = registrations[0];
    if (!registration) throw new DomainError("Registration not found.", 404, "not_found");
    if (registration.status === "waitlisted") {
      throw new DomainError("Waitlisted teams are not asked to pay unless an organizer changes that.");
    }
    if (registration.status !== "approved") throw new DomainError("Payment opens after the team is approved.");
    const rows = await query.query(
      `insert into payment_attempts (
        season_id, registration_id, amount_paise, transaction_reference, receipt_path, status, note, submitted_by
      ) values ($1,$2,$3,$4,$5,'submitted',$6,$7) returning *`,
      [season.id, registrationId, season.feePaise, reference, input.receiptPath ?? null, input.note ?? null, actor.id],
    );
    await writeAudit(query, actor.id, "payment.submit", "payment", String(rows[0]?.id ?? ""), {
      registrationId,
    });
    return mapPayment(rows[0] as Row);
  });
}

export async function verifyPayment(db: Db, actor: Actor, attemptId: string): Promise<PaymentAttempt> {
  if (actor.role !== "organizer") throw new DomainError("Only an organizer can verify a payment, after checking the receiving account.", 403, "forbidden");
  try {
    return await db.tx(async (query) => {
      const rows = await query.query("select * from payment_attempts where id = $1 for update", [attemptId]);
      if (!rows[0]) throw new DomainError("Payment attempt not found.", 404, "not_found");
      const current = mapPayment(rows[0]);
      if (current.status === "verified") return current;
      if (current.status !== "submitted") throw new DomainError("Only a submitted payment reference can be verified.");
      if (!current.transactionReference) throw new DomainError("This attempt has no transaction reference.");
      const duplicate = await query.query(
        `select id from payment_attempts
         where season_id = $1 and status = 'verified' and lower(transaction_reference) = lower($2) and id <> $3`,
        [current.seasonId, current.transactionReference, current.id],
      );
      if (duplicate.length > 0) throw new DomainError("That transaction reference is already verified on another payment.", 409, "duplicate_reference");
      const updated = await query.query(
        `update payment_attempts
         set status = 'verified', verified_by = $1, verified_at = now()
         where id = $2 returning *`,
        [actor.id, current.id],
      );
      await writeAudit(query, actor.id, "payment.verify", "payment", current.id, {
        registrationId: current.registrationId,
        transactionReference: current.transactionReference,
      });
      return mapPayment(updated[0] as Row);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError("That transaction reference is already verified on another payment.", 409, "duplicate_reference");
    }
    throw error;
  }
}

export async function rejectPayment(db: Db, actor: Actor, attemptId: string, reason: string): Promise<PaymentAttempt> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  if (reason.trim().length < 3) throw new DomainError("A rejection reason is required.");
  const rows = await db.query(
    `update payment_attempts set status = 'rejected', rejection_reason = $1
     where id = $2 and status = 'submitted' returning *`,
    [reason.trim(), attemptId],
  );
  if (!rows[0]) throw new DomainError("Only a submitted payment can be rejected.");
  await writeAudit(db, actor.id, "payment.reject", "payment", attemptId, { reason: reason.trim() });
  return mapPayment(rows[0]);
}

export async function recordRefund(
  db: Db,
  actor: Actor,
  attemptId: string,
  input: { status: "refund_pending" | "refunded"; reason: string; refundReference?: string | null },
): Promise<PaymentAttempt> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  if (input.reason.trim().length < 3) throw new DomainError("A refund reason is required. This application does not transfer the money.");
  if (input.status === "refunded" && !input.refundReference?.trim()) {
    throw new DomainError("Record the refund reference. The site does not send the refund itself.");
  }
  const rows = await db.query(
    `update payment_attempts
     set status = $1, rejection_reason = $2, refund_reference = $3
     where id = $4 and status in ('verified', 'refund_pending')
     returning *`,
    [input.status, input.reason.trim(), input.refundReference?.trim() || null, attemptId],
  );
  if (!rows[0]) throw new DomainError("Refunds can be recorded only against a verified payment.");
  await writeAudit(db, actor.id, "payment.refund", "payment", attemptId, {
    status: input.status,
    reason: input.reason.trim(),
    refundReference: input.refundReference ?? null,
  });
  return mapPayment(rows[0]);
}

export async function listAllPayments(db: Queryable, actor: Actor): Promise<(PaymentAttempt & { teamName: string; reference: string | null })[]> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const season = await getActiveSeason(db);
  const rows = await db.query(
    `select p.*, r.team_name, r.reference as registration_reference
     from payment_attempts p
     join registrations r on r.id = p.registration_id
     where p.season_id = $1
     order by p.created_at desc`,
    [season.id],
  );
  return rows.map((row) => ({
    ...mapPayment(row),
    teamName: requiredStr(row, "team_name"),
    reference: str(row, "registration_reference"),
  }));
}

export async function assertReceiptAccess(db: Queryable, actor: Actor, attemptId: string): Promise<PaymentAttempt> {
  const rows = await db.query("select * from payment_attempts where id = $1", [attemptId]);
  if (!rows[0]) throw new DomainError("Receipt not found.", 404, "not_found");
  const payment = mapPayment(rows[0]);
  if (actor.role === "organizer") return payment;
  const owner = await db.query("select captain_user_id from registrations where id = $1", [payment.registrationId]);
  if (owner[0]?.captain_user_id !== actor.id) throw new DomainError("Receipt not found.", 404, "not_found");
  return payment;
}
