import { writeAudit } from "../audit";
import type { Db, Queryable } from "../db";
import { DomainError } from "../errors";
import { clearReadCache } from "../read-cache";
import { recordResultTx } from "../schedule";
import { num, requiredStr, str, type Row } from "../rows";
import { lockActiveSeason } from "../season";
import type { Actor } from "../types";
import { pairQuarterfinals } from "./bracket";
import { syncEditionHistory } from "./history";
import { advanceWinner } from "./knockouts";
import { loadDecisions, loadLeagueScores, qualificationFor, getOfficialDraw } from "./service";
import { matchWinner, oversText, validateScore, type Innings, type MatchOutcome, type MatchScore } from "./standings";
import type { DrawPlan, OfficialDrawView } from "./types";

export type ScoreEntry = {
  outcome: MatchOutcome;
  firstBats: "a" | "b";
  first: Innings;
  second: Innings;
};

function inningsOf(raw: unknown): Innings {
  const value = (raw ?? {}) as Record<string, unknown>;
  return {
    runs: Number(value.runs ?? 0),
    wickets: Number(value.wickets ?? 0),
    balls: Number(value.balls ?? 0),
    allOut: value.allOut === true,
  };
}

export function parseScoreEntry(body: Record<string, unknown>): ScoreEntry {
  const outcome = String(body.outcome ?? "");
  if (!["win", "tie", "no_result"].includes(outcome)) throw new DomainError("Choose win, tie or no result.");
  const firstBats = body.firstBats === "b" ? "b" : "a";
  return { outcome: outcome as MatchOutcome, firstBats, first: inningsOf(body.first), second: inningsOf(body.second) };
}

function describe(entry: ScoreEntry, labels: { a: string; b: string }, winner: "a" | "b" | null, maxBalls: number): string {
  if (entry.outcome === "no_result") return "No result. One point each.";
  const bat = (side: "a" | "b", inn: Innings) => `${labels[side]} ${inn.runs}/${inn.wickets} (${oversText(inn.balls)})`;
  const other = entry.firstBats === "a" ? "b" : "a";
  const line = `${bat(entry.firstBats, entry.first)}, ${bat(other, entry.second)}`;
  if (!winner) return `Match tied. ${line}. One point each.`;
  const loser = winner === "a" ? "b" : "a";
  const margin =
    winner === entry.firstBats
      ? `${entry.first.runs - entry.second.runs} runs`
      : `${maxBalls - entry.second.balls} balls to spare`;
  return `${labels[winner]} beat ${labels[loser]} by ${margin}. ${line}.`;
}

/**
 * Records a result and its score in one transaction through the existing result function, so the headline
 * result, standings inputs and downstream matches all move together or not at all.
 */
