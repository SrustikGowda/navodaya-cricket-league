"use client";

import { useState } from "react";
import Link from "next/link";
import { oversText, parseOvers, type TieNote } from "@/lib/draw/standings";
import type { LiveFixture } from "@/lib/draw/types";
import { isoToMinutes, timeText } from "@/lib/draw/view";
import { AdminFeedback, useAdminPost } from "../admin-post";

type Props = {
  official: { ref: string; publishedAt: string; planHash: string; seed: string } | null;
  fixtures: LiveFixture[];
  ties: (TieNote & { names: Record<string, string> })[];
  leagueResults: number;
  roster: { id: string; name: string }[];
  passwordConfigured: boolean;
};

export function DrawDesk({ official, fixtures, ties, leagueResults, roster, passwordConfigured }: Props) {
  if (!official) {
    return (
      <div className="stack">
        <h1>Draw &amp; results</h1>
        <p>The official draw has not been run. It is started from the public <Link href="/2026/fixtures">Fixtures page</Link> with the draw password.</p>
        {!passwordConfigured ? <p className="alert" role="alert">NCL_FIXTURE_RUN_PASSWORD is not set on the server, so the official draw is switched off.</p> : null}
      </div>
    );
  }
  const knockouts = fixtures.filter((fixture) => fixture.stage !== "league");
  return (
    <div className="stack">
      <h1>Draw &amp; results</h1>
      <section className="note stack">
        <p>
          <strong>Official draw {official.ref}</strong> published {new Date(official.publishedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST.
        </p>
        <p className="quiet">Plan hash {official.planHash.slice(0, 16)}… · draw entropy {official.seed.slice(0, 12)}… (published so anyone can replay the draw).</p>
        <p className="quiet">League results entered: {leagueResults} of 27. The quarterfinals fill themselves when the 27th result is in and no tie needs a decision.</p>
      </section>

      {ties.length > 0 ? (
        <section className="stack">
          <h2>Ties that need a decision</h2>
          <p className="quiet">These teams are level on points, net run rate, wins and head-to-head. The site will not pick between them. Record the order you decided, and why.</p>
          {ties.map((tie) => <TieForm key={`${tie.scope}-${tie.teamIds.join()}`} tie={tie} />)}
        </section>
      ) : null}

      <section className="stack" id="knockouts">
        <h2>Knockouts · Sunday 29 November</h2>
        <p className="quiet">
          Choose who plays in each quarterfinal, semifinal and the final, and who won. A winner moves into the next match by itself. When the final has a winner, the Hall of Champions
          on the History page updates with the champion, runner-up and semifinals. Best batter and the other awards are entered in <Link href="/admin/settings#awards">Settings</Link>.
        </p>
        {knockouts.map((fixture) => (
          <KnockoutRow key={`${fixture.id}-${fixture.teamAId}-${fixture.teamBId}-${fixture.winnerLabel}-${fixture.status}`} fixture={fixture} roster={roster} />
        ))}
      </section>

      <section className="stack">
        <h2>League match results</h2>
        <p className="quiet">Scores feed the group tables, net run rate and the bracket. Overs are written the cricket way: 5.3 is five overs and three balls. An all-out innings counts at the full overs quota for net run rate.</p>
        {fixtures.filter((fixture) => fixture.stage === "league").map((fixture) => <ScoreRow key={fixture.id} fixture={fixture} />)}
      </section>

      <p className="quiet">
        Need to redo the draw? An admin can delete the official run in <Link href="/admin/settings#official-run">Settings</Link>, then run the Real Run again from the Fixtures page.
      </p>
    </div>
  );
}

function TieForm({ tie }: { tie: TieNote & { names: Record<string, string> } }) {
  const form = useAdminPost();
  const [order, setOrder] = useState<string[]>(tie.teamIds);
  const move = (from: number, to: number) => {
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item as string);
    setOrder(next);
  };
  return (
    <form
      className="stack note"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void form.submit("draw-tiebreak", { scope: tie.scope, order, note: String(data.get("note") ?? "") });
      }}
    >
      <p><strong>{tie.scope.startsWith("group:") ? `Group ${tie.scope.slice(6)}` : tie.scope === "wildcard" ? "Wildcard race" : tie.scope}</strong> · level for place {tie.positions[0]}{tie.positions[1] > tie.positions[0] ? `–${tie.positions[1]}` : ""}</p>
      <ol>
        {order.map((id, index) => (
          <li key={id}>
            {tie.names[id] ?? id}{" "}
            <button type="button" className="button secondary" disabled={index === 0} onClick={() => move(index, index - 1)} aria-label={`Move ${tie.names[id]} up`}>↑</button>{" "}
            <button type="button" className="button secondary" disabled={index === order.length - 1} onClick={() => move(index, index + 1)} aria-label={`Move ${tie.names[id]} down`}>↓</button>
          </li>
        ))}
      </ol>
      <label className="field">How it was decided<input className="text-input" name="note" required minLength={5} placeholder="For example: draw of lots, witnessed by both captains" /></label>
      <button className="button" type="submit" disabled={form.pending}>Record this order</button>
      <AdminFeedback message={form.message} error={form.error} />
    </form>
  );
}

