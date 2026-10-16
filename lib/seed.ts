import type { Db } from "./db";
import { demoAllowed } from "./integrations";

const VENUE_MAPS_URL = "https://maps.app.goo.gl/yHH4eTsZLpsiLWU6A";

export async function seedDatabase(db: Db): Promise<void> {
  const existing = await db.query("select id from seasons where year = 2026");
  if (existing.length === 0) {
    const inserted = await db.query<{ id: string }>(
      `insert into seasons (
        year, slug, name, short_name, edition_number, community, organizer_credit,
        start_date, end_date, timezone, venue_name, venue_address, maps_url, active
      ) values (
        2026, '2026', 'Navodaya Cricket League 2026', 'NCL 2026', 15,
        'JNVCKM Alumni Group', 'Organized by Alumni Batch 2005–2012',
        '2026-11-28', '2026-11-29', 'Asia/Kolkata', 'Loyala School Ground',
        'Kothnur Main Rd, Kothnur, Kalena Agrahara, Bengaluru, 560076', $1, true
      ) returning id`,
      [VENUE_MAPS_URL],
    );
    await db.execute(
      `insert into schedule_settings (season_id) values ($1) on conflict (season_id) do nothing`,
      [inserted[0]?.id],
    );
  }

  await db.execute(
    `update seasons set maps_url = $1 where year = 2026 and (maps_url is null or btrim(maps_url) = '')`,
    [VENUE_MAPS_URL],
  );

  await db.execute("delete from archive_entries where edition_number not in (12, 13, 14)");
  for (const entry of heritageSeed) {
    await db.execute(
      `insert into archive_entries (
        edition_number, year, start_date, end_date, champion, runner_up, venue_note, notes, source_url, verification_status
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      on conflict (edition_number) do update set
        year = excluded.year,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        champion = excluded.champion,
        runner_up = excluded.runner_up,
        venue_note = excluded.venue_note,
        notes = excluded.notes,
        source_url = excluded.source_url,
        verification_status = excluded.verification_status,
        updated_at = now()`,
      [
        entry.edition,
        entry.year,
        entry.start,
        entry.end,
        entry.champion,
        entry.runnerUp,
        entry.venue,
        entry.notes,
        entry.source,
        entry.status,
      ],
    );
  }

  if (demoAllowed()) await seedDemo(db);
}

export async function seedDemo(db: Db): Promise<void> {
  if (!demoAllowed()) return;
  const seasons = await db.query<{ id: string }>("select id from seasons where year = 2026");
  const seasonId = seasons[0]?.id;
  if (!seasonId) return;
  const already = await db.query(
    "select id from registrations where season_id = $1 and team_name like 'DEMO · %' limit 1",
    [seasonId],
  );
  if (already.length > 0) return;

  const organizer = await db.query<{ id: string }>(
    `insert into profiles (email, display_name, role)
     values ('demo-organizer@example.invalid', 'Demo organizer', 'captain')
     on conflict (email) do update set display_name = excluded.display_name
     returning id`,
  );
  const ownerId = organizer[0]?.id;
  if (!ownerId) return;

  const teams = [
    ["DEMO · North Stand", 2005, 2012],
    ["DEMO · South Stand", 2012, 2019],
  ] as const;
  const ids: string[] = [];
  for (const [name, admission, leaving] of teams) {
    const row = await db.query<{ id: string }>(
      `insert into registrations (
        season_id, captain_user_id, status, team_name, slug, batch_admission_year,
        batch_leaving_year, captain_name, captain_email, publication_consent, reference
      ) values ($1,$2,'approved',$3,$4,$5,$6,'Demo Captain','demo@example.invalid',true,$7)
      returning id`,
      [seasonId, ownerId, name, name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), admission, leaving, `DEMO-${admission}`],
    );
    if (row[0]) ids.push(row[0].id);
  }

  const ground = await db.query<{ id: string }>(
    `insert into grounds (season_id, name, sort_order) values ($1, 'DEMO Ground', 0)
     on conflict (season_id, name) do update set name = excluded.name returning id`,
    [seasonId],
  );
  const version = await db.query<{ id: string }>(
    `insert into schedule_versions (season_id, status, note, published_at)
     values ($1, 'published', 'DEMO DATA. These fixtures are fictional and exist only in local demo mode.', now())
     returning id`,
    [seasonId],
  );
  if (ids.length === 2 && ground[0] && version[0]) {
    await db.execute(
      `insert into fixtures (
        season_id, schedule_version_id, match_number, stage, ground_id,
        team_a_registration_id, team_b_registration_id, team_a_label, team_b_label,
        starts_at, duration_minutes, status, change_note
      ) values ($1,$2,1,'league',$3,$4,$5,'DEMO · North Stand','DEMO · South Stand',$6,60,'scheduled','DEMO DATA')`,
      [seasonId, version[0].id, ground[0].id, ids[0], ids[1], "2026-11-28T03:30:00.000Z"],
    );
  }
}

