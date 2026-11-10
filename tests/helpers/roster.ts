import { createDb, migrate, type Db } from "../../lib/db";
import { seedDatabase } from "../../lib/seed";
import { upsertProfile } from "../../lib/accounts";
import { clearReadCache } from "../../lib/read-cache";
import { slugify } from "../../lib/format";
import type { Actor } from "../../lib/types";

/** The 18 approved NCL 2026 teams as the roster might spell them, including the four seeded 2025 teams. */
export const TEAM_NAMES = [
  "4s-11",
  "RCB United",
  "JNV Junglees",
  "Balehonnur Bulls",
  "Royal Challengers Balehonnur",
  "GTR",
  "The Elite",
  "TWENTY SIXers",
  "IX-ELEVENS",
  "Champions-11",
  "Balehonnur Blasters",
  "Navodaya Warriors",
  "Kalpavruksha XI",
  "Malnad Mavericks",
  "Sahyadri Strikers",
  "Tunga Titans",
  "Bhadra Blasters",
  "Hemavathi Hawks",
];

export async function freshDb(): Promise<Db> {
  clearReadCache();
  delete process.env.DATABASE_URL;
  delete process.env.PGLITE_DIR;
  process.env.DEMO_MODE = "false";
  Object.assign(process.env, { NODE_ENV: "test" });
  const db = await createDb();
  await migrate(db);
  await seedDatabase(db);
  return db;
}

export async function organizer(db: Db): Promise<Actor> {
  const actor = await upsertProfile(db, { email: "organizer@ncl.test", displayName: "Organizer" });
  await db.execute("update profiles set role = 'organizer' where id = $1", [actor.id]);
  return { ...actor, role: "organizer" };
}

export async function captain(db: Db): Promise<Actor> {
  return upsertProfile(db, { email: "captain@ncl.test", displayName: "Captain" });
}

/** Inserts approved registrations directly. Returns them in the order given. */
export async function seedRoster(db: Db, names: string[] = TEAM_NAMES, batches: Record<string, [number, number]> = {}): Promise<{ id: string; name: string }[]> {
  const season = await db.query<{ id: string }>("select id from seasons where year = 2026");
  const seasonId = (season[0] as { id: string }).id;
  const out: { id: string; name: string }[] = [];
  for (const [index, name] of names.entries()) {
    const owner = await upsertProfile(db, { email: `captain${index}-${slugify(name)}@ncl.test`, displayName: `${name} captain` });
    const batch = batches[name] ?? [2000 + (index % 10), 2007 + (index % 10)];
    const rows = await db.query<{ id: string }>(
      `insert into registrations (
         season_id, captain_user_id, status, team_name, slug, batch_admission_year, batch_leaving_year,
         captain_name, captain_email, publication_consent, reference
       ) values ($1,$2,'approved',$3,$4,$5,$6,$7,$8,true,$9) returning id`,
      [seasonId, owner.id, name, `${slugify(name)}-${index}`, batch[0], batch[1], `${name} captain`, `captain${index}@ncl.test`, `T-${index}`],
    );
    out.push({ id: (rows[0] as { id: string }).id, name });
  }
  return out;
}

export async function counts(db: Db): Promise<Record<string, number>> {
  const tables = ["draws", "groups", "group_memberships", "schedule_versions", "fixtures", "fixture_dependencies", "match_scores", "audit_events", "grounds", "draw_tiebreaks"];
  const out: Record<string, number> = {};
  for (const table of tables) {
    const rows = await db.query<{ n: number }>(`select count(*)::int as n from ${table}`);
    out[table] = rows[0]?.n ?? 0;
  }
  return out;
}

export const DAYS: [string, string] = ["2026-11-28", "2026-11-29"];
