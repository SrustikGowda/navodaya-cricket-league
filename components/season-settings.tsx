import { SettingsForm } from "@/components/admin-forms";
import type { Season } from "@/lib/season";

export function SeasonSettings({ season }: { season: Season }) {
  return (
    <SettingsForm
      version={season.version}
      values={{
        registrationAnnounced: season.registrationAnnounced,
        registrationClosesAt: season.registrationClosesAt ?? "",
        startDate: season.startDate,
        endDate: season.endDate,
        fixturesOn: season.fixturesOn ?? "",
        feePaise: season.feePaise,
        venueName: season.venueName,
        venueAddress: season.venueAddress,
        mapsUrl: season.mapsUrl,
        contactName: season.contactName,
        contactPhone: season.contactPhone,
        contactEmail: season.contactEmail,
        rulesText: season.rulesText,
      }}
    />
  );
}
