"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FeeRow } from "@/lib/payments";
import { postJson } from "./post-json";

/** Settings › Payments: every approved team with a Paid box to tick once the entry fee is received. */
export function FeeChecklist({ teams, fee }: { teams: FeeRow[]; fee: string | null }) {
  const router = useRouter();
  const [paid, setPaid] = useState(() => new Set(teams.filter((team) => team.status === "paid").map((team) => team.id)));
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");
  const due = teams.filter((team) => team.status !== "exempt");
  const paidCount = due.filter((team) => paid.has(team.id)).length;
  const exemptCount = teams.length - due.length;

  const change = (ids: Set<string>, id: string, add: boolean) => {
    const next = new Set(ids);
    if (add) next.add(id);
    else next.delete(id);
    return next;
  };

  async function toggle(team: FeeRow, next: boolean) {
    setError("");
    setPaid((current) => change(current, team.id, next));
    setBusy((current) => change(current, team.id, true));
    try {
      await postJson("/api/admin", { action: "fee-paid", registrationId: team.id, paid: next });
      router.refresh();
    } catch (caught) {
      setPaid((current) => change(current, team.id, !next));
      setError(`${team.teamName}: ${caught instanceof Error ? caught.message : "not saved."}`);
    } finally {
      setBusy((current) => change(current, team.id, false));
    }
  }

  return (
    <section className="set-card" id="payments">
      <div className="set-head">
        <h2>Payments</h2>
        {fee && due.length > 0 ? (
          <p className="set-count">
            <strong>{paidCount}</strong> of {due.length} paid · {fee} per team
            {exemptCount > 0 ? <span className="set-sub">{teams.length} teams in all. {exemptCount} {exemptCount === 1 ? "team does" : "teams do"} not pay (batch passed out in 2021 or later).</span> : null}
          </p>
        ) : null}
      </div>
      {teams.length === 0 ? <p className="quiet">No approved teams yet.</p> : null}
      {!fee && teams.length > 0 ? <p className="quiet">Set the entry fee above, then tick each team once it has paid.</p> : null}
      {teams.length > 0 ? (
        <ul className="pay-list">
          {teams.map((team) => {
            const exempt = team.status === "exempt";
            const checked = paid.has(team.id);
            return (
              <li key={team.id} className={checked ? "pay-row is-paid" : "pay-row"}>
                <label>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={exempt || !fee || busy.has(team.id)}
                    onChange={(event) => void toggle(team, event.target.checked)}
                  />
                  <span className="pay-name">{team.teamName}</span>
                  {team.batch ? <span className="pay-batch">{team.batch}</span> : null}
                </label>
                <span className="pay-state">{exempt ? "No fee" : checked ? "Paid" : ""}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
