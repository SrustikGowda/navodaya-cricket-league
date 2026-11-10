import { writeAudit } from "../audit";
import type { Db, Queryable } from "../db";
import { DomainError } from "../errors";
import { clearReadCache } from "../read-cache";
import { recordResultTx } from "../schedule";
import { requiredStr, str, type Row } from "../rows";
import { lockActiveSeason } from "../season";
import type { Actor } from "../types";
import { syncEditionHistory } from "./history";
import type { DrawPlan } from "./types";

export type KnockoutInput = {
  teamAId: string | null;
  teamBId: string | null;
  /** Which side won, or null for no result yet. */
  winner: "a" | "b" | null;
  /** Optional note shown as the result, for example "by 12 runs". */
  summary?: string | null;
};

const STARTED = new Set(["in_progress", "completed", "abandoned"]);

/**
 * Lets an organizer say who plays in a quarterfinal, semifinal or the final, and who won, without having entered every
 * score. A winner moves into the next match on its own (never over a different team an organizer placed there, and never
 * into a match that has started; those are flagged instead). The edition's History entry is rebuilt each time.
 */
export async function setKnockoutMatch(db: Db, actor: Actor, fixtureId: string, input: KnockoutInput): Promise<{ code: string; winner: string | null }> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const result = await db.tx(async (query) => {
    const season = await lockActiveSeason(query);
    const rows = await query.query<Row>("select * from fixtures where id = $1 and season_id = $2 for update", [fixtureId, season.id]);
    const fixture = rows[0];
    if (!fixture || !fixture.draw_id || fixture.stage === "league") throw new DomainError("That is not a knockout match of the official draw.", 404, "not_found");
    const drawId = requiredStr(fixture, "draw_id");
    const code = requiredStr(fixture, "code");
    const stage = requiredStr(fixture, "stage");
    const status = requiredStr(fixture, "status");
    if (status === "in_progress") throw new DomainError("This match is in progress. Finish it before changing the teams or the winner.", 409, "in_progress");

    const draw = await query.query<Row>("select plan from draws where id = $1", [drawId]);
    const plan = (typeof draw[0]?.plan === "string" ? JSON.parse(draw[0].plan as string) : draw[0]?.plan) as DrawPlan | undefined;
    const planned = plan?.matches.find((match) => match.code === code);
    const placeholderA = planned?.teamA.label ?? requiredStr(fixture, "team_a_label");
    const placeholderB = planned?.teamB.label ?? requiredStr(fixture, "team_b_label");

    const named = async (id: string | null): Promise<string | null> => {
      if (!id) return null;
      const found = await query.query<Row>("select team_name from registrations where id = $1 and season_id = $2 and status = 'approved'", [id, season.id]);
      if (!found[0]) throw new DomainError("Choose teams from the approved list.", 422, "team");
      return requiredStr(found[0], "team_name");
    };
    const nameA = await named(input.teamAId);
    const nameB = await named(input.teamBId);
    if (input.teamAId && input.teamAId === input.teamBId) throw new DomainError("A team cannot play itself. Choose two different teams.", 422, "same_team");

    for (const id of [input.teamAId, input.teamBId]) {
      if (!id) continue;
      const clash = await query.query<Row>(
        `select code from fixtures where draw_id = $1 and stage = $2 and id <> $3 and (team_a_registration_id = $4 or team_b_registration_id = $4) limit 1`,
        [drawId, stage, fixtureId, id],
      );
      if (clash[0]) throw new DomainError(`${id === input.teamAId ? nameA : nameB} is already in ${requiredStr(clash[0], "code")}. A team plays once in each round.`, 422, "team_twice");
    }

    const winnerId = input.winner === "a" ? input.teamAId : input.winner === "b" ? input.teamBId : null;
    if (input.winner && (!input.teamAId || !input.teamBId)) throw new DomainError("Choose both teams before choosing a winner.", 422, "winner_needs_teams");
    const winnerName = input.winner === "a" ? nameA : input.winner === "b" ? nameB : null;

    const previousWinner = str(fixture, "winner_registration_id");
    const teamsChanged = str(fixture, "team_a_registration_id") !== input.teamAId || str(fixture, "team_b_registration_id") !== input.teamBId;
    if (teamsChanged) {
      await query.execute(
        `update fixtures set team_a_registration_id = $1, team_b_registration_id = $2, team_a_label = $3, team_b_label = $4,
           updated_at = now(), version = version + 1, calendar_sequence = calendar_sequence + 1 where id = $5`,
        [input.teamAId, input.teamBId, nameA ?? placeholderA, nameB ?? placeholderB, fixtureId],
      );
    }

    if (winnerId && winnerName) {
      await recordResultTx(query, actor, fixtureId, {
        summary: input.summary?.trim() || `${winnerName} won.`,
        source: "manual",
        winnerRegistrationId: winnerId,
        winnerLabel: winnerName,
      });
    } else if (previousWinner) {
      // Taking a winner back also takes back the score it was based on.
      await query.execute(
        `update fixtures set winner_registration_id = null, winner_label = null, summary = null, summary_source = null,
           summary_updated_at = null, status = 'scheduled', needs_resolution = false, resolution_note = null,
           updated_at = now(), version = version + 1 where id = $1`,
        [fixtureId],
      );
      await query.execute("delete from match_scores where fixture_id = $1", [fixtureId]);
    }

    await advanceWinner(query, fixtureId, code, previousWinner, winnerId, winnerName);
    await writeAudit(query, actor.id, "draw.knockout", "fixture", fixtureId, {
      code,
      teams: [nameA, nameB],
      winner: winnerName,
    });
    await syncEditionHistory(query);
    return { code, winner: winnerName };
  });
  clearReadCache();
  return result;
}

/** Moves a winner into the next match's slot, or takes it back out, without overriding anything an organizer set by hand. */
export async function advanceWinner(
  query: Queryable,
  fixtureId: string,
  code: string,
  previousWinner: string | null,
  winnerId: string | null,
  winnerName: string | null,
): Promise<void> {
  if (previousWinner === winnerId) return;
  const dependents = await query.query<Row>("select fixture_id, team_slot from fixture_dependencies where depends_on_fixture_id = $1 and slot = 'winner'", [fixtureId]);
  for (const dependent of dependents) {
    const side = dependent.team_slot === "a" ? "a" : "b";
    const target = await query.query<Row>(`select id, status, winner_registration_id, team_${side}_registration_id as current from fixtures where id = $1 for update`, [requiredStr(dependent, "fixture_id")]);
    const row = target[0];
    if (!row) continue;
    const current = str(row, "current");
    const untouched = !STARTED.has(requiredStr(row, "status")) && !row.winner_registration_id;
    const ours = current === null || current === previousWinner;
    if (untouched && ours) {
      await query.execute(
        `update fixtures set team_${side}_registration_id = $1, team_${side}_label = $2, updated_at = now(), version = version + 1,
           calendar_sequence = calendar_sequence + 1 where id = $3`,
        [winnerId, winnerName ?? `Winner ${code}`, requiredStr(row, "id")],
      );
    } else if (current !== winnerId) {
      await query.execute("update fixtures set needs_resolution = true, resolution_note = $1 where id = $2", [
        `The winner of ${code} changed. Confirm the teams before this match is played. They were not changed automatically.`,
        requiredStr(row, "id"),
      ]);
    }
  }
}

export function knockoutOrder(code: string): number {
  return ["QF1", "QF2", "QF3", "QF4", "SF1", "SF2", "F"].indexOf(code);
}

