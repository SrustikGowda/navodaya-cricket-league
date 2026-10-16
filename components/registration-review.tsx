"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "./post-json";

const DECISIONS = [
  ["approve", "Approve"],
  ["waitlist", "Waitlist"],
  ["request_changes", "Ask for changes"],
  ["reject", "Reject"],
] as const;

export function RegistrationReview({ id, teamName, status }: { id: string; teamName: string; status: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const decisions = DECISIONS.filter(([decision]) => (decision === "approve" ? status !== "approved" : status !== decision));

  async function decide(decision: (typeof DECISIONS)[number][0]) {
    if (decision !== "approve" && reason.trim().length < 3) {
      setError("Add a short reason for this decision.");
      return;
    }
    setPending(decision);
    setError("");
    try {
      await postJson("/api/admin", { action: "review", id, decision, reason });
      setReason("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The decision was not saved.");
    } finally {
      setPending("");
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${teamName}? This removes the team.`)) return;
    setPending("remove");
    setError("");
    try {
      await postJson("/api/admin", { action: "remove-registration", id });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The application was not removed.");
      setPending("");
    }
  }

  if (status === "approved") {
    return (
      <div className="review-panel">
        <button className="button secondary" type="button" disabled={Boolean(pending)} onClick={remove}>
          {pending === "remove" ? "Deleting" : "Delete team"}
        </button>
        {error ? <p className="alert" role="alert">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="review-panel">
      <label className="field">
        Reason, required unless you approve
        <input className="text-input" value={reason} onChange={(event) => setReason(event.target.value)} disabled={Boolean(pending)} />
      </label>
      <div className="review-row">
        {decisions.map(([decision, label]) => (
          <button key={decision} className={decision === "approve" ? "button" : "button secondary"} type="button" disabled={Boolean(pending)} onClick={() => decide(decision)}>
            {pending === decision ? "Saving" : label}
          </button>
        ))}
        <button className="button secondary" type="button" disabled={Boolean(pending)} onClick={remove}>
          {pending === "remove" ? "Deleting" : "Delete team"}
        </button>
      </div>
      {error ? <p className="alert" role="alert">{error}</p> : null}
    </div>
  );
}
