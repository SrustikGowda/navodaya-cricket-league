import { SettingsForm } from "@/components/admin-forms";
import { adminSnapshot } from "@/lib/admin-actions";
import { getActor } from "@/lib/auth";

export async function SeasonSettings() {
  const actor = await getActor();
  if (!actor || actor.role !== "organizer") return null;
  const { season } = await adminSnapshot(actor);
  const values = {
    venueName: season.venueName,
    venueAddress: season.venueAddress,
    mapsUrl: season.mapsUrl,
    registrationClosesAt: season.registrationClosesAt ?? "",
    registrationAnnounced: season.registrationAnnounced,
    startDate: season.startDate,
    endDate: season.endDate,
    fixturesOn: season.fixturesOn ?? "",
    feePaise: season.feePaise,
    feeDueAt: season.feeDueAt ?? "",
    rulesText: season.rulesText,
    contactName: season.contactName,
    contactEmail: season.contactEmail,
    contactPhone: season.contactPhone,
    cricheroesTournamentUrl: season.cricheroesTournamentUrl,
    oneTeamPerBatch: season.oneTeamPerBatch,
    waitlistEnabled: season.waitlistEnabled,
  };
  return (
    <div className="stack">
      <h1>Season settings</h1>
      <p className="quiet">Registration dates are when teams can sign up. Match start and end are the two days games are played. Fixtures date is when the pairings, who plays whom, are published. Times are IST.</p>
      <SettingsForm version={season.version} values={values} />
    </div>
  );
}
