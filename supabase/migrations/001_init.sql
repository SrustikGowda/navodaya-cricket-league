-- NCL 2026 schema. Safe to apply on empty Postgres, embedded Postgres, or Supabase.
-- Does not replace a hosted Supabase auth.uid().

create schema if not exists ncl;
create schema if not exists auth;

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    execute $fn$
      create function auth.uid() returns uuid
      language sql
      stable
      as $body$
        select nullif(current_setting('ncl.actor_id', true), '')::uuid
      $body$
    $fn$;
  end if;
end $$;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text,
  role text not null default 'captain' check (role in ('captain', 'organizer')),
  created_at timestamptz not null default now()
);

create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  year int not null unique,
  slug text not null unique,
  name text not null,
  short_name text not null,
  edition_number int not null,
  community text not null,
  organizer_credit text not null,
  start_date date not null,
  end_date date not null,
  timezone text not null default 'Asia/Kolkata',
  venue_name text not null,
  venue_address text not null,
  maps_url text,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  roster_lock_at timestamptz,
  event_start_at timestamptz,
  fee_paise int check (fee_paise is null or fee_paise >= 0),
  payee_name text,
  upi_vpa text,
  payment_note text,
  refund_policy text,
  team_cap int check (team_cap is null or team_cap > 0),
  squad_min int check (squad_min is null or squad_min >= 0),
  squad_max int check (squad_max is null or squad_max > 0),
  playing_xi int check (playing_xi is null or playing_xi > 0),
  ball_type text,
  eligibility_rules text,
  overs_by_stage text,
  one_team_per_batch boolean not null default false,
  waitlist_enabled boolean not null default false,
  rules_version text,
  rules_text text,
  contact_name text,
  contact_email text,
  contact_phone text,
  privacy_note text,
  cricheroes_tournament_url text,
  active boolean not null default true,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists schedule_settings (
  season_id uuid primary key references seasons(id) on delete cascade,
  day_start_minutes int,
  day_end_minutes int,
  break_start_minutes int,
  break_end_minutes int,
  transition_buffer_minutes int,
  min_rest_minutes int,
  version int not null default 1
);

