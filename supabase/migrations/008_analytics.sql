-- Simple, private visit analytics for the organizers: page views and a few actions (for example a trial draw).
-- No IP address, name or account is stored. "visitor" is a code that changes every day, so one person cannot be followed
-- from one day to the next. Visits by signed-in organizers are not recorded.

create table if not exists analytics_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  kind text not null check (kind in ('view', 'action')),
  -- The page path for a view, or the name of the action.
  name text not null check (char_length(name) <= 160),
  visitor text not null check (char_length(visitor) <= 32),
  device text not null default 'desktop' check (device in ('phone', 'desktop'))
);

create index if not exists analytics_events_time_idx on analytics_events (occurred_at desc);
create index if not exists analytics_events_kind_name_idx on analytics_events (kind, name, occurred_at desc);

alter table analytics_events enable row level security;
create policy analytics_events_organizer on analytics_events for all
  using (ncl.is_organizer()) with check (ncl.is_organizer());
