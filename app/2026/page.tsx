export const dynamic = "force-dynamic";

import Link from "next/link";
import { HomeMotion } from "@/components/home-motion";
import { PublicShell } from "@/components/shell";
import { getDb } from "@/lib/db";
import { formatEventDates, formatInrFromPaise, formatIst } from "@/lib/format";
import { listPublicAnnouncements, listPublicFixtures, listPublicTeams } from "@/lib/public-data";
import { getActiveSeason, toPublicSeason } from "@/lib/season";

export default async function SeasonHome() {
  const db = await getDb();
  const season = toPublicSeason(await getActiveSeason(db));
  const [announcements, fixtures, teams] = await Promise.all([
    listPublicAnnouncements(db),
    listPublicFixtures(db),
    listPublicTeams(db),
  ]);
  const now = Date.now(); // eslint-disable-line react-hooks/purity -- next match is relative to this request
  const upcoming = fixtures.filter((fixture) => fixture.startsAt && new Date(fixture.startsAt).getTime() > now && !["completed", "cancelled"].includes(fixture.status)).slice(0, 3);
  const shownTeams = teams.slice(0, 4);
  const registerLabel = season.registrationPhase === "open" ? "Register a team" : season.registrationPhase === "closed" ? "Registration is closed" : "Registration opens soon";
  const directions = httpUrl(season.mapsUrl);
  const showClose = Boolean(season.registrationClosesAt && (season.registrationAnnounced || season.registrationPhase === "closed"));
  const close = season.registrationClosesAt ? splitIst(season.registrationClosesAt) : null;
  return (
    <PublicShell home>
      <HomeMotion />
      <section className="bc-hero">
        <div className="bc-hero-art" aria-hidden="true">
          <span className="bc-fifteen">{season.editionNumber}</span>
          <span className="bc-sweep" />
        </div>
        <div className="bc-hero-copy">
          <p className="bc-kicker">{season.editionNumber}TH EDITION · {season.year}</p>
          <h1 className="bc-title">Navodaya Cricket League</h1>
          <p className="bc-date">{formatEventDates(season.startDate, season.endDate)}</p>
          <p className="bc-place">{season.venueName.trim()}, Bengaluru</p>
          <div className="bc-actions">
            <Link className="bc-primary" href="/2026/register">{registerLabel}</Link>
          </div>
          <p className="bc-credit">Organized by alumni batch 2005 - 2012.</p>
        </div>
      </section>

      <section className="bc-sheet home-reveal" aria-label="Registration">
        <div className="bc-ticket">
          <div className="bc-ticket-cols">
            <div>
              <p>Entry fee</p>
              <strong>{season.feePaise == null ? "Not set" : season.feePaise === 0 ? "Free" : formatInrFromPaise(season.feePaise)}</strong>
              {season.feePaise != null && season.feePaise > 0 ? <span>per team</span> : null}
            </div>
            <div>
              <p>Entry closes</p>
              {showClose && close ? (
                <strong>
                  <span aria-hidden="true">{shortStamp(season.registrationClosesAt!)}</span>
                  <span className="bc-sr">{close.date}</span>
                </strong>
              ) : <strong>Not announced</strong>}
              {showClose && close ? <span>{close.time}</span> : null}
            </div>
          </div>
          {season.feePaise != null && season.feePaise > 0 ? <p className="bc-fee-note">Batches that passed out in 2021 or later do not pay the entry fee.</p> : null}
          {season.fixturesOn ? (
            <p className="bc-fixtures">
              <span className="bc-fixtures-kicker">Announcement</span>
              <span className="bc-fixtures-line" aria-hidden="true">Fixtures to be announced {shortDay(season.fixturesOn)}</span>
              <span className="bc-sr">Fixtures will be announced on {formatIst(`${season.fixturesOn}T00:00:00+05:30`, false)}</span>
            </p>
          ) : null}
        </div>
      </section>

      {upcoming.length > 0 ? (
        <section className="bc-matches home-reveal">
          <h2>Matches</h2>
          <ul>
            {upcoming.map((fixture) => (
              <li key={fixture.id}>
                <Link href={`/2026/matches/${fixture.id}`}>{fixture.teamALabel} vs {fixture.teamBLabel}</Link>
                <span>{formatIst(fixture.startsAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {shownTeams.length > 0 ? (
        <section className="bc-teams home-reveal">
          <div className="bc-section-head">
            <h2>Meet the teams</h2>
            <Link href="/2026/teams">View all</Link>
          </div>
          <ul>
            {shownTeams.map((team) => (
              <li key={team.id}>
                <Link className="bc-team" href={`/2026/teams/${team.slug}`}>
                  <span className="bc-mono" aria-hidden="true">{monogram(team.teamName)}</span>
                  <span className="bc-team-copy">
                    <strong>{team.teamName}</strong>
                    {batchLabel(team.batchAdmissionYear, team.batchLeavingYear) ? <span>{batchLabel(team.batchAdmissionYear, team.batchLeavingYear)}</span> : null}
                  </span>
                  <span className="bc-arrow" aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {announcements.length > 0 ? (
        <section className="bc-news home-reveal">
          <h2>Announcements</h2>
          {announcements.map((item) => (
            <article key={item.id}><h3>{item.title}</h3><p>{item.body}</p></article>
          ))}
        </section>
      ) : null}

      <section className="bc-venue home-reveal">
        <article className="bc-venue-card">
          <p className="bc-venue-label">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.4" /></svg>
            The venue
          </p>
          <h2>{season.venueName.trim()}</h2>
          <p className="bc-address">{season.venueAddress}</p>
          {directions ? <a className="bc-directions" href={directions}>Get directions <span aria-hidden="true">↗</span></a> : null}
        </article>
        {season.contactName || season.contactPhone || season.contactEmail ? (
          <div className="bc-contact">
            <div className="bc-contact-id">
              {season.contactName ? <span className="bc-mono" aria-hidden="true">{monogram(season.contactName)}</span> : null}
              <div>
                <p className="bc-contact-label">Contact organizers</p>
                {season.contactName ? <p className="bc-contact-name">{season.contactName}</p> : null}
              </div>
            </div>
            {season.contactPhone || season.contactEmail ? (
              <div className="bc-help">
                {season.contactPhone ? <a href={`tel:${season.contactPhone}`}>Call</a> : null}
                {season.contactEmail ? <a href={`mailto:${season.contactEmail}`}>Email</a> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </PublicShell>
  );
}

function splitIst(iso: string) {
  const full = formatIst(iso);
  const [date, time] = full.split(", ");
  return { date, time: time ?? "" };
}

function monogram(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "N";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function batchLabel(admission: number | null, leaving: number | null) {
  if (admission != null && leaving != null) return `${admission}–${leaving}`;
  if (admission != null) return String(admission);
  if (leaving != null) return String(leaving);
  return null;
}

function shortStamp(iso: string) {
  return shortDay(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)));
}

function shortDay(date: string) {
  const value = new Date(`${date}T00:00:00+05:30`);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric" }).format(value);
  const month = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", month: "short" }).format(value);
  return `${day} ${month}`;
}

function httpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}
