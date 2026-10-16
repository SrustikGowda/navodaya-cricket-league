import { DomainError } from "./errors";
import { addCalendarStamp, formatIst, icsLocalStamp } from "./format";
import type { PublicFixture } from "./public-data";

export function buildFixtureCalendar(fixture: PublicFixture, venueName: string): string {
  if (!fixture.startsAt || fixture.durationMinutes == null) {
    throw new DomainError("This match has no start or duration yet, so a calendar end time cannot be generated.", 422, "calendar");
  }
  const end = new Date(new Date(fixture.startsAt).getTime() + fixture.durationMinutes * 60_000).toISOString();
  const description = [
    `NCL 2026 · ${fixture.stage}`,
    fixture.matchNumber ? `Match ${fixture.matchNumber}` : null,
    fixture.groundName ? `Ground: ${fixture.groundName}` : "Ground to be announced",
    fixture.reportingAt ? `Reporting: ${formatIst(fixture.reportingAt)}` : null,
    fixture.changeNote ? `Update: ${fixture.changeNote}` : null,
    "Times are Asia/Kolkata (IST).",
  ]
    .filter(Boolean)
    .join("\\n");
  const uid = `fixture-${fixture.id}@ncl.jnvckm.org`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JNVCKM//Navodaya Cricket League//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Kolkata",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0530",
    "TZOFFSETTO:+0530",
    "TZNAME:IST",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SEQUENCE:${fixture.calendarSequence}`,
    `DTSTAMP:${addCalendarStamp()}`,
    `DTSTART;TZID=Asia/Kolkata:${icsLocalStamp(fixture.startsAt)}`,
    `DTEND;TZID=Asia/Kolkata:${icsLocalStamp(end)}`,
    `SUMMARY:${escapeIcs(`NCL 2026: ${fixture.teamALabel} vs ${fixture.teamBLabel}`)}`,
    `LOCATION:${escapeIcs(fixture.groundName ? `${venueName}, ${fixture.groundName}` : venueName)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function shouldNotifyScheduleUpdate(previous: { sequence: number; updatedAt: string | null }, next: { sequence: number; updatedAt: string | null }) {
  return previous.sequence !== next.sequence || previous.updatedAt !== next.updatedAt;
}
