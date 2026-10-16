import { RegistrationReview } from "@/components/registration-review";
import { adminSnapshot } from "@/lib/admin-actions";
import { getActor } from "@/lib/auth";
import { formatInrFromPaise, formatIst } from "@/lib/format";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  changes_requested: "Changes requested",
  approved: "Approved",
  waitlisted: "Waitlisted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export default async function RegistrationsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const actor = await getActor();
  if (!actor || actor.role !== "organizer") return null;
  const filters = await searchParams;
  const { registrations } = await adminSnapshot(actor);
  const shown = registrations.filter((registration) => {
    if (filters.status && registration.status !== filters.status) return false;
    if (filters.q && !`${registration.teamName} ${registration.captainName} ${registration.captainEmail} ${registration.reference ?? ""}`.toLowerCase().includes(filters.q.toLowerCase())) return false;
    return true;
  });
  return (
    <div className="stack">
      <h1>Registrations</h1>
      <form className="stack" method="get">
        <label className="field">
          Status
          <select className="text-input" name="status" defaultValue={filters.status ?? ""}>
            <option value="">All</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="field">Search<input className="text-input" name="q" defaultValue={filters.q ?? ""} placeholder="Team, captain, email, or reference" /></label>
        <button className="button" type="submit">Filter</button>
      </form>
      {shown.length === 0 ? <p className="quiet">{registrations.length === 0 ? "No registrations yet." : "No registrations match this filter."}</p> : null}
      {shown.map((registration) => (
        <article key={registration.id} className="section">
          <h2>{registration.teamName || "Untitled"} · {STATUS_LABELS[registration.status] ?? registration.status}</h2>
          <p>{registration.captainName} · {registration.captainEmail} · {registration.captainPhone}</p>
          <p>Reference {registration.reference ?? "not issued"}</p>
          {registration.batchAdmissionYear != null && registration.batchLeavingYear != null ? (
            <p>Batch {registration.batchAdmissionYear}–{registration.batchLeavingYear}</p>
          ) : null}
          <p>
            Publication consent {registration.publicationConsent ? "recorded" : "missing"}.
            {" "}
            Fee acknowledgement {registration.feeConsent ? "recorded" : "not recorded"}
            {registration.feeConsent && registration.feeConsentPaise != null ? ` for ${formatInrFromPaise(registration.feeConsentPaise)}` : ""}
            {registration.feeConsentDueAt ? `, due ${formatIst(registration.feeConsentDueAt)}` : ""}.
          </p>
          {registration.reviewReason ? <p>Last note: {registration.reviewReason}</p> : null}
          {registration.nameReviewRequired ? <p>Name review required.</p> : null}
          {registration.players.length > 0 ? (
            <ul>{registration.players.map((player) => <li key={player.id}>{player.name} · {player.role}</li>)}</ul>
          ) : null}
          <RegistrationReview id={registration.id} teamName={registration.teamName || "this application"} status={registration.status} />
        </article>
      ))}
    </div>
  );
}