function ScoreRow({ fixture }: { fixture: LiveFixture }) {
  const [open, setOpen] = useState(false);
  const known = Boolean(fixture.teamAId && fixture.teamBId);
  const done = fixture.status === "completed" || fixture.status === "abandoned";
  return (
    <div className="note stack">
      <p>
        <strong>#{fixture.number} {fixture.code}</strong> · {fixture.teamALabel} vs {fixture.teamBLabel} · {fixture.overs} overs{" "}
        <span className="quiet">({fixture.status.replaceAll("_", " ")})</span>
      </p>
      {fixture.summary ? <p className="quiet">{fixture.summary}</p> : null}
      {known ? (
        <button type="button" className="button secondary" onClick={() => setOpen((value) => !value)}>{open ? "Close" : done ? "Correct result" : "Enter result"}</button>
      ) : (
        <p className="quiet">Teams are not known yet.</p>
      )}
      {open ? <ScoreForm fixture={fixture} onSaved={() => setOpen(false)} /> : null}
    </div>
  );
}

function ScoreForm({ fixture, onSaved }: { fixture: LiveFixture; onSaved: () => void }) {
  const form = useAdminPost();
  const [outcome, setOutcome] = useState<"win" | "tie" | "no_result">("win");
  const [error, setError] = useState("");
  const maxOvers = (fixture.overs ?? 6);
  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const data = new FormData(event.currentTarget);
        const innings = (prefix: "first" | "second") => {
          const balls = parseOvers(String(data.get(`${prefix}Overs`) ?? ""));
          if (balls == null) return null;
          return { runs: Number(data.get(`${prefix}Runs`)), wickets: Number(data.get(`${prefix}Wickets`)), balls, allOut: data.get(`${prefix}AllOut`) === "on" };
        };
        if (outcome === "no_result") {
          if (await form.submit("draw-score", { fixtureId: fixture.id, outcome })) onSaved();
          return;
        }
        const first = innings("first");
        const second = innings("second");
        if (!first || !second) {
          setError("Write overs as whole overs and balls, for example 5.3. Balls go from 0 to 5.");
          return;
        }
        if (await form.submit("draw-score", { fixtureId: fixture.id, outcome, firstBats: String(data.get("firstBats")), first, second })) onSaved();
      }}
    >
      <label className="field">Result
        <select className="text-input" value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)}>
          <option value="win">One team won</option>
          <option value="tie">Tie (1 point each)</option>
          <option value="no_result">No result (1 point each, ignored for net run rate)</option>
        </select>
      </label>
      {outcome !== "no_result" ? (
        <>
          <label className="field">Batted first
            <select className="text-input" name="firstBats" defaultValue="a">
              <option value="a">{fixture.teamALabel}</option>
              <option value="b">{fixture.teamBLabel}</option>
            </select>
          </label>
          {(["first", "second"] as const).map((prefix) => (
            <fieldset key={prefix} className="stack">
              <legend>{prefix === "first" ? "First innings" : "Second innings"}</legend>
              <label className="field">Runs<input className="text-input" name={`${prefix}Runs`} type="number" min={0} required /></label>
              <label className="field">Wickets lost<input className="text-input" name={`${prefix}Wickets`} type="number" min={0} max={10} required defaultValue={0} /></label>
              <label className="field">Overs faced (max {maxOvers}, for example {oversText(maxOvers * 6 - 1)})<input className="text-input" name={`${prefix}Overs`} inputMode="decimal" required placeholder={String(maxOvers)} /></label>
              <label className="check"><input type="checkbox" name={`${prefix}AllOut`} /> All out</label>
            </fieldset>
          ))}
        </>
      ) : null}
      {error ? <p className="alert" role="alert">{error}</p> : null}
      <button className="button" type="submit" disabled={form.pending}>Save result</button>
      <AdminFeedback message={form.message} error={form.error} />
    </form>
  );
}

