import Link from "next/link";
import { adminSnapshot } from "@/lib/admin-actions";
import { getActor } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatInrFromPaise } from "@/lib/format";
import { listAllPayments } from "@/lib/payments";
import { registrationAvailability } from "@/lib/season";

export default async function AdminHome() {
  const actor = await getActor();
  if (!actor || actor.role !== "organizer") return null;
  const snapshot = await adminSnapshot(actor);
  const payments = await listAllPayments(await getDb(), actor);
  const availability = registrationAvailability(snapshot.season);
  const pending = snapshot.registrations.filter((row) => row.status === "submitted");
  const approved = snapshot.registrations.filter((row) => row.status === "approved");
  const awaiting = payments.filter((row) => row.status === "submitted");
  const verifiedPaise = payments.filter((row) => row.status === "verified").reduce((sum, row) => sum + row.amountPaise, 0);
  const attention = [
    pending.length > 0
      ? {
          href: "/admin/registrations?status=submitted",
          text: `${pending.length} registration${pending.length === 1 ? "" : "s"} need${pending.length === 1 ? "s" : ""} review`,
          action: "Review",
        }
      : null,
    snapshot.season.feePaise != null && snapshot.season.feePaise > 0 && !snapshot.season.feeDueAt
      ? { href: "/admin/settings", text: "A fee is set, but the payment deadline is missing.", action: "Review" }
      : null,
  ].filter((item): item is { href: string; text: string; action: string } => item != null);
  const cards = [
    { href: "/admin/registrations", value: String(snapshot.registrations.length), label: "Registrations", alert: false },
    { href: "/admin/registrations?status=submitted", value: String(pending.length), label: "Pending review", alert: pending.length > 0 },
    { href: "/admin/registrations?status=approved", value: String(approved.length), label: "Approved teams", alert: false },
    { href: "/admin/payments?status=submitted", value: String(awaiting.length), label: "Payments to verify", alert: awaiting.length > 0 },
    { href: "/admin/payments?status=verified", value: formatInrFromPaise(verifiedPaise), label: "Verified collections", alert: false },
    { href: "/admin/fixtures", value: String(snapshot.published.length), label: "Published matches", alert: false },
  ];

  return (
    <div className="admin-overview">
      <div className="admin-heading">
        <h1>Overview</h1>
        <p className="status-badge">{statusBadge(availability)}</p>
      </div>
      {attention.length > 0 ? (
        <section className="attention" aria-label="Needs attention">
          <h2>Needs attention</h2>
          {attention.map((item) => (
            <div className="attention-row" key={item.href + item.text}>
              <p>{item.text}</p>
              <Link className="button admin-review" href={item.href}>{item.action}</Link>
            </div>
          ))}
        </section>
      ) : null}
      <div className="dash-grid">
        {cards.map((card) => (
          <Link key={card.label} className={card.alert ? "dash-card alert" : "dash-card"} href={card.href}>
            <strong>{card.value}</strong>
            <span>{card.label}</span>
          </Link>
        ))}
      </div>
      <details className="export-menu">
        <summary>Export data</summary>
        <div>
          <a href="/api/admin/export/registrations">Registrations</a>
          <a href="/api/admin/export/payments">Payments</a>
          <a href="/api/admin/export/fixtures">Fixtures</a>
        </div>
      </details>
    </div>
  );
}

function statusBadge(availability: ReturnType<typeof registrationAvailability>) {
  if (availability.accepting) return "Registration open";
  if (availability.phase === "closed") return "Registration closed";
  if (availability.phase === "open") return "Registration unavailable";
  return "Registration opens soon";
}
