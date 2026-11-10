import { DrawDesk } from "@/components/draw/draw-desk";
import { getActor } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadBoard } from "@/lib/draw/board";
import { drawPasswordConfigured, RESET_PHRASE } from "@/lib/draw/service";

export const dynamic = "force-dynamic";

export default async function DrawAdminPage() {
  const actor = await getActor();
  if (!actor || actor.role !== "organizer") return null;
  const db = await getDb();
  const board = await loadBoard(db);
  const official = board.official;
  const names = new Map((official?.plan.roster ?? []).map((team) => [team.id, team.name]));
  const hash = official ? (await db.query<{ plan_hash: string }>("select plan_hash from draws where id = $1", [official.id]))[0]?.plan_hash ?? "" : "";
  const ties = (board.qualification?.blockingTies ?? []).map((tie) => ({
    ...tie,
    names: Object.fromEntries(tie.teamIds.map((id) => [id, names.get(id) ?? id])),
  }));
  return (
    <DrawDesk
      official={official ? { ref: official.ref, publishedAt: official.publishedAt, planHash: hash, seed: official.plan.seed } : null}
      fixtures={board.fixtures}
      ties={ties}
      leagueResults={board.qualification?.leagueMatchesPlayed ?? 0}
      resetPhrase={RESET_PHRASE}
      passwordConfigured={drawPasswordConfigured()}
    />
  );
}
