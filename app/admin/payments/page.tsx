import Link from "next/link";
import { PaymentActions } from "@/components/payment-actions";
import { getActor } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatInrFromPaise } from "@/lib/format";
import { listAllPayments } from "@/lib/payments";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const actor = await getActor();
  if (!actor || actor.role !== "organizer") return null;
  const filters = await searchParams;
  const payments = (await listAllPayments(await getDb(), actor)).filter((payment) => !filters.status || payment.status === filters.status);
  return (
    <div className="stack">
      <h1>Payments</h1>
      <p>Verification means you checked the receiving account. This site does not move money.</p>
      <p><Link href="/api/admin/export/payments">Download reconciliation CSV</Link></p>
      {payments.length === 0 ? <p>No payment attempts yet.</p> : null}
      {payments.map((payment) => (
        <article key={payment.id} className="section">
          <h2>{payment.teamName} · {payment.status}</h2>
          <p>{formatInrFromPaise(payment.amountPaise)} · {payment.transactionReference ?? "no reference"} · registration {payment.reference ?? "—"}</p>
          {payment.receiptPath ? <p><a href={`/api/receipts/${payment.id}`}>Open receipt</a></p> : null}
          <PaymentActions id={payment.id} status={payment.status} />
        </article>
      ))}
    </div>
  );
}
