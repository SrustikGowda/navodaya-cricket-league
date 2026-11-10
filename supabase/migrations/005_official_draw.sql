-- Official group draw, fixture generation and match scores for NCL 2026.
-- Extends groups, group_memberships, schedule_versions and fixtures. Does not replace them.

create table if not exists draws (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  ref text not null unique,
  status text not null default 'published' check (status in ('published', 'reset')),
  algorithm text not null,
  -- 32 bytes of hex from the OS CSPRNG. Published with the result so anyone can replay the draw.
  entropy text not null check (entropy ~ '^[0-9a-f]{64}$'),
  plan jsonb not null,
  plan_hash text not null,
  -- Lets a retried request recognise its own earlier success instead of reporting a conflict.
  request_id text,
  schedule_version_id uuid references schedule_versions(id),
  published_by uuid references profiles(id),
  published_at timestamptz not null default now(),
  -- When every connected viewer should start the reveal.
  reveal_at timestamptz not null,
  reset_by uuid references profiles(id),
  reset_at timestamptz,
  reset_reason text,
  created_at timestamptz not null default now()
);

-- The database itself refuses a second official draw for a season. Application checks are only the first line.
create unique index if not exists draws_one_published_per_season
  on draws (season_id) where status = 'published';

create index if not exists draws_season_idx on draws (season_id, created_at desc);

alter table groups add column if not exists code text check (code is null or code in ('A', 'B', 'C'));
alter table groups add column if not exists draw_id uuid references draws(id);

alter table group_memberships add column if not exists sub_pool smallint check (sub_pool is null or sub_pool in (1, 2));
alter table group_memberships add column if not exists slot smallint check (slot is null or slot between 1 and 6);
alter table group_memberships add column if not exists seeded_as text check (seeded_as is null or seeded_as in ('champion', 'runner_up', 'semifinalist'));

-- A team holds one position in one group.
create unique index if not exists group_memberships_slot_unique
  on group_memberships (group_id, slot) where slot is not null;

alter table fixtures add column if not exists code text;
alter table fixtures add column if not exists group_id uuid references groups(id);
alter table fixtures add column if not exists draw_id uuid references draws(id);

create unique index if not exists fixtures_code_per_version
  on fixtures (schedule_version_id, code) where code is not null;

-- Runs and balls behind each result. Net run rate needs them; the existing result fields stay the headline.
create table if not exists match_scores (
  fixture_id uuid primary key references fixtures(id) on delete cascade,
  outcome text not null check (outcome in ('win', 'tie', 'no_result')),
  first_bats text check (first_bats is null or first_bats in ('a', 'b')),
  first_runs int check (first_runs is null or first_runs >= 0),
  first_wickets int check (first_wickets is null or first_wickets between 0 and 10),
  first_balls int check (first_balls is null or first_balls >= 0),
  first_all_out boolean,
  second_runs int check (second_runs is null or second_runs >= 0),
  second_wickets int check (second_wickets is null or second_wickets between 0 and 10),
  second_balls int check (second_balls is null or second_balls >= 0),
  second_all_out boolean,
  max_balls int not null check (max_balls > 0),
  recorded_by uuid references profiles(id),
  recorded_at timestamptz not null default now(),
  version int not null default 1
);

-- Organizer decisions for teams that are level on every published tie-breaker.
create table if not exists draw_tiebreaks (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references draws(id),
  scope text not null,
  tie_key text not null,
  ordered_ids jsonb not null,
  note text not null,
  decided_by uuid references profiles(id),
  decided_at timestamptz not null default now(),
  unique (draw_id, scope, tie_key)
);

alter table draws enable row level security;
alter table match_scores enable row level security;
alter table draw_tiebreaks enable row level security;

create policy draws_organizer on draws for all
  using (ncl.is_organizer()) with check (ncl.is_organizer());
create policy match_scores_organizer on match_scores for all
  using (ncl.is_organizer()) with check (ncl.is_organizer());
create policy draw_tiebreaks_organizer on draw_tiebreaks for all
  using (ncl.is_organizer()) with check (ncl.is_organizer());

-- Public reads go through views, as for every other published fact.
create or replace view public_fixtures as
select
  f.id, f.season_id, f.match_number, f.stage, f.ground_id, g.name as ground_name,
  f.team_a_registration_id, f.team_b_registration_id, f.team_a_label, f.team_b_label,
  f.starts_at, f.duration_minutes, f.reporting_minutes_before, f.overs, f.status,
  f.change_note, f.calendar_sequence, f.scorecard_url, f.livestream_url, f.summary,
  f.summary_source, f.summary_updated_at, f.winner_label, f.needs_resolution,
  f.updated_at, sv.id as schedule_version_id, sv.published_at as schedule_published_at,
  sv.note as schedule_note,
  f.code, gr.code as group_code
from fixtures f
join schedule_versions sv on sv.id = f.schedule_version_id
left join grounds g on g.id = f.ground_id
left join groups gr on gr.id = f.group_id
where sv.status = 'published';

create or replace view public_draw as
select id, season_id, ref, status, algorithm, entropy, plan, plan_hash, schedule_version_id, published_at, reveal_at
from draws
where status = 'published';

create or replace view public_match_scores as
select
  ms.fixture_id, ms.outcome, ms.first_bats, ms.first_runs, ms.first_wickets, ms.first_balls, ms.first_all_out,
  ms.second_runs, ms.second_wickets, ms.second_balls, ms.second_all_out, ms.max_balls, ms.recorded_at
from match_scores ms
join fixtures f on f.id = ms.fixture_id
join schedule_versions sv on sv.id = f.schedule_version_id
where sv.status = 'published';

grant select on public_fixtures, public_draw, public_match_scores to ncl_rls;
