import { requireOrganizer } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { toCsv } from "@/lib/csv";
import { errorResponse } from "@/lib/http";
import { listAllPayments } from "@/lib/payments";
import { listRegistrations } from "@/lib/registration";
import { listAdminFixtures } from "@/lib/schedule";
import { formatInrFromPaise } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ kind: string }> }) {
  try {
    const actor = await requireOrganizer();
    const { kind } = await context.params;
    const db = await getDb();
    let csv = "";
    if (kind === "registrations") {
      const rows = await listRegistrations(db, actor);
      csv = toCsv(
        ["reference", "team", "batch", "captain", "email", "phone", "status", "review"],
        rows.map((row) => [
          row.reference ?? "",
          row.teamName,
          row.batchAdmissionYear ? `${row.batchAdmissionYear}-${row.batchLeavingYear}` : "",
          row.captainName,
          row.captainEmail,
          row.captainPhone,
          row.status,
          row.reviewReason ?? "",
        ]),
      );
    } else if (kind === "payments") {
      const rows = await listAllPayments(db, actor);
      csv = toCsv(
        ["registration_reference", "team", "amount_paise", "amount_inr", "transaction_reference", "status", "created_at", "verified_at", "refund_reference"],
        rows.map((row) => [
          row.reference ?? "",
          row.teamName,
          String(row.amountPaise),
          formatInrFromPaise(row.amountPaise),
          row.transactionReference ?? "",
          row.status,
          row.createdAt ?? "",
          row.verifiedAt ?? "",
          row.refundReference ?? "",
        ]),
      );
    } else if (kind === "fixtures") {
      const rows = await listAdminFixtures(db, actor, "published");
      csv = toCsv(
        ["match_number", "stage", "ground", "team_a", "team_b", "starts_at", "duration_minutes", "status", "sequence", "change_note"],
        rows.map((row) => [
          String(row.matchNumber ?? ""),
          row.stage ?? "",
          row.groundName ?? "",
          row.teamALabel,
          row.teamBLabel,
          row.startsAt ?? "",
          String(row.durationMinutes ?? ""),
          row.status,
          String(row.calendarSequence),
          row.changeNote ?? "",
        ]),
      );
    } else {
      throw new DomainError("That export is not available.", 404, "not_found");
    }
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="ncl-2026-${kind}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
