import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { errorResponse, guardMutation, json, readJson } from "@/lib/http";
import { registrationFollowUp, submitPublicRegistration } from "@/lib/registration";
import { getActiveSeason } from "@/lib/season";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await guardMutation(request, "register");
    const body = await readJson(request);
    const db = await getDb();
    const result = await submitPublicRegistration(db, {
      teamName: typeof body.teamName === "string" ? body.teamName : "",
      batchAdmissionYear: year(body.batchAdmissionYear),
      batchLeavingYear: year(body.batchLeavingYear),
      captainName: typeof body.captainName === "string" ? body.captainName : "",
      captainEmail: typeof body.captainEmail === "string" ? body.captainEmail : "",
      captainPhone: typeof body.captainPhone === "string" ? body.captainPhone : "",
      viceCaptainName: typeof body.viceCaptainName === "string" ? body.viceCaptainName : "",
      viceCaptainPhone: typeof body.viceCaptainPhone === "string" ? body.viceCaptainPhone : "",
      publicationConsent: body.publicationConsent === true,
      feeConsent: body.feeConsent === true,
      rulesAcknowledged: body.rulesAcknowledged === true,
    });
    const season = await getActiveSeason(db);
    return json({
      ok: true,
      reference: result.registration.reference,
      status: result.registration.status,
      alreadySubmitted: result.alreadySubmitted,
      teamName: result.registration.teamName,
      nextAction: registrationFollowUp(season, result.alreadySubmitted),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function year(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d{4}$/.test(value)) return Number(value);
  throw new DomainError("Add the batch admission and leaving years.", 422, "incomplete");
}
