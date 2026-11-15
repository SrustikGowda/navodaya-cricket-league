import { getActor } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { isAction, looksLikeBot, normalizePath, recordAction, recordView, visitorId } from "@/lib/analytics";
import { assertSameOrigin, errorResponse, json, readJson } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Counts a page view or one of a short list of actions. Nothing personal is stored (see lib/analytics). Visits by
 * signed-in organizers and by obvious bots are not counted. It never fails loudly: a visitor must not notice it.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    // Many phones on one venue Wi-Fi share an address, so this ceiling is high. Beyond it a view is simply not counted.
    if (!rateLimit(`track:${clientKey(request)}`, 600, 60_000)) return json({ ok: true, counted: false });
    const body = await readJson(request);
    if (looksLikeBot(request)) return json({ ok: true, counted: false });
    if ((await getActor())?.role === "organizer") return json({ ok: true, counted: false });
    const device = body.device === "phone" ? "phone" : "desktop";
    const visitor = visitorId(request);
    const db = await getDb();
    if (body.type === "view") {
      const path = normalizePath(body.path);
      if (!path) return json({ ok: true, counted: false });
      await recordView(db, { path, visitor, device });
      return json({ ok: true, counted: true });
    }
    if (body.type === "action" && isAction(body.name)) {
      await recordAction(db, { name: body.name, visitor, device });
      return json({ ok: true, counted: true });
    }
    return json({ ok: true, counted: false });
  } catch (error) {
    return errorResponse(error);
  }
}
