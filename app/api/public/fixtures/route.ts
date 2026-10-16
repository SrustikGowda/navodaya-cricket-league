import { getDb } from "@/lib/db";
import { json } from "@/lib/http";
import { listPublicFixtures, scheduleMeta } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const db = await getDb();
  const fixtures = await listPublicFixtures(db, {
    day: url.searchParams.get("day") ?? undefined,
    team: url.searchParams.get("team") ?? undefined,
    stage: url.searchParams.get("stage") ?? undefined,
    ground: url.searchParams.get("ground") ?? undefined,
  });
  return json({ fixtures, meta: await scheduleMeta(db) }, 200);
}
