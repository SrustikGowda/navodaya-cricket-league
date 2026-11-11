import type { FeeStatus } from "@/lib/fee-state";

/** A team's entry fee on its public card: Fee paid, Fee not paid, or No fee (older batches). Nothing before a fee is set. */
export function FeeBadge({ status, long = false }: { status: FeeStatus; long?: boolean }) {
  if (status === "paid") return <span className="tm-paid">{long ? "Entry fee paid" : "Fee paid"}</span>;
  if (status === "unpaid") return <span className="tm-unpaid">{long ? "Entry fee not paid" : "Fee not paid"}</span>;
  if (status === "exempt") return <span className="tm-nofee">{long ? "No entry fee" : "No fee"}</span>;
  return null;
}
