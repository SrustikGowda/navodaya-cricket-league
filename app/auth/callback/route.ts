import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/format";
import { supabaseAuthConfigured } from "@/lib/integrations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next"));
  if (supabaseAuthConfigured() && url.searchParams.get("code")) {
    const { createServerClient } = await import("@supabase/ssr");
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    });
    await supabase.auth.exchangeCodeForSession(url.searchParams.get("code") ?? "");
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
