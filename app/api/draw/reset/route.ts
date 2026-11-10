import { requireOrganizer } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { authorizeDrawPassword, resetOfficialDraw } from "@/lib/draw/service";
import { errorResponse, guardMutation, json, readJson } from "@/lib/http";
import { clientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Organizer reset of the official draw: organizer session, draw password, typed phrase and a reason. Audited. */
export async function POST(request: Request) {
  try {
    await guardMutation(request, "draw-reset");
    const actor = await requireOrganizer();
    const db = await getDb();
    const body = await readJson(request);
    await authorizeDrawPassword(db, actor, { password: String(body.password ?? ""), ip: clientKey(request), purpose: "reset" });
    const result = await resetOfficialDraw(db, actor, { reason: String(body.reason ?? ""), confirmation: String(body.confirmation ?? "") });
    return json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