const heritageSeed: {
  edition: number;
  year: number;
  start: string;
  end: string;
  champion: string;
  runnerUp: string;
  venue: string;
  notes: string;
  source: string;
  status: "verified";
}[] = [
  {
    edition: 12,
    year: 2023,
    start: "2023-10-27",
    end: "2023-10-29",
    champion: "Royal Challengers Balehonnur (1997–04)",
    runnerUp: "GTR (2012–2019)",
    venue: "ITI Ground, KR Puram, and ITI Pavilion Ground, Nelmangala",
    notes: [
      "Dates: 27–29 October 2023",
      "Ball: Tennis",
      "Teams: 18",
      "Matches: 24",
      "Final: Royal Challengers Balehonnur (1997–04) beat GTR (2012–2019) by 7 wickets. GTR made 63/7 in 8 overs and RCB finished on 64/3 in 6.2 overs at ITI Ground KR Puram Pitch A.",
      "Semi-finals: GTR beat Champions-11 (2001–08) by 31 runs. Royal Challengers Balehonnur beat Balehonnur Blasters (2011–18) by 58 runs.",
      "Leading run-scorer: Rudresh Bp, Royal Challengers Balehonnur, 101 runs from 5 innings, strike rate 177.19.",
      "Leading wicket-taker: Santhosh B R, Royal Challengers Balehonnur, 13 wickets in 10 overs, economy 4.40.",
      "Most valuable player: Santhosh B R, top of the CricHeroes tournament MVP table. A separate Man of the Series title was not published.",
      "Leading fielder: Rudresh BP, 13 dismissals.",
    ].join("\n"),
    source: "https://cricheroes.com/tournament/788869/jnv-ckm-ncl-2023(12th-edition)/leaderboard",
    status: "verified",
  },
  {
    edition: 13,
    year: 2024,
    start: "2024-11-23",
    end: "2024-11-24",
    champion: "TWENTY SIXers (2012–2019)",
    runnerUp: "The Elite (2002–09)",
    venue: "Loyala Cricket Ground, Bengaluru",
    notes: [
      "Dates: 23–24 November 2024",
      "Ball: Tennis",
      "Teams: 16",
      "Matches: 31",
      "Final: TWENTY SIXers (2012–2019) beat The Elite (2002–09) by 15 runs on 24 November. TWENTY SIXers made 45/6 in 8 overs and The Elite were 30/9 in 7.2 overs at Ground A.",
      "Semi-finals: TWENTY SIXers beat IX-ELEVENS (2009–16) by 4 wickets. The Elite beat RCB United by 19 runs.",
      "Leading run-scorer: Gopi A V, The Elite, 85 runs from 6 innings.",
      "Leading wicket-taker: Jithu, The Elite, 11 wickets in 12 overs, economy 4.33.",
      "Most valuable player: Jithu, top of the CricHeroes tournament MVP table. A separate Man of the Series title was not published.",
      "Leading fielder: Jithu, 8 dismissals.",
    ].join("\n"),
    source: "https://cricheroes.com/tournament/1165353/navodaya-cricket-league-2024/leaderboard",
    status: "verified",
  },
  {
    edition: 14,
    year: 2025,
    start: "2025-11-21",
    end: "2025-11-23",
    champion: "4s-11 (2004–2011)",
    runnerUp: "RCB United",
    venue: "Loyala Cricket Ground, Bengaluru",
    notes: [
      "Dates: 21–23 November 2025",
      "Ball: Tennis",
      "Teams: 19, plus a bye on the CricHeroes list",
      "Matches: 36",
      "Final: 4s-11 (2004–2011) beat RCB United by 10 wickets on 23 November. RCB United made 45/9 in 8 overs and 4s-11 finished on 46/0 in 6 overs at Ground A.",
      "Semi-finals: RCB United beat Balehonnur Bulls (2005–12) by 3 runs. 4s-11 beat Jnv Junglees by 7 wickets.",
      "Leading run-scorer: Praveen G J, Jnv Junglees, 122 runs from 5 innings, average 40.67, strike rate 146.99.",
      "Leading wicket-taker: Deekshith Gowda, Balehonnur Bulls, 11 wickets in 10 overs, economy 5.80.",
      "Most valuable player: Deekshith Gowda, top of the CricHeroes tournament MVP table. A separate Man of the Series title was not published.",
      "Leading fielder: Darshan K P, Balehonnur Bulls, 8 dismissals.",
    ].join("\n"),
    source: "https://cricheroes.com/tournament/1648642/navodaya-cricket-league-14/leaderboard",
    status: "verified",
  },
];
