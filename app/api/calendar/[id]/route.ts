import { buildFixtureCalendar } from "@/lib/calendar";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { getPublicFixture } from "@/lib/public-data";
import { getActiveSeason } from "@/lib/season";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const db = await getDb();
    const fixture = await getPublicFixture(db, id);
    if (!fixture) return Response.json({ error: "That match is not on the published schedule." }, { status: 404 });
    const season = await getActiveSeason(db);
    const body = buildFixtureCalendar(fixture, season.venueName);
    return new Response(body, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `attachment; filename="ncl-${fixture.matchNumber ?? "match"}.ics"`,
        "cache-control": "no-cache",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