create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  captain_user_id uuid not null references profiles(id),
  reference text unique,
  idempotency_key text,
  status text not null default 'draft' check (status in (
    'draft', 'submitted', 'changes_requested', 'approved', 'waitlisted', 'rejected', 'withdrawn'
  )),
  team_name text not null default '',
  slug text,
  batch_admission_year int,
  batch_leaving_year int,
  logo_path text,
  cricheroes_team_url text,
  captain_name text not null default '',
  captain_email text not null default '',
  captain_phone text not null default '',
  vice_captain_name text,
  vice_captain_phone text,
  rules_version text,
  rules_acknowledged_at timestamptz,
  publication_consent boolean not null default false,
  review_reason text,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  name_review_required boolean not null default false,
  version int not null default 1,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists registrations_idempotency
  on registrations (season_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists registrations_one_active_per_captain
  on registrations (season_id, captain_user_id)
  where status not in ('withdrawn', 'rejected');

create unique index if not exists registrations_public_slug
  on registrations (season_id, slug)
  where slug is not null and status = 'approved';

create index if not exists registrations_season_status_idx
  on registrations (season_id, status);

create table if not exists registration_players (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  registration_id uuid not null references registrations(id) on delete cascade,
  name text not null,
  batch_label text,
  role text not null check (role in ('batter', 'bowler', 'all_rounder', 'wicket_keeper')),
  jersey_number int,
  cricheroes_url text,
  cricheroes_player_id text,
  public_state text not null default 'pending_add' check (public_state in ('included', 'pending_add', 'pending_remove')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists registration_players_reg_idx
  on registration_players (registration_id, sort_order);

create table if not exists payment_attempts (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  registration_id uuid not null references registrations(id),
  amount_paise int not null check (amount_paise >= 0),
  transaction_reference text,
  receipt_path text,
  status text not null check (status in (
    'not_required', 'awaiting_payment', 'submitted', 'verified', 'rejected', 'refund_pending', 'refunded'
  )),
  note text,
  rejection_reason text,
  refund_reference text,
  submitted_by uuid references profiles(id),
  verified_by uuid references profiles(id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists payment_verified_reference_unique
  on payment_attempts (season_id, lower(transaction_reference))
  where status = 'verified' and transaction_reference is not null;

create index if not exists payment_registration_idx
  on payment_attempts (registration_id, created_at desc);

create table if not exists grounds (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  unique (season_id, name)
);

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  name text not null,
  stage text not null default 'league',
  unique (season_id, name)
);

create table if not exists group_memberships (
  group_id uuid not null references groups(id) on delete cascade,
  registration_id uuid not null references registrations(id),
  primary key (group_id, registration_id)
);

create table if not exists schedule_versions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  status text not null check (status in ('draft', 'published', 'archived')),
  note text,
  created_by uuid references profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists one_draft_schedule
  on schedule_versions (season_id) where status = 'draft';

create unique index if not exists one_published_schedule
  on schedule_versions (season_id) where status = 'published';

create table if not exists fixtures (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  schedule_version_id uuid not null references schedule_versions(id) on delete cascade,
  match_number int,
  stage text not null default 'league',
  ground_id uuid references grounds(id),
  team_a_registration_id uuid references registrations(id),
  team_b_registration_id uuid references registrations(id),
  team_a_label text not null,
  team_b_label text not null,
  starts_at timestamptz,
  duration_minutes int,
  reporting_minutes_before int,
  overs int,
  status text not null default 'scheduled' check (status in (
    'scheduled', 'delayed', 'in_progress', 'completed', 'abandoned', 'cancelled'
  )),
  change_note text,
  calendar_sequence int not null default 0,
  scorecard_url text,
  livestream_url text,
  summary text,
  summary_source text check (summary_source is null or summary_source in ('manual', 'import')),
  summary_updated_at timestamptz,
  winner_registration_id uuid references registrations(id),
  winner_label text,
  needs_resolution boolean not null default false,
  resolution_note text,
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  version int not null default 1
);

create index if not exists fixtures_version_idx on fixtures (schedule_version_id);
create index if not exists fixtures_season_start_idx on fixtures (season_id, starts_at);

create table if not exists fixture_dependencies (
  fixture_id uuid not null references fixtures(id) on delete cascade,
  depends_on_fixture_id uuid not null references fixtures(id) on delete cascade,
  slot text not null check (slot in ('winner', 'loser')),
  team_slot text not null check (team_slot in ('a', 'b')),
  primary key (fixture_id, team_slot)
);

create table if not exists schedule_revisions (
  id uuid primary key default gen_random_uuid(),
  schedule_version_id uuid not null references schedule_versions(id) on delete cascade,
  note text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists standings_versions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  status text not null check (status in ('draft', 'published', 'archived')),
  source text not null check (source in ('manual', 'import')),
  note text,
  needs_review boolean not null default false,
  created_by uuid references profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists one_draft_standings
  on standings_versions (season_id) where status = 'draft';

create unique index if not exists one_published_standings
  on standings_versions (season_id) where status = 'published';

create table if not exists standings_rows (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references standings_versions(id) on delete cascade,
  registration_id uuid references registrations(id),
  team_label text not null,
  played int not null default 0 check (played >= 0),
  won int not null default 0 check (won >= 0),
  lost int not null default 0 check (lost >= 0),
  tied int not null default 0 check (tied >= 0),
  no_result int not null default 0 check (no_result >= 0),
  points int not null default 0,
  nrr text,
  rank int,
  sort_order int not null default 0
);

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  title text not null,
  body text not null,
  published boolean not null default false,
  published_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sponsors (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  name text not null,
  url text,
  logo_path text,
  published boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  kind text not null check (kind in ('gallery', 'logo', 'other')),
  path text not null,
  caption text,
  consent boolean not null default false,
  published boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists archive_entries (
  id uuid primary key default gen_random_uuid(),
  edition_number int not null unique,
  year int,
  start_date date,
  end_date date,
  champion text,
  runner_up text,
  organizer_batch text,
  venue_note text,
  notes text,
  source_url text,
  verification_status text not null check (verification_status in ('verified', 'partial', 'unverified')),
  updated_at timestamptz not null default now()
);

create table if not exists heritage_submissions (
  id uuid primary key default gen_random_uuid(),
  edition_number int,
  year int,
  claim text not null,
  source_url text,
  submitter_name text,
  submitter_email text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  review_note text,
  created_at timestamptz not null default now()
);

create table if not exists team_aliases (
  id uuid primary key default gen_random_uuid(),
  batch_admission_year int,
  batch_leaving_year int,
  alias text not null,
  season_year int,
  notes text,
  confirmed_by uuid references profiles(id),
  confirmed_at timestamptz
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_entity_idx
  on audit_events (entity_type, entity_id, created_at desc);

create or replace function ncl.is_organizer() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'organizer'
  );
$$;

revoke all on function ncl.is_organizer() from public;

create or replace view public_season as
select
  id, year, slug, name, short_name, edition_number, community, organizer_credit,
  start_date, end_date, timezone, venue_name, venue_address, maps_url,
  registration_opens_at, registration_closes_at, roster_lock_at, event_start_at,
  fee_paise, team_cap, squad_min, squad_max, playing_xi, ball_type, eligibility_rules,
  overs_by_stage, one_team_per_batch, waitlist_enabled, rules_version, rules_text,
  contact_name, contact_email, contact_phone, privacy_note, cricheroes_tournament_url,
  refund_policy, active
from seasons;

create or replace view public_teams as
select
  r.id, r.season_id, r.slug, r.team_name, r.batch_admission_year, r.batch_leaving_year,
  r.logo_path, r.cricheroes_team_url
from registrations r
where r.status = 'approved' and r.slug is not null;

create or replace view public_squad as
select p.id, p.registration_id, p.name, p.batch_label, p.role, p.jersey_number, p.sort_order
from registration_players p
join registrations r on r.id = p.registration_id
where r.status = 'approved'
  and r.publication_consent = true
  and p.public_state = 'included';

create or replace view public_fixtures as
select
  f.id, f.season_id, f.match_number, f.stage, f.ground_id, g.name as ground_name,
  f.team_a_registration_id, f.team_b_registration_id, f.team_a_label, f.team_b_label,
  f.starts_at, f.duration_minutes, f.reporting_minutes_before, f.overs, f.status,
  f.change_note, f.calendar_sequence, f.scorecard_url, f.livestream_url, f.summary,
  f.summary_source, f.summary_updated_at, f.winner_label, f.needs_resolution,
  f.updated_at, sv.id as schedule_version_id, sv.published_at as schedule_published_at,
  sv.note as schedule_note
from fixtures f
join schedule_versions sv on sv.id = f.schedule_version_id
left join grounds g on g.id = f.ground_id
where sv.status = 'published';

create or replace view public_standings as
select
  sv.id as version_id, sv.season_id, sv.source, sv.note, sv.needs_review, sv.published_at,
  sr.id as row_id, sr.team_label, sr.registration_id, sr.played, sr.won, sr.lost, sr.tied,
  sr.no_result, sr.points, sr.nrr, sr.rank, sr.sort_order
from standings_versions sv
join standings_rows sr on sr.version_id = sv.id
where sv.status = 'published';

create or replace view public_announcements as
select id, season_id, title, body, published_at
from announcements
where published = true;

create or replace view public_sponsors as
select id, season_id, name, url, logo_path, sort_order
from sponsors
where published = true;

create or replace view public_media as
select id, season_id, kind, path, caption, created_at
from media_assets
where published = true and consent = true;

-- Row level security. The privileged app connection bypasses this.
-- Direct table access with a non-superuser role does not.

alter table profiles enable row level security;
alter table seasons enable row level security;
alter table schedule_settings enable row level security;
alter table registrations enable row level security;
alter table registration_players enable row level security;
alter table payment_attempts enable row level security;
alter table fixtures enable row level security;
alter table fixture_dependencies enable row level security;
alter table schedule_versions enable row level security;
alter table schedule_revisions enable row level security;
alter table standings_versions enable row level security;
alter table standings_rows enable row level security;
alter table announcements enable row level security;
alter table sponsors enable row level security;
alter table media_assets enable row level security;
alter table audit_events enable row level security;
alter table heritage_submissions enable row level security;
alter table team_aliases enable row level security;
alter table grounds enable row level security;
alter table groups enable row level security;
alter table group_memberships enable row level security;

create policy profiles_select on profiles for select
  using (id = auth.uid() or ncl.is_organizer());
create policy profiles_insert on profiles for insert
  with check (id = auth.uid() and role = 'captain');
create policy profiles_update on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = 'captain');

create policy seasons_organizer on seasons for all
  using (ncl.is_organizer())
  with check (ncl.is_organizer());

create policy schedule_settings_organizer on schedule_settings for all
  using (ncl.is_organizer())
  with check (ncl.is_organizer());

create policy registrations_select on registrations for select
  using (captain_user_id = auth.uid() or ncl.is_organizer());
create policy registrations_insert on registrations for insert
  with check (captain_user_id = auth.uid() and status = 'draft');
create policy registrations_update on registrations for update
  using (captain_user_id = auth.uid() or ncl.is_organizer())
  with check (
    ncl.is_organizer()
    or (
      captain_user_id = auth.uid()
      and status in ('draft', 'submitted', 'changes_requested', 'withdrawn')
    )
  );

create policy players_all on registration_players for all
  using (
    ncl.is_organizer()
    or exists (
      select 1 from registrations r
      where r.id = registration_id and r.captain_user_id = auth.uid()
    )
  )
  with check (
    ncl.is_organizer()
    or exists (
      select 1 from registrations r
      where r.id = registration_id and r.captain_user_id = auth.uid()
    )
  );

create policy payments_select on payment_attempts for select
  using (
    ncl.is_organizer()
    or exists (
      select 1 from registrations r
      where r.id = registration_id and r.captain_user_id = auth.uid()
    )
  );
create policy payments_insert on payment_attempts for insert
  with check (
    status = 'submitted'
    and exists (
      select 1 from registrations r
      where r.id = registration_id and r.captain_user_id = auth.uid()
    )
  );
create policy payments_update on payment_attempts for update
  using (
    ncl.is_organizer()
    or exists (
      select 1 from registrations r
      where r.id = registration_id and r.captain_user_id = auth.uid()
    )
  )
  with check (
    ncl.is_organizer()
    or status in ('submitted', 'awaiting_payment')
  );

create policy fixtures_organizer on fixtures for all
  using (ncl.is_organizer()) with check (ncl.is_organizer());
create policy fixture_dependencies_organizer on fixture_dependencies for all
  using (ncl.is_organizer()) with check (ncl.is_organizer());
create policy schedule_versions_organizer on schedule_versions for all
  using (ncl.is_organizer()) with check (ncl.is_organizer());
create policy schedule_revisions_organizer on schedule_revisions for all
  using (ncl.is_organizer()) with check (ncl.is_organizer());
create policy standings_versions_organizer on standings_versions for all
  using (ncl.is_organizer()) with check (ncl.is_organizer());
create policy standings_rows_organizer on standings_rows for all
  using (ncl.is_organizer()) with check (ncl.is_organizer());
create policy announcements_organizer on announcements for all
  using (ncl.is_organizer()) with check (ncl.is_organizer());
create policy sponsors_organizer on sponsors for all
  using (ncl.is_organizer()) with check (ncl.is_organizer());
create policy media_organizer on media_assets for all
  using (ncl.is_organizer()) with check (ncl.is_organizer());
create policy heritage_organizer on heritage_submissions for select
  using (ncl.is_organizer());
create policy heritage_insert on heritage_submissions for insert
  with check (status = 'pending');
create policy aliases_organizer on team_aliases for all
  using (ncl.is_organizer()) with check (ncl.is_organizer());
create policy grounds_organizer on grounds for all
  using (ncl.is_organizer()) with check (ncl.is_organizer());
create policy groups_organizer on groups for all
  using (ncl.is_organizer()) with check (ncl.is_organizer());
create policy group_memberships_organizer on group_memberships for all
  using (ncl.is_organizer()) with check (ncl.is_organizer());

-- No policies on audit_events: clients cannot read or write the audit log.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ncl_rls') then
    create role ncl_rls nosuperuser nobypassrls;
  end if;
end $$;

grant usage on schema public to ncl_rls;
grant usage on schema ncl to ncl_rls;
grant usage on schema auth to ncl_rls;
grant execute on function ncl.is_organizer() to ncl_rls;
grant execute on function auth.uid() to ncl_rls;
grant select, insert, update, delete on all tables in schema public to ncl_rls;
grant select on public_season, public_teams, public_squad, public_fixtures,
  public_standings, public_announcements, public_sponsors, public_media to ncl_rls;
revoke all on audit_events from ncl_rls;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from authenticated';
  end if;
end $$;
