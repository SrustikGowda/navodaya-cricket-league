import { PublicShell } from "@/components/shell";
import { SignInForm } from "@/components/sign-in";
import { localAuthAllowed, supabaseAuthConfigured } from "@/lib/integrations";

export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <PublicShell>
      <p className="kicker">Captains</p>
      <h1>Sign in</h1>
      <p>Team entry is the registration form. This page is only for the captain desk. Browsing the schedule does not need an account.</p>
      {!supabaseAuthConfigured() ? <p className="note">Email sign-in is not configured until Supabase URL and anon key are set. No message will be sent.</p> : null}
      <SignInForm next={next} localAuth={localAuthAllowed()} />
    </PublicShell>
  );
}
