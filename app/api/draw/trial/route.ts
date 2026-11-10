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
    const plan = await previewTrial(await getDb());
    return json({ mode: "trial", plan, serverTime: new Date().toISOString() });
  } catch (error) {
    return errorResponse(error);
  }
}
