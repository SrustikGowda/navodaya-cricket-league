export const dynamic = "force-dynamic";

import "./rules.css";
import { Rulebook } from "@/components/rulebook";
import { PublicShell } from "@/components/shell";
import { getActor } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { publicRulebook } from "@/lib/rulebook";

export const metadata = {
  title: "Rules",
  description: "NCL 2026 tournament rules and guidelines: format, points and qualification, overs, no-balls and wides, fielding, timing penalties, dismissals and awards.",
};

export default async function RulesPage() {
  const db = await getDb();
  const [{ season, book }, actor] = await Promise.all([publicRulebook(db), getActor()]);
  return (
    <PublicShell>
      <Rulebook book={book} notes={season.rulesText?.trim() || null} editHref={actor?.role === "organizer" ? "/admin/rules" : null} />
    </PublicShell>
  );
}
