export const dynamic = "force-dynamic";

import Link from "next/link";
import { PublicShell } from "@/components/shell";
import { getDb } from "@/lib/db";
import { getActiveSeason, toPublicSeason } from "@/lib/season";

export const metadata = { title: "Rules" };

export default async function RulesPage() {
  const season = toPublicSeason(await getActiveSeason(await getDb()));
  return (
    <PublicShell>
      <p className="kicker">2026</p>
      <h1>Rules</h1>
      {season.rulesText ? <article style={{ whiteSpace: "pre-wrap" }}><p>Version {season.rulesVersion}</p><p>{season.rulesText}</p></article> : <p>Playing conditions have not been published yet.</p>}
      {season.eligibilityRules ? <p>{season.eligibilityRules}</p> : null}
      {season.ballType ? <p>Ball: {season.ballType}</p> : null}
      {season.oversByStage ? <p>Overs: {season.oversByStage}</p> : null}
      {season.playingXi ? <p>Playing XI: {season.playingXi}</p> : null}
      {season.refundPolicy ? <p>{season.refundPolicy}</p> : null}
      <p><Link href="/2026">Home</Link></p>
    </PublicShell>
  );
}
