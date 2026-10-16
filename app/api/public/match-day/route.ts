import { getDb } from "@/lib/db";
import { buildMatchDay } from "@/lib/match-day";
import { listPublicAnnouncements, listPublicFixtures } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  const fixtures = await listPublicFixtures(db);
  return Response.json(
    { ...buildMatchDay(fixtures), announcements: await listPublicAnnouncements(db), syncedAt: new Date().toISOString() },
    { headers: { "cache-control": "public, max-age=0, must-revalidate" } },
  );
}
