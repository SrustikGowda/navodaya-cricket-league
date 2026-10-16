export const revalidate = 60;

import { HallOfChampions } from "@/components/hall-of-champions";
import { HeritageClient } from "@/components/heritage-form";
import { PublicShell } from "@/components/shell";
import { listArchive } from "@/lib/content";
import { getDb } from "@/lib/db";
import { toHallEdition } from "@/lib/hall";

export const metadata = { title: "Hall of Champions" };

const KEPT = new Set([12, 13, 14]);

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const params = await searchParams;
  const editions = (await listArchive(await getDb()))
    .filter((entry) => KEPT.has(entry.editionNumber) && entry.year != null)
    .map(toHallEdition)
    .sort((a, b) => b.year - a.year);
  const requested = Number(params.year);
  const year = editions.some((edition) => edition.year === requested) ? requested : editions[0]?.year ?? 0;
  return (
    <PublicShell history>
      <div className="history-page">
        <h1>Hall of Champions</h1>
        <p className="hall-lead">Relive the finals. Celebrate the standouts.</p>
        <HallOfChampions editions={editions} year={year} />
        <HeritageClient />
      </div>
    </PublicShell>
  );
}
