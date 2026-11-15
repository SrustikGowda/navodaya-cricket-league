export const dynamic = "force-dynamic";

import "./rules.css";
import { Rulebook } from "@/components/rulebook";
import { PublicShell } from "@/components/shell";
import { getDb } from "@/lib/db";
import { DEFAULT_TIMETABLE } from "@/lib/draw/config";
import { getOfficialDraw } from "@/lib/draw/service";
import { formatEventDates, formatInrFromPaise } from "@/lib/format";
import { buildRulebook } from "@/lib/rules";
import { getActiveSeason } from "@/lib/season";

export const metadata = {
  title: "Rules",
  description: "NCL 2026 tournament rules and guidelines: format, points and qualification, overs, no-balls and wides, fielding, timing penalties, dismissals and awards.",
};

export default async function RulesPage() {
  const db = await getDb();
  const season = await getActiveSeason(db);
  // Times follow the official draw once it is published, including any rescheduling by the organizers.
  const official = await getOfficialDraw(db);
  const organizer = season.organizerCredit?.replace(/^organi[sz]ed by\s+/i, "").trim() || null;
  const book = buildRulebook({
    editionNumber: season.editionNumber,
    dates: formatEventDates(season.startDate, season.endDate),
    days: [season.startDate, season.endDate],
    venue: [season.venueName, season.venueAddress].map((part) => part?.trim()).filter(Boolean).join(", "),
    organizer: organizer ? organizer.charAt(0).toUpperCase() + organizer.slice(1) : null,
    fee: season.feePaise != null && season.feePaise > 0 ? formatInrFromPaise(season.feePaise) : null,
    ball: season.ballType,
    timetable: official?.timetable ?? DEFAULT_TIMETABLE,
  });
  return (
    <PublicShell>
      <Rulebook book={book} notes={season.rulesText?.trim() || null} />
    </PublicShell>
  );
}
