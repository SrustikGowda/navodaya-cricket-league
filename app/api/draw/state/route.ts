import { getDb } from "@/lib/db";
import { getDrawState } from "@/lib/draw/service";
import { errorResponse, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Polling fallback for viewers that cannot hold a live stream. A few bytes: only whether a draw is published. */
export async function GET() {
  try {
    return json({ ...(await getDrawState(await getDb())), serverTime: new Date().toISOString() });
  } catch (error) {
    return errorResponse(error);
  }
}