export async function recordMatchScore(db: Db, actor: Actor, fixtureId: string, entry: ScoreEntry): Promise<{ bracketResolved: boolean }> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  const outcome = await db.tx(async (query) => {
    const season = await lockActiveSeason(query);
    const rows = await query.query<Row>("select * from fixtures where id = $1 and season_id = $2 for update", [fixtureId, season.id]);
    const fixture = rows[0];
    if (!fixture || !fixture.draw_id) throw new DomainError("That match is not part of the official draw.", 404, "not_found");
    const a = str(fixture, "team_a_registration_id");
    const b = str(fixture, "team_b_registration_id");
    if (!a || !b) throw new DomainError("Both teams are not known yet, so a result cannot be recorded for this match.", 422, "teams_unknown");
    const overs = num(fixture, "overs") ?? 6;
    const maxBalls = overs * 6;
    const problems = validateScore({ ...entry, maxBalls });
    if (problems.length > 0) throw new DomainError(problems.join(" "), 422, "score");

    if (entry.outcome !== "win" && str(fixture, "stage") !== "league") {
      throw new DomainError("A knockout match needs a winner. Record the tie-break result as a win, or correct the score.", 422, "knockout_tie");
    }

    const score: MatchScore = { fixtureId, teamAId: a, teamBId: b, ...entry, maxBalls };
    const winnerSide = matchWinner(score);
    const labels = { a: requiredStr(fixture, "team_a_label"), b: requiredStr(fixture, "team_b_label") };
    const noResult = entry.outcome === "no_result";
    await query.execute(
      `insert into match_scores (
         fixture_id, outcome, first_bats, first_runs, first_wickets, first_balls, first_all_out,
         second_runs, second_wickets, second_balls, second_all_out, max_balls, recorded_by
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (fixture_id) do update set
         outcome = excluded.outcome, first_bats = excluded.first_bats,
         first_runs = excluded.first_runs, first_wickets = excluded.first_wickets, first_balls = excluded.first_balls, first_all_out = excluded.first_all_out,
         second_runs = excluded.second_runs, second_wickets = excluded.second_wickets, second_balls = excluded.second_balls, second_all_out = excluded.second_all_out,
         max_balls = excluded.max_balls, recorded_by = excluded.recorded_by, recorded_at = now(), version = match_scores.version + 1`,
      [
        fixtureId,
        entry.outcome,
        noResult ? null : entry.firstBats,
        noResult ? null : entry.first.runs,
        noResult ? null : entry.first.wickets,
        noResult ? null : entry.first.balls,
        noResult ? null : entry.first.allOut,
        noResult ? null : entry.second.runs,
        noResult ? null : entry.second.wickets,
        noResult ? null : entry.second.balls,
        noResult ? null : entry.second.allOut,
        maxBalls,
        actor.id,
      ],
    );

    const winnerId = winnerSide === "a" ? a : winnerSide === "b" ? b : null;
    const winnerLabel = winnerSide ? labels[winnerSide] : null;
    await recordResultTx(query, actor, fixtureId, {
      summary: describe(entry, labels, winnerSide, maxBalls),
      source: "manual",
      winnerRegistrationId: winnerId,
      winnerLabel,
    });
    if (noResult) await query.execute("update fixtures set status = 'abandoned' where id = $1", [fixtureId]);

    // A knockout winner moves into the next match when that slot is still a placeholder.
    if (str(fixture, "stage") !== "league") {
      await advanceWinner(query, fixtureId, requiredStr(fixture, "code"), str(fixture, "winner_registration_id"), winnerId, winnerLabel);
    }

    await writeAudit(query, actor.id, "draw.score", "fixture", fixtureId, { outcome: entry.outcome, winner: winnerLabel });
    const drawId = requiredStr(fixture, "draw_id");
    const bracketResolved = str(fixture, "stage") === "league" ? await resolveBracketTx(query, actor, drawId) : false;
    // The final's score, the semifinals and the champion all feed the edition's History entry.
    await syncEditionHistory(query);
    return { bracketResolved };
  });
  clearReadCache();
  return outcome;
}

/**
 * Fills the quarterfinals once all 27 league results are in and no tie needs a human decision. Teams already
 * in a quarterfinal are never overwritten; if the standings later change, the match is flagged instead.
 */
