import { getActor } from "@/lib/auth";
import { looksLikeBot, recordAction, visitorId } from "@/lib/analytics";
import { getDb } from "@/lib/db";
import { previewTrial } from "@/lib/draw/service";
import { errorResponse, guardMutation, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Trial run. Public and repeatable. It only reads the approved roster and returns a complete draw; it never
 * writes to the database, so it cannot create, change or publish any official record.
 */
export async function POST(request: Request) {
  try {
    await guardMutation(request, "draw-trial");
    const db = await getDb();
    const plan = await previewTrial(db);
    // Counted here, on the server, so every trial is seen. A failure to count never affects the trial itself.
    try {
      if (!looksLikeBot(request) && (await getActor())?.role !== "organizer") {
        await recordAction(db, { name: "trial_run", visitor: visitorId(request), device: request.headers.get("sec-ch-ua-mobile") === "?1" ? "phone" : "desktop" });
      }
    } catch {
      // Analytics must never break the draw.
    }
    return json({ mode: "trial", plan, serverTime: new Date().toISOString() });
  } catch (error) {
    return errorResponse(error);
  }
}
