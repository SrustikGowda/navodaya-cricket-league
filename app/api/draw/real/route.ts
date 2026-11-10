import { requireOrganizer } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadBoard } from "@/lib/draw/board";
import { authorizeDrawPassword, runOfficialDraw } from "@/lib/draw/service";
import { errorResponse, guardMutation, json, readJson } from "@/lib/http";
import { clientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Step two of a real run. Needs an organizer session AND the draw password again, so the confirmation
 * cannot be replayed from a stale tab. The draw itself is created, validated and saved on the server in
 * one transaction; a second call cannot replace it.
 */
export async function POST(request: Request) {
  try {
    await guardMutation(request, "draw-real");
    const actor = await requireOrganizer();
    const db = await getDb();
    const body = await readJson(request);
    await authorizeDrawPassword(db, actor, { password: String(body.password ?? ""), ip: clientKey(request), purpose: "real_run" });
    const { draw, replayed } = await runOfficialDraw(db, actor, { requestId: String(body.requestId ?? "") });
    const board = await loadBoard(db);
    return json({ ok: true, replayed, draw, board });
  } catch (error) {
    return errorResponse(error);
  }
}
