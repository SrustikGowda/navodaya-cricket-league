import type { Queryable } from "./db";
import { reportingIso } from "./format";
import { remember } from "./read-cache";
import { bool, num, requiredStr, str, type Row } from "./rows";
import { getActiveSeason } from "./season";

export type PublicFixture = {
  id: string;
  matchNumber: number | null;
  stage: string;
  groundId: string | null;
  groundName: string | null;
  teamAId: string | null;
  teamBId: string | null;
  teamALabel: string;
  teamBLabel: string;
  startsAt: string | null;
  durationMinutes: number | null;
  reportingAt: string | null;
  overs: number | null;
  status: string;
  changeNote: string | null;
  calendarSequence: number;
  scorecardUrl: string | null;
  livestreamUrl: string | null;
  summary: string | null;
  summarySource: string | null;
  summaryUpdatedAt: string | null;
  winnerLabel: string | null;
  needsResolution: boolean;
  updatedAt: string | null;
  scheduleVersionId: string | null;
  schedulePublishedAt: string | null;
  scheduleNote: string | null;
};

async function allPublicFixtures(db: Queryable): Promise<PublicFixture[]> {
  return remember("public-fixtures", 20_000, async () => {
    const season = await getActiveSeason(db);
    const rows = await db.query("select * from public_fixtures where season_id = $1 order by starts_at nulls last, match_number", [
      season.id,
    ]);
    return rows.map(mapPublicFixture);
  });
}

export async function listPublicFixtures(
  db: Queryable,
  filters: { day?: string; team?: string; stage?: string; ground?: string } = {},
): Promise<PublicFixture[]> {
  const fixtures = await allPublicFixtures(db);
  return fixtures.filter((fixture) => {
    if (filters.stage && fixture.stage !== filters.stage) return false;
    if (filters.ground && fixture.groundName?.toLowerCase() !== filters.ground.toLowerCase() && fixture.groundId !== filters.ground) return false;
    if (filters.team) {
      const needle = filters.team.toLowerCase();
      const names = [fixture.teamALabel, fixture.teamBLabel, fixture.teamAId, fixture.teamBId].filter(Boolean).map((value) => String(value).toLowerCase());
      if (!names.some((value) => value === needle || value.includes(needle))) return false;
    }
    if (filters.day && fixture.startsAt) {
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(
        new Date(fixture.startsAt),
      );
      if (day !== filters.day) return false;
    }
    if (filters.day && !fixture.startsAt) return false;
    return true;
  });
}

export async function getPublicFixture(db: Queryable, id: string): Promise<PublicFixture | null> {
  const fixtures = await allPublicFixtures(db);
  return fixtures.find((fixture) => fixture.id === id) ?? null;
}

export async function listPublicTeams(db: Queryable) {
  return remember("public-teams", 20_000, async () => {
    const season = await getActiveSeason(db);
    const rows = await db.query(
      "select * from public_teams where season_id = $1 order by team_name",
      [season.id],
    );
    return rows.map(mapPublicTeam);
  });
}

export async function getPublicTeam(db: Queryable, slug: string) {
  const season = await getActiveSeason(db);
  const rows = await db.query("select * from public_teams where season_id = $1 and slug = $2", [season.id, slug]);
  if (!rows[0]) return null;
  const team = mapPublicTeam(rows[0]);
  const squad = await db.query(
    "select name, batch_label, role, jersey_number from public_squad where registration_id = $1 order by sort_order",
    [team.id],
  );
  const fixtures = (await listPublicFixtures(db)).filter(
    (fixture) => fixture.teamAId === team.id || fixture.teamBId === team.id,
  );
  return {
    ...team,
    squad: squad.map((player) => ({
      name: requiredStr(player, "name"),
      batchLabel: str(player, "batch_label"),
      role: requiredStr(player, "role"),
      jerseyNumber: num(player, "jersey_number"),
    })),
    fixtures,
  };
}

