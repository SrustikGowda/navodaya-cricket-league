-- Tournament awards (best batter, bowler, MVP, fielder) entered by organizers, used to build the edition's History entry.

create table if not exists season_awards (
  season_id uuid primary key references seasons(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

alter table season_awards enable row level security;

create policy season_awards_organizer on season_awards for all
  using (ncl.is_organizer()) with check (ncl.is_organizer());
