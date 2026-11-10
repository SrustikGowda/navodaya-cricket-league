"use client";

import { useState } from "react";
import { AdminFeedback, useAdminPost } from "./admin-post";

export type FeeState = "paid" | "unpaid" | "exempt" | "none";

/** Entry fee on an approved team's admin card: see whether it is paid, and mark it paid or take the mark back. */
export function FeePaid({ registrationId, teamName, status }: { registrationId: string; teamName: string; status: FeeState }) {
  const form = useAdminPost();
  const [note, setNote] = useState("");

  if (status === "exempt") return <p className="fee-line fee-line--muted">Entry fee: <strong>not due</strong>. This batch passed out in 2021 or later.</p>;
  if (status === "none") return <p className="fee-line fee-line--muted">Entry fee: no fee is set for this season.</p>;

  return (
    <div className={status === "paid" ? "fee-line fee-line--paid" : "fee-line"}>
      <p>
        Entry fee: <strong>{status === "paid" ? "Paid" : "Not paid"}</strong>
        {status === "paid" ? <span className="fee-tick" aria-hidden="true"> ✓</span> : null}
      </p>
      {status === "unpaid" ? (
        <form
          className="fee-form"
          onSubmit={(event) => {
            event.preventDefault();
            void form.submit("fee-paid", { registrationId, paid: true, note });
          }}
        >
          <label className="field">
            Note, optional (cash, UPI, who received it)
            <input className="text-input" value={note} onChange={(event) => setNote(event.target.value)} maxLength={120} />
          </label>
          <button className="button" type="submit" disabled={form.pending}>
            {form.pending ? "Saving" : "Mark entry fee paid"}
          </button>
        </form>
      ) : (
        <button
          className="button secondary"
          type="button"
          disabled={form.pending}
          onClick={() => {
            if (window.confirm(`Mark ${teamName} as NOT paid? The change is recorded.`)) void form.submit("fee-paid", { registrationId, paid: false });
          }}
        >
          {form.pending ? "Saving" : "Mark not paid"}
        </button>
      )}
      <AdminFeedback message="" error={form.error} />
    </div>
  );
}
