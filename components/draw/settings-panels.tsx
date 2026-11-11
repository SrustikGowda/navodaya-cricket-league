"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AWARD_KEYS, LABELS, type Awards } from "@/lib/draw/awards";
import { AdminFeedback, useAdminPost } from "../admin-post";
import { postJson } from "../post-json";

const UNIT: Record<(typeof AWARD_KEYS)[number], string | null> = { batter: "Runs", bowler: "Wickets", mvp: null, fielder: "Dismissals" };

/** Best batter, bowler, MVP and fielder, typed in by an organizer. Shown on the History page once the final has a winner. */
export function AwardsForm({ awards }: { awards: Awards }) {
  const form = useAdminPost();
  const [state, setState] = useState<Awards>(awards);
  const set = (key: (typeof AWARD_KEYS)[number], field: keyof Awards["batter"], value: string) =>
    setState((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));
  return (
    <form
      className="set-card"
      id="awards"
      onSubmit={(event) => {
        event.preventDefault();
        void form.submit("save-awards", { awards: state });
      }}
    >
      <div className="set-head">
        <h2>Awards</h2>
        <p className="quiet">Shown on the History page after the final.</p>
      </div>
      {AWARD_KEYS.map((key) => {
        const unit = UNIT[key];
        return (
          <fieldset key={key} className="award-row">
            <legend>{LABELS[key]}</legend>
            <input className="text-input" aria-label={`${LABELS[key]}: player`} placeholder="Player" value={state[key].name} onChange={(event) => set(key, "name", event.target.value)} maxLength={80} />
            <input className="text-input" aria-label={`${LABELS[key]}: team`} placeholder="Team" value={state[key].team} onChange={(event) => set(key, "team", event.target.value)} maxLength={80} />
            {unit ? (
              <input
                className="text-input"
                aria-label={`${LABELS[key]}: ${unit.toLowerCase()}`}
                placeholder={unit}
                inputMode="numeric"
                value={state[key].figure}
                onChange={(event) => set(key, "figure", event.target.value.replace(/\D/g, ""))}
                maxLength={5}
              />
            ) : (
              <span aria-hidden="true" />
            )}
          </fieldset>
        );
      })}
      <div className="set-actions">
        <button className="button" type="submit" disabled={form.pending}>
          {form.pending ? "Saving" : "Save awards"}
        </button>
        <AdminFeedback message={form.message ? "Saved." : ""} error={form.error} />
      </div>
    </form>
  );
}

type RunInfo = { ref: string; publishedAt: string; results: number };

/** Admin-only: delete the official run so the Real Run can be done again. The old run is archived, not destroyed. */
export function OfficialRunPanel({ run, phrase, passwordConfigured }: { run: RunInfo | null; phrase: string; passwordConfigured: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<{ pending: boolean; message: string; error: string }>({ pending: false, message: "", error: "" });
  return (
    <section className="set-card" id="official-run">
      <h2>Official draw</h2>
      {state.message ? (
        <p className="note" role="status">
          {state.message}
        </p>
      ) : null}
      {!run ? (
        <p className="quiet">No official draw yet. Do the Real Run on the Fixtures page.</p>
      ) : (
        <>
          <p>
            <strong>{run.ref}</strong> · published {new Date(run.publishedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
          </p>
          {!passwordConfigured ? (
            <p className="alert" role="alert">
              The draw password is not set on the server, so the run cannot be deleted.
            </p>
          ) : null}
          <details className="set-danger">
            <summary>Delete this run to redo the draw</summary>
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
                    acknowledgeResults: true,
                  });
                  setState({ pending: false, message: `Run ${String(result.ref)} was deleted. You can do the Real Run again.`, error: "" });
                  router.refresh();
                } catch (caught) {
                  setState({ pending: false, message: "", error: caught instanceof Error ? caught.message : "Nothing was changed." });
                }
              }}
            >
              <p className="quiet">
                The fixtures{run.results > 0 ? ` and ${run.results} ${run.results === 1 ? "result" : "results"}` : ""} come off the site. They are kept in the database.
              </p>
              <label className="field">
                Draw password
                <input className="text-input" name="password" type="password" autoComplete="off" required />
              </label>
              <label className="field">
                Type {phrase}
                <input className="text-input" name="confirmation" autoComplete="off" required />
              </label>
              <button className="button secondary" type="submit" disabled={state.pending}>
                {state.pending ? "Deleting" : "Delete the official run"}
              </button>
              {state.error ? (
                <p className="alert" role="alert">
                  {state.error}
                </p>
              ) : null}
            </form>
          </details>
        </>
      )}
    </section>
  );
}
