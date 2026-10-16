import { getDb } from "@/lib/db";
import { scheduleMeta } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await scheduleMeta(await getDb()), {
    headers: { "cache-control": "public, max-age=0, must-revalidate" },
  });
}
