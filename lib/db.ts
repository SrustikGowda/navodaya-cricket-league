import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { seedDatabase } from "./seed";

export type Row = Record<string, unknown>;

export type Queryable = {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  execute(text: string, params?: unknown[]): Promise<number>;
};

export type Db = Queryable & {
  tx<T>(fn: (query: Queryable) => Promise<T>): Promise<T>;
  execScript(sql: string): Promise<void>;
  close(): Promise<void>;
};

type GlobalDb = typeof globalThis & { __nclDb?: Promise<Db> };
const globalForDb = globalThis as GlobalDb;

export async function getDb(): Promise<Db> {
  if (!globalForDb.__nclDb) {
    globalForDb.__nclDb = openApplicationDatabase();
  }
  return globalForDb.__nclDb;
}

async function openApplicationDatabase(): Promise<Db> {
  const db = await createDb();
  await migrate(db);
  await seedDatabase(db);
  return db;
}

export async function createDb(): Promise<Db> {
  if (process.env.DATABASE_URL) return createPostgres(process.env.DATABASE_URL);
  return createEmbedded();
}

async function createEmbedded(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = process.env.PGLITE_DIR;
  if (dataDir) await mkdir(dataDir, { recursive: true });
  const client = new PGlite(dataDir || undefined);
  await client.waitReady;

  const wrap = (runner: { query: typeof client.query; exec: typeof client.exec }): Queryable & {
    execScript(sql: string): Promise<void>;
  } => ({
    async query<T = Row>(text: string, params: unknown[] = []) {
      const result = await runner.query<T>(text, params);
      return result.rows;
    },
    async execute(text: string, params: unknown[] = []) {
      const result = await runner.query(text, params);
      return result.rowCount ?? result.affectedRows ?? 0;
    },
    async execScript(sql: string) {
      await runner.exec(sql);
    },
  });

  const root = wrap(client);
  return {
    ...root,
    tx(fn) {
      return client.transaction(async (tx) => fn(wrap(tx)));
    },
    async close() {
      await client.close();
    },
  };
}

async function createPostgres(url: string): Promise<Db> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(url, { max: 5, prepare: false, idle_timeout: 60, connect_timeout: 10 });

  const wrap = (runner: { unsafe: typeof sql.unsafe }): Queryable & { execScript(script: string): Promise<void> } => ({
    async query<T = Row>(text: string, params: unknown[] = []) {
      const rows = await runner.unsafe(text, params as never[]);
      return [...rows] as T[];
    },
    async execute(text: string, params: unknown[] = []) {
      const rows = await runner.unsafe(text, params as never[]);
      return rows.count ?? 0;
    },
    async execScript(script: string) {
      await runner.unsafe(script);
    },
  });

  const root = wrap(sql);
  return {
    ...root,
    tx(fn) {
      return sql.begin(async (tx) => fn(wrap(tx))) as Promise<never>;
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

export async function migrate(db: Db): Promise<void> {
  await db.execScript(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  const directory = path.join(process.cwd(), "supabase", "migrations");
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const existing = await db.query<{ id: string }>("select id from schema_migrations where id = $1", [file]);
    if (existing.length > 0) continue;
    const script = await readFile(path.join(directory, file), "utf8");
    await db.execScript(script);
    await db.execute("insert into schema_migrations (id) values ($1)", [file]);
  }
}
