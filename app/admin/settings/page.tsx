import { SeasonSettings } from "@/components/season-settings";
import { integrationStatus } from "@/lib/integrations";

export default function SettingsPage() {
  const status = integrationStatus();
  return (
    <>
      <SeasonSettings />
      <section className="system-panel" id="system">
        <h2>System</h2>
        <ul>
          <li>Database: {status.database === "postgres" ? "Postgres" : "embedded"}.</li>
          <li>Email sign-in: {status.supabaseAuth ? "configured" : "not configured"}.</li>
          <li>Storage: {status.supabaseStorage ? "Supabase" : "local disk"}.</li>
          <li>Development sign-in: {status.localAuth ? "on" : "off"}.</li>
          <li>CricHeroes sync: off.</li>
          <li>Payment gateway: off.</li>
        </ul>
      </section>
    </>
  );
}
