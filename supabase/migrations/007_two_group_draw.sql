-- NCL 2026 moves to 19 teams in two groups (A with nine teams and a BYE, B with ten) and a fixed opponent template.
-- Nothing is deleted. Existing draws, groups and fixtures keep their rows.

-- A group now has up to ten positions (B1..B10). Sub-pools are no longer used, so sub_pool stays empty.
do $$
declare name text;
begin
  for name in
    select conname from pg_constraint
    where conrelid = 'group_memberships'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%slot%'
  loop
    execute format('alter table group_memberships drop constraint %I', name);
  end loop;
end $$;
alter table group_memberships add constraint group_memberships_slot_check check (slot is null or slot between 1 and 10);

-- The BYE is a fixture entry for one team: no ground, no time, no second team, no score.
alter table fixtures add column if not exists is_bye boolean not null default false;
create unique index if not exists fixtures_one_bye_per_draw on fixtures (draw_id) where is_bye;

-- The times in force after any rescheduling by organizers, and the organizer's confirmation of the final standings.
alter table draws add column if not exists timetable jsonb;
alter table draws add column if not exists standings_confirmed_at timestamptz;
alter table draws add column if not exists standings_confirmed_by uuid references profiles(id);
alter table draws add column if not exists standings_confirmed_hash text;

create or replace view public_fixtures as
select
  f.id, f.season_id, f.match_number, f.stage, f.ground_id, g.name as ground_name,
  f.team_a_registration_id, f.team_b_registration_id, f.team_a_label, f.team_b_label,
  f.starts_at, f.duration_minutes, f.reporting_minutes_before, f.overs, f.status,
  f.change_note, f.calendar_sequence, f.scorecard_url, f.livestream_url, f.summary,
  f.summary_source, f.summary_updated_at, f.winner_label, f.needs_resolution,
  f.updated_at, sv.id as schedule_version_id, sv.published_at as schedule_published_at,
  sv.note as schedule_note,
  f.code, gr.code as group_code, f.is_bye
from fixtures f
join schedule_versions sv on sv.id = f.schedule_version_id
left join grounds g on g.id = f.ground_id
left join groups gr on gr.id = f.group_id
where sv.status = 'published';

grant select on public_fixtures to ncl_rls;
