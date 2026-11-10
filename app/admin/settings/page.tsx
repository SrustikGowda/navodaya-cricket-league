import { AwardsForm, OfficialRunPanel } from "@/components/draw/settings-panels";
import { SeasonSettings } from "@/components/season-settings";
import { getActor } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadAwards } from "@/lib/draw/history";
import { drawPasswordConfigured, drawResultCounts, getOfficialDraw, RESET_PHRASE } from "@/lib/draw/service";
import { integrationStatus } from "@/lib/integrations";
import { getActiveSeason } from "@/lib/season";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const status = integrationStatus();
  const actor = await getActor();
  const admin = actor?.role === "organizer";
  const db = await getDb();
  const season = await getActiveSeason(db);
  const [awards, official] = admin ? await Promise.all([loadAwards(db, season.id), getOfficialDraw(db)]) : [null, null];
  const counts = official ? await drawResultCounts(db, official.id) : null;
  return (
    <>
      <SeasonSettings />
      {admin && awards ? <AwardsForm awards={awards} /> : null}
      {admin ? (
        <OfficialRunPanel
          run={official && counts ? { ref: official.ref, publishedAt: official.publishedAt, results: Math.max(counts.started, counts.scores) } : null}
          phrase={RESET_PHRASE}
          passwordConfigured={drawPasswordConfigured()}
        />
      ) : null}
      <section className="system-panel" id="system">
        <h2>System</h2>
        <ul>
          <li>Database: {status.database === "postgres" ? "Postgres" : "embedded"}.</li>
          <li>Email sign-in: {status.supabaseAuth ? "configured" : "not configured"}.</li>
          <li>Storage: {status.supabaseStorage ? "Supabase" : "local disk"}.</li>
          <li>Development sign-in: {status.localAuth ? "on" : "off"}.</li>
          <li>CricHeroes sync: off.</li>
          <li>Payment gateway: off.</li>
          <li>Official draw password: {drawPasswordConfigured() ? "set" : "not set"}.</li>
        </ul>
      </section>
    </>
  );
}
