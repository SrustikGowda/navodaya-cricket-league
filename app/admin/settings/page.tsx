import { AwardsForm, OfficialRunPanel } from "@/components/draw/settings-panels";
import { FeeChecklist } from "@/components/fee-checklist";
import { SeasonSettings } from "@/components/season-settings";
import { getActor } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadAwards } from "@/lib/draw/history";
import { drawPasswordConfigured, drawResultCounts, getOfficialDraw, RESET_PHRASE } from "@/lib/draw/service";
import { formatInrFromPaise } from "@/lib/format";
import { feeChecklist } from "@/lib/payments";
import { getActiveSeason } from "@/lib/season";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const actor = await getActor();
  if (!actor || actor.role !== "organizer") return null;
  const db = await getDb();
  const season = await getActiveSeason(db);
  const [teams, awards, official] = await Promise.all([feeChecklist(db, season.id), loadAwards(db, season.id), getOfficialDraw(db)]);
  const counts = official ? await drawResultCounts(db, official.id) : null;
  const fee = season.feePaise != null && season.feePaise > 0 ? formatInrFromPaise(season.feePaise) : null;
  return (
    <div className="settings">
      <h1>Settings</h1>
      <SeasonSettings season={season} />
      <FeeChecklist teams={teams} fee={fee} />
      <AwardsForm awards={awards} />
      <OfficialRunPanel
        run={official && counts ? { ref: official.ref, publishedAt: official.publishedAt, results: Math.max(counts.started, counts.scores) } : null}
        phrase={RESET_PHRASE}
        passwordConfigured={drawPasswordConfigured()}
      />
    </div>
  );
}
