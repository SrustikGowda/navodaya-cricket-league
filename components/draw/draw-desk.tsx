"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { oversText, parseOvers, type TieNote } from "@/lib/draw/standings";
import type { LiveFixture } from "@/lib/draw/types";
import { AdminFeedback, useAdminPost } from "../admin-post";
import { postJson } from "../post-json";

type Props = {
  official: { ref: string; publishedAt: string; planHash: string; seed: string } | null;
  fixtures: LiveFixture[];
  ties: (TieNote & { names: Record<string, string> })[];
  leagueResults: number;
  resetPhrase: string;
  passwordConfigured: boolean;
};

export function DrawDesk({ official, fixtures, ties, leagueResults, resetPhrase, passwordConfigured }: Props) {
  if (!official) {
    return (
      <div className="stack">
        <h1>Draw &amp; results</h1>
        <p>The official draw has not been run. It is started from the public <Link href="/2026/fixtures">Fixtures page</Link> with the draw password.</p>
        {!passwordConfigured ? <p className="alert" role="alert">NCL_FIXTURE_RUN_PASSWORD is not set on the server, so the official draw is switched off.</p> : null}
      </div>
    );
  }
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

      <section className="stack">
        <h2>Match results</h2>
        <p className="quiet">Scores feed the group tables, net run rate and the bracket. Overs are written the cricket way: 5.3 is five overs and three balls. An all-out innings counts at the full overs quota for net run rate.</p>
        {fixtures.map((fixture) => <ScoreRow key={fixture.id} fixture={fixture} />)}
      </section>

      <ResetForm resetPhrase={resetPhrase} />
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

function ResetForm({ resetPhrase }: { resetPhrase: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ pending: boolean; message: string; error: string }>({ pending: false, message: "", error: "" });
  return (
    <details className="stack">
      <summary>Reset the official draw</summary>
      <p className="alert">A reset withdraws the published draw and schedule so a new one can be run. It is refused once any match has started or has a result. The old draw stays in the audit log.</p>
      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setState({ pending: true, message: "", error: "" });
          try {
            const result = await postJson("/api/draw/reset", {
              password: String(data.get("password") ?? ""),
              confirmation: String(data.get("confirmation") ?? ""),
              reason: String(data.get("reason") ?? ""),
            });
            setState({ pending: false, message: `Draw ${String(result.ref)} was reset. A new official draw can now be run.`, error: "" });
            router.refresh();
          } catch (caught) {
            setState({ pending: false, message: "", error: caught instanceof Error ? caught.message : "Nothing was changed." });
          }
        }}
      >
        <label className="field">Draw password<input className="text-input" name="password" type="password" autoComplete="off" required /></label>
        <label className="field">Type {resetPhrase} to confirm<input className="text-input" name="confirmation" required autoComplete="off" /></label>
        <label className="field">Reason (kept in the audit log)<input className="text-input" name="reason" required minLength={10} /></label>
        <button className="button" type="submit" disabled={state.pending}>Reset the official draw</button>
        {state.message ? <p className="note" role="status">{state.message}</p> : null}
        {state.error ? <p className="alert" role="alert">{state.error}</p> : null}
      </form>
    </details>
  );
}
