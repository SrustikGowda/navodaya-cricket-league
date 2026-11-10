"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AWARD_KEYS, LABELS, type Awards } from "@/lib/draw/awards";
import { AdminFeedback, useAdminPost } from "../admin-post";
import { postJson } from "../post-json";

const FIELDS: Record<(typeof AWARD_KEYS)[number], { unit: string; hint: string } | null> = {
  batter: { unit: "Runs", hint: "from 5 innings, average 40.67, strike rate 146.99" },
  bowler: { unit: "Wickets", hint: "in 10 overs, economy 5.80" },
  mvp: null,
  fielder: { unit: "Dismissals", hint: "catches and run-outs" },
};

/** Best batter, bowler, MVP and fielder, typed in by an organizer. They appear on the History page once the final has a winner. */
export function AwardsForm({ awards }: { awards: Awards }) {
  const form = useAdminPost();
  const [state, setState] = useState<Awards>(awards);
  const set = (key: (typeof AWARD_KEYS)[number], field: keyof Awards["batter"], value: string) =>
    setState((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));
  return (
    <section className="stack" id="awards">
      <h2>Tournament awards</h2>
      <p className="quiet">
        Type these in by hand once they are known. They are shown on the Hall of Champions (History page) for this edition after the final has a winner. Leave a player blank to hide that award.
      </p>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void form.submit("save-awards", { awards: state });
        }}
      >
        {AWARD_KEYS.map((key) => {
          const extra = FIELDS[key];
          return (
            <fieldset key={key} className="stack">
              <legend>{LABELS[key]}</legend>
              <label className="field">
                Player name
                <input className="text-input" value={state[key].name} onChange={(event) => set(key, "name", event.target.value)} maxLength={80} />
              </label>
              <label className="field">
                Team
                <input className="text-input" value={state[key].team} onChange={(event) => set(key, "team", event.target.value)} maxLength={80} />
              </label>
              {extra ? (
                <label className="field">
                  {extra.unit}
                  <input className="text-input" inputMode="numeric" value={state[key].figure} onChange={(event) => set(key, "figure", event.target.value.replace(/\D/g, ""))} maxLength={5} />
                </label>
              ) : null}
              <label className="field">
                {extra ? "More figures, optional" : "Note, optional"}
                <input className="text-input" value={state[key].details} onChange={(event) => set(key, "details", event.target.value)} maxLength={160} placeholder={extra ? `For example: ${extra.hint}` : "Why they won it"} />
              </label>
            </fieldset>
          );
        })}
        <button className="button" type="submit" disabled={form.pending}>
          {form.pending ? "Saving" : "Save awards"}
        </button>
        <AdminFeedback message={form.message ? "Saved. The History page is updated." : ""} error={form.error} />
      </form>
    </section>
  );
}

type RunInfo = { ref: string; publishedAt: string; results: number };

/** Admin-only: delete the official run so the Real Run can be done again. Nothing is destroyed; the old run is archived. */
export function OfficialRunPanel({ run, phrase, passwordConfigured }: { run: RunInfo | null; phrase: string; passwordConfigured: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<{ pending: boolean; message: string; error: string }>({ pending: false, message: "", error: "" });
  const [acknowledge, setAcknowledge] = useState(false);
  return (
    <section className="stack" id="official-run">
      <h2>Official draw run</h2>
      {!run ? (
        <p>
          {state.message || "There is no official run right now."} The Real Run can be done from the Fixtures page.
        </p>
      ) : (
        <>
          <p>
            Official run <strong>{run.ref}</strong>, published {new Date(run.publishedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST.
          </p>
          <p className="quiet">
            To redo the Real Run, delete this run first. Only an admin can. The old draw, its fixtures and any scores stay in the database as a record and come off the site; the History entry made from it is removed. You then run the Real Run again from the Fixtures page.
          </p>
          {!passwordConfigured ? <p className="alert" role="alert">NCL_FIXTURE_RUN_PASSWORD is not set on the server, so the official run cannot be deleted or redone.</p> : null}
          <details className="stack">
            <summary>Delete the official run</summary>
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
                    acknowledgeResults: acknowledge,
                  });
                  setState({ pending: false, message: `Run ${String(result.ref)} was deleted.`, error: "" });
                  setAcknowledge(false);
                  router.refresh();
                } catch (caught) {
                  setState({ pending: false, message: "", error: caught instanceof Error ? caught.message : "Nothing was changed." });
                }
              }}
            >
              <label className="field">
                Draw password
                <input className="text-input" name="password" type="password" autoComplete="off" required />
              </label>
              <label className="field">
                Type {phrase} to confirm
                <input className="text-input" name="confirmation" autoComplete="off" required />
              </label>
              <label className="field">
                Reason (kept in the audit log)
                <input className="text-input" name="reason" required minLength={10} />
              </label>
              {run.results > 0 ? (
                <label className="check">
                  <input type="checkbox" checked={acknowledge} onChange={(event) => setAcknowledge(event.target.checked)} />{" "}
                  {run.results} {run.results === 1 ? "match has" : "matches have"} a result. I understand they come off the site (they stay in the database).
                </label>
              ) : null}
              <button className="button secondary" type="submit" disabled={state.pending}>
                {state.pending ? "Deleting" : "Delete the official run"}
              </button>
              {state.error ? <p className="alert" role="alert">{state.error}</p> : null}
            </form>
          </details>
        </>
      )}
      {run && state.message ? <p className="note" role="status">{state.message}</p> : null}
    </section>
  );
}
