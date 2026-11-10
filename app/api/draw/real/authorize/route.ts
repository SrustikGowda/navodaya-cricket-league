import { requireOrganizer } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { authorizeDrawPassword, getOfficialDraw } from "@/lib/draw/service";
import { DomainError } from "@/lib/errors";
import { errorResponse, guardMutation, json, readJson } from "@/lib/http";
import { clientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Step one of a real run: an organizer proves the draw password. Nothing is drawn or saved here. */
export async function POST(request: Request) {
  try {
    await guardMutation(request, "draw-authorize");
    const actor = await requireOrganizer();
    const db = await getDb();
    if (await getOfficialDraw(db)) {
      throw new DomainError("The official draw has already been published and cannot be run again.", 409, "draw_exists");
    }
    const body = await readJson(request);
    await authorizeDrawPassword(db, actor, { password: String(body.password ?? ""), ip: clientKey(request), purpose: "real_run" });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
