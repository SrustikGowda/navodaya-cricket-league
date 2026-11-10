// Local development only: approves 18 sample teams so the Fixtures page can be tried end to end.
// Refuses to run against a hosted database or in production. Usage: PGLITE_DIR=.data/pglite npx tsx scripts/seed-roster.ts

import { createDb, migrate } from "../lib/db";
import { seedDatabase } from "../lib/seed";
import { upsertProfile } from "../lib/accounts";
import { slugify } from "../lib/format";

if (process.env.DATABASE_URL || process.env.NODE_ENV === "production") {
  console.error("seed-roster only runs against the embedded local database.");
  process.exit(1);
}

const NAMES = [
  "4s-11 (2004–2011)", "RCB United", "Jnv Junglees", "Balehonnur Bulls (2005–12)", "Royal Challengers Balehonnur", "GTR",
  "The Elite", "TWENTY SIXers", "IX-ELEVENS", "Champions-11", "Balehonnur Blasters", "Navodaya Warriors", "Kalpavruksha XI",
  "Malnad Mavericks", "Sahyadri Strikers", "Tunga Titans", "Bhadra Blasters", "Hemavathi Hawks",
];

async function main() {
  const db = await createDb();
  await migrate(db);
  await seedDatabase(db);
  const season = await db.query<{ id: string }>("select id from seasons where year = 2026");
  const seasonId = (season[0] as { id: string }).id;
  const have = await db.query<{ n: number }>("select count(*)::int as n from registrations where season_id = $1 and status = 'approved'", [seasonId]);
  if ((have[0]?.n ?? 0) > 0) {
    console.log(`Already ${have[0]?.n} approved teams. Nothing added.`);
  } else {
    for (const [index, name] of NAMES.entries()) {
      const owner = await upsertProfile(db, { email: `sample${index}@ncl.test`, displayName: `${name} captain` });
      await db.execute(
        `insert into registrations (season_id, captain_user_id, status, team_name, slug, batch_admission_year, batch_leaving_year,
           captain_name, captain_email, publication_consent, reference)
         values ($1,$2,'approved',$3,$4,$5,$6,$7,$8,true,$9)`,
        [seasonId, owner.id, name, slugify(name), 1998 + index, 2005 + index, `${name} captain`, `sample${index}@ncl.test`, `SAMPLE-${index}`],
      );
    }
    console.log("Added 18 sample approved teams.");
  }
  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
