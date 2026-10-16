import { cookies } from "next/headers";
import { upsertProfile } from "./accounts";
import { getDb } from "./db";
import { DomainError } from "./errors";
import { localAuthAllowed, supabaseAuthConfigured } from "./integrations";
import { str, type Row } from "./rows";
import { openSession, sessionSecret } from "./session";
import type { Actor } from "./types";

export async function getActor(): Promise<Actor | null> {
  const supabaseUser = await readSupabaseUser();
  const db = await getDb();
  if (supabaseUser?.email) {
    return upsertProfile(db, { id: supabaseUser.id, email: supabaseUser.email });
  }
  const secret = sessionSecret();
  const token = (await cookies()).get("ncl_session")?.value;
  if (!secret || !token) return null;
  const session = openSession(token, secret);
  if (!session) return null;
  const rows = await db.query<Row>("select * from profiles where id = $1", [session.uid]);
  if (!rows[0]) return null;
  const role = rows[0].role === "organizer" ? "organizer" : "captain";
  if (role !== "organizer" && !localAuthAllowed()) return null;
  return {
    id: String(rows[0].id),
    email: String(rows[0].email),
    role,
    displayName: str(rows[0], "display_name"),
  };
}

export async function requireOrganizer(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new DomainError("Sign in is required.", 401, "unauthorized");
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  return actor;
}

async function readSupabaseUser(): Promise<{ id: string; email: string } | null> {
  if (!supabaseAuthConfigured()) return null;
  const { createServerClient } = await import("@supabase/ssr");
  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server components cannot always write cookies. The callback route can.
        }
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user?.email || !data.user.id) return null;
  return { id: data.user.id, email: data.user.email };
}
