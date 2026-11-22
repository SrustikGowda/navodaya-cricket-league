"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Timetable } from "@/lib/draw/config";
import { oversText, parseOvers, type TieNote } from "@/lib/draw/standings";
import type { LiveFixture } from "@/lib/draw/types";
import { isoToMinutes, timeText } from "@/lib/draw/view";
import { AdminFeedback, useAdminPost } from "../admin-post";
import { postJson } from "../post-json";

type Props = {
  official: { ref: string; publishedAt: string; planHash: string; seed: string } | null;
  fixtures: LiveFixture[];
  ties: (TieNote & { names: Record<string, string> })[];
  leagueResults: number;
  /** League matches in the tournament: 28 with 19 teams, 30 with 20. */
  leagueTotal: number;
  roster: { id: string; name: string }[];
  passwordConfigured: boolean;
  timetable: Timetable | null;
  confirmedAt: string | null;
  /** True when every league match has a result and no tie is waiting for a decision, so the standings can be confirmed. */
  canConfirm: boolean;
  leagueComplete: boolean;
};

export function DrawDesk({ official, fixtures, ties, leagueResults, leagueTotal, roster, passwordConfigured, timetable, confirmedAt, canConfirm, leagueComplete }: Props) {
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
        <p className="quiet">League results entered: {leagueResults} of {leagueTotal}. The quarterfinals are filled only after you confirm the final standings below.</p>
      </section>

      <StandingsConfirm leagueTotal={leagueTotal} leagueComplete={leagueComplete} canConfirm={canConfirm} confirmedAt={confirmedAt} tiesWaiting={ties.length} />

      {ties.length > 0 ? (
        <section className="stack">
          <h2>Ties that need a decision</h2>
          <p className="quiet">These teams are level on points and net run rate, so a Super Over decides. Record the order after the Super Over, and add a note.</p>
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
        {fixtures.filter((fixture) => fixture.stage === "league" && !fixture.isBye).map((fixture) => <ScoreRow key={fixture.id} fixture={fixture} />)}
      </section>

      {timetable ? <TimetableForm timetable={timetable} /> : null}
      <MoveMatchForm fixtures={fixtures.filter((fixture) => !fixture.isBye && fixture.status !== "completed" && fixture.status !== "in_progress")} />

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

/** Confirming the final group standings is what lets the quarterfinals fill in. Nothing fills in by itself. */
function StandingsConfirm({ leagueTotal, leagueComplete, canConfirm, confirmedAt, tiesWaiting }: { leagueTotal: number; leagueComplete: boolean; canConfirm: boolean; confirmedAt: string | null; tiesWaiting: number }) {
  const form = useAdminPost();
  return (
    <section className="stack" id="confirm">
      <h2>Confirm the final standings</h2>
      {!leagueComplete ? (
        <p className="quiet">Available once all {leagueTotal} league matches have a result. The top 4 of each group will then go into the quarterfinals.</p>
      ) : tiesWaiting > 0 ? (
        <p className="alert" role="alert">Record a decision for each tie below first.</p>
      ) : (
        <>
          <p>
            {confirmedAt
              ? `Confirmed ${new Date(confirmedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST. The quarterfinals are filled. If you correct a league score afterwards, confirm again so any change is checked.`
              : "Check the group tables on the Fixtures page, then confirm. The 8 qualifiers go into the quarterfinals: Group A #1 v Group B #4, A #2 v B #3, A #3 v B #2, A #4 v B #1."}
          </p>
          <button className="button" type="button" disabled={!canConfirm || form.pending} onClick={() => void form.submit("draw-confirm-standings", {})}>
            {form.pending ? "Confirming" : confirmedAt ? "Confirm again" : "Confirm standings and fill the quarterfinals"}
          </button>
          <AdminFeedback message={form.message ? "Confirmed." : ""} error={form.error} />
        </>
      )}
    </section>
  );
}

const toClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const fromClock = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

type Preview = { changes: { code: string; from: string; to: string; fromGround: string; toGround: string }[]; errors: string[]; notes: string[] };

/** Times and lengths for the two days. Opponents never change; the same clash, rest and daylight rules as the draw apply. */
function TimetableForm({ timetable }: { timetable: Timetable }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  const read = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const clock = (name: string) => fromClock(String(data.get(name) ?? "00:00"));
    const num = (name: string) => Number(data.get(name));
    return {
      saturdayStart: clock("saturdayStart"),
      sundayStart: clock("sundayStart"),
      slotMinutes: num("slotMinutes"),
      leagueMinutes: num("leagueMinutes"),
      breakAfterSlots: num("breakAfterSlots"),
      breakMinutes: num("breakMinutes"),
      qf1: clock("qf1"),
      qf2: clock("qf2"),
      sf: clock("sf"),
      final: clock("final"),
      quarterfinalMinutes: num("quarterfinalMinutes"),
      semifinalMinutes: num("semifinalMinutes"),
      finalMinutes: num("finalMinutes"),
    };
  };

  async function run(action: "draw-preview-times" | "draw-apply-times", form: HTMLFormElement) {
    setBusy(true);
    setError("");
    setDone("");
    try {
      const data = new FormData(form);
      const result = (await postJson("/api/admin", { action, timetable: read(form), note: String(data.get("note") ?? "") })) as unknown as Preview;
      setPreview(result);
      if (action === "draw-apply-times") {
        setDone(`Done. ${result.changes.length} matches were moved. The public pages show the new times now.`);
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack" id="timetable">
      <h2>Match times</h2>
      <p className="quiet">
        Change the start times, slot length, the Saturday inauguration break or the knockout times. Who plays whom does not change. Matches already played keep their times. Check the preview before you apply.
      </p>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void run("draw-preview-times", event.currentTarget);
        }}
      >
        <div className="set-grid">
          <label className="field">Saturday first match<input className="text-input" type="time" name="saturdayStart" defaultValue={toClock(timetable.saturdayStart)} required /></label>
          <label className="field">Sunday first match<input className="text-input" type="time" name="sundayStart" defaultValue={toClock(timetable.sundayStart)} required /></label>
          <label className="field">Minutes between league matches<input className="text-input" type="number" name="slotMinutes" defaultValue={timetable.slotMinutes} min={30} max={120} required /></label>
          <label className="field">Length booked for a league match (minutes)<input className="text-input" type="number" name="leagueMinutes" defaultValue={timetable.leagueMinutes} min={20} max={120} required /></label>
          <label className="field">Inauguration break after this many Saturday slots<input className="text-input" type="number" name="breakAfterSlots" defaultValue={timetable.breakAfterSlots} min={0} max={10} required /></label>
          <label className="field">Break length (minutes, 0 for none)<input className="text-input" type="number" name="breakMinutes" defaultValue={timetable.breakMinutes} min={0} max={180} required /></label>
          <label className="field">Quarterfinals 1 and 2<input className="text-input" type="time" name="qf1" defaultValue={toClock(timetable.qf1)} required /></label>
          <label className="field">Quarterfinals 3 and 4<input className="text-input" type="time" name="qf2" defaultValue={toClock(timetable.qf2)} required /></label>
          <label className="field">Semifinals<input className="text-input" type="time" name="sf" defaultValue={toClock(timetable.sf)} required /></label>
          <label className="field">Final<input className="text-input" type="time" name="final" defaultValue={toClock(timetable.final)} required /></label>
          <label className="field">Quarterfinal length (minutes)<input className="text-input" type="number" name="quarterfinalMinutes" defaultValue={timetable.quarterfinalMinutes} min={20} max={120} required /></label>
          <label className="field">Semifinal length (minutes)<input className="text-input" type="number" name="semifinalMinutes" defaultValue={timetable.semifinalMinutes} min={20} max={150} required /></label>
          <label className="field">Final length (minutes)<input className="text-input" type="number" name="finalMinutes" defaultValue={timetable.finalMinutes} min={20} max={150} required /></label>
          <label className="field wide">Reason (shown to the public as the update)<input className="text-input" name="note" placeholder="For example: start half an hour later" maxLength={200} /></label>
        </div>
        <div className="set-actions">
          <button className="button secondary" type="submit" disabled={busy}>{busy ? "Checking" : "Preview the change"}</button>
          {preview && preview.errors.length === 0 && preview.changes.length > 0 ? (
            <button
              className="button"
              type="button"
              disabled={busy}
              onClick={(event) => {
                const form = (event.currentTarget as HTMLButtonElement).form;
                if (form && window.confirm(`Move ${preview.changes.length} matches? The public pages show the new times straight away. Who plays whom does not change.`)) void run("draw-apply-times", form);
              }}
            >
              Apply: move {preview.changes.length} matches
            </button>
          ) : null}
        </div>
      </form>
      {error ? <p className="alert" role="alert">{error}</p> : null}
      {done ? <p className="note" role="status">{done}</p> : null}
      {preview ? (
        <div className="stack" aria-live="polite">
          {preview.errors.length > 0 ? (
            <div className="alert" role="alert">
              <b>These times break the rules, so nothing can be applied:</b>
              <ul>{preview.errors.map((message) => <li key={message}>{message}</li>)}</ul>
            </div>
          ) : preview.changes.length === 0 ? (
            <p className="quiet">These are the times already in use. Nothing would change.</p>
          ) : (
            <details open>
              <summary>{preview.changes.length} matches would move</summary>
              <ul>{preview.changes.map((change) => <li key={change.code}>{change.code}: {change.from} → {change.to}{change.fromGround !== change.toGround ? ` (Ground ${change.fromGround} → ${change.toGround})` : ""}</li>)}</ul>
            </details>
          )}
          {preview.notes.map((note) => <p key={note} className="quiet">{note}</p>)}
        </div>
      ) : null}
    </section>
  );
}

/** One match to another time or ground, under the same rules. */
function MoveMatchForm({ fixtures }: { fixtures: LiveFixture[] }) {
  const form = useAdminPost();
  const [code, setCode] = useState(fixtures[0]?.code ?? "");
  const current = fixtures.find((fixture) => fixture.code === code);
  return (
    <section className="stack" id="move">
      <h2>Move one match</h2>
      <p className="quiet">For a delay or a pitch problem. The match keeps its teams; only its time and ground change, and the public card says it was rescheduled.</p>
      <form
        className="stack"
        key={code}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void form.submit("draw-move-match", { code, startMinutes: fromClock(String(data.get("time") ?? "")), ground: String(data.get("ground") ?? ""), note: String(data.get("note") ?? "") });
        }}
      >
        <div className="set-grid">
          <label className="field wide">
            Match
            <select className="text-input" value={code} onChange={(event) => setCode(event.target.value)}>
              {fixtures.map((fixture) => (
                <option key={fixture.id} value={fixture.code ?? ""}>
                  #{fixture.number} {fixture.code} · {fixture.teamALabel} v {fixture.teamBLabel} · {fixture.startsAt ? timeText(isoToMinutes(fixture.startsAt)) : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field">New start time<input className="text-input" type="time" name="time" defaultValue={current?.startsAt ? toClock(isoToMinutes(current.startsAt)) : ""} required /></label>
          <label className="field">Ground
            <select className="text-input" name="ground" defaultValue={current?.ground === "Ground B" ? "B" : "A"}>
              <option value="A">Ground A</option>
              <option value="B">Ground B</option>
            </select>
          </label>
          <label className="field wide">Reason<input className="text-input" name="note" placeholder="For example: pitch repair" maxLength={200} /></label>
        </div>
        <div className="set-actions">
          <button className="button" type="submit" disabled={form.pending || !code}>{form.pending ? "Moving" : "Move this match"}</button>
        </div>
        <AdminFeedback message={form.message ? "Moved." : ""} error={form.error} />
      </form>
    </section>
  );
}