export async function listPublicAnnouncements(db: Queryable) {
  return remember("public-announcements", 20_000, async () => {
    const season = await getActiveSeason(db);
    const rows = await db.query(
      "select * from public_announcements where season_id = $1 order by published_at desc nulls last",
      [season.id],
    );
    return rows.map((row) => ({
      id: requiredStr(row, "id"),
      title: requiredStr(row, "title"),
      body: requiredStr(row, "body"),
      publishedAt: str(row, "published_at"),
    }));
  });
}

export async function listPublicSponsors(db: Queryable) {
  const season = await getActiveSeason(db);
  const rows = await db.query("select * from public_sponsors where season_id = $1 order by sort_order, name", [season.id]);
  return rows.map((row) => ({
    id: requiredStr(row, "id"),
    name: requiredStr(row, "name"),
    url: str(row, "url"),
    logoPath: str(row, "logo_path"),
  }));
}

export async function listPublicMedia(db: Queryable) {
  const season = await getActiveSeason(db);
  const rows = await db.query("select * from public_media where season_id = $1 order by created_at desc", [season.id]);
  return rows.map((row) => ({
    id: requiredStr(row, "id"),
    path: requiredStr(row, "path"),
    caption: str(row, "caption"),
  }));
}

export async function approvedTeamCount(db: Queryable): Promise<number> {
  const season = await getActiveSeason(db);
  const rows = await db.query<{ count: number }>("select count(*)::int as count from public_teams where season_id = $1", [season.id]);
  return rows[0]?.count ?? 0;
}

export async function scheduleMeta(db: Queryable) {
  const fixtures = await listPublicFixtures(db);
  const updatedAt = fixtures.reduce<string | null>((latest, fixture) => {
    if (!fixture.updatedAt) return latest;
    if (!latest || fixture.updatedAt > latest) return fixture.updatedAt;
    return latest;
  }, null);
  const sequence = fixtures.reduce((sum, fixture) => sum + fixture.calendarSequence, 0);
  return {
    versionId: fixtures[0]?.scheduleVersionId ?? null,
    updatedAt,
    sequence,
    count: fixtures.length,
  };
}

function mapPublicFixture(row: Row): PublicFixture {
  const startsAt = str(row, "starts_at");
  return {
    id: requiredStr(row, "id"),
    matchNumber: num(row, "match_number"),
    stage: requiredStr(row, "stage"),
    groundId: str(row, "ground_id"),
    groundName: str(row, "ground_name"),
    teamAId: str(row, "team_a_registration_id"),
    teamBId: str(row, "team_b_registration_id"),
    teamALabel: requiredStr(row, "team_a_label"),
    teamBLabel: requiredStr(row, "team_b_label"),
    startsAt,
    durationMinutes: num(row, "duration_minutes"),
    reportingAt: reportingIso(startsAt, num(row, "reporting_minutes_before")),
    overs: num(row, "overs"),
    status: requiredStr(row, "status"),
    changeNote: str(row, "change_note"),
    calendarSequence: num(row, "calendar_sequence") ?? 0,
    scorecardUrl: str(row, "scorecard_url"),
    livestreamUrl: str(row, "livestream_url"),
    summary: str(row, "summary"),
    summarySource: str(row, "summary_source"),
    summaryUpdatedAt: str(row, "summary_updated_at"),
    winnerLabel: str(row, "winner_label"),
    needsResolution: bool(row, "needs_resolution"),
    updatedAt: str(row, "updated_at"),
    scheduleVersionId: str(row, "schedule_version_id"),
    schedulePublishedAt: str(row, "schedule_published_at"),
    scheduleNote: str(row, "schedule_note"),
  };
}

function mapPublicTeam(row: Row) {
  return {
    id: requiredStr(row, "id"),
    slug: requiredStr(row, "slug"),
    teamName: requiredStr(row, "team_name"),
    batchAdmissionYear: num(row, "batch_admission_year"),
    batchLeavingYear: num(row, "batch_leaving_year"),
    logoPath: str(row, "logo_path"),
    cricheroesTeamUrl: str(row, "cricheroes_team_url"),
  };
}
