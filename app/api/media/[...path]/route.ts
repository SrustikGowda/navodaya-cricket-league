import { getDb } from "@/lib/db";
import { readStoredFile } from "@/lib/files";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await context.params;
  const stored = `local:public:${parts.at(-1) ?? ""}`;
  const file = await readStoredFile(stored);
  if (!file) return new Response("Not found", { status: 404 });
  const db = await getDb();
  const known = await db.query(
    `select path from media_assets where path = $1 and published = true and consent = true
     union select logo_path from registrations where logo_path = $1 and status = 'approved'
     union select logo_path from sponsors where logo_path = $1 and published = true`,
    [stored],
  );
  if (known.length === 0) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), { headers: { "content-type": file.contentType, "cache-control": "public, max-age=3600" } });
}
