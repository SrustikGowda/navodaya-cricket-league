import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { upsertProfile } from "@/lib/accounts";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { errorResponse, guardMutation, json, readJson } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { sealSession, sessionSecret } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await guardMutation(request, "admin-password");
    if (!rateLimit(`admin-password:${clientKey(request)}`, 8, 10 * 60_000)) {
      throw new DomainError("Too many attempts. Wait and try again.", 429, "rate_limit");
    }
    const expected = process.env.ADMIN_PASSWORD ?? "";
    const secret = sessionSecret();
    if (!expected || !secret) {
      throw new DomainError("Organizer sign-in is not configured. Set ADMIN_PASSWORD and SESSION_SECRET before opening the admin area.", 503, "config");
    }
    const body = await readJson(request);
    const password = String(body.password ?? "");
    if (!passwordsMatch(password, expected)) throw new DomainError("That password is not correct.", 401, "unauthorized");
    const db = await getDb();
    const actor = await upsertProfile(db, { email: "organizer@ncl.local", displayName: "Organizer" });
    await db.execute("update profiles set role = 'organizer' where id = $1", [actor.id]);
    const response = NextResponse.json({ ok: true });
    response.cookies.set("ncl_session", sealSession(actor.id, secret), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

function passwordsMatch(input: string, expected: string): boolean {
  const left = createHash("sha256").update(input).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}
