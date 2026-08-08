-- Phase 10A1: Routine organization settings system bootstrap.
--
-- This is an installation-time system bootstrap, not a manager action. It
-- creates only missing organization settings with the inert legacy defaults;
-- existing settings, audit actors, revisions, and timestamps remain unchanged.

insert into public.routine_organization_settings (
  organization_id,
  mode,
  timezone,
  operational_day_cutoff,
  shared_device_enabled,
  reopen_window_hours,
  revision,
  created_by_auth_user_id,
  updated_by_auth_user_id
)
select
  organization.id,
  'legacy',
  'Europe/Oslo',
  '04:00'::time without time zone,
  false,
  24,
  1,
  null,
  null
from public.organizations organization
where not exists (
  select 1
  from public.routine_organization_settings settings
  where settings.organization_id = organization.id
)
order by organization.id
on conflict (organization_id) do nothing;