export async function resolveBracketTx(query: Queryable, actor: Actor, drawId: string): Promise<boolean> {
  const drawRows = await query.query<Row>("select plan from draws where id = $1", [drawId]);
  if (!drawRows[0]) return false;
  const plan = (typeof drawRows[0].plan === "string" ? JSON.parse(drawRows[0].plan) : drawRows[0].plan) as DrawPlan;
  const [scores, decisions] = await Promise.all([loadLeagueScores(query, drawId), loadDecisions(query, drawId)]);
  const qualification = qualificationFor(plan, scores, decisions);
  if (!qualification.qualifiers) return false;

  const names = new Map(plan.roster.map((team) => [team.id, team.name]));
  const pairs = pairQuarterfinals(qualification.qualifiers);
  let changed = false;
  for (const pair of pairs) {
    const rows = await query.query<Row>("select id, team_a_registration_id, team_b_registration_id from fixtures where draw_id = $1 and code = $2 for update", [drawId, pair.code]);
    const fixture = rows[0];
    if (!fixture) continue;
    const currentA = str(fixture, "team_a_registration_id");
    const currentB = str(fixture, "team_b_registration_id");
    if (!currentA && !currentB) {
      await query.execute(
        `update fixtures set team_a_registration_id = $1, team_b_registration_id = $2, team_a_label = $3, team_b_label = $4,
           updated_at = now(), version = version + 1, calendar_sequence = calendar_sequence + 1 where id = $5`,
        [pair.teamAId, pair.teamBId, names.get(pair.teamAId) ?? pair.teamAId, names.get(pair.teamBId) ?? pair.teamBId, requiredStr(fixture, "id")],
      );
      changed = true;
    } else if (currentA !== pair.teamAId || currentB !== pair.teamBId) {
      await query.execute(
        "update fixtures set needs_resolution = true, resolution_note = $1 where id = $2",
        ["The league standings changed after this quarterfinal was filled. Confirm the teams before it is played. They were not changed automatically.", requiredStr(fixture, "id")],
      );
    }
  }
  if (changed) {
    await writeAudit(query, actor.id, "draw.bracket", "draw", drawId, {
      qualifiers: qualification.qualifiers.map((q) => ({ seed: q.seed, team: names.get(q.teamId) ?? q.teamId })),
      quarterfinals: pairs.map((pair) => ({ code: pair.code, a: names.get(pair.teamAId), b: names.get(pair.teamBId), sameGroup: pair.sameGroup })),
    });
  }
  return changed;
}

/** Records an organizer's ordering for teams that are level on every published criterion. */
export async function recordTiebreak(
  db: Db,
  actor: Actor,
  input: { scope: string; order: string[]; note: string },
): Promise<{ bracketResolved: boolean }> {
  if (actor.role !== "organizer") throw new DomainError("Organizer access is required.", 403, "forbidden");
  if (input.note.trim().length < 5) throw new DomainError("Record how the tie was decided. It is shown publicly and kept in the audit log.", 422, "note");
  const outcome = await db.tx(async (query) => {
    await lockActiveSeason(query);
    const draw = await getOfficialDraw(query);
    if (!draw) throw new DomainError("There is no official draw.", 404, "no_draw");
    const [scores, decisions] = await Promise.all([loadLeagueScores(query, draw.id), loadDecisions(query, draw.id)]);
    const qualification = qualificationFor(draw.plan, scores, decisions);
    const tie = qualification.blockingTies.find(
      (candidate) =>
        candidate.scope === input.scope &&
        candidate.teamIds.length === input.order.length &&
        candidate.teamIds.every((id) => input.order.includes(id)),
    );
    if (!tie) throw new DomainError("That is not a current unresolved tie. Nothing was recorded.", 422, "no_tie");
    if (new Set(input.order).size !== input.order.length) throw new DomainError("List each team once.", 422, "order");
    const key = [...input.order].sort().join("|");
    await query.execute(
      `insert into draw_tiebreaks (draw_id, scope, tie_key, ordered_ids, note, decided_by)
       values ($1,$2,$3,$4::jsonb,$5,$6)
       on conflict (draw_id, scope, tie_key) do update set ordered_ids = excluded.ordered_ids, note = excluded.note, decided_by = excluded.decided_by, decided_at = now()`,
      [draw.id, input.scope, key, JSON.stringify(input.order), input.note.trim(), actor.id],
    );
    await writeAudit(query, actor.id, "draw.tiebreak", "draw", draw.id, { scope: input.scope, order: input.order, note: input.note.trim() });
    return { bracketResolved: await resolveBracketTx(query, actor, draw.id) };
  });
  clearReadCache();
  return outcome;
}

export type { OfficialDrawView };
