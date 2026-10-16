import type { Queryable } from "./db";
import { DomainError } from "./errors";
import { str, type Row } from "./rows";
import type { Actor } from "./types";

export async function upsertProfile(
  db: Queryable,
  input: { id?: string | null; email: string; displayName?: string | null },
): Promise<Actor> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new DomainError("Enter a valid email address.");
  const existing = await db.query<Row>("select * from profiles where lower(email) = $1", [email]);
  if (existing[0]) {
    const refreshed = await db.query<Row>("select * from profiles where id = $1", [existing[0].id]);
    return mapActor(refreshed[0] as Row);
  }
  const created = await db.query<Row>(
    `insert into profiles (id, email, display_name, role)
     values (coalesce($1::uuid, gen_random_uuid()), $2, $3, 'captain')
     returning *`,
    [input.id ?? null, email, input.displayName ?? null],
  );
  return mapActor(created[0] as Row);
}

function mapActor(row: Row): Actor {
  return {
    id: String(row.id),
    email: String(row.email),
    role: row.role === "organizer" ? "organizer" : "captain",
    displayName: str(row, "display_name"),
  };
}
