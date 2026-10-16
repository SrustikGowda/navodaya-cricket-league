import Link from "next/link";
import { MatchDayBoard } from "@/components/match-day-board";
import { PublicShell } from "@/components/shell";
import { getDb } from "@/lib/db";
import { buildMatchDay } from "@/lib/match-day";
import { listPublicAnnouncements, listPublicFixtures } from "@/lib/public-data";

export const metadata = { title: "Match day" };

export default async function MatchDayPage({ searchParams }: { searchParams: Promise<{ display?: string }> }) {
  const { display } = await searchParams;
  const db = await getDb();
  const initial = {
    ...buildMatchDay(await listPublicFixtures(db)),
    announcements: await listPublicAnnouncements(db),
    syncedAt: new Date().toISOString(),
  };
  const board = <MatchDayBoard initial={initial} display={display === "1"} />;
  if (display === "1") {
    return (
      <main id="content">
        <p className="no-print"><Link href="/2026/match-day">Leave display mode</Link></p>
        {board}
      </main>
    );
  }
  return (
    <PublicShell>
      <p className="kicker">2026</p>
      <h1>Match day</h1>
      <p><Link href="/2026/match-day?display=1">Open venue display</Link></p>
      {board}
    </PublicShell>
  );
}
