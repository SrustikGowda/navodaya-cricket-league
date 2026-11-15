-- The organizers' own wording of the rules, edited in Admin › Rules. With no row for a season, the Rules page shows the
-- standard rules, built from the season settings and the draw timetable.

create table if not exists rulebooks (
  season_id uuid primary key references seasons(id) on delete cascade,
  -- { highlights: string[], sections: [{ id, title, summary, rules: [{ text, items?, note? }], tables?: [...] }] }
  content jsonb not null,
  -- A fingerprint of the standard rules when this copy was saved. If the season or the timetable changes afterwards, the
  -- fingerprint no longer matches and the editor asks the organizers to check the dates and times in their copy.
  base_hash text not null,
  version integer not null default 1,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table rulebooks enable row level security;
create policy rulebooks_organizer on rulebooks for all
  using (ncl.is_organizer()) with check (ncl.is_organizer());