function KnockoutRow({ fixture, roster }: { fixture: LiveFixture; roster: { id: string; name: string }[] }) {
  const form = useAdminPost();
  const [teamA, setTeamA] = useState(fixture.teamAId ?? "");
  const [teamB, setTeamB] = useState(fixture.teamBId ?? "");
  const initialWinner = fixture.winnerLabel ? (fixture.winnerLabel === fixture.teamALabel ? "a" : fixture.winnerLabel === fixture.teamBLabel ? "b" : "") : "";
  const [winner, setWinner] = useState<"" | "a" | "b">(initialWinner as "" | "a" | "b");
  const [summary, setSummary] = useState("");
  const title = fixture.code === "F" ? "Final" : `${fixture.stage === "quarterfinal" ? "Quarterfinal" : "Semifinal"} ${fixture.code?.slice(2)}`;
  const when = fixture.startsAt ? `${timeText(isoToMinutes(fixture.startsAt))} · ${fixture.ground ?? ""}` : "";
  const options = (other: string) => roster.filter((team) => team.id !== other);
  const bothChosen = Boolean(teamA && teamB);
  return (
    <form
      className="note stack"
      onSubmit={(event) => {
        event.preventDefault();
        void form.submit("draw-knockout", { fixtureId: fixture.id, teamAId: teamA, teamBId: teamB, winner: bothChosen ? winner : "", summary });
      }}
    >
      <p>
        <strong>
          #{fixture.number} {title}
        </strong>{" "}
        <span className="quiet">
          {when} · {fixture.overs} overs{fixture.winnerLabel ? ` · won by ${fixture.winnerLabel}` : ""}
        </span>
      </p>
      <label className="field">
        Team 1
        <select className="text-input" value={teamA} onChange={(event) => setTeamA(event.target.value)}>
          <option value="">To be decided ({fixture.code?.startsWith("QF") ? "qualifier seed" : "winner of the earlier round"})</option>
          {options(teamB).map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Team 2
        <select className="text-input" value={teamB} onChange={(event) => setTeamB(event.target.value)}>
          <option value="">To be decided</option>
          {options(teamA).map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Winner
        <select className="text-input" value={bothChosen ? winner : ""} onChange={(event) => setWinner(event.target.value as "" | "a" | "b")} disabled={!bothChosen}>
          <option value="">No winner yet</option>
          <option value="a">{roster.find((team) => team.id === teamA)?.name ?? "Team 1"}</option>
          <option value="b">{roster.find((team) => team.id === teamB)?.name ?? "Team 2"}</option>
        </select>
      </label>
      {winner && bothChosen ? (
        <label className="field">
          Result note, optional (for example “by 12 runs”)
          <input className="text-input" value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={120} />
        </label>
      ) : null}
      <button className="button" type="submit" disabled={form.pending}>
        {form.pending ? "Saving" : "Save"}
      </button>
      <AdminFeedback message={form.message ? "Saved." : ""} error={form.error} />
    </form>
  );
}
