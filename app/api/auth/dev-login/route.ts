import { NextResponse } from "next/server";
import { upsertProfile } from "@/lib/accounts";
import { getDb } from "@/lib/db";
import { errorResponse, guardMutation, json, readJson } from "@/lib/http";
import { localAuthAllowed } from "@/lib/integrations";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { sealSession, sessionSecret } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await guardMutation(request, "dev-login");
    if (!rateLimit(`dev-login:${clientKey(request)}`, 8, 10 * 60_000)) {
      return json({ error: "Too many sign-in attempts. Wait and try again." }, 429);
    }
    if (!localAuthAllowed()) return json({ error: "Development sign-in is disabled." }, 403);
    const secret = sessionSecret();
    if (!secret) return json({ error: "Set SESSION_SECRET to at least 16 characters before using development sign-in." }, 500);
    const body = await readJson(request);
    const actor = await upsertProfile(await getDb(), { email: String(body.email ?? "") });
    const response = NextResponse.json({ ok: true, role: actor.role });
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
