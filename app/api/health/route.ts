import { getDb } from "@/lib/db";
import { integrationStatus } from "@/lib/integrations";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  await db.query("select 1 as ok");
  return json({ ok: true, ...integrationStatus() });
}
