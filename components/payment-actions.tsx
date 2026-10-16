"use client";

import { AdminFeedback, useAdminPost } from "./admin-post";

export function PaymentActions({ id, status }: { id: string; status: string }) {
  const verify = useAdminPost();
  const reject = useAdminPost();
  const refund = useAdminPost();
  return (
    <div className="stack">
      {status === "submitted" ? (
        <>
          <button className="button" type="button" disabled={verify.pending} onClick={() => void verify.submit("verify-payment", { attemptId: id })}>Mark verified</button>
          <AdminFeedback message={verify.message} error={verify.error} />
          <form className="stack" onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void reject.submit("reject-payment", { attemptId: id, reason: String(data.get("reason") ?? "") });
          }}>
            <label className="field">Reason for rejecting this evidence<input className="text-input" name="reason" required /></label>
            <button className="button secondary" type="submit" disabled={reject.pending}>Reject evidence</button>
            <AdminFeedback message={reject.message} error={reject.error} />
          </form>
        </>
      ) : null}
      {status === "verified" ? (
        <form className="stack" onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void refund.submit("refund", {
            attemptId: id,
            status: String(data.get("status") ?? "refund_pending"),
            reason: String(data.get("reason") ?? ""),
            refundReference: String(data.get("refundReference") ?? ""),
          });
        }}>
          <label className="field">Refund status
            <select className="text-input" name="status">
              <option value="refund_pending">Refund pending</option>
              <option value="refunded">Refunded</option>
            </select>
          </label>
          <label className="field">Reason<input className="text-input" name="reason" required /></label>
          <label className="field">Refund reference<input className="text-input" name="refundReference" /></label>
          <button className="button secondary" type="submit" disabled={refund.pending}>Record refund</button>
          <AdminFeedback message={refund.message} error={refund.error} />
        </form>
      ) : null}
    </div>
  );
}
