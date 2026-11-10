import { loadBoard } from "@/lib/draw/board";
import { getDb } from "@/lib/db";
import { errorResponse, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** The saved official draw, its live fixtures and standings. Public: this is the published result. */
export async function GET() {
  try {
    return json(await loadBoard(await getDb()));
  } catch (error) {
    return errorResponse(error);
  }
}
