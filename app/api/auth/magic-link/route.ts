import { errorResponse, guardMutation, json, readJson } from "@/lib/http";
import { supabaseAuthConfigured } from "@/lib/integrations";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { safeNextPath } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await guardMutation(request, "magic-link");
    if (!rateLimit(`magic:${clientKey(request)}`, 5, 10 * 60_000)) {
      return json({ error: "Too many email requests. Wait a few minutes and try again." }, 429);
    }
    if (!supabaseAuthConfigured()) {
      return json({ error: "Email sign-in is not configured. Add the Supabase URL and anon key. No message was sent." }, 503);
    }
    const body = await readJson(request);
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email.includes("@")) return json({ error: "Enter the email address to receive a sign-in link." }, 400);
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
      auth: { persistSession: false },
    });
    const next = safeNextPath(typeof body.next === "string" ? body.next : "/captain");
    const site = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) return json({ error: "The sign-in email could not be sent. Nothing was changed." }, 502);
    return json({ ok: true, message: "Check your email for a sign-in link." });
  } catch (error) {
    return errorResponse(error);
  }
}
