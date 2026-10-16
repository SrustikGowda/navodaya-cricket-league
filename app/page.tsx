export const dynamic = "force-dynamic";

import Link from "next/link";
import { PublicShell } from "@/components/shell";
import { getDb } from "@/lib/db";
import { getActiveSeason, toPublicSeason } from "@/lib/season";

export const metadata = { title: "NCL" };

export default async function HomePage() {
  const season = toPublicSeason(await getActiveSeason(await getDb()));
  return (
    <PublicShell>
      <p className="kicker">{season.community}</p>
      <h1>Navodaya Cricket League</h1>
      <p className="dek">A permanent home for the alumni tournament. The active edition is {season.shortName}.</p>
      <p><Link className="button" href={`/${season.slug}`}>Enter {season.year}</Link></p>
      <p><Link href="/history">Earlier editions</Link></p>
    </PublicShell>
  );
}
