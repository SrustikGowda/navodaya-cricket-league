alter table seasons add column if not exists fee_due_at timestamptz;

alter table registrations add column if not exists fee_consent boolean not null default false;
alter table registrations add column if not exists fee_consent_at timestamptz;
alter table registrations add column if not exists fee_consent_paise int;
alter table registrations add column if not exists fee_consent_due_at timestamptz;

drop view if exists public_season;
create view public_season as
select
  id, year, slug, name, short_name, edition_number, community, organizer_credit,
  start_date, end_date, timezone, venue_name, venue_address, maps_url,
  registration_opens_at, registration_closes_at, roster_lock_at, event_start_at,
  fee_paise, team_cap, squad_min, squad_max, playing_xi, ball_type, eligibility_rules,
  overs_by_stage, one_team_per_batch, waitlist_enabled, rules_version, rules_text,
  contact_name, contact_email, contact_phone, privacy_note, cricheroes_tournament_url,
  refund_policy, active, fee_due_at
from seasons;

grant select on public_season to ncl_rls;
