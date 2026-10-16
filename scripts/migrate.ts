import { createDb, migrate } from "../lib/db";
import { seedDatabase } from "../lib/seed";

const db = await createDb();
await migrate(db);
await seedDatabase(db);
console.log("Migrations applied.");
await db.close();
