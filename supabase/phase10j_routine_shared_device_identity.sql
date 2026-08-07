-- Mesh Shift Log Routine Engine v2 - Phase 10J
-- Secure shared-device operator identity. This migration is additive and is
-- intentionally not part of the legacy Phase 7A staff-code flow.

create table if not exists public.routine_shared_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  auth_user_id uuid not null references auth.users(id),
  user_profile_id uuid not null references public.user_profiles(id),
  device_key text not null,
  label text not null,
  active boolean not null default true,
  absolute_session_minutes integer not null default 960,
  idle_timeout_minutes integer not null default 30,
  critical_reauth_minutes integer not null default 5,
  max_failed_attempts integer not null default 5,
  failure_window_minutes integer not null default 15,
  lockout_minutes integer not null default 15,
  allow_offline_noncritical_drafts boolean not null default true,
  revision bigint not null default 1,
  creation_idempotency_key uuid not null,
  creation_request_hash text not null,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid not null references auth.users(id),
  constraint routine_shared_devices_auth_profile_check check(auth_user_id=user_profile_id),
  constraint routine_shared_devices_key_check check(device_key=lower(trim(device_key)) and device_key~'^[a-z0-9][a-z0-9_-]{2,63}$'),
  constraint routine_shared_devices_label_check check(label=trim(label) and char_length(label) between 1 and 120),
  constraint routine_shared_devices_policy_check check(absolute_session_minutes between 60 and 1440 and idle_timeout_minutes between 5 and 240
    and critical_reauth_minutes between 1 and 30 and max_failed_attempts between 3 and 20
    and failure_window_minutes between 1 and 120 and lockout_minutes between 1 and 1440),
  constraint routine_shared_devices_revision_check check(revision>0),
  constraint routine_shared_devices_hash_check check(creation_request_hash~'^[0-9a-f]{64}$'),
  constraint routine_shared_devices_org_key_unique unique(organization_id,device_key),
  constraint routine_shared_devices_profile_unique unique(user_profile_id),
  constraint routine_shared_devices_org_idempotency_unique unique(organization_id,creation_idempotency_key),
  constraint routine_shared_devices_id_org_unique unique(id,organization_id)
);

create table if not exists public.routine_operators (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  operator_key text not null,
  operator_type text not null,
  linked_user_profile_id uuid references public.user_profiles(id),
  display_name text not null,
  effective_role text not null,
  active boolean not null default true,
  valid_from timestamptz,
  valid_until timestamptz,
  revision bigint not null default 1,
  creation_idempotency_key uuid not null,
  creation_request_hash text not null,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid not null references auth.users(id),
  constraint routine_operators_key_check check(operator_key=lower(trim(operator_key)) and operator_key~'^[a-z0-9][a-z0-9_-]{2,63}$'),
  constraint routine_operators_type_check check(operator_type in('linked_profile','temporary')),
  constraint routine_operators_role_check check(effective_role in('staff','time2staff','shift_lead','event_floor_manager')),
  constraint routine_operators_identity_check check((operator_type='linked_profile' and linked_user_profile_id is not null)
    or (operator_type='temporary' and linked_user_profile_id is null and effective_role in('staff','time2staff'))),
  constraint routine_operators_name_check check(display_name=trim(display_name) and char_length(display_name) between 1 and 200),
  constraint routine_operators_validity_check check(valid_until is null or valid_from is null or valid_until>valid_from),
  constraint routine_operators_revision_check check(revision>0),
  constraint routine_operators_hash_check check(creation_request_hash~'^[0-9a-f]{64}$'),
  constraint routine_operators_org_key_unique unique(organization_id,operator_key),
  constraint routine_operators_org_idempotency_unique unique(organization_id,creation_idempotency_key),
  constraint routine_operators_id_org_unique unique(id,organization_id)
);
create unique index if not exists routine_operators_active_linked_profile_unique
  on public.routine_operators(linked_user_profile_id) where active and linked_user_profile_id is not null;

create table if not exists public.routine_shared_device_operator_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  shared_device_id uuid not null,
  operator_id uuid not null,
  active boolean not null default true,
  valid_from timestamptz,
  valid_until timestamptz,
  sort_order integer not null default 0,
  allow_task_actions boolean not null default true,
  allow_critical_actions boolean not null default true,
  allow_run_coordination boolean not null default false,
  allow_event_transfer_actions boolean not null default false,
  allow_offline_noncritical boolean not null default true,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid not null references auth.users(id),
  constraint routine_device_access_device_fkey foreign key(shared_device_id,organization_id)
    references public.routine_shared_devices(id,organization_id),
  constraint routine_device_access_operator_fkey foreign key(operator_id,organization_id)
    references public.routine_operators(id,organization_id),
  constraint routine_device_access_identity_unique unique(shared_device_id,operator_id),
  constraint routine_device_access_sort_unique unique(shared_device_id,sort_order),
  constraint routine_device_access_validity_check check(valid_until is null or valid_from is null or valid_until>valid_from),
  constraint routine_device_access_revision_check check(revision>0)
);

create table if not exists public.routine_operator_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  operator_id uuid not null,
  credential_version bigint not null,
  status text not null default 'active',
  pin_hash text not null,
  hash_algorithm text not null default 'bcrypt',
  hash_cost integer not null default 12,
  valid_from timestamptz not null default now(),
  expires_at timestamptz,
  must_rotate boolean not null default false,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  revoked_at timestamptz,
  revoked_by_auth_user_id uuid references auth.users(id),
  revocation_reason text,
  constraint routine_operator_credentials_operator_fkey foreign key(operator_id,organization_id)
    references public.routine_operators(id,organization_id),
  constraint routine_operator_credentials_version_unique unique(operator_id,credential_version),
  constraint routine_operator_credentials_version_check check(credential_version>0),
  constraint routine_operator_credentials_status_check check(status in('active','revoked','expired')),
  constraint routine_operator_credentials_hash_check check(hash_algorithm='bcrypt' and hash_cost>=12 and pin_hash~E'^\\$2[abxy]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$'),
  constraint routine_operator_credentials_active_check check(status<>'active' or expires_at is null or expires_at>valid_from),
  constraint routine_operator_credentials_revoke_check check((status='revoked' and revoked_at is not null and revoked_by_auth_user_id is not null
    and char_length(trim(revocation_reason)) between 1 and 1000) or (status<>'revoked' and revoked_at is null and revoked_by_auth_user_id is null and revocation_reason is null))
);
alter table public.routine_operator_credentials drop constraint if exists routine_operator_credentials_hash_check;
alter table public.routine_operator_credentials add constraint routine_operator_credentials_hash_check
  check(hash_algorithm='bcrypt' and hash_cost>=12 and pin_hash~E'^\\$2[abxy]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$');
create unique index if not exists routine_operator_credentials_one_active
  on public.routine_operator_credentials(operator_id) where status='active';

create table if not exists public.routine_operator_auth_throttles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  subject_type text not null,
  shared_device_id uuid not null,
  operator_id uuid,
  failed_attempt_count integer not null default 0,
  window_started_at timestamptz,
  locked_until timestamptz,
  last_failed_at timestamptz,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint routine_operator_throttle_device_fkey foreign key(shared_device_id,organization_id)
    references public.routine_shared_devices(id,organization_id),
  constraint routine_operator_throttle_operator_fkey foreign key(operator_id,organization_id)
    references public.routine_operators(id,organization_id),
  constraint routine_operator_throttle_subject_check check((subject_type='device' and operator_id is null) or (subject_type='operator' and operator_id is not null)),
  constraint routine_operator_throttle_count_check check(failed_attempt_count>=0 and revision>0)
);
create unique index if not exists routine_operator_throttle_device_unique on public.routine_operator_auth_throttles(shared_device_id) where subject_type='device';
create unique index if not exists routine_operator_throttle_operator_unique on public.routine_operator_auth_throttles(shared_device_id,operator_id) where subject_type='operator';

create table if not exists public.routine_operator_auth_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  shared_device_id uuid not null,
  operator_id uuid,
  client_instance_id uuid,
  device_auth_user_id uuid not null references auth.users(id),
  outcome text not null,
  failure_code text,
  attempted_at timestamptz not null default now(),
  constraint routine_operator_attempt_device_fkey foreign key(shared_device_id,organization_id)
    references public.routine_shared_devices(id,organization_id),
  constraint routine_operator_attempt_operator_fkey foreign key(operator_id,organization_id)
    references public.routine_operators(id,organization_id),
  constraint routine_operator_attempt_outcome_check check(outcome in('success','failure','locked','rejected')),
  constraint routine_operator_attempt_failure_check check((outcome='success' and failure_code is null)
    or (outcome<>'success' and failure_code='operator_auth_failed'))
);

alter table public.routine_client_instances add column if not exists shared_device_id uuid references public.routine_shared_devices(id);

create table if not exists public.routine_operator_sessions (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  shared_device_id uuid not null,
  client_instance_id uuid not null,
  device_auth_user_id uuid not null references auth.users(id),
  device_user_profile_id uuid not null references public.user_profiles(id),
  operator_id uuid not null,
  credential_id uuid not null references public.routine_operator_credentials(id),
  linked_user_profile_id_snapshot uuid references public.user_profiles(id),
  display_name_snapshot text not null,
  role_snapshot text not null,
  operator_revision_snapshot bigint not null,
  access_revision_snapshot bigint not null,
  session_secret_hash text not null,
  token_version text not null default 'v1',
  status text not null default 'active',
  authenticated_at timestamptz not null,
  last_credential_verified_at timestamptz not null,
  last_seen_at timestamptz not null,
  expires_at timestamptz not null,
  idle_expires_at timestamptz not null,
  ended_at timestamptz,
  ended_by_auth_user_id uuid references auth.users(id),
  end_reason text,
  revoked_at timestamptz,
  revoked_by_auth_user_id uuid references auth.users(id),
  revocation_reason text,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routine_operator_sessions_device_fkey foreign key(shared_device_id,organization_id)
    references public.routine_shared_devices(id,organization_id),
  constraint routine_operator_sessions_operator_fkey foreign key(operator_id,organization_id)
    references public.routine_operators(id,organization_id),
  constraint routine_operator_sessions_client_fkey foreign key(client_instance_id,organization_id,device_auth_user_id)
    references public.routine_client_instances(id,organization_id,auth_user_id),
  constraint routine_operator_sessions_hash_check check(session_secret_hash~'^[0-9a-f]{64}$' and token_version='v1'),
  constraint routine_operator_sessions_role_check check(role_snapshot in('staff','time2staff','shift_lead','event_floor_manager')),
  constraint routine_operator_sessions_status_check check(status in('active','ended','revoked','expired')),
  constraint routine_operator_sessions_time_check check(expires_at>authenticated_at and idle_expires_at<=expires_at and idle_expires_at>authenticated_at),
  constraint routine_operator_sessions_revision_check check(operator_revision_snapshot>0 and access_revision_snapshot>0 and revision>0),
  constraint routine_operator_sessions_end_check check((status='ended' and ended_at is not null and char_length(trim(end_reason)) between 1 and 1000)
    or (status<>'ended' and ended_at is null and ended_by_auth_user_id is null and end_reason is null)),
  constraint routine_operator_sessions_revoke_check check((status='revoked' and revoked_at is not null and revoked_by_auth_user_id is not null
    and char_length(trim(revocation_reason)) between 1 and 1000) or (status<>'revoked' and revoked_at is null and revoked_by_auth_user_id is null and revocation_reason is null)),
  constraint routine_operator_sessions_id_org_unique unique(id,organization_id)
);
create unique index if not exists routine_operator_sessions_one_active_client
  on public.routine_operator_sessions(shared_device_id,client_instance_id) where status='active';

create table if not exists public.routine_operator_operations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  actor_auth_user_id uuid not null references auth.users(id),
  effective_operator_id uuid references public.routine_operators(id),
  operator_session_id uuid references public.routine_operator_sessions(id),
  operation_type text not null,
  idempotency_key uuid not null,
  request_hash text not null,
  resource_type text not null,
  resource_id uuid,
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint routine_operator_operations_replay_unique unique(organization_id,actor_auth_user_id,effective_operator_id,operation_type,idempotency_key),
  constraint routine_operator_operations_hash_check check(request_hash~'^[0-9a-f]{64}$'),
  constraint routine_operator_operations_json_check check(jsonb_typeof(response_payload)='object' and pg_column_size(response_payload)<=131072)
);

create table if not exists public.routine_operator_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  shared_device_id uuid references public.routine_shared_devices(id),
  operator_id uuid references public.routine_operators(id),
  operator_session_id uuid references public.routine_operator_sessions(id),
  event_type text not null,
  actor_auth_user_id uuid not null references auth.users(id),
  actor_profile_id uuid references public.user_profiles(id),
  actor_name_snapshot text not null,
  payload jsonb not null default '{}'::jsonb,
  operation_id uuid references public.routine_operator_operations(id),
  created_at timestamptz not null default now(),
  constraint routine_operator_events_type_check check(event_type in('shared_device_registered','shared_device_updated','shared_device_disabled',
    'operator_created','operator_updated','operator_disabled','operator_credential_created','operator_credential_rotated',
    'operator_credential_revoked','operator_auth_succeeded','operator_auth_failed','operator_session_started',
    'operator_session_reauthenticated','operator_session_ended','operator_session_revoked','operator_session_expired','operator_access_updated')),
  constraint routine_operator_events_json_check check(jsonb_typeof(payload)='object' and pg_column_size(payload)<=65536)
);

create index if not exists routine_device_access_listing_idx on public.routine_shared_device_operator_access(shared_device_id,active,sort_order);
create index if not exists routine_operator_sessions_operator_idx on public.routine_operator_sessions(operator_id,status,expires_at);
create index if not exists routine_operator_attempts_security_idx on public.routine_operator_auth_attempts(organization_id,attempted_at desc);
create index if not exists routine_operator_events_security_idx on public.routine_operator_events(organization_id,created_at desc);

alter table public.routine_run_participants add column if not exists identity_type text not null default 'personal_profile';
alter table public.routine_run_participants add column if not exists operator_id uuid references public.routine_operators(id);
alter table public.routine_run_participants add column if not exists linked_user_profile_id_snapshot uuid references public.user_profiles(id);
alter table public.routine_run_participants add column if not exists authenticated_device_profile_id_snapshot uuid references public.user_profiles(id);
alter table public.routine_run_participants alter column user_profile_id drop not null;
alter table public.routine_bundle_participants add column if not exists identity_type text not null default 'personal_profile';
alter table public.routine_bundle_participants add column if not exists operator_id uuid references public.routine_operators(id);
alter table public.routine_bundle_participants add column if not exists linked_user_profile_id_snapshot uuid references public.user_profiles(id);
alter table public.routine_bundle_participants add column if not exists authenticated_device_profile_id_snapshot uuid references public.user_profiles(id);
alter table public.routine_bundle_participants alter column user_profile_id drop not null;

alter table public.routine_events add column if not exists authenticated_profile_id uuid references public.user_profiles(id);
alter table public.routine_events add column if not exists shared_device_id uuid references public.routine_shared_devices(id);
alter table public.routine_events add column if not exists operator_session_id uuid references public.routine_operator_sessions(id);
alter table public.routine_events add column if not exists actor_source text not null default 'personal_auth';
alter table public.routine_offline_operation_receipts alter column actor_profile_id drop not null;
alter table public.routine_offline_operation_receipts add column if not exists effective_operator_id uuid references public.routine_operators(id);
alter table public.routine_offline_operation_receipts add column if not exists operator_session_id uuid references public.routine_operator_sessions(id);
alter table public.routine_offline_operation_receipts add column if not exists actor_source text not null default 'personal_auth';

alter table public.routine_runs add column if not exists started_by_operator_id uuid references public.routine_operators(id);
alter table public.routine_runs add column if not exists finished_by_operator_id uuid references public.routine_operators(id);
alter table public.routine_run_tasks add column if not exists initial_assessed_by_operator_id uuid references public.routine_operators(id);
alter table public.routine_run_tasks add column if not exists started_by_operator_id uuid references public.routine_operators(id);
alter table public.routine_run_tasks add column if not exists completed_by_operator_id uuid references public.routine_operators(id);
alter table public.routine_run_tasks add column if not exists last_status_changed_by_operator_id uuid references public.routine_operators(id);
alter table public.routine_run_task_items add column if not exists completed_by_operator_id uuid references public.routine_operators(id);
alter table public.routine_run_task_items add column if not exists last_status_changed_by_operator_id uuid references public.routine_operators(id);
alter table public.routine_deviations add column if not exists detected_by_operator_id uuid references public.routine_operators(id);
alter table public.routine_deviations add column if not exists resolved_by_operator_id uuid references public.routine_operators(id);

alter table public.routine_task_verifications add column if not exists effective_operator_id uuid references public.routine_operators(id);
alter table public.routine_task_verifications add column if not exists operator_session_id uuid references public.routine_operator_sessions(id);
alter table public.routine_task_verifications add column if not exists actor_source text not null default 'personal_auth';
alter table public.routine_run_verifications add column if not exists effective_operator_id uuid references public.routine_operators(id);
alter table public.routine_run_verifications add column if not exists operator_session_id uuid references public.routine_operator_sessions(id);
alter table public.routine_run_verifications add column if not exists actor_source text not null default 'personal_auth';
alter table public.routine_handovers add column if not exists effective_operator_id uuid references public.routine_operators(id);
alter table public.routine_handovers add column if not exists operator_session_id uuid references public.routine_operator_sessions(id);
alter table public.routine_handovers add column if not exists actor_source text not null default 'personal_auth';
alter table public.routine_bundle_steps add column if not exists effective_operator_id uuid references public.routine_operators(id);
alter table public.routine_bundle_steps add column if not exists operator_session_id uuid references public.routine_operator_sessions(id);
alter table public.routine_bundle_steps add column if not exists actor_source text not null default 'personal_auth';
alter table public.routine_delivery_comparisons add column if not exists effective_operator_id uuid references public.routine_operators(id);
alter table public.routine_delivery_comparisons add column if not exists operator_session_id uuid references public.routine_operator_sessions(id);
alter table public.routine_delivery_comparisons add column if not exists actor_source text not null default 'personal_auth';
alter table public.routine_run_operations add column if not exists effective_operator_id uuid references public.routine_operators(id);
alter table public.routine_run_operations add column if not exists operator_session_id uuid references public.routine_operator_sessions(id);
alter table public.routine_run_operations add column if not exists actor_source text not null default 'personal_auth';
alter table public.routine_bundle_operations add column if not exists effective_operator_id uuid references public.routine_operators(id);
alter table public.routine_bundle_operations add column if not exists operator_session_id uuid references public.routine_operator_sessions(id);
alter table public.routine_bundle_operations add column if not exists actor_source text not null default 'personal_auth';

do $phase10j_participant_constraints$
begin
  alter table public.routine_run_participants drop constraint if exists routine_run_participants_run_profile_unique;
  alter table public.routine_bundle_participants drop constraint if exists routine_bundle_participants_profile_unique;
  if not exists(select 1 from pg_constraint where conname='routine_run_participants_identity_check') then
    alter table public.routine_run_participants add constraint routine_run_participants_identity_check check(
      (identity_type='personal_profile' and user_profile_id is not null and operator_id is null and authenticated_device_profile_id_snapshot is null)
      or (identity_type='shared_device_operator' and user_profile_id is null and operator_id is not null and authenticated_device_profile_id_snapshot is not null));
  end if;
  if not exists(select 1 from pg_constraint where conname='routine_bundle_participants_identity_check') then
    alter table public.routine_bundle_participants add constraint routine_bundle_participants_identity_check check(
      (identity_type='personal_profile' and user_profile_id is not null and operator_id is null and authenticated_device_profile_id_snapshot is null)
      or (identity_type='shared_device_operator' and user_profile_id is null and operator_id is not null and authenticated_device_profile_id_snapshot is not null));
  end if;
end $phase10j_participant_constraints$;
create unique index if not exists routine_run_participants_personal_unique on public.routine_run_participants(run_id,user_profile_id) where identity_type='personal_profile';
create unique index if not exists routine_run_participants_operator_unique on public.routine_run_participants(run_id,operator_id) where identity_type='shared_device_operator';
create unique index if not exists routine_bundle_participants_personal_unique on public.routine_bundle_participants(bundle_id,user_profile_id) where identity_type='personal_profile';
create unique index if not exists routine_bundle_participants_operator_unique on public.routine_bundle_participants(bundle_id,operator_id) where identity_type='shared_device_operator';

create or replace function public.routine_phase10j_request_hash(input_value jsonb)
returns text language sql immutable security definer set search_path=pg_catalog
as $$ select encode(extensions.digest(convert_to(coalesce(input_value,'{}'::jsonb)::text,'UTF8'),'sha256'),'hex') $$;

create or replace function public.routine_phase10j_json_has_secret(input_value jsonb)
returns boolean language sql immutable security definer set search_path=pg_catalog
as $$
  select exists(
    select 1 from jsonb_object_keys(coalesce(input_value,'{}'::jsonb)) key
    where lower(key) in('pin','pin_hash','credential_hash','session_secret','session_secret_hash','session_token',
      'x-mesh-routine-operator-session','access_token','refresh_token','service_role')
  ) or exists(
    select 1 from jsonb_each(coalesce(input_value,'{}'::jsonb)) entry
    where jsonb_typeof(entry.value)='object' and public.routine_phase10j_json_has_secret(entry.value)
  ) or exists(
    select 1 from jsonb_each(coalesce(input_value,'{}'::jsonb)) entry,
      lateral jsonb_array_elements(case when jsonb_typeof(entry.value)='array' then entry.value else '[]'::jsonb end) item
    where jsonb_typeof(item)='object' and public.routine_phase10j_json_has_secret(item)
  );
$$;

create or replace function public.routine_phase10j_require_manager()
returns public.user_profiles language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_profile public.user_profiles%rowtype;
begin
  select profile.* into v_profile from public.user_profiles profile
  where profile.id=auth.uid() and profile.active and profile.organization_id is not null
    and not coalesce(profile.is_shared_device,false) and profile.role='manager';
  if v_profile.id is null then
    raise exception using errcode='42501',message='Personal manager authentication is required.';
  end if;
  return v_profile;
end $$;

create or replace function public.routine_phase10j_shared_device_for_request()
returns public.routine_shared_devices language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_device public.routine_shared_devices%rowtype;
begin
  select device.* into v_device from public.routine_shared_devices device
  join public.user_profiles profile on profile.id=device.user_profile_id
  where device.auth_user_id=auth.uid() and device.active and profile.active
    and profile.organization_id=device.organization_id and coalesce(profile.is_shared_device,false);
  if v_device.id is null then raise exception using errcode='42501',message='operator_auth_failed'; end if;
  return v_device;
end $$;

create or replace function public.routine_phase10j_validate_pin(input_pin text)
returns void language plpgsql immutable security definer set search_path=pg_catalog
as $$
declare v_pin text:=coalesce(input_pin,''); v_ascending text:='012345678901234567890'; v_descending text:='987654321098765432109';
begin
  if v_pin !~ '^[0-9]{6,12}$' or v_pin~'^([0-9])\1+$'
     or v_pin in('123456','654321','000000','111111','121212','112233')
     or position(v_pin in v_ascending)>0 or position(v_pin in v_descending)>0 then
    raise exception using errcode='P0001',message='PIN does not meet the operator credential policy.';
  end if;
end $$;

create or replace function public.routine_phase10j_device_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_profile public.user_profiles%rowtype;
begin
  if coalesce(current_setting('mesh.routine_operator_internal',true),'')='' then raise exception using errcode='42501',message='Shared devices may only be changed through manager RPCs.'; end if;
  if tg_op='DELETE' then raise exception using errcode='42501',message='Shared devices cannot be deleted.'; end if;
  if tg_op='UPDATE' and (new.id<>old.id or new.organization_id<>old.organization_id or new.auth_user_id<>old.auth_user_id
      or new.user_profile_id<>old.user_profile_id or new.device_key<>old.device_key or new.created_at<>old.created_at) then
    raise exception using errcode='42501',message='Shared-device identity is immutable.';
  end if;
  select profile.* into v_profile from public.user_profiles profile where profile.id=new.user_profile_id;
  if v_profile.id is null or not v_profile.active or not coalesce(v_profile.is_shared_device,false)
     or v_profile.organization_id<>new.organization_id or v_profile.id<>new.auth_user_id or v_profile.role='manager' then
    raise exception using errcode='P0001',message='The shared-device profile is invalid.';
  end if;
  new.updated_at:=clock_timestamp();
  return new;
end $$;

create or replace function public.routine_phase10j_operator_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_profile public.user_profiles%rowtype;
begin
  if coalesce(current_setting('mesh.routine_operator_internal',true),'')='' then raise exception using errcode='42501',message='Operators may only be changed through manager RPCs.'; end if;
  if tg_op='DELETE' then raise exception using errcode='42501',message='Operators cannot be deleted.'; end if;
  if tg_op='UPDATE' and (new.id<>old.id or new.organization_id<>old.organization_id or new.operator_key<>old.operator_key
      or new.operator_type<>old.operator_type or new.linked_user_profile_id is distinct from old.linked_user_profile_id or new.created_at<>old.created_at) then
    raise exception using errcode='42501',message='Operator identity and type are immutable.';
  end if;
  if new.operator_type='linked_profile' then
    select profile.* into v_profile from public.user_profiles profile where profile.id=new.linked_user_profile_id;
    if v_profile.id is null or not v_profile.active or coalesce(v_profile.is_shared_device,false)
       or v_profile.organization_id<>new.organization_id or v_profile.role<>new.effective_role
       or v_profile.role in('manager','counter') then
      raise exception using errcode='P0001',message='The linked operator profile is invalid.';
    end if;
  end if;
  new.updated_at:=clock_timestamp();
  return new;
end $$;

create or replace function public.routine_phase10j_access_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_operator public.routine_operators%rowtype;
begin
  if coalesce(current_setting('mesh.routine_operator_internal',true),'')='' then raise exception using errcode='42501',message='Operator access may only be changed through manager RPCs.'; end if;
  if tg_op='DELETE' then raise exception using errcode='42501',message='Operator access rows cannot be deleted.'; end if;
  select operator.* into v_operator from public.routine_operators operator where operator.id=new.operator_id;
  if (new.allow_run_coordination and (v_operator.operator_type<>'linked_profile' or v_operator.effective_role not in('shift_lead','event_floor_manager')))
     or (new.allow_event_transfer_actions and v_operator.operator_type<>'linked_profile') then
    raise exception using errcode='P0001',message='Operator access exceeds linked-profile capabilities.';
  end if;
  new.updated_at:=clock_timestamp();
  return new;
end $$;

create or replace function public.routine_phase10j_protected_row_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if coalesce(current_setting('mesh.routine_operator_internal',true),'')='' then raise exception using errcode='42501',message='Routine operator security rows are RPC-managed.'; end if;
  if tg_op='DELETE' then raise exception using errcode='42501',message='Routine operator security rows are immutable.'; end if;
  if tg_table_name='routine_operator_credentials' and tg_op='UPDATE' and (
      to_jsonb(new)->>'pin_hash' is distinct from to_jsonb(old)->>'pin_hash'
      or to_jsonb(new)->>'operator_id' is distinct from to_jsonb(old)->>'operator_id'
      or to_jsonb(new)->>'credential_version' is distinct from to_jsonb(old)->>'credential_version'
      or to_jsonb(new)->>'organization_id' is distinct from to_jsonb(old)->>'organization_id') then
    raise exception using errcode='42501',message='Credential identity and hash are immutable.';
  end if;
  if tg_table_name='routine_operator_sessions' and tg_op='UPDATE' and (
      to_jsonb(new)->>'session_secret_hash' is distinct from to_jsonb(old)->>'session_secret_hash'
      or to_jsonb(new)->>'operator_id' is distinct from to_jsonb(old)->>'operator_id'
      or to_jsonb(new)->>'client_instance_id' is distinct from to_jsonb(old)->>'client_instance_id'
      or to_jsonb(new)->>'shared_device_id' is distinct from to_jsonb(old)->>'shared_device_id'
      or to_jsonb(new)->>'credential_id' is distinct from to_jsonb(old)->>'credential_id'
      or to_jsonb(new)->>'linked_user_profile_id_snapshot' is distinct from to_jsonb(old)->>'linked_user_profile_id_snapshot'
      or to_jsonb(new)->>'role_snapshot' is distinct from to_jsonb(old)->>'role_snapshot') then
    raise exception using errcode='42501',message='Operator session identity is immutable.';
  end if;
  return new;
end $$;

create or replace function public.routine_phase10j_immutable_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$ begin raise exception using errcode='42501',message='Routine operator audit rows are immutable.'; end $$;

drop trigger if exists routine_shared_devices_guard on public.routine_shared_devices;
create trigger routine_shared_devices_guard before insert or update or delete on public.routine_shared_devices for each row execute function public.routine_phase10j_device_guard();
drop trigger if exists routine_operators_guard on public.routine_operators;
create trigger routine_operators_guard before insert or update or delete on public.routine_operators for each row execute function public.routine_phase10j_operator_guard();
drop trigger if exists routine_device_access_guard on public.routine_shared_device_operator_access;
create trigger routine_device_access_guard before insert or update or delete on public.routine_shared_device_operator_access for each row execute function public.routine_phase10j_access_guard();
drop trigger if exists routine_operator_credentials_guard on public.routine_operator_credentials;
create trigger routine_operator_credentials_guard before insert or update or delete on public.routine_operator_credentials for each row execute function public.routine_phase10j_protected_row_guard();
drop trigger if exists routine_operator_throttles_guard on public.routine_operator_auth_throttles;
create trigger routine_operator_throttles_guard before insert or update or delete on public.routine_operator_auth_throttles for each row execute function public.routine_phase10j_protected_row_guard();
drop trigger if exists routine_operator_attempts_immutable on public.routine_operator_auth_attempts;
create trigger routine_operator_attempts_immutable before update or delete on public.routine_operator_auth_attempts for each row execute function public.routine_phase10j_immutable_guard();
drop trigger if exists routine_operator_sessions_guard on public.routine_operator_sessions;
create trigger routine_operator_sessions_guard before insert or update or delete on public.routine_operator_sessions for each row execute function public.routine_phase10j_protected_row_guard();
drop trigger if exists routine_operator_operations_immutable on public.routine_operator_operations;
create trigger routine_operator_operations_immutable before update or delete on public.routine_operator_operations for each row execute function public.routine_phase10j_immutable_guard();
drop trigger if exists routine_operator_events_immutable on public.routine_operator_events;
create trigger routine_operator_events_immutable before update or delete on public.routine_operator_events for each row execute function public.routine_phase10j_immutable_guard();

create or replace function public.routine_read_operator_session_header()
returns text language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_headers jsonb; v_token text;
begin
  begin v_headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb); exception when others then v_headers:='{}'::jsonb; end;
  v_token:=v_headers->>'x-mesh-routine-operator-session';
  if v_token is not null and (char_length(v_token)>96 or v_token!~E'^v1\\.[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\\.[A-Za-z0-9_-]{43}$') then
    raise exception using errcode='P0001',message='operator_auth_failed';
  end if;
  return v_token;
end $$;

create or replace function public.routine_parse_operator_session_token(input_token text)
returns table(session_id uuid,secret_hash text) language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_parts text[]; v_secret text; v_padding text;
begin
  if input_token is null or char_length(input_token)>96 or input_token!~E'^v1\\.[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\\.[A-Za-z0-9_-]{43}$' then
    raise exception using errcode='P0001',message='operator_auth_failed';
  end if;
  v_parts:=string_to_array(input_token,'.');
  begin session_id:=v_parts[2]::uuid; exception when others then raise exception using errcode='P0001',message='operator_auth_failed'; end;
  v_secret:=translate(v_parts[3],'-_','+/');
  v_padding:=repeat('=',(4-char_length(v_secret)%4)%4);
  begin secret_hash:=encode(extensions.digest(decode(v_secret||v_padding,'base64'),'sha256'),'hex');
  exception when others then raise exception using errcode='P0001',message='operator_auth_failed'; end;
  if char_length(secret_hash)<>64 then raise exception using errcode='P0001',message='operator_auth_failed'; end if;
  return next;
end $$;

create or replace function public.routine_constant_time_equals(input_left text,input_right text)
returns boolean language plpgsql immutable security definer set search_path=pg_catalog
as $$
declare v_diff integer:=char_length(coalesce(input_left,''))#char_length(coalesce(input_right,'')); v_i integer;
  v_left text:=rpad(coalesce(input_left,''),greatest(char_length(coalesce(input_left,'')),char_length(coalesce(input_right,''))),'0');
  v_right text:=rpad(coalesce(input_right,''),greatest(char_length(coalesce(input_left,'')),char_length(coalesce(input_right,''))),'0');
begin
  for v_i in 1..char_length(v_left) loop v_diff:=v_diff|(ascii(substr(v_left,v_i,1))#ascii(substr(v_right,v_i,1))); end loop;
  return v_diff=0;
end $$;

create or replace function public.routine_operator_session_is_valid(input_session_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select exists(select 1 from public.routine_operator_sessions session
    join public.routine_shared_devices device on device.id=session.shared_device_id and device.organization_id=session.organization_id
    join public.routine_operators operator on operator.id=session.operator_id and operator.organization_id=session.organization_id
    join public.routine_shared_device_operator_access access on access.shared_device_id=device.id and access.operator_id=operator.id and access.organization_id=session.organization_id
    join public.routine_operator_credentials credential on credential.id=session.credential_id and credential.operator_id=operator.id
    join public.routine_client_instances client on client.id=session.client_instance_id and client.auth_user_id=session.device_auth_user_id
    left join public.user_profiles linked on linked.id=operator.linked_user_profile_id
    where session.id=input_session_id and session.status='active' and session.device_auth_user_id=auth.uid()
      and session.expires_at>clock_timestamp() and session.idle_expires_at>clock_timestamp()
      and device.active and operator.active and (operator.valid_from is null or operator.valid_from<=clock_timestamp())
      and (operator.valid_until is null or operator.valid_until>clock_timestamp())
      and access.active and (access.valid_from is null or access.valid_from<=clock_timestamp())
      and (access.valid_until is null or access.valid_until>clock_timestamp()) and credential.status='active'
      and (credential.expires_at is null or credential.expires_at>clock_timestamp()) and client.revoked_at is null
      and client.shared_device_id=device.id and operator.revision=session.operator_revision_snapshot and access.revision=session.access_revision_snapshot
      and (operator.operator_type='temporary' or (linked.active and not coalesce(linked.is_shared_device,false)
        and linked.organization_id=operator.organization_id and linked.role=session.role_snapshot)));
$$;

create or replace function public.routine_resolve_operator_session()
returns table(session_id uuid,organization_id uuid,shared_device_id uuid,device_auth_user_id uuid,device_profile_id uuid,
  operator_id uuid,linked_profile_id uuid,display_name text,operator_role text,capabilities jsonb,last_credential_verified_at timestamptz,
  expires_at timestamptz,idle_expires_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_token text; v_parsed record; v_session public.routine_operator_sessions%rowtype; v_access public.routine_shared_device_operator_access%rowtype;
  v_device public.routine_shared_devices%rowtype; v_actual_hash text;
begin
  v_token:=public.routine_read_operator_session_header();
  if v_token is null then raise exception using errcode='P0001',message='operator_auth_failed'; end if;
  select * into v_parsed from public.routine_parse_operator_session_token(v_token);
  select session.* into v_session from public.routine_operator_sessions session where session.id=v_parsed.session_id;
  if v_session.id is null or not public.routine_constant_time_equals(v_parsed.secret_hash,v_session.session_secret_hash)
     or not public.routine_operator_session_is_valid(v_session.id) then
    raise exception using errcode='P0001',message='operator_auth_failed';
  end if;
  select access.* into v_access from public.routine_shared_device_operator_access access
    where access.shared_device_id=v_session.shared_device_id and access.operator_id=v_session.operator_id;
  select device.* into v_device from public.routine_shared_devices device where device.id=v_session.shared_device_id;
  session_id:=v_session.id; organization_id:=v_session.organization_id; shared_device_id:=v_session.shared_device_id;
  device_auth_user_id:=v_session.device_auth_user_id; device_profile_id:=v_session.device_user_profile_id;
  operator_id:=v_session.operator_id; linked_profile_id:=v_session.linked_user_profile_id_snapshot;
  display_name:=v_session.display_name_snapshot; operator_role:=v_session.role_snapshot;
  capabilities:=jsonb_build_object('taskActions',v_access.allow_task_actions,'criticalActions',v_access.allow_critical_actions,
    'runCoordination',v_access.allow_run_coordination and v_session.linked_user_profile_id_snapshot is not null,
    'eventTransferActions',v_access.allow_event_transfer_actions and v_session.linked_user_profile_id_snapshot is not null,
    'offlineNoncritical',v_access.allow_offline_noncritical and v_device.allow_offline_noncritical_drafts);
  last_credential_verified_at:=v_session.last_credential_verified_at; expires_at:=v_session.expires_at; idle_expires_at:=v_session.idle_expires_at;
  return next;
end $$;

create or replace function public.routine_operator_credential_is_fresh(input_session_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$ select exists(select 1 from public.routine_operator_sessions session join public.routine_shared_devices device on device.id=session.shared_device_id
  where session.id=input_session_id and session.last_credential_verified_at>clock_timestamp()-make_interval(mins=>device.critical_reauth_minutes)
    and public.routine_operator_session_is_valid(session.id)) $$;

create unique index if not exists routine_operator_operations_personal_replay_unique
  on public.routine_operator_operations(organization_id,actor_auth_user_id,operation_type,idempotency_key)
  where effective_operator_id is null;
create unique index if not exists routine_operator_operations_shared_replay_unique
  on public.routine_operator_operations(organization_id,actor_auth_user_id,effective_operator_id,operation_type,idempotency_key)
  where effective_operator_id is not null;

create or replace function public.routine_phase10j_existing_operation(input_organization_id uuid,input_actor_auth_user_id uuid,
  input_effective_operator_id uuid,input_operation_type text,input_idempotency_key uuid,input_request_hash text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_operation public.routine_operator_operations%rowtype;
begin
  select operation.* into v_operation from public.routine_operator_operations operation
  where operation.organization_id=input_organization_id and operation.actor_auth_user_id=input_actor_auth_user_id
    and operation.effective_operator_id is not distinct from input_effective_operator_id
    and operation.operation_type=input_operation_type and operation.idempotency_key=input_idempotency_key;
  if v_operation.id is null then return null; end if;
  if v_operation.request_hash<>input_request_hash then raise exception using errcode='P0001',message='Idempotency key was reused with another request.'; end if;
  return v_operation.response_payload;
end $$;

create or replace function public.routine_phase10j_record_operation(input_organization_id uuid,input_actor_auth_user_id uuid,
  input_effective_operator_id uuid,input_operator_session_id uuid,input_operation_type text,input_idempotency_key uuid,
  input_request_hash text,input_resource_type text,input_resource_id uuid,input_response jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog
as $$
declare v_id uuid;
begin
  if public.routine_phase10j_json_has_secret(input_response) then raise exception using errcode='P0001',message='Sensitive identity material is forbidden in operation responses.'; end if;
  perform set_config('mesh.routine_operator_internal','operation',true);
  insert into public.routine_operator_operations(organization_id,actor_auth_user_id,effective_operator_id,operator_session_id,
    operation_type,idempotency_key,request_hash,resource_type,resource_id,response_payload)
  values(input_organization_id,input_actor_auth_user_id,input_effective_operator_id,input_operator_session_id,
    input_operation_type,input_idempotency_key,input_request_hash,input_resource_type,input_resource_id,input_response)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.routine_phase10j_record_event(input_organization_id uuid,input_shared_device_id uuid,input_operator_id uuid,
  input_operator_session_id uuid,input_event_type text,input_actor_auth_user_id uuid,input_actor_profile_id uuid,input_actor_name text,
  input_payload jsonb,input_operation_id uuid default null)
returns uuid language plpgsql security definer set search_path=pg_catalog
as $$
declare v_id uuid;
begin
  if public.routine_phase10j_json_has_secret(input_payload) then raise exception using errcode='P0001',message='Sensitive identity material is forbidden in operator events.'; end if;
  perform set_config('mesh.routine_operator_internal','event',true);
  insert into public.routine_operator_events(organization_id,shared_device_id,operator_id,operator_session_id,event_type,
    actor_auth_user_id,actor_profile_id,actor_name_snapshot,payload,operation_id)
  values(input_organization_id,input_shared_device_id,input_operator_id,input_operator_session_id,input_event_type,
    input_actor_auth_user_id,input_actor_profile_id,trim(input_actor_name),coalesce(input_payload,'{}'::jsonb),input_operation_id)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.register_routine_shared_device(input_user_profile_id uuid,input_device_key text,input_label text,
  input_settings jsonb,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10j_require_manager(); v_device public.routine_shared_devices%rowtype;
  v_hash text; v_response jsonb; v_operation uuid;
begin
  v_hash:=public.routine_phase10j_request_hash(jsonb_build_object('profileId',input_user_profile_id,'deviceKey',lower(trim(input_device_key)),
    'label',trim(input_label),'settings',coalesce(input_settings,'{}'::jsonb)));
  v_response:=public.routine_phase10j_existing_operation(v_actor.organization_id,v_actor.id,null,'register_shared_device',input_idempotency_key,v_hash);
  if v_response is not null then return v_response||jsonb_build_object('idempotentReplay',true); end if;
  perform set_config('mesh.routine_operator_internal','manager',true);
  insert into public.routine_shared_devices(organization_id,auth_user_id,user_profile_id,device_key,label,
    absolute_session_minutes,idle_timeout_minutes,critical_reauth_minutes,max_failed_attempts,failure_window_minutes,
    lockout_minutes,allow_offline_noncritical_drafts,creation_idempotency_key,creation_request_hash,created_by_auth_user_id,updated_by_auth_user_id)
  values(v_actor.organization_id,input_user_profile_id,input_user_profile_id,lower(trim(input_device_key)),trim(input_label),
    coalesce((input_settings->>'absoluteSessionMinutes')::integer,960),coalesce((input_settings->>'idleTimeoutMinutes')::integer,30),
    coalesce((input_settings->>'criticalReauthMinutes')::integer,5),coalesce((input_settings->>'maxFailedAttempts')::integer,5),
    coalesce((input_settings->>'failureWindowMinutes')::integer,15),coalesce((input_settings->>'lockoutMinutes')::integer,15),
    coalesce((input_settings->>'allowOfflineNoncriticalDrafts')::boolean,true),input_idempotency_key,v_hash,v_actor.id,v_actor.id)
  returning * into v_device;
  v_response:=jsonb_build_object('device',to_jsonb(v_device)-'creation_request_hash','idempotentReplay',false);
  v_operation:=public.routine_phase10j_record_operation(v_actor.organization_id,v_actor.id,null,null,'register_shared_device',input_idempotency_key,
    v_hash,'shared_device',v_device.id,v_response);
  perform public.routine_phase10j_record_event(v_actor.organization_id,v_device.id,null,null,'shared_device_registered',v_actor.id,v_actor.id,
    v_actor.display_name,jsonb_build_object('deviceId',v_device.id,'deviceKey',v_device.device_key,'label',v_device.label),v_operation);
  return v_response;
end $$;

create or replace function public.update_routine_shared_device(input_shared_device_id uuid,input_label text,input_settings jsonb,
  input_expected_revision bigint,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10j_require_manager(); v_device public.routine_shared_devices%rowtype;
  v_hash text; v_response jsonb; v_operation uuid;
begin
  v_hash:=public.routine_phase10j_request_hash(jsonb_build_object('deviceId',input_shared_device_id,'label',trim(input_label),
    'settings',coalesce(input_settings,'{}'::jsonb),'expectedRevision',input_expected_revision));
  v_response:=public.routine_phase10j_existing_operation(v_actor.organization_id,v_actor.id,null,'update_shared_device',input_idempotency_key,v_hash);
  if v_response is not null then return v_response||jsonb_build_object('idempotentReplay',true); end if;
  select device.* into v_device from public.routine_shared_devices device where device.id=input_shared_device_id
    and device.organization_id=v_actor.organization_id for update;
  if v_device.id is null then raise exception using errcode='42501',message='Shared device is not available.'; end if;
  if v_device.revision<>input_expected_revision then raise exception using errcode='40001',message='Stale shared-device revision.'; end if;
  perform set_config('mesh.routine_operator_internal','manager',true);
  update public.routine_shared_devices set label=trim(input_label),
    absolute_session_minutes=coalesce((input_settings->>'absoluteSessionMinutes')::integer,absolute_session_minutes),
    idle_timeout_minutes=coalesce((input_settings->>'idleTimeoutMinutes')::integer,idle_timeout_minutes),
    critical_reauth_minutes=coalesce((input_settings->>'criticalReauthMinutes')::integer,critical_reauth_minutes),
    max_failed_attempts=coalesce((input_settings->>'maxFailedAttempts')::integer,max_failed_attempts),
    failure_window_minutes=coalesce((input_settings->>'failureWindowMinutes')::integer,failure_window_minutes),
    lockout_minutes=coalesce((input_settings->>'lockoutMinutes')::integer,lockout_minutes),
    allow_offline_noncritical_drafts=coalesce((input_settings->>'allowOfflineNoncriticalDrafts')::boolean,allow_offline_noncritical_drafts),
    revision=revision+1,updated_by_auth_user_id=v_actor.id where id=v_device.id returning * into v_device;
  v_response:=jsonb_build_object('device',to_jsonb(v_device)-'creation_request_hash','idempotentReplay',false);
  v_operation:=public.routine_phase10j_record_operation(v_actor.organization_id,v_actor.id,null,null,'update_shared_device',input_idempotency_key,
    v_hash,'shared_device',v_device.id,v_response);
  perform public.routine_phase10j_record_event(v_actor.organization_id,v_device.id,null,null,'shared_device_updated',v_actor.id,v_actor.id,
    v_actor.display_name,jsonb_build_object('deviceId',v_device.id,'revision',v_device.revision),v_operation);
  return v_response;
end $$;

create or replace function public.set_routine_shared_device_active(input_shared_device_id uuid,input_active boolean,input_reason text,
  input_expected_revision bigint,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10j_require_manager(); v_device public.routine_shared_devices%rowtype;
  v_hash text; v_response jsonb; v_operation uuid; v_reason text:=nullif(trim(coalesce(input_reason,'')),'');
begin
  if v_reason is null or char_length(v_reason)>1000 then raise exception using errcode='P0001',message='A bounded device status reason is required.'; end if;
  v_hash:=public.routine_phase10j_request_hash(jsonb_build_object('deviceId',input_shared_device_id,'active',input_active,'reason',v_reason,'expectedRevision',input_expected_revision));
  v_response:=public.routine_phase10j_existing_operation(v_actor.organization_id,v_actor.id,null,'set_shared_device_active',input_idempotency_key,v_hash);
  if v_response is not null then return v_response||jsonb_build_object('idempotentReplay',true); end if;
  select device.* into v_device from public.routine_shared_devices device where device.id=input_shared_device_id
    and device.organization_id=v_actor.organization_id for update;
  if v_device.id is null then raise exception using errcode='42501',message='Shared device is not available.'; end if;
  if v_device.revision<>input_expected_revision then raise exception using errcode='40001',message='Stale shared-device revision.'; end if;
  perform set_config('mesh.routine_operator_internal','manager',true);
  update public.routine_shared_devices set active=input_active,revision=revision+1,updated_by_auth_user_id=v_actor.id
    where id=v_device.id returning * into v_device;
  if not input_active then
    update public.routine_operator_sessions set status='revoked',revoked_at=clock_timestamp(),revoked_by_auth_user_id=v_actor.id,
      revocation_reason=v_reason,revision=revision+1,updated_at=clock_timestamp() where shared_device_id=v_device.id and status='active';
  end if;
  v_response:=jsonb_build_object('device',to_jsonb(v_device)-'creation_request_hash','idempotentReplay',false);
  v_operation:=public.routine_phase10j_record_operation(v_actor.organization_id,v_actor.id,null,null,'set_shared_device_active',input_idempotency_key,
    v_hash,'shared_device',v_device.id,v_response);
  perform public.routine_phase10j_record_event(v_actor.organization_id,v_device.id,null,null,
    case when input_active then 'shared_device_updated' else 'shared_device_disabled' end,v_actor.id,v_actor.id,v_actor.display_name,
    jsonb_build_object('deviceId',v_device.id,'active',input_active,'reason',v_reason),v_operation);
  return v_response;
end $$;

create or replace function public.create_routine_operator(input_operator_key text,input_operator_type text,input_linked_user_profile_id uuid,
  input_display_name text,input_effective_role text,input_valid_from timestamptz,input_valid_until timestamptz,input_initial_pin text,
  input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10j_require_manager(); v_operator public.routine_operators%rowtype;
  v_credential public.routine_operator_credentials%rowtype; v_hash text; v_response jsonb; v_operation uuid;
begin
  perform public.routine_phase10j_validate_pin(input_initial_pin);
  v_hash:=public.routine_phase10j_request_hash(jsonb_build_object('operatorKey',lower(trim(input_operator_key)),'operatorType',input_operator_type,
    'linkedProfileId',input_linked_user_profile_id,'displayName',trim(input_display_name),'effectiveRole',input_effective_role,
    'validFrom',input_valid_from,'validUntil',input_valid_until));
  v_response:=public.routine_phase10j_existing_operation(v_actor.organization_id,v_actor.id,null,'create_operator',input_idempotency_key,v_hash);
  if v_response is not null then return v_response||jsonb_build_object('idempotentReplay',true); end if;
  perform set_config('mesh.routine_operator_internal','manager',true);
  insert into public.routine_operators(organization_id,operator_key,operator_type,linked_user_profile_id,display_name,effective_role,
    valid_from,valid_until,creation_idempotency_key,creation_request_hash,created_by_auth_user_id,updated_by_auth_user_id)
  values(v_actor.organization_id,lower(trim(input_operator_key)),input_operator_type,input_linked_user_profile_id,trim(input_display_name),
    input_effective_role,input_valid_from,input_valid_until,input_idempotency_key,v_hash,v_actor.id,v_actor.id) returning * into v_operator;
  insert into public.routine_operator_credentials(organization_id,operator_id,credential_version,pin_hash,created_by_auth_user_id)
  values(v_actor.organization_id,v_operator.id,1,extensions.crypt(input_initial_pin,extensions.gen_salt('bf',12)),v_actor.id) returning * into v_credential;
  v_response:=jsonb_build_object('operator',to_jsonb(v_operator)-'creation_request_hash','credential',jsonb_build_object(
    'id',v_credential.id,'credentialVersion',v_credential.credential_version,'status',v_credential.status,'createdAt',v_credential.created_at),'idempotentReplay',false);
  v_operation:=public.routine_phase10j_record_operation(v_actor.organization_id,v_actor.id,null,null,'create_operator',input_idempotency_key,
    v_hash,'operator',v_operator.id,v_response);
  perform public.routine_phase10j_record_event(v_actor.organization_id,null,v_operator.id,null,'operator_created',v_actor.id,v_actor.id,
    v_actor.display_name,jsonb_build_object('operatorId',v_operator.id,'operatorType',v_operator.operator_type,'effectiveRole',v_operator.effective_role),v_operation);
  perform public.routine_phase10j_record_event(v_actor.organization_id,null,v_operator.id,null,'operator_credential_created',v_actor.id,v_actor.id,
    v_actor.display_name,jsonb_build_object('operatorId',v_operator.id,'credentialId',v_credential.id,'credentialVersion',1),v_operation);
  return v_response;
end $$;

create or replace function public.routine_phase10j_revoke_operator_sessions(input_operator_id uuid,input_actor_auth_user_id uuid,input_reason text)
returns integer language plpgsql security definer set search_path=pg_catalog
as $$
declare v_count integer;
begin
  perform set_config('mesh.routine_operator_internal','revoke',true);
  update public.routine_operator_sessions set status='revoked',revoked_at=clock_timestamp(),revoked_by_auth_user_id=input_actor_auth_user_id,
    revocation_reason=left(trim(input_reason),1000),revision=revision+1,updated_at=clock_timestamp()
  where operator_id=input_operator_id and status='active';
  get diagnostics v_count=row_count;
  return v_count;
end $$;

create or replace function public.update_routine_operator(input_operator_id uuid,input_display_name text,input_effective_role text,
  input_valid_from timestamptz,input_valid_until timestamptz,input_expected_revision bigint,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10j_require_manager(); v_operator public.routine_operators%rowtype;
  v_hash text; v_response jsonb; v_operation uuid; v_security_change boolean;
begin
  v_hash:=public.routine_phase10j_request_hash(jsonb_build_object('operatorId',input_operator_id,'displayName',trim(input_display_name),
    'effectiveRole',input_effective_role,'validFrom',input_valid_from,'validUntil',input_valid_until,'expectedRevision',input_expected_revision));
  v_response:=public.routine_phase10j_existing_operation(v_actor.organization_id,v_actor.id,null,'update_operator',input_idempotency_key,v_hash);
  if v_response is not null then return v_response||jsonb_build_object('idempotentReplay',true); end if;
  select operator.* into v_operator from public.routine_operators operator where operator.id=input_operator_id
    and operator.organization_id=v_actor.organization_id for update;
  if v_operator.id is null then raise exception using errcode='42501',message='Operator is not available.'; end if;
  if v_operator.revision<>input_expected_revision then raise exception using errcode='40001',message='Stale operator revision.'; end if;
  v_security_change:=v_operator.effective_role<>input_effective_role or v_operator.valid_from is distinct from input_valid_from
    or v_operator.valid_until is distinct from input_valid_until;
  perform set_config('mesh.routine_operator_internal','manager',true);
  update public.routine_operators set display_name=trim(input_display_name),effective_role=input_effective_role,
    valid_from=input_valid_from,valid_until=input_valid_until,revision=revision+1,updated_by_auth_user_id=v_actor.id
    where id=v_operator.id returning * into v_operator;
  if v_security_change then perform public.routine_phase10j_revoke_operator_sessions(v_operator.id,v_actor.id,'Operator security attributes changed.'); end if;
  v_response:=jsonb_build_object('operator',to_jsonb(v_operator)-'creation_request_hash','sessionsRevoked',v_security_change,'idempotentReplay',false);
  v_operation:=public.routine_phase10j_record_operation(v_actor.organization_id,v_actor.id,null,null,'update_operator',input_idempotency_key,
    v_hash,'operator',v_operator.id,v_response);
  perform public.routine_phase10j_record_event(v_actor.organization_id,null,v_operator.id,null,'operator_updated',v_actor.id,v_actor.id,v_actor.display_name,
    jsonb_build_object('operatorId',v_operator.id,'revision',v_operator.revision,'securityRelevant',v_security_change),v_operation);
  return v_response;
end $$;

create or replace function public.set_routine_operator_active(input_operator_id uuid,input_active boolean,input_reason text,
  input_expected_revision bigint,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10j_require_manager(); v_operator public.routine_operators%rowtype;
  v_hash text; v_response jsonb; v_operation uuid; v_reason text:=nullif(trim(coalesce(input_reason,'')),''); v_revoked integer:=0;
begin
  if v_reason is null or char_length(v_reason)>1000 then raise exception using errcode='P0001',message='A bounded operator status reason is required.'; end if;
  v_hash:=public.routine_phase10j_request_hash(jsonb_build_object('operatorId',input_operator_id,'active',input_active,'reason',v_reason,'expectedRevision',input_expected_revision));
  v_response:=public.routine_phase10j_existing_operation(v_actor.organization_id,v_actor.id,null,'set_operator_active',input_idempotency_key,v_hash);
  if v_response is not null then return v_response||jsonb_build_object('idempotentReplay',true); end if;
  select operator.* into v_operator from public.routine_operators operator where operator.id=input_operator_id
    and operator.organization_id=v_actor.organization_id for update;
  if v_operator.id is null then raise exception using errcode='42501',message='Operator is not available.'; end if;
  if v_operator.revision<>input_expected_revision then raise exception using errcode='40001',message='Stale operator revision.'; end if;
  perform set_config('mesh.routine_operator_internal','manager',true);
  update public.routine_operators set active=input_active,revision=revision+1,updated_by_auth_user_id=v_actor.id
    where id=v_operator.id returning * into v_operator;
  if not input_active then v_revoked:=public.routine_phase10j_revoke_operator_sessions(v_operator.id,v_actor.id,v_reason); end if;
  v_response:=jsonb_build_object('operator',to_jsonb(v_operator)-'creation_request_hash','sessionsRevoked',v_revoked,'idempotentReplay',false);
  v_operation:=public.routine_phase10j_record_operation(v_actor.organization_id,v_actor.id,null,null,'set_operator_active',input_idempotency_key,
    v_hash,'operator',v_operator.id,v_response);
  perform public.routine_phase10j_record_event(v_actor.organization_id,null,v_operator.id,null,
    case when input_active then 'operator_updated' else 'operator_disabled' end,v_actor.id,v_actor.id,v_actor.display_name,
    jsonb_build_object('operatorId',v_operator.id,'active',input_active,'reason',v_reason,'sessionsRevoked',v_revoked),v_operation);
  return v_response;
end $$;

create or replace function public.rotate_routine_operator_pin(input_operator_id uuid,input_new_pin text,input_reason text,
  input_expected_operator_revision bigint,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10j_require_manager(); v_operator public.routine_operators%rowtype;
  v_old public.routine_operator_credentials%rowtype; v_new public.routine_operator_credentials%rowtype; v_hash text; v_response jsonb;
  v_operation uuid; v_reason text:=nullif(trim(coalesce(input_reason,'')),''); v_revoked integer;
begin
  perform public.routine_phase10j_validate_pin(input_new_pin);
  if v_reason is null or char_length(v_reason)>1000 then raise exception using errcode='P0001',message='A bounded credential rotation reason is required.'; end if;
  v_hash:=public.routine_phase10j_request_hash(jsonb_build_object('operatorId',input_operator_id,'reason',v_reason,'expectedRevision',input_expected_operator_revision));
  v_response:=public.routine_phase10j_existing_operation(v_actor.organization_id,v_actor.id,null,'rotate_operator_pin',input_idempotency_key,v_hash);
  if v_response is not null then return v_response||jsonb_build_object('idempotentReplay',true); end if;
  select operator.* into v_operator from public.routine_operators operator where operator.id=input_operator_id
    and operator.organization_id=v_actor.organization_id for update;
  if v_operator.id is null then raise exception using errcode='42501',message='Operator is not available.'; end if;
  if v_operator.revision<>input_expected_operator_revision then raise exception using errcode='40001',message='Stale operator revision.'; end if;
  select credential.* into v_old from public.routine_operator_credentials credential where credential.operator_id=v_operator.id
    and credential.status='active' for update;
  perform set_config('mesh.routine_operator_internal','manager',true);
  update public.routine_operator_credentials set status='revoked',revoked_at=clock_timestamp(),revoked_by_auth_user_id=v_actor.id,
    revocation_reason=v_reason where id=v_old.id;
  insert into public.routine_operator_credentials(organization_id,operator_id,credential_version,pin_hash,created_by_auth_user_id)
  values(v_actor.organization_id,v_operator.id,v_old.credential_version+1,extensions.crypt(input_new_pin,extensions.gen_salt('bf',12)),v_actor.id)
  returning * into v_new;
  update public.routine_operators set revision=revision+1,updated_by_auth_user_id=v_actor.id where id=v_operator.id returning * into v_operator;
  v_revoked:=public.routine_phase10j_revoke_operator_sessions(v_operator.id,v_actor.id,v_reason);
  v_response:=jsonb_build_object('operatorId',v_operator.id,'operatorRevision',v_operator.revision,'credential',jsonb_build_object(
    'id',v_new.id,'credentialVersion',v_new.credential_version,'status',v_new.status,'createdAt',v_new.created_at),
    'sessionsRevoked',v_revoked,'idempotentReplay',false);
  v_operation:=public.routine_phase10j_record_operation(v_actor.organization_id,v_actor.id,null,null,'rotate_operator_pin',input_idempotency_key,
    v_hash,'operator',v_operator.id,v_response);
  perform public.routine_phase10j_record_event(v_actor.organization_id,null,v_operator.id,null,'operator_credential_rotated',v_actor.id,v_actor.id,
    v_actor.display_name,jsonb_build_object('operatorId',v_operator.id,'oldCredentialId',v_old.id,'newCredentialId',v_new.id,
      'credentialVersion',v_new.credential_version,'reason',v_reason,'sessionsRevoked',v_revoked),v_operation);
  return v_response;
end $$;

create or replace function public.revoke_routine_operator_credential(input_credential_id uuid,input_reason text,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10j_require_manager(); v_credential public.routine_operator_credentials%rowtype;
  v_hash text; v_response jsonb; v_operation uuid; v_reason text:=nullif(trim(coalesce(input_reason,'')),''); v_revoked integer;
begin
  if v_reason is null or char_length(v_reason)>1000 then raise exception using errcode='P0001',message='A bounded credential revocation reason is required.'; end if;
  v_hash:=public.routine_phase10j_request_hash(jsonb_build_object('credentialId',input_credential_id,'reason',v_reason));
  v_response:=public.routine_phase10j_existing_operation(v_actor.organization_id,v_actor.id,null,'revoke_operator_credential',input_idempotency_key,v_hash);
  if v_response is not null then return v_response||jsonb_build_object('idempotentReplay',true); end if;
  select credential.* into v_credential from public.routine_operator_credentials credential where credential.id=input_credential_id
    and credential.organization_id=v_actor.organization_id for update;
  if v_credential.id is null then raise exception using errcode='42501',message='Credential is not available.'; end if;
  perform set_config('mesh.routine_operator_internal','manager',true);
  if v_credential.status='active' then update public.routine_operator_credentials set status='revoked',revoked_at=clock_timestamp(),
    revoked_by_auth_user_id=v_actor.id,revocation_reason=v_reason where id=v_credential.id returning * into v_credential; end if;
  v_revoked:=public.routine_phase10j_revoke_operator_sessions(v_credential.operator_id,v_actor.id,v_reason);
  v_response:=jsonb_build_object('credential',jsonb_build_object('id',v_credential.id,'operatorId',v_credential.operator_id,
    'credentialVersion',v_credential.credential_version,'status',v_credential.status,'revokedAt',v_credential.revoked_at),
    'sessionsRevoked',v_revoked,'idempotentReplay',false);
  v_operation:=public.routine_phase10j_record_operation(v_actor.organization_id,v_actor.id,null,null,'revoke_operator_credential',input_idempotency_key,
    v_hash,'credential',v_credential.id,v_response);
  perform public.routine_phase10j_record_event(v_actor.organization_id,null,v_credential.operator_id,null,'operator_credential_revoked',
    v_actor.id,v_actor.id,v_actor.display_name,jsonb_build_object('operatorId',v_credential.operator_id,'credentialId',v_credential.id,
      'reason',v_reason,'sessionsRevoked',v_revoked),v_operation);
  return v_response;
end $$;

create or replace function public.replace_routine_shared_device_operator_access(input_shared_device_id uuid,input_access_entries jsonb,
  input_expected_device_revision bigint,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10j_require_manager(); v_device public.routine_shared_devices%rowtype;
  v_hash text; v_response jsonb; v_operation uuid; v_entry jsonb; v_operator public.routine_operators%rowtype; v_seen uuid[]:='{}';
begin
  if jsonb_typeof(input_access_entries)<>'array' or jsonb_array_length(input_access_entries)>200 then
    raise exception using errcode='P0001',message='A bounded access entry array is required.';
  end if;
  v_hash:=public.routine_phase10j_request_hash(jsonb_build_object('deviceId',input_shared_device_id,'entries',input_access_entries,'expectedRevision',input_expected_device_revision));
  v_response:=public.routine_phase10j_existing_operation(v_actor.organization_id,v_actor.id,null,'replace_operator_access',input_idempotency_key,v_hash);
  if v_response is not null then return v_response||jsonb_build_object('idempotentReplay',true); end if;
  select device.* into v_device from public.routine_shared_devices device where device.id=input_shared_device_id
    and device.organization_id=v_actor.organization_id for update;
  if v_device.id is null then raise exception using errcode='42501',message='Shared device is not available.'; end if;
  if v_device.revision<>input_expected_device_revision then raise exception using errcode='40001',message='Stale shared-device revision.'; end if;
  perform set_config('mesh.routine_operator_internal','manager',true);
  update public.routine_shared_device_operator_access set sort_order=sort_order+1000000,active=false,revision=revision+1,
    updated_by_auth_user_id=v_actor.id where shared_device_id=v_device.id;
  for v_entry in select value from jsonb_array_elements(input_access_entries) loop
    if (v_entry->>'operatorId')::uuid=any(v_seen) then raise exception using errcode='P0001',message='Duplicate operator access entry.'; end if;
    v_seen:=array_append(v_seen,(v_entry->>'operatorId')::uuid);
    select operator.* into v_operator from public.routine_operators operator where operator.id=(v_entry->>'operatorId')::uuid
      and operator.organization_id=v_actor.organization_id;
    if v_operator.id is null then raise exception using errcode='42501',message='Operator access is cross-organization or missing.'; end if;
    insert into public.routine_shared_device_operator_access(organization_id,shared_device_id,operator_id,active,valid_from,valid_until,
      sort_order,allow_task_actions,allow_critical_actions,allow_run_coordination,allow_event_transfer_actions,allow_offline_noncritical,
      created_by_auth_user_id,updated_by_auth_user_id)
    values(v_actor.organization_id,v_device.id,v_operator.id,coalesce((v_entry->>'active')::boolean,true),
      (v_entry->>'validFrom')::timestamptz,(v_entry->>'validUntil')::timestamptz,coalesce((v_entry->>'sortOrder')::integer,0),
      coalesce((v_entry->>'allowTaskActions')::boolean,true),coalesce((v_entry->>'allowCriticalActions')::boolean,true),
      coalesce((v_entry->>'allowRunCoordination')::boolean,false),coalesce((v_entry->>'allowEventTransferActions')::boolean,false),
      coalesce((v_entry->>'allowOfflineNoncritical')::boolean,true),v_actor.id,v_actor.id)
    on conflict(shared_device_id,operator_id) do update set active=excluded.active,valid_from=excluded.valid_from,valid_until=excluded.valid_until,
      sort_order=excluded.sort_order,allow_task_actions=excluded.allow_task_actions,allow_critical_actions=excluded.allow_critical_actions,
      allow_run_coordination=excluded.allow_run_coordination,allow_event_transfer_actions=excluded.allow_event_transfer_actions,
      allow_offline_noncritical=excluded.allow_offline_noncritical,revision=routine_shared_device_operator_access.revision+1,
      updated_by_auth_user_id=v_actor.id;
  end loop;
  update public.routine_shared_devices set revision=revision+1,updated_by_auth_user_id=v_actor.id where id=v_device.id returning * into v_device;
  update public.routine_operator_sessions session set status='revoked',revoked_at=clock_timestamp(),revoked_by_auth_user_id=v_actor.id,
    revocation_reason='Operator access was replaced.',revision=session.revision+1,updated_at=clock_timestamp()
  where session.shared_device_id=v_device.id and session.status='active'
    and not exists(select 1 from public.routine_shared_device_operator_access access where access.shared_device_id=v_device.id
      and access.operator_id=session.operator_id and access.active and access.revision=session.access_revision_snapshot);
  v_response:=jsonb_build_object('deviceId',v_device.id,'deviceRevision',v_device.revision,'access',
    (select coalesce(jsonb_agg(to_jsonb(access) order by access.sort_order),'[]'::jsonb) from public.routine_shared_device_operator_access access
      where access.shared_device_id=v_device.id),'idempotentReplay',false);
  v_operation:=public.routine_phase10j_record_operation(v_actor.organization_id,v_actor.id,null,null,'replace_operator_access',input_idempotency_key,
    v_hash,'shared_device',v_device.id,v_response);
  perform public.routine_phase10j_record_event(v_actor.organization_id,v_device.id,null,null,'operator_access_updated',v_actor.id,v_actor.id,
    v_actor.display_name,jsonb_build_object('deviceId',v_device.id,'operatorCount',coalesce(array_length(v_seen,1),0)),v_operation);
  return v_response;
end $$;

create or replace function public.revoke_routine_operator_session(input_operator_session_id uuid,input_reason text,
  input_expected_revision bigint,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10j_require_manager(); v_session public.routine_operator_sessions%rowtype;
  v_hash text; v_response jsonb; v_operation uuid; v_reason text:=nullif(trim(coalesce(input_reason,'')),'');
begin
  if v_reason is null or char_length(v_reason)>1000 then raise exception using errcode='P0001',message='A bounded session revocation reason is required.'; end if;
  v_hash:=public.routine_phase10j_request_hash(jsonb_build_object('sessionId',input_operator_session_id,'reason',v_reason,'expectedRevision',input_expected_revision));
  v_response:=public.routine_phase10j_existing_operation(v_actor.organization_id,v_actor.id,null,'revoke_operator_session',input_idempotency_key,v_hash);
  if v_response is not null then return v_response||jsonb_build_object('idempotentReplay',true); end if;
  select session.* into v_session from public.routine_operator_sessions session where session.id=input_operator_session_id
    and session.organization_id=v_actor.organization_id for update;
  if v_session.id is null then raise exception using errcode='42501',message='Operator session is not available.'; end if;
  if v_session.revision<>input_expected_revision then raise exception using errcode='40001',message='Stale operator session revision.'; end if;
  perform set_config('mesh.routine_operator_internal','manager',true);
  if v_session.status='active' then update public.routine_operator_sessions set status='revoked',revoked_at=clock_timestamp(),
    revoked_by_auth_user_id=v_actor.id,revocation_reason=v_reason,revision=revision+1,updated_at=clock_timestamp()
    where id=v_session.id returning * into v_session; end if;
  v_response:=jsonb_build_object('session',jsonb_build_object('id',v_session.id,'operatorId',v_session.operator_id,'deviceId',v_session.shared_device_id,
    'status',v_session.status,'revokedAt',v_session.revoked_at,'revision',v_session.revision),'idempotentReplay',false);
  v_operation:=public.routine_phase10j_record_operation(v_actor.organization_id,v_actor.id,null,null,'revoke_operator_session',input_idempotency_key,
    v_hash,'operator_session',v_session.id,v_response);
  perform public.routine_phase10j_record_event(v_actor.organization_id,v_session.shared_device_id,v_session.operator_id,v_session.id,
    'operator_session_revoked',v_actor.id,v_actor.id,v_actor.display_name,jsonb_build_object('sessionId',v_session.id,'reason',v_reason),v_operation);
  return v_response;
end $$;

create or replace function public.get_routine_operator_admin_workspace()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10j_require_manager();
begin
  return jsonb_build_object(
    'devices',(select coalesce(jsonb_agg(to_jsonb(device)-'creation_request_hash' order by device.label),'[]'::jsonb)
      from public.routine_shared_devices device where device.organization_id=v_actor.organization_id),
    'operators',(select coalesce(jsonb_agg(to_jsonb(operator)-'creation_request_hash' order by operator.display_name),'[]'::jsonb)
      from public.routine_operators operator where operator.organization_id=v_actor.organization_id),
    'access',(select coalesce(jsonb_agg(to_jsonb(access) order by access.shared_device_id,access.sort_order),'[]'::jsonb)
      from public.routine_shared_device_operator_access access where access.organization_id=v_actor.organization_id),
    'credentials',(select coalesce(jsonb_agg(jsonb_build_object('id',credential.id,'operatorId',credential.operator_id,
      'credentialVersion',credential.credential_version,'status',credential.status,'hashAlgorithm',credential.hash_algorithm,
      'hashCost',credential.hash_cost,'validFrom',credential.valid_from,'expiresAt',credential.expires_at,'mustRotate',credential.must_rotate,
      'createdAt',credential.created_at,'revokedAt',credential.revoked_at)),'[]'::jsonb)
      from public.routine_operator_credentials credential where credential.organization_id=v_actor.organization_id),
    'sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',session.id,'deviceId',session.shared_device_id,'operatorId',session.operator_id,
      'status',session.status,'authenticatedAt',session.authenticated_at,'lastSeenAt',session.last_seen_at,'expiresAt',session.expires_at,
      'idleExpiresAt',session.idle_expires_at,'endedAt',session.ended_at,'revokedAt',session.revoked_at,'revision',session.revision)),'[]'::jsonb)
      from public.routine_operator_sessions session where session.organization_id=v_actor.organization_id and session.created_at>clock_timestamp()-interval '90 days'),
    'lockouts',(select coalesce(jsonb_agg(jsonb_build_object('deviceId',throttle.shared_device_id,'operatorId',throttle.operator_id,
      'subjectType',throttle.subject_type,'failedAttemptCount',throttle.failed_attempt_count,'lockedUntil',throttle.locked_until,
      'updatedAt',throttle.updated_at)),'[]'::jsonb) from public.routine_operator_auth_throttles throttle
      where throttle.organization_id=v_actor.organization_id and throttle.locked_until>clock_timestamp()),
    'authAttemptAggregates',(select coalesce(jsonb_agg(row_value),'[]'::jsonb) from (select date_trunc('day',attempt.attempted_at) bucket_day,
      attempt.outcome,count(*) attempt_count from public.routine_operator_auth_attempts attempt where attempt.organization_id=v_actor.organization_id
      and attempt.attempted_at>clock_timestamp()-interval '90 days' group by 1,2 order by 1 desc,2) row_value));
end $$;

create or replace function public.routine_phase10j_session_payload(input_session_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  select jsonb_build_object('id',session.id,'status',session.status,'authenticatedAt',session.authenticated_at,
    'lastCredentialVerifiedAt',session.last_credential_verified_at,
    'credentialFreshUntil',session.last_credential_verified_at+make_interval(mins=>device.critical_reauth_minutes),
    'lastSeenAt',session.last_seen_at,'expiresAt',session.expires_at,
    'idleExpiresAt',session.idle_expires_at,'revision',session.revision,
    'operator',jsonb_build_object('id',operator.id,'operatorKey',operator.operator_key,'operatorType',operator.operator_type,
      'linkedUserProfileId',session.linked_user_profile_id_snapshot,'displayName',session.display_name_snapshot,
      'effectiveRole',session.role_snapshot,'active',operator.active),
    'sharedDevice',jsonb_build_object('id',device.id,'deviceKey',device.device_key,'label',device.label,'active',device.active),
    'capabilities',jsonb_build_object('taskActions',access.allow_task_actions,'criticalActions',access.allow_critical_actions,
      'runCoordination',access.allow_run_coordination and session.linked_user_profile_id_snapshot is not null,
      'eventTransferActions',access.allow_event_transfer_actions and session.linked_user_profile_id_snapshot is not null,
      'offlineNoncritical',access.allow_offline_noncritical and device.allow_offline_noncritical_drafts))
  from public.routine_operator_sessions session
  join public.routine_operators operator on operator.id=session.operator_id
  join public.routine_shared_devices device on device.id=session.shared_device_id
  join public.routine_shared_device_operator_access access on access.shared_device_id=device.id and access.operator_id=operator.id
  where session.id=input_session_id;
$$;

create or replace function public.routine_phase10j_auth_failure(input_device public.routine_shared_devices,input_operator_id uuid,
  input_client_instance_id uuid,input_locked boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_now timestamptz:=clock_timestamp(); v_operator_throttle public.routine_operator_auth_throttles%rowtype;
  v_device_throttle public.routine_operator_auth_throttles%rowtype; v_failure_count integer; v_window timestamptz;
  v_valid_operator_id uuid;
begin
  select operator.id into v_valid_operator_id from public.routine_operators operator
    where operator.id=input_operator_id and operator.organization_id=input_device.organization_id;
  perform set_config('mesh.routine_operator_internal','auth',true);
  insert into public.routine_operator_auth_throttles(organization_id,subject_type,shared_device_id,operator_id)
    values(input_device.organization_id,'device',input_device.id,null) on conflict do nothing;
  if v_valid_operator_id is not null then
    insert into public.routine_operator_auth_throttles(organization_id,subject_type,shared_device_id,operator_id)
      values(input_device.organization_id,'operator',input_device.id,v_valid_operator_id) on conflict do nothing;
  end if;
  select throttle.* into v_device_throttle from public.routine_operator_auth_throttles throttle
    where throttle.shared_device_id=input_device.id and throttle.subject_type='device' for update;
  v_window:=case when v_device_throttle.window_started_at is null
      or v_device_throttle.window_started_at<=v_now-make_interval(mins=>input_device.failure_window_minutes) then v_now
    else v_device_throttle.window_started_at end;
  v_failure_count:=case when v_window=v_now then 1 else v_device_throttle.failed_attempt_count+1 end;
  update public.routine_operator_auth_throttles set failed_attempt_count=v_failure_count,window_started_at=v_window,last_failed_at=v_now,
    locked_until=case when input_locked or v_failure_count>=input_device.max_failed_attempts then v_now+make_interval(mins=>input_device.lockout_minutes) else locked_until end,
    revision=revision+1,updated_at=v_now where id=v_device_throttle.id;
  if v_valid_operator_id is not null then
    select throttle.* into v_operator_throttle from public.routine_operator_auth_throttles throttle
      where throttle.shared_device_id=input_device.id and throttle.operator_id=v_valid_operator_id and throttle.subject_type='operator' for update;
    v_window:=case when v_operator_throttle.window_started_at is null
        or v_operator_throttle.window_started_at<=v_now-make_interval(mins=>input_device.failure_window_minutes) then v_now
      else v_operator_throttle.window_started_at end;
    v_failure_count:=case when v_window=v_now then 1 else v_operator_throttle.failed_attempt_count+1 end;
    update public.routine_operator_auth_throttles set failed_attempt_count=v_failure_count,window_started_at=v_window,last_failed_at=v_now,
      locked_until=case when input_locked or v_failure_count>=input_device.max_failed_attempts then v_now+make_interval(mins=>input_device.lockout_minutes) else locked_until end,
      revision=revision+1,updated_at=v_now where id=v_operator_throttle.id;
  end if;
  insert into public.routine_operator_auth_attempts(organization_id,shared_device_id,operator_id,client_instance_id,device_auth_user_id,outcome,failure_code)
    values(input_device.organization_id,input_device.id,v_valid_operator_id,input_client_instance_id,input_device.auth_user_id,
      case when input_locked then 'locked' else 'failure' end,'operator_auth_failed');
  perform public.routine_phase10j_record_event(input_device.organization_id,input_device.id,v_valid_operator_id,null,'operator_auth_failed',
    input_device.auth_user_id,input_device.user_profile_id,input_device.label,
    jsonb_build_object('failureCode','operator_auth_failed','locked',input_locked,'clientInstanceId',input_client_instance_id),null);
  return jsonb_build_object('authenticated',false,'errorCode','operator_auth_failed');
end $$;

create or replace function public.list_available_routine_operators(input_client_instance_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_device public.routine_shared_devices%rowtype:=public.routine_phase10j_shared_device_for_request(); v_client public.routine_client_instances%rowtype;
begin
  select client.* into v_client from public.routine_client_instances client where client.id=input_client_instance_id
    and client.auth_user_id=auth.uid() and client.organization_id=v_device.organization_id and client.shared_device_id=v_device.id and client.revoked_at is null;
  if v_client.id is null then raise exception using errcode='42501',message='operator_auth_failed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',operator.id,'displayName',operator.display_name,
    'role',operator.effective_role,'sortOrder',access.sort_order,'operatorType',operator.operator_type,
    'locked',coalesce(throttle.locked_until>clock_timestamp(),false),'validUntil',operator.valid_until) order by access.sort_order,operator.display_name)
    from public.routine_shared_device_operator_access access join public.routine_operators operator on operator.id=access.operator_id
    left join public.routine_operator_auth_throttles throttle on throttle.shared_device_id=v_device.id and throttle.operator_id=operator.id
      and throttle.subject_type='operator'
    where access.shared_device_id=v_device.id and access.active and operator.active
      and (access.valid_from is null or access.valid_from<=clock_timestamp()) and (access.valid_until is null or access.valid_until>clock_timestamp())
      and (operator.valid_from is null or operator.valid_from<=clock_timestamp()) and (operator.valid_until is null or operator.valid_until>clock_timestamp())),'[]'::jsonb);
end $$;

create or replace function public.authenticate_routine_operator(input_client_instance_id uuid,input_operator_id uuid,input_session_id uuid,
  input_session_secret_hash text,input_pin text,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_device public.routine_shared_devices%rowtype:=public.routine_phase10j_shared_device_for_request(); v_client public.routine_client_instances%rowtype;
  v_operator public.routine_operators%rowtype; v_access public.routine_shared_device_operator_access%rowtype;
  v_credential public.routine_operator_credentials%rowtype; v_existing public.routine_operator_sessions%rowtype;
  v_now timestamptz:=clock_timestamp(); v_locked boolean:=false; v_session public.routine_operator_sessions%rowtype;
  v_hash text; v_response jsonb; v_operation uuid;
begin
  if input_session_id is null or input_idempotency_key is null or input_session_secret_hash!~'^[0-9a-f]{64}$' then
    return public.routine_phase10j_auth_failure(v_device,input_operator_id,input_client_instance_id,false);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_device.id::text||':'||input_operator_id::text,0));
  select client.* into v_client from public.routine_client_instances client where client.id=input_client_instance_id
    and client.auth_user_id=v_device.auth_user_id and client.organization_id=v_device.organization_id
    and client.shared_device_id=v_device.id and client.revoked_at is null for update;
  if v_client.id is null then return public.routine_phase10j_auth_failure(v_device,input_operator_id,input_client_instance_id,false); end if;
  select session.* into v_existing from public.routine_operator_sessions session where session.id=input_session_id;
  if v_existing.id is not null then
    if v_existing.operator_id=input_operator_id and v_existing.client_instance_id=input_client_instance_id
       and public.routine_constant_time_equals(v_existing.session_secret_hash,input_session_secret_hash) then
      return jsonb_build_object('authenticated',public.routine_operator_session_is_valid(v_existing.id),
        'session',public.routine_phase10j_session_payload(v_existing.id),'idempotentReplay',true);
    end if;
    return public.routine_phase10j_auth_failure(v_device,input_operator_id,input_client_instance_id,false);
  end if;
  select operator.* into v_operator from public.routine_operators operator where operator.id=input_operator_id
    and operator.organization_id=v_device.organization_id and operator.active
    and (operator.valid_from is null or operator.valid_from<=v_now) and (operator.valid_until is null or operator.valid_until>v_now);
  select access.* into v_access from public.routine_shared_device_operator_access access where access.shared_device_id=v_device.id
    and access.operator_id=input_operator_id and access.active and (access.valid_from is null or access.valid_from<=v_now)
    and (access.valid_until is null or access.valid_until>v_now);
  select credential.* into v_credential from public.routine_operator_credentials credential where credential.operator_id=input_operator_id
    and credential.status='active' and credential.valid_from<=v_now and (credential.expires_at is null or credential.expires_at>v_now);
  select exists(select 1 from public.routine_operator_auth_throttles throttle where throttle.shared_device_id=v_device.id
    and (throttle.operator_id=input_operator_id or throttle.subject_type='device') and throttle.locked_until>v_now) into v_locked;
  if v_operator.id is null or v_access.id is null or v_credential.id is null or v_locked
     or input_pin!~'^[0-9]{6,12}$' or extensions.crypt(input_pin,v_credential.pin_hash)<>v_credential.pin_hash then
    return public.routine_phase10j_auth_failure(v_device,input_operator_id,input_client_instance_id,v_locked);
  end if;
  if v_operator.operator_type='linked_profile' and not exists(select 1 from public.user_profiles profile where profile.id=v_operator.linked_user_profile_id
      and profile.active and not coalesce(profile.is_shared_device,false) and profile.organization_id=v_operator.organization_id
      and profile.role=v_operator.effective_role) then
    return public.routine_phase10j_auth_failure(v_device,input_operator_id,input_client_instance_id,false);
  end if;
  perform set_config('mesh.routine_operator_internal','auth',true);
  update public.routine_operator_sessions set status='ended',ended_at=v_now,ended_by_auth_user_id=v_device.auth_user_id,
    end_reason='Replaced by a new operator session on this client.',revision=revision+1,updated_at=v_now
    where shared_device_id=v_device.id and client_instance_id=v_client.id and status='active';
  insert into public.routine_operator_sessions(id,organization_id,shared_device_id,client_instance_id,device_auth_user_id,device_user_profile_id,
    operator_id,credential_id,linked_user_profile_id_snapshot,display_name_snapshot,role_snapshot,operator_revision_snapshot,
    access_revision_snapshot,session_secret_hash,authenticated_at,last_credential_verified_at,last_seen_at,expires_at,idle_expires_at)
  values(input_session_id,v_device.organization_id,v_device.id,v_client.id,v_device.auth_user_id,v_device.user_profile_id,
    v_operator.id,v_credential.id,v_operator.linked_user_profile_id,v_operator.display_name,v_operator.effective_role,v_operator.revision,
    v_access.revision,input_session_secret_hash,v_now,v_now,v_now,v_now+make_interval(mins=>v_device.absolute_session_minutes),
    least(v_now+make_interval(mins=>v_device.idle_timeout_minutes),v_now+make_interval(mins=>v_device.absolute_session_minutes))) returning * into v_session;
  update public.routine_operator_auth_throttles set failed_attempt_count=0,window_started_at=null,locked_until=null,last_failed_at=null,
    revision=revision+1,updated_at=v_now where shared_device_id=v_device.id and (operator_id=v_operator.id or subject_type='device');
  insert into public.routine_operator_auth_attempts(organization_id,shared_device_id,operator_id,client_instance_id,device_auth_user_id,outcome)
    values(v_device.organization_id,v_device.id,v_operator.id,v_client.id,v_device.auth_user_id,'success');
  v_response:=jsonb_build_object('authenticated',true,'session',public.routine_phase10j_session_payload(v_session.id),'idempotentReplay',false);
  v_hash:=public.routine_phase10j_request_hash(jsonb_build_object('clientInstanceId',v_client.id,'operatorId',v_operator.id,
    'sessionId',v_session.id));
  v_operation:=public.routine_phase10j_record_operation(v_device.organization_id,v_device.auth_user_id,v_operator.id,v_session.id,
    'authenticate_operator',input_idempotency_key,v_hash,'operator_session',v_session.id,v_response);
  perform public.routine_phase10j_record_event(v_device.organization_id,v_device.id,v_operator.id,v_session.id,'operator_auth_succeeded',
    v_device.auth_user_id,v_operator.linked_user_profile_id,v_operator.display_name,jsonb_build_object('clientInstanceId',v_client.id),v_operation);
  perform public.routine_phase10j_record_event(v_device.organization_id,v_device.id,v_operator.id,v_session.id,'operator_session_started',
    v_device.auth_user_id,v_operator.linked_user_profile_id,v_operator.display_name,jsonb_build_object('sessionId',v_session.id,
      'expiresAt',v_session.expires_at,'idleExpiresAt',v_session.idle_expires_at),v_operation);
  return v_response;
end $$;

create or replace function public.get_current_routine_operator_session()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$ declare v_session record; begin select * into v_session from public.routine_resolve_operator_session();
  return public.routine_phase10j_session_payload(v_session.session_id); end $$;

create or replace function public.touch_routine_operator_session()
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_resolved record; v_session public.routine_operator_sessions%rowtype; v_device public.routine_shared_devices%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  select * into v_resolved from public.routine_resolve_operator_session();
  select session.* into v_session from public.routine_operator_sessions session where session.id=v_resolved.session_id for update;
  select device.* into v_device from public.routine_shared_devices device where device.id=v_session.shared_device_id;
  if v_session.last_seen_at<=v_now-interval '60 seconds' then
    perform set_config('mesh.routine_operator_internal','touch',true);
    update public.routine_operator_sessions set last_seen_at=v_now,
      idle_expires_at=least(expires_at,v_now+make_interval(mins=>v_device.idle_timeout_minutes)),revision=revision+1,updated_at=v_now
      where id=v_session.id returning * into v_session;
  end if;
  return public.routine_phase10j_session_payload(v_session.id);
end $$;

create or replace function public.reauthenticate_routine_operator_session(input_pin text,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_resolved record; v_session public.routine_operator_sessions%rowtype; v_device public.routine_shared_devices%rowtype;
  v_credential public.routine_operator_credentials%rowtype; v_hash text; v_response jsonb; v_operation uuid; v_now timestamptz:=clock_timestamp();
  v_locked boolean;
begin
  select * into v_resolved from public.routine_resolve_operator_session();
  perform pg_advisory_xact_lock(hashtextextended(v_resolved.shared_device_id::text||':'||v_resolved.operator_id::text,0));
  v_hash:=public.routine_phase10j_request_hash(jsonb_build_object('sessionId',v_resolved.session_id,'action','reauthenticate'));
  v_response:=public.routine_phase10j_existing_operation(v_resolved.organization_id,v_resolved.device_auth_user_id,v_resolved.operator_id,
    'reauthenticate_operator',input_idempotency_key,v_hash);
  if v_response is not null then return v_response||jsonb_build_object('idempotentReplay',true); end if;
  select session.* into v_session from public.routine_operator_sessions session where session.id=v_resolved.session_id for update;
  select device.* into v_device from public.routine_shared_devices device where device.id=v_session.shared_device_id;
  select credential.* into v_credential from public.routine_operator_credentials credential where credential.id=v_session.credential_id
    and credential.status='active' and (credential.expires_at is null or credential.expires_at>v_now);
  select exists(select 1 from public.routine_operator_auth_throttles throttle where throttle.shared_device_id=v_device.id
    and (throttle.operator_id=v_session.operator_id or throttle.subject_type='device') and throttle.locked_until>v_now) into v_locked;
  if v_locked or v_credential.id is null or input_pin!~'^[0-9]{6,12}$'
     or extensions.crypt(input_pin,v_credential.pin_hash)<>v_credential.pin_hash then
    return public.routine_phase10j_auth_failure(v_device,v_session.operator_id,v_session.client_instance_id,v_locked);
  end if;
  perform set_config('mesh.routine_operator_internal','reauth',true);
  update public.routine_operator_sessions set last_credential_verified_at=v_now,last_seen_at=v_now,
    idle_expires_at=least(expires_at,v_now+make_interval(mins=>v_device.idle_timeout_minutes)),revision=revision+1,updated_at=v_now
    where id=v_session.id returning * into v_session;
  update public.routine_operator_auth_throttles set failed_attempt_count=0,window_started_at=null,locked_until=null,last_failed_at=null,
    revision=revision+1,updated_at=v_now where shared_device_id=v_device.id and (operator_id=v_session.operator_id or subject_type='device');
  insert into public.routine_operator_auth_attempts(organization_id,shared_device_id,operator_id,client_instance_id,device_auth_user_id,outcome)
    values(v_device.organization_id,v_device.id,v_session.operator_id,v_session.client_instance_id,v_device.auth_user_id,'success');
  v_response:=jsonb_build_object('session',public.routine_phase10j_session_payload(v_session.id),'idempotentReplay',false);
  v_operation:=public.routine_phase10j_record_operation(v_session.organization_id,v_session.device_auth_user_id,v_session.operator_id,v_session.id,
    'reauthenticate_operator',input_idempotency_key,v_hash,'operator_session',v_session.id,v_response);
  perform public.routine_phase10j_record_event(v_session.organization_id,v_session.shared_device_id,v_session.operator_id,v_session.id,
    'operator_session_reauthenticated',v_session.device_auth_user_id,v_session.linked_user_profile_id_snapshot,v_session.display_name_snapshot,
    jsonb_build_object('sessionId',v_session.id,'credentialFreshAt',v_now),v_operation);
  return v_response;
end $$;

create or replace function public.end_routine_operator_session(input_reason text,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_token text; v_parsed record; v_session public.routine_operator_sessions%rowtype; v_reason text:=nullif(trim(coalesce(input_reason,'')),'');
  v_hash text; v_response jsonb; v_operation uuid; v_now timestamptz:=clock_timestamp();
begin
  if v_reason is null or char_length(v_reason)>1000 then raise exception using errcode='P0001',message='A bounded session end reason is required.'; end if;
  v_token:=public.routine_read_operator_session_header(); select * into v_parsed from public.routine_parse_operator_session_token(v_token);
  select session.* into v_session from public.routine_operator_sessions session where session.id=v_parsed.session_id
    and session.device_auth_user_id=auth.uid() for update;
  if v_session.id is null or not public.routine_constant_time_equals(v_parsed.secret_hash,v_session.session_secret_hash)
     or v_session.expires_at<v_now-interval '24 hours' then raise exception using errcode='P0001',message='operator_auth_failed'; end if;
  v_hash:=public.routine_phase10j_request_hash(jsonb_build_object('sessionId',v_session.id,'reason',v_reason));
  v_response:=public.routine_phase10j_existing_operation(v_session.organization_id,v_session.device_auth_user_id,v_session.operator_id,
    'end_operator_session',input_idempotency_key,v_hash);
  if v_response is not null then return v_response||jsonb_build_object('idempotentReplay',true); end if;
  perform set_config('mesh.routine_operator_internal','end',true);
  if v_session.status='active' then update public.routine_operator_sessions set status='ended',ended_at=v_now,
    ended_by_auth_user_id=v_session.device_auth_user_id,end_reason=v_reason,revision=revision+1,updated_at=v_now
    where id=v_session.id returning * into v_session; end if;
  v_response:=jsonb_build_object('session',jsonb_build_object('id',v_session.id,'operatorId',v_session.operator_id,
    'status',v_session.status,'endedAt',v_session.ended_at,'revision',v_session.revision),'idempotentReplay',false);
  v_operation:=public.routine_phase10j_record_operation(v_session.organization_id,v_session.device_auth_user_id,v_session.operator_id,v_session.id,
    'end_operator_session',input_idempotency_key,v_hash,'operator_session',v_session.id,v_response);
  perform public.routine_phase10j_record_event(v_session.organization_id,v_session.shared_device_id,v_session.operator_id,v_session.id,
    'operator_session_ended',v_session.device_auth_user_id,v_session.linked_user_profile_id_snapshot,v_session.display_name_snapshot,
    jsonb_build_object('sessionId',v_session.id,'reason',v_reason),v_operation);
  return v_response;
end $$;

create or replace function public.get_routine_shared_device_context()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_device public.routine_shared_devices%rowtype:=public.routine_phase10j_shared_device_for_request();
begin
  return jsonb_build_object('id',v_device.id,'deviceKey',v_device.device_key,'label',v_device.label,'active',v_device.active,
    'sessionPolicy',jsonb_build_object('absoluteSessionMinutes',v_device.absolute_session_minutes,'idleTimeoutMinutes',v_device.idle_timeout_minutes,
      'criticalReauthMinutes',v_device.critical_reauth_minutes,'allowOfflineNoncriticalDrafts',v_device.allow_offline_noncritical_drafts),
    'clientInstances',(select coalesce(jsonb_agg(jsonb_build_object('id',client.id,'appVersion',client.app_version,
      'offlineSchemaVersion',client.offline_schema_version,'lastSeenAt',client.last_seen_at,'revokedAt',client.revoked_at)),'[]'::jsonb)
      from public.routine_client_instances client where client.shared_device_id=v_device.id and client.auth_user_id=auth.uid()));
end $$;

create or replace function public.get_routine_operator_session_context()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_session record;
begin
  select * into v_session from public.routine_resolve_operator_session();
  return public.routine_phase10j_session_payload(v_session.session_id)||jsonb_build_object(
    'participants',jsonb_build_object(
      'runs',(select coalesce(jsonb_agg(jsonb_build_object('participantId',participant.id,'runId',participant.run_id,'status',participant.participation_status)),'[]'::jsonb)
        from public.routine_run_participants participant where participant.operator_id=v_session.operator_id),
      'bundles',(select coalesce(jsonb_agg(jsonb_build_object('participantId',participant.id,'bundleId',participant.bundle_id,'status',participant.status)),'[]'::jsonb)
        from public.routine_bundle_participants participant where participant.operator_id=v_session.operator_id)));
end $$;

create or replace function public.get_routine_operator_security_history(input_date_from date,input_date_to date,input_operator_id uuid default null,
  input_shared_device_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10j_require_manager();
begin
  if input_date_from is null or input_date_to is null or input_date_to<input_date_from or input_date_to-input_date_from>90 then
    raise exception using errcode='P0001',message='Security history date range must be between 0 and 90 days.';
  end if;
  return jsonb_build_object('attempts',(select coalesce(jsonb_agg(row_value),'[]'::jsonb) from (select attempt.shared_device_id "sharedDeviceId",
    attempt.operator_id "operatorId",attempt.outcome,count(*) count,min(attempt.attempted_at) "firstAt",max(attempt.attempted_at) "lastAt"
    from public.routine_operator_auth_attempts attempt where attempt.organization_id=v_actor.organization_id
      and attempt.attempted_at>=input_date_from::timestamptz and attempt.attempted_at<(input_date_to+1)::timestamptz
      and (input_operator_id is null or attempt.operator_id=input_operator_id)
      and (input_shared_device_id is null or attempt.shared_device_id=input_shared_device_id)
    group by 1,2,3 order by max(attempt.attempted_at) desc) row_value),
    'events',(select coalesce(jsonb_agg(jsonb_build_object('id',event.id,'eventType',event.event_type,'deviceId',event.shared_device_id,
      'operatorId',event.operator_id,'sessionId',event.operator_session_id,'actorName',event.actor_name_snapshot,'payload',event.payload,
      'createdAt',event.created_at) order by event.created_at desc),'[]'::jsonb) from public.routine_operator_events event
      where event.organization_id=v_actor.organization_id and event.created_at>=input_date_from::timestamptz
      and event.created_at<(input_date_to+1)::timestamptz and (input_operator_id is null or event.operator_id=input_operator_id)
      and (input_shared_device_id is null or event.shared_device_id=input_shared_device_id)));
end $$;

create or replace function public.routine_resolve_effective_actor()
returns table(actor_auth_user_id uuid,actor_profile_id uuid,authenticated_profile_id uuid,organization_id uuid,actor_role text,
  actor_display_name text,actor_source text,effective_operator_id uuid,shared_device_id uuid,operator_session_id uuid,capabilities jsonb)
language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_profile public.user_profiles%rowtype; v_session record;
begin
  select profile.* into v_profile from public.user_profiles profile where profile.id=auth.uid() and profile.active and profile.organization_id is not null;
  if v_profile.id is null then raise exception using errcode='P0001',message='Authenticated routine access is required.'; end if;
  if not coalesce(v_profile.is_shared_device,false) then
    if v_profile.role not in('manager','shift_lead','staff') then raise exception using errcode='42501',message='An active personal routine profile is required.'; end if;
    return query select v_profile.id,v_profile.id,v_profile.id,v_profile.organization_id,v_profile.role,v_profile.display_name,
      'personal_auth'::text,null::uuid,null::uuid,null::uuid,jsonb_build_object('taskActions',true,'criticalActions',true,
        'runCoordination',v_profile.role in('manager','shift_lead'),'eventTransferActions',v_profile.role in('manager','shift_lead'),
        'offlineNoncritical',true);
    return;
  end if;
  select * into v_session from public.routine_resolve_operator_session();
  return query select v_session.device_auth_user_id,v_session.linked_profile_id,v_session.device_profile_id,v_session.organization_id,
    v_session.operator_role,v_session.display_name,'shared_device_operator'::text,v_session.operator_id,v_session.shared_device_id,
    v_session.session_id,v_session.capabilities;
end $$;

create or replace function public.routine_resolve_actor()
returns table(actor_auth_user_id uuid,actor_profile_id uuid,organization_id uuid,actor_role text,actor_display_name text)
language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor record;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  return query select v_actor.actor_auth_user_id,coalesce(v_actor.actor_profile_id,v_actor.authenticated_profile_id),v_actor.organization_id,
    v_actor.actor_role,v_actor.actor_display_name;
end $$;

create or replace function public.routine_current_authenticated_profile_id()
returns uuid language sql stable security definer set search_path=pg_catalog
as $$ select (select actor.authenticated_profile_id from public.routine_resolve_effective_actor() actor) $$;
create or replace function public.routine_current_effective_profile_id()
returns uuid language sql stable security definer set search_path=pg_catalog
as $$ select (select actor.actor_profile_id from public.routine_resolve_effective_actor() actor) $$;
create or replace function public.routine_current_effective_operator_id()
returns uuid language sql stable security definer set search_path=pg_catalog
as $$ select (select actor.effective_operator_id from public.routine_resolve_effective_actor() actor) $$;
create or replace function public.routine_current_shared_device_id()
returns uuid language sql stable security definer set search_path=pg_catalog
as $$ select (select actor.shared_device_id from public.routine_resolve_effective_actor() actor) $$;
create or replace function public.routine_current_operator_session_id()
returns uuid language sql stable security definer set search_path=pg_catalog
as $$ select (select actor.operator_session_id from public.routine_resolve_effective_actor() actor) $$;
create or replace function public.routine_current_actor_source()
returns text language sql stable security definer set search_path=pg_catalog
as $$ select (select actor.actor_source from public.routine_resolve_effective_actor() actor) $$;
create or replace function public.routine_current_actor_display_name()
returns text language sql stable security definer set search_path=pg_catalog
as $$ select (select actor.actor_display_name from public.routine_resolve_effective_actor() actor) $$;

create or replace function public.routine_current_user_is_active()
returns boolean language plpgsql stable security definer set search_path=pg_catalog
as $$ begin perform 1 from public.routine_resolve_effective_actor(); return true; exception when others then return false; end $$;
create or replace function public.routine_current_user_organization_id()
returns uuid language plpgsql stable security definer set search_path=pg_catalog
as $$ declare v uuid; begin select actor.organization_id into v from public.routine_resolve_effective_actor() actor; return v;
  exception when others then return null; end $$;
create or replace function public.routine_current_user_role()
returns text language plpgsql stable security definer set search_path=pg_catalog
as $$ declare v text; begin select actor.actor_role into v from public.routine_resolve_effective_actor() actor; return v;
  exception when others then return null; end $$;
create or replace function public.routine_current_user_can_manage_templates()
returns boolean language sql stable security definer set search_path=pg_catalog
as $$ select coalesce(public.routine_current_actor_source()='personal_auth' and public.routine_current_user_role()='manager',false) $$;
create or replace function public.routine_current_user_can_coordinate_runs()
returns boolean language plpgsql stable security definer set search_path=pg_catalog
as $$ declare v_actor record; begin select * into v_actor from public.routine_resolve_effective_actor();
  return case when v_actor.actor_source='personal_auth' then v_actor.actor_role in('manager','shift_lead')
    else v_actor.actor_profile_id is not null and coalesce((v_actor.capabilities->>'runCoordination')::boolean,false) end;
  exception when others then return false; end $$;
create or replace function public.routine_current_user_can_perform_tasks()
returns boolean language plpgsql stable security definer set search_path=pg_catalog
as $$ declare v_actor record; begin select * into v_actor from public.routine_resolve_effective_actor();
  return case when v_actor.actor_source='personal_auth' then v_actor.actor_role in('manager','shift_lead','staff')
    else coalesce((v_actor.capabilities->>'taskActions')::boolean,false) end;
  exception when others then return false; end $$;

create or replace function public.routine_run_is_visible(input_run_id uuid,input_organization_id uuid)
returns boolean language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor record;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  return input_organization_id=v_actor.organization_id
    and exists(select 1 from public.routine_runs run where run.id=input_run_id and run.organization_id=input_organization_id and run.snapshot_state='ready')
    and (public.routine_current_user_can_coordinate_runs() or exists(select 1 from public.routine_run_participants participant
      where participant.run_id=input_run_id and participant.organization_id=input_organization_id and participant.participation_status<>'removed'
      and ((v_actor.actor_source='personal_auth' and participant.identity_type='personal_profile' and participant.user_profile_id=v_actor.actor_profile_id)
        or (v_actor.actor_source='shared_device_operator' and participant.identity_type='shared_device_operator'
          and participant.operator_id=v_actor.effective_operator_id))));
exception when others then return false;
end $$;

create or replace function public.routine_bundle_is_visible(input_bundle_id uuid,input_organization_id uuid)
returns boolean language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor record;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  return input_organization_id=v_actor.organization_id and (public.routine_current_user_can_coordinate_runs()
    or exists(select 1 from public.routine_bundle_participants participant where participant.bundle_id=input_bundle_id
      and participant.organization_id=input_organization_id and participant.status<>'removed'
      and ((v_actor.actor_source='personal_auth' and participant.identity_type='personal_profile' and participant.user_profile_id=v_actor.actor_profile_id)
        or (v_actor.actor_source='shared_device_operator' and participant.identity_type='shared_device_operator'
          and participant.operator_id=v_actor.effective_operator_id)))
    or exists(select 1 from public.routine_bundle_runs link join public.routine_run_participants participant on participant.run_id=link.run_id
      and participant.organization_id=link.organization_id where link.bundle_id=input_bundle_id and link.organization_id=input_organization_id
      and participant.participation_status<>'removed' and ((v_actor.actor_source='personal_auth' and participant.identity_type='personal_profile'
        and participant.user_profile_id=v_actor.actor_profile_id) or (v_actor.actor_source='shared_device_operator'
        and participant.identity_type='shared_device_operator' and participant.operator_id=v_actor.effective_operator_id))));
exception when others then return false;
end $$;

create or replace function public.routine_lifecycle_context(input_run_id uuid)
returns table(actor_auth_user_id uuid,actor_profile_id uuid,organization_id uuid,actor_role text,actor_display_name text,
  participant_id uuid,is_manager boolean,is_coordinator boolean)
language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor record; v_run public.routine_runs%rowtype; v_participant uuid;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  select run.* into v_run from public.routine_runs run where run.id=input_run_id and run.organization_id=v_actor.organization_id and run.snapshot_state='ready';
  if v_run.id is null then raise exception using errcode='P0001',message='A ready same-organization routine run is required.'; end if;
  select participant.id into v_participant from public.routine_run_participants participant where participant.run_id=v_run.id
    and participant.participation_status<>'removed' and ((v_actor.actor_source='personal_auth' and participant.identity_type='personal_profile'
      and participant.user_profile_id=v_actor.actor_profile_id) or (v_actor.actor_source='shared_device_operator'
      and participant.identity_type='shared_device_operator' and participant.operator_id=v_actor.effective_operator_id));
  if not public.routine_current_user_can_coordinate_runs() and v_participant is null then
    raise exception using errcode='42501',message='Active routine run participation is required.';
  end if;
  return query select v_actor.actor_auth_user_id,coalesce(v_actor.actor_profile_id,v_actor.authenticated_profile_id),v_actor.organization_id,
    v_actor.actor_role,v_actor.actor_display_name,v_participant,v_actor.actor_source='personal_auth' and v_actor.actor_role='manager',
    public.routine_current_user_can_coordinate_runs();
end $$;

create or replace function public.routine_require_fresh_operator_credential(input_action text,input_task_id uuid default null)
returns void language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor record;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  if v_actor.actor_source='shared_device_operator' and not public.routine_operator_credential_is_fresh(v_actor.operator_session_id) then
    raise exception using errcode='42501',message='operator_reauthentication_required';
  end if;
end $$;

create or replace function public.routine_client_instance_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_profile public.user_profiles%rowtype; v_device public.routine_shared_devices%rowtype;
begin
  if tg_op='DELETE' then raise exception using errcode='P0001',message='Routine client instances cannot be deleted.'; end if;
  if current_setting('mesh.routine_sync_internal',true) is null then raise exception using errcode='42501',message='Routine client instances require an authorized RPC.'; end if;
  select profile.* into v_profile from public.user_profiles profile where profile.id=new.user_profile_id;
  if v_profile.id is null or v_profile.organization_id is distinct from new.organization_id or v_profile.id is distinct from new.auth_user_id
     or not v_profile.active then raise exception using errcode='P0001',message='Client instance identity is invalid.'; end if;
  if coalesce(v_profile.is_shared_device,false) then
    select device.* into v_device from public.routine_shared_devices device where device.id=new.shared_device_id
      and device.user_profile_id=v_profile.id and device.organization_id=new.organization_id and device.active;
    if v_device.id is null then raise exception using errcode='P0001',message='Client instance requires an enrolled active shared device.'; end if;
  elsif new.shared_device_id is not null then raise exception using errcode='P0001',message='Personal client instances cannot claim a shared device.';
  end if;
  if tg_op='UPDATE' then
    if row(new.id,new.organization_id,new.auth_user_id,new.user_profile_id,new.shared_device_id,new.registered_at,new.created_at,
      new.registration_idempotency_key,new.registration_request_hash) is distinct from
      row(old.id,old.organization_id,old.auth_user_id,old.user_profile_id,old.shared_device_id,old.registered_at,old.created_at,
      old.registration_idempotency_key,old.registration_request_hash) then raise exception using errcode='P0001',message='Client instance identity is immutable.'; end if;
    if new.revision<=old.revision then raise exception using errcode='P0001',message='Client instance revision must increase.'; end if;
    new.updated_at:=clock_timestamp();
  end if;
  return new;
end $$;

create or replace function public.register_routine_client_instance(input_client_instance_id uuid,input_app_version text,
  input_offline_schema_version text,input_platform_label text,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_profile public.user_profiles%rowtype; v_device public.routine_shared_devices%rowtype; v_instance public.routine_client_instances%rowtype;
  v_hash text; v_operational_clock jsonb;
begin
  select profile.* into v_profile from public.user_profiles profile where profile.id=auth.uid() and profile.active and profile.organization_id is not null;
  if v_profile.id is null then raise exception using errcode='42501',message='Authenticated client registration is required.'; end if;
  if coalesce(v_profile.is_shared_device,false) then
    v_device:=public.routine_phase10j_shared_device_for_request();
  else
    v_operational_clock:=public.get_routine_operational_clock();
  end if;
  if input_client_instance_id is null or input_idempotency_key is null then raise exception using errcode='P0001',message='Client instance and idempotency IDs are required.'; end if;
  v_hash:=public.routine_phase10i_request_hash(jsonb_build_object('clientInstanceId',input_client_instance_id,
    'appVersion',trim(coalesce(input_app_version,'')),'offlineSchemaVersion',trim(coalesce(input_offline_schema_version,'')),
    'platformLabel',nullif(trim(coalesce(input_platform_label,'')),'')));
  select instance.* into v_instance from public.routine_client_instances instance where instance.id=input_client_instance_id for update;
  if v_instance.id is not null then
    if v_instance.auth_user_id<>v_profile.id or v_instance.organization_id<>v_profile.organization_id
       or v_instance.registration_request_hash<>v_hash then raise exception using errcode='42501',message='Client instance registration does not match.'; end if;
    return jsonb_build_object('instance',to_jsonb(v_instance),'operationalClock',v_operational_clock,'idempotentReplay',true);
  end if;
  perform set_config('mesh.routine_sync_internal','register',true);
  insert into public.routine_client_instances(id,organization_id,auth_user_id,user_profile_id,shared_device_id,app_version,offline_schema_version,
    platform_label,registration_idempotency_key,registration_request_hash)
  values(input_client_instance_id,v_profile.organization_id,v_profile.id,v_profile.id,v_device.id,trim(input_app_version),
    trim(input_offline_schema_version),nullif(trim(coalesce(input_platform_label,'')),''),input_idempotency_key,v_hash) returning * into v_instance;
  if not coalesce(v_profile.is_shared_device,false) then
    perform public.routine_record_instance_event(v_instance.id,'client_instance_registered',jsonb_build_object('authUserId',v_profile.id,
      'profileId',v_profile.id,'displayName',v_profile.display_name,'role',v_profile.role),jsonb_build_object('clientInstanceId',v_instance.id,
      'appVersion',v_instance.app_version,'offlineSchemaVersion',v_instance.offline_schema_version),input_idempotency_key);
  end if;
  return jsonb_build_object('instance',to_jsonb(v_instance),'operationalClock',v_operational_clock,'idempotentReplay',false);
end $$;

create or replace function public.touch_routine_client_instance(input_client_instance_id uuid,input_app_version text,input_offline_schema_version text)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_profile public.user_profiles%rowtype; v_instance public.routine_client_instances%rowtype; v_now timestamptz:=clock_timestamp();
begin
  select profile.* into v_profile from public.user_profiles profile where profile.id=auth.uid() and profile.active;
  select instance.* into v_instance from public.routine_client_instances instance where instance.id=input_client_instance_id
    and instance.auth_user_id=v_profile.id and instance.organization_id=v_profile.organization_id for update;
  if v_instance.id is null or v_instance.revoked_at is not null then raise exception using errcode='42501',message='Only the owning active actor may touch a client instance.'; end if;
  if v_instance.shared_device_id is not null and not exists(select 1 from public.routine_shared_devices device
      where device.id=v_instance.shared_device_id and device.active and device.auth_user_id=auth.uid()) then
    raise exception using errcode='42501',message='Shared device is not active.';
  end if;
  if v_instance.app_version<>trim(coalesce(input_app_version,'')) or v_instance.offline_schema_version<>trim(coalesce(input_offline_schema_version,''))
     or v_instance.last_seen_at<=v_now-interval '5 minutes' then
    perform set_config('mesh.routine_sync_internal','touch',true);
    update public.routine_client_instances set app_version=trim(input_app_version),offline_schema_version=trim(input_offline_schema_version),
      last_seen_at=v_now,revision=revision+1 where id=v_instance.id returning * into v_instance;
  end if;
  return jsonb_build_object('instance',to_jsonb(v_instance),'serverNow',v_now);
end $$;

create or replace function public.routine_offline_receipt_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record;
begin
  if tg_op<>'INSERT' then raise exception using errcode='P0001',message='Offline operation receipts are immutable.'; end if;
  if current_setting('mesh.routine_sync_internal',true) is null then raise exception using errcode='42501',message='Offline receipts require an authorized RPC.'; end if;
  select * into v_actor from public.routine_resolve_effective_actor();
  if new.organization_id<>v_actor.organization_id or new.actor_auth_user_id<>v_actor.actor_auth_user_id
     or new.actor_source<>v_actor.actor_source or new.effective_operator_id is distinct from v_actor.effective_operator_id
     or new.operator_session_id is distinct from v_actor.operator_session_id then raise exception using errcode='42501',message='Offline receipt actor identity is invalid.'; end if;
  if public.routine_phase10i_json_has_forbidden_key(new.response_payload) or public.routine_phase10i_json_has_forbidden_key(new.conflict_payload)
     or public.routine_phase10j_json_has_secret(new.response_payload) or public.routine_phase10j_json_has_secret(new.conflict_payload) then
    raise exception using errcode='P0001',message='Sensitive keys are forbidden in offline receipts.';
  end if;
  return new;
end $$;

create or replace function public.routine_phase10j_event_actor_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record;
begin
  if new.actor_type='system' then new.actor_source:='system'; new.authenticated_profile_id:=null; new.shared_device_id:=null;
    new.operator_session_id:=null; new.effective_operator_id:=null; return new; end if;
  begin select * into v_actor from public.routine_resolve_effective_actor(); exception when others then return new; end;
  new.authenticated_profile_id:=v_actor.authenticated_profile_id; new.actor_source:=v_actor.actor_source;
  new.shared_device_id:=v_actor.shared_device_id; new.operator_session_id:=v_actor.operator_session_id;
  new.effective_operator_id:=v_actor.effective_operator_id; new.actor_profile_id:=v_actor.actor_profile_id;
  new.actor_name_snapshot:=v_actor.actor_display_name; new.actor_role_snapshot:=v_actor.actor_role;
  return new;
end $$;
drop trigger if exists routine_phase10j_event_actor on public.routine_events;
create trigger routine_phase10j_event_actor before insert on public.routine_events for each row execute function public.routine_phase10j_event_actor_guard();

do $phase10j_participant_roles$
begin
  alter table public.routine_run_participants drop constraint if exists routine_run_participants_role_check;
  alter table public.routine_run_participants add constraint routine_run_participants_role_check
    check(role_snapshot in('manager','shift_lead','staff','time2staff','event_floor_manager'));
  alter table public.routine_bundle_participants drop constraint if exists routine_bundle_participants_role_check;
  alter table public.routine_bundle_participants add constraint routine_bundle_participants_role_check
    check(role_snapshot in('manager','shift_lead','staff','time2staff','event_floor_manager'));
  alter table public.routine_run_operations drop constraint if exists routine_run_operations_idempotency_unique;
end $phase10j_participant_roles$;
create unique index if not exists routine_run_operations_personal_idempotency on public.routine_run_operations(
  organization_id,actor_auth_user_id,operation_type,idempotency_key) where actor_source='personal_auth';
create unique index if not exists routine_run_operations_operator_idempotency on public.routine_run_operations(
  organization_id,actor_auth_user_id,effective_operator_id,operation_type,idempotency_key) where actor_source='shared_device_operator';

create or replace function public.routine_run_participant_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_profile public.user_profiles%rowtype; v_operator public.routine_operators%rowtype;
begin
  if tg_op='DELETE' then raise exception using errcode='P0001',message='Routine run participants cannot be deleted.'; end if;
  if new.identity_type='personal_profile' then
    select profile.* into v_profile from public.user_profiles profile where profile.id=new.user_profile_id and profile.active
      and not coalesce(profile.is_shared_device,false) and profile.role in('manager','shift_lead','staff');
    if v_profile.id is null or v_profile.organization_id<>new.organization_id then raise exception using errcode='P0001',message='Personal routine participant is invalid.'; end if;
  else
    select operator.* into v_operator from public.routine_operators operator where operator.id=new.operator_id and operator.active;
    if v_operator.id is null or v_operator.organization_id<>new.organization_id
       or not exists(select 1 from public.routine_shared_devices device where device.user_profile_id=new.authenticated_device_profile_id_snapshot
         and device.organization_id=new.organization_id) then raise exception using errcode='P0001',message='Shared operator routine participant is invalid.'; end if;
  end if;
  if tg_op='UPDATE' then
    if row(new.organization_id,new.run_id,new.user_profile_id,new.identity_type,new.operator_id,new.linked_user_profile_id_snapshot,
      new.authenticated_device_profile_id_snapshot,new.display_name_snapshot,new.role_snapshot,new.creation_idempotency_key,new.created_at,new.created_by_auth_user_id)
      is distinct from row(old.organization_id,old.run_id,old.user_profile_id,old.identity_type,old.operator_id,old.linked_user_profile_id_snapshot,
      old.authenticated_device_profile_id_snapshot,old.display_name_snapshot,old.role_snapshot,old.creation_idempotency_key,old.created_at,old.created_by_auth_user_id)
      then raise exception using errcode='P0001',message='Routine participant identity snapshots are immutable.'; end if;
    if current_setting('mesh.routine_run_internal',true) is null then raise exception using errcode='42501',message='Routine participant status requires an authorized RPC.'; end if;
    new.updated_at:=clock_timestamp();
  end if;
  return new;
end $$;

create or replace function public.routine_bundle_participant_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_profile public.user_profiles%rowtype; v_operator public.routine_operators%rowtype; v_opening uuid; v_closing uuid;
begin
  if tg_op='DELETE' then raise exception using errcode='P0001',message='Routine bundle participants cannot be deleted.'; end if;
  if new.identity_type='personal_profile' then select profile.* into v_profile from public.user_profiles profile where profile.id=new.user_profile_id
    and profile.active and not coalesce(profile.is_shared_device,false) and profile.role in('manager','shift_lead','staff');
    if v_profile.id is null or v_profile.organization_id<>new.organization_id then raise exception using errcode='P0001',message='Personal bundle participant is invalid.'; end if;
  else select operator.* into v_operator from public.routine_operators operator where operator.id=new.operator_id and operator.active;
    if v_operator.id is null or v_operator.organization_id<>new.organization_id then raise exception using errcode='P0001',message='Shared operator bundle participant is invalid.'; end if;
  end if;
  select (select link.run_id from public.routine_bundle_runs link where link.bundle_id=new.bundle_id and link.phase='opening'),
    (select link.run_id from public.routine_bundle_runs link where link.bundle_id=new.bundle_id and link.phase='closing') into v_opening,v_closing;
  if new.opening_run_participant_id is not null and not exists(select 1 from public.routine_run_participants participant
      where participant.id=new.opening_run_participant_id and participant.run_id=v_opening and participant.identity_type=new.identity_type
      and participant.user_profile_id is not distinct from new.user_profile_id and participant.operator_id is not distinct from new.operator_id)
    then raise exception using errcode='P0001',message='Opening participant link is invalid.'; end if;
  if new.closing_run_participant_id is not null and not exists(select 1 from public.routine_run_participants participant
      where participant.id=new.closing_run_participant_id and participant.run_id=v_closing and participant.identity_type=new.identity_type
      and participant.user_profile_id is not distinct from new.user_profile_id and participant.operator_id is not distinct from new.operator_id)
    then raise exception using errcode='P0001',message='Closing participant link is invalid.'; end if;
  if tg_op='UPDATE' then
    if row(new.organization_id,new.bundle_id,new.user_profile_id,new.identity_type,new.operator_id,new.linked_user_profile_id_snapshot,
      new.authenticated_device_profile_id_snapshot,new.display_name_snapshot,new.role_snapshot,new.creation_idempotency_key,new.created_at,new.created_by_auth_user_id)
      is distinct from row(old.organization_id,old.bundle_id,old.user_profile_id,old.identity_type,old.operator_id,old.linked_user_profile_id_snapshot,
      old.authenticated_device_profile_id_snapshot,old.display_name_snapshot,old.role_snapshot,old.creation_idempotency_key,old.created_at,old.created_by_auth_user_id)
      then raise exception using errcode='P0001',message='Bundle participant identity snapshots are immutable.'; end if;
    if current_setting('mesh.routine_bundle_internal',true) is null then raise exception using errcode='42501',message='Bundle participant update requires an authorized RPC.'; end if;
    if new.revision<=old.revision then raise exception using errcode='P0001',message='Bundle participant revision must increase.'; end if;
    new.updated_at:=clock_timestamp();
  end if;
  return new;
end $$;

create or replace function public.routine_run_operation_replay(input_organization_id uuid,input_actor_auth_user_id uuid,
  input_operation_type text,input_idempotency_key uuid,input_request_hash text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_operation public.routine_run_operations%rowtype; v_actor record;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  select operation.* into v_operation from public.routine_run_operations operation where operation.organization_id=input_organization_id
    and operation.actor_auth_user_id=input_actor_auth_user_id and operation.operation_type=input_operation_type
    and operation.idempotency_key=input_idempotency_key and operation.actor_source=v_actor.actor_source
    and operation.effective_operator_id is not distinct from v_actor.effective_operator_id;
  if v_operation.id is null then return null; end if;
  if v_operation.request_hash<>input_request_hash then raise exception using errcode='P0001',message='Idempotency key was already used with another routine request.'; end if;
  return v_operation.response_payload||jsonb_build_object('idempotentReplay',true);
end $$;

create or replace function public.routine_record_run_operation(input_organization_id uuid,input_actor_auth_user_id uuid,input_operation_type text,
  input_idempotency_key uuid,input_request_hash text,input_resource_type text,input_resource_id uuid,input_response_payload jsonb)
returns void language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  perform set_config('mesh.routine_run_internal','operation',true);
  insert into public.routine_run_operations(organization_id,actor_auth_user_id,effective_operator_id,operator_session_id,actor_source,
    operation_type,idempotency_key,request_hash,resource_type,resource_id,response_payload)
  values(input_organization_id,input_actor_auth_user_id,v_actor.effective_operator_id,v_actor.operator_session_id,v_actor.actor_source,
    input_operation_type,input_idempotency_key,input_request_hash,input_resource_type,input_resource_id,input_response_payload);
end $$;

create or replace function public.routine_lifecycle_operation_id(input_organization_id uuid,input_actor_auth_user_id uuid,
  input_operation_type text,input_idempotency_key uuid)
returns uuid language plpgsql stable security definer set search_path=pg_catalog
as $$ declare v_actor record; v_id uuid; begin select * into v_actor from public.routine_resolve_effective_actor();
  select operation.id into v_id from public.routine_run_operations operation where operation.organization_id=input_organization_id
    and operation.actor_auth_user_id=input_actor_auth_user_id and operation.operation_type=input_operation_type
    and operation.idempotency_key=input_idempotency_key and operation.actor_source=v_actor.actor_source
    and operation.effective_operator_id is not distinct from v_actor.effective_operator_id; return v_id; end $$;

create or replace function public.join_routine_run(input_run_id uuid,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record; v_run public.routine_runs%rowtype; v_participant public.routine_run_participants%rowtype;
  v_hash text; v_replay jsonb; v_response jsonb;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  if not public.routine_current_user_can_perform_tasks() or input_run_id is null or input_idempotency_key is null then
    raise exception using errcode='42501',message='Routine task-performer access, run, and idempotency key are required.'; end if;
  v_hash:=public.routine_run_request_hash(jsonb_build_object('runId',input_run_id));
  v_replay:=public.routine_run_operation_replay(v_actor.organization_id,v_actor.actor_auth_user_id,'join_run',input_idempotency_key,v_hash);
  if v_replay is not null then return v_replay; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor.organization_id::text||'|'||input_run_id::text||'|'||
    coalesce(v_actor.effective_operator_id,v_actor.actor_profile_id)::text,11));
  select run.* into v_run from public.routine_runs run where run.id=input_run_id and run.organization_id=v_actor.organization_id
    and run.snapshot_state='ready' and run.status in('scheduled','in_progress','awaiting_final_verification','waiting_for_transfers','reopened') for share;
  if v_run.id is null then raise exception using errcode='P0001',message='A joinable same-organization routine run was not found.'; end if;
  if v_actor.actor_source='personal_auth' then
    insert into public.routine_run_participants(organization_id,run_id,user_profile_id,identity_type,display_name_snapshot,role_snapshot,
      participation_status,joined_at,creation_idempotency_key,created_by_auth_user_id,updated_by_auth_user_id)
    values(v_actor.organization_id,v_run.id,v_actor.actor_profile_id,'personal_profile',v_actor.actor_display_name,v_actor.actor_role,
      'active',clock_timestamp(),input_idempotency_key,v_actor.actor_auth_user_id,v_actor.actor_auth_user_id)
    on conflict(run_id,user_profile_id) where identity_type='personal_profile' do nothing;
    select participant.* into v_participant from public.routine_run_participants participant where participant.run_id=v_run.id
      and participant.identity_type='personal_profile' and participant.user_profile_id=v_actor.actor_profile_id;
  else
    insert into public.routine_run_participants(organization_id,run_id,user_profile_id,identity_type,operator_id,linked_user_profile_id_snapshot,
      authenticated_device_profile_id_snapshot,display_name_snapshot,role_snapshot,participation_status,joined_at,creation_idempotency_key,
      created_by_auth_user_id,updated_by_auth_user_id)
    values(v_actor.organization_id,v_run.id,null,'shared_device_operator',v_actor.effective_operator_id,v_actor.actor_profile_id,
      v_actor.authenticated_profile_id,v_actor.actor_display_name,v_actor.actor_role,'active',clock_timestamp(),input_idempotency_key,
      v_actor.actor_auth_user_id,v_actor.actor_auth_user_id)
    on conflict(run_id,operator_id) where identity_type='shared_device_operator' do nothing;
    select participant.* into v_participant from public.routine_run_participants participant where participant.run_id=v_run.id
      and participant.identity_type='shared_device_operator' and participant.operator_id=v_actor.effective_operator_id;
  end if;
  v_response:=jsonb_build_object('run',to_jsonb(v_run),'participant',to_jsonb(v_participant),'idempotentReplay',false);
  perform public.routine_record_run_operation(v_actor.organization_id,v_actor.actor_auth_user_id,'join_run',input_idempotency_key,v_hash,
    'participant',v_participant.id,v_response);
  return v_response;
end $$;

alter table public.routine_task_verifications add column if not exists verifier_operator_id uuid references public.routine_operators(id);
alter table public.routine_run_verifications add column if not exists verifier_operator_id uuid references public.routine_operators(id);
alter table public.routine_handovers add column if not exists submitted_by_operator_id uuid references public.routine_operators(id);
alter table public.routine_handovers add column if not exists accepted_by_operator_id uuid references public.routine_operators(id);
alter table public.routine_run_transfers add column if not exists proposed_by_operator_id uuid references public.routine_operators(id);
alter table public.routine_run_transfers add column if not exists accepted_by_operator_id uuid references public.routine_operators(id);
alter table public.routine_run_transfers add column if not exists completed_by_operator_id uuid references public.routine_operators(id);
alter table public.routine_bundle_steps add column if not exists completed_by_operator_id uuid references public.routine_operators(id);
alter table public.routine_delivery_comparisons add column if not exists compared_by_operator_id uuid references public.routine_operators(id);

do $phase10j_critical_wrappers$
begin
  if to_regprocedure('public.complete_routine_task_phase10j_base(uuid,text,boolean,bigint,uuid)') is null then
    alter function public.complete_routine_task(uuid,text,boolean,bigint,uuid) rename to complete_routine_task_phase10j_base;
  end if;
  if to_regprocedure('public.verify_routine_task_phase10j_base(uuid,text,text,boolean,bigint,uuid)') is null then
    alter function public.verify_routine_task(uuid,text,text,boolean,bigint,uuid) rename to verify_routine_task_phase10j_base;
  end if;
  if to_regprocedure('public.complete_routine_run_verification_phase10j_base(uuid,text,jsonb,text,text,bigint,uuid)') is null then
    alter function public.complete_routine_run_verification(uuid,text,jsonb,text,text,bigint,uuid) rename to complete_routine_run_verification_phase10j_base;
  end if;
  if to_regprocedure('public.finish_routine_run_phase10j_base(uuid,bigint,uuid)') is null then
    alter function public.finish_routine_run(uuid,bigint,uuid) rename to finish_routine_run_phase10j_base;
  end if;
end $phase10j_critical_wrappers$;

create or replace function public.complete_routine_task(input_task_id uuid,input_completion_note text,input_critical_confirmation boolean,
  input_expected_revision bigint,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record; v_response jsonb; v_critical boolean;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  select task.criticality_snapshot='critical' into v_critical from public.routine_run_tasks task where task.id=input_task_id;
  if v_critical then perform public.routine_require_fresh_operator_credential('complete_critical_task',input_task_id); end if;
  v_response:=public.complete_routine_task_phase10j_base(input_task_id,input_completion_note,input_critical_confirmation,input_expected_revision,input_idempotency_key);
  return v_response;
end $$;

create or replace function public.verify_routine_task(input_task_id uuid,input_result text,input_note text,
  input_physical_recheck_confirmed boolean,input_expected_task_revision bigint,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record; v_response jsonb; v_critical boolean; v_verification_id uuid;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  select task.criticality_snapshot='critical' into v_critical from public.routine_run_tasks task where task.id=input_task_id;
  if v_critical then perform public.routine_require_fresh_operator_credential('verify_critical_task',input_task_id); end if;
  v_response:=public.verify_routine_task_phase10j_base(input_task_id,input_result,input_note,input_physical_recheck_confirmed,
    input_expected_task_revision,input_idempotency_key);
  return v_response;
end $$;

create or replace function public.complete_routine_run_verification(input_run_id uuid,input_verification_type text,input_items jsonb,
  input_result text,input_note text,input_expected_run_revision bigint,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record; v_response jsonb; v_verification_id uuid;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  if lower(trim(input_verification_type))='closing_responsible' then perform public.routine_require_fresh_operator_credential('final_run_verification',null); end if;
  v_response:=public.complete_routine_run_verification_phase10j_base(input_run_id,input_verification_type,input_items,input_result,input_note,
    input_expected_run_revision,input_idempotency_key);
  return v_response;
end $$;

create or replace function public.finish_routine_run(input_run_id uuid,input_expected_run_revision bigint,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record; v_response jsonb;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  perform public.routine_require_fresh_operator_credential('finish_routine_run',null);
  v_response:=public.finish_routine_run_phase10j_base(input_run_id,input_expected_run_revision,input_idempotency_key);
  return v_response;
end $$;

create or replace function public.routine_phase10j_run_actor_projection()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$ declare v_actor record; begin
  begin select * into v_actor from public.routine_resolve_effective_actor(); exception when others then return new; end;
  if v_actor.actor_source='shared_device_operator' then
    if new.started_at is not null and (tg_op='INSERT' or old.started_at is null) then new.started_by_operator_id:=v_actor.effective_operator_id; end if;
    if new.finished_at is not null and (tg_op='INSERT' or old.finished_at is null) then new.finished_by_operator_id:=v_actor.effective_operator_id; end if;
  end if; return new;
end $$;
create or replace function public.routine_phase10j_task_actor_projection()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$ declare v_actor record; begin
  begin select * into v_actor from public.routine_resolve_effective_actor(); exception when others then return new; end;
  if v_actor.actor_source='shared_device_operator' then
    if new.initial_assessed_at is not null and (tg_op='INSERT' or old.initial_assessed_at is null) then new.initial_assessed_by_operator_id:=v_actor.effective_operator_id; end if;
    if new.started_at is not null and (tg_op='INSERT' or old.started_at is null) then new.started_by_operator_id:=v_actor.effective_operator_id; end if;
    if new.completed_at is not null and (tg_op='INSERT' or old.completed_at is null) then new.completed_by_operator_id:=v_actor.effective_operator_id; end if;
    if tg_op='INSERT' or new.status is distinct from old.status then new.last_status_changed_by_operator_id:=v_actor.effective_operator_id; end if;
  end if; return new;
end $$;
create or replace function public.routine_phase10j_item_actor_projection()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$ declare v_actor record; begin
  begin select * into v_actor from public.routine_resolve_effective_actor(); exception when others then return new; end;
  if v_actor.actor_source='shared_device_operator' then
    if new.completed_at is not null and (tg_op='INSERT' or old.completed_at is null) then new.completed_by_operator_id:=v_actor.effective_operator_id; end if;
    if tg_op='INSERT' or new.status is distinct from old.status then new.last_status_changed_by_operator_id:=v_actor.effective_operator_id; end if;
  end if; return new;
end $$;
create or replace function public.routine_phase10j_verification_actor_projection()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$ declare v_actor record; begin
  begin select * into v_actor from public.routine_resolve_effective_actor(); exception when others then return new; end;
  new.effective_operator_id:=v_actor.effective_operator_id; new.operator_session_id:=v_actor.operator_session_id;
  new.actor_source:=v_actor.actor_source; new.verifier_operator_id:=v_actor.effective_operator_id; return new;
end $$;
drop trigger if exists routine_phase10j_run_actor_projection on public.routine_runs;
create trigger routine_phase10j_run_actor_projection before insert or update on public.routine_runs for each row execute function public.routine_phase10j_run_actor_projection();
drop trigger if exists routine_phase10j_task_actor_projection on public.routine_run_tasks;
create trigger routine_phase10j_task_actor_projection before insert or update on public.routine_run_tasks for each row execute function public.routine_phase10j_task_actor_projection();
drop trigger if exists routine_phase10j_item_actor_projection on public.routine_run_task_items;
create trigger routine_phase10j_item_actor_projection before insert or update on public.routine_run_task_items for each row execute function public.routine_phase10j_item_actor_projection();
drop trigger if exists routine_phase10j_task_verification_actor on public.routine_task_verifications;
create trigger routine_phase10j_task_verification_actor before insert on public.routine_task_verifications for each row execute function public.routine_phase10j_verification_actor_projection();
drop trigger if exists routine_phase10j_run_verification_actor on public.routine_run_verifications;
create trigger routine_phase10j_run_verification_actor before insert on public.routine_run_verifications for each row execute function public.routine_phase10j_verification_actor_projection();

do $phase10j_receipt_uniqueness$
begin
  alter table public.routine_offline_operation_receipts drop constraint if exists routine_offline_receipts_operation_unique;
end $phase10j_receipt_uniqueness$;
create unique index if not exists routine_offline_receipts_personal_operation_unique on public.routine_offline_operation_receipts(
  organization_id,actor_auth_user_id,client_instance_id,client_operation_id) where actor_source='personal_auth';
create unique index if not exists routine_offline_receipts_operator_operation_unique on public.routine_offline_operation_receipts(
  organization_id,actor_auth_user_id,effective_operator_id,client_instance_id,client_operation_id) where actor_source='shared_device_operator';

create or replace function public.routine_phase10i_assert_instance(input_instance_id uuid,input_actor jsonb)
returns public.routine_client_instances language plpgsql security definer set search_path=pg_catalog
as $$
declare v_instance public.routine_client_instances%rowtype; v_effective record;
begin
  select * into v_effective from public.routine_resolve_effective_actor();
  select instance.* into v_instance from public.routine_client_instances instance where instance.id=input_instance_id;
  if v_instance.id is null or v_instance.organization_id<>v_effective.organization_id or v_instance.auth_user_id<>v_effective.actor_auth_user_id
     or v_instance.shared_device_id is distinct from v_effective.shared_device_id then
    raise exception using errcode='42501',message='Offline operation requires the effective actor own the client instance.';
  end if;
  if v_instance.revoked_at is not null then raise exception using errcode='P0001',message='Client instance is revoked.'; end if;
  return v_instance;
end $$;

create or replace function public.routine_phase10i_existing_receipt(input_organization_id uuid,input_actor_auth_user_id uuid,
  input_client_instance_id uuid,input_client_operation_id uuid,input_request_hash text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_receipt public.routine_offline_operation_receipts%rowtype; v_actor record;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  select receipt.* into v_receipt from public.routine_offline_operation_receipts receipt where receipt.organization_id=input_organization_id
    and receipt.actor_auth_user_id=input_actor_auth_user_id and receipt.client_instance_id=input_client_instance_id
    and receipt.client_operation_id=input_client_operation_id and receipt.actor_source=v_actor.actor_source
    and receipt.effective_operator_id is not distinct from v_actor.effective_operator_id;
  if v_receipt.id is null then return null; end if;
  if v_receipt.request_hash<>input_request_hash then raise exception using errcode='P0001',message='Client operation ID was already used with a different request.'; end if;
  return to_jsonb(v_receipt)||jsonb_build_object('idempotentReplay',true);
end $$;

create or replace function public.routine_phase10i_record_receipt(input_actor jsonb,input_client_instance_id uuid,input_client_operation_id uuid,
  input_operation_type text,input_request_hash text,input_receipt_status text,input_resource_type text,input_resource_id uuid,
  input_response_payload jsonb,input_conflict_payload jsonb,input_client_recorded_at timestamptz)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_receipt public.routine_offline_operation_receipts%rowtype; v_effective record;
begin
  select * into v_effective from public.routine_resolve_effective_actor();
  perform set_config('mesh.routine_sync_internal','receipt',true);
  insert into public.routine_offline_operation_receipts(organization_id,actor_auth_user_id,actor_profile_id,effective_operator_id,
    operator_session_id,actor_source,client_instance_id,client_operation_id,operation_type,request_hash,receipt_status,resource_type,
    resource_id,response_payload,conflict_payload,client_recorded_at,client_time_authoritative,completed_at)
  values(v_effective.organization_id,v_effective.actor_auth_user_id,v_effective.actor_profile_id,v_effective.effective_operator_id,
    v_effective.operator_session_id,v_effective.actor_source,input_client_instance_id,input_client_operation_id,input_operation_type,
    input_request_hash,input_receipt_status,input_resource_type,input_resource_id,coalesce(input_response_payload,'{}'::jsonb),
    coalesce(input_conflict_payload,'{}'::jsonb),input_client_recorded_at,false,clock_timestamp()) on conflict do nothing returning * into v_receipt;
  if v_receipt.id is null then select receipt.* into v_receipt from public.routine_offline_operation_receipts receipt
    where receipt.organization_id=v_effective.organization_id and receipt.actor_auth_user_id=v_effective.actor_auth_user_id
      and receipt.effective_operator_id is not distinct from v_effective.effective_operator_id and receipt.actor_source=v_effective.actor_source
      and receipt.client_instance_id=input_client_instance_id and receipt.client_operation_id=input_client_operation_id;
    if v_receipt.request_hash<>input_request_hash then raise exception using errcode='P0001',message='Client operation ID was already used with a different request.'; end if;
  end if;
  return to_jsonb(v_receipt);
end $$;

create or replace function public.routine_offline_receipt_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record;
begin
  if tg_op<>'INSERT' then raise exception using errcode='P0001',message='Offline operation receipts are immutable.'; end if;
  if current_setting('mesh.routine_sync_internal',true) is null then raise exception using errcode='42501',message='Offline receipts require an authorized RPC.'; end if;
  select * into v_actor from public.routine_resolve_effective_actor();
  new.organization_id:=v_actor.organization_id; new.actor_auth_user_id:=v_actor.actor_auth_user_id;
  new.actor_profile_id:=v_actor.actor_profile_id; new.effective_operator_id:=v_actor.effective_operator_id;
  new.operator_session_id:=v_actor.operator_session_id; new.actor_source:=v_actor.actor_source;
  if public.routine_phase10i_json_has_forbidden_key(new.response_payload) or public.routine_phase10i_json_has_forbidden_key(new.conflict_payload)
     or public.routine_phase10j_json_has_secret(new.response_payload) or public.routine_phase10j_json_has_secret(new.conflict_payload) then
    raise exception using errcode='P0001',message='Sensitive keys are forbidden in offline receipts.'; end if;
  return new;
end $$;

do $phase10j_offline_wrappers$
begin
  if to_regprocedure('public.apply_routine_offline_task_bundle_phase10j_base(uuid,uuid,jsonb,text)') is null then
    alter function public.apply_routine_offline_task_bundle(uuid,uuid,jsonb,text) rename to apply_routine_offline_task_bundle_phase10j_base;
  end if;
  if to_regprocedure('public.apply_routine_offline_run_finish_intent_phase10j_base(uuid,uuid,uuid,bigint,timestamptz,text)') is null then
    alter function public.apply_routine_offline_run_finish_intent(uuid,uuid,uuid,bigint,timestamptz,text) rename to apply_routine_offline_run_finish_intent_phase10j_base;
  end if;
end $phase10j_offline_wrappers$;

create or replace function public.apply_routine_offline_task_bundle(input_client_instance_id uuid,input_client_operation_id uuid,
  input_payload jsonb,input_request_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record; v_task public.routine_run_tasks%rowtype;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  if v_actor.actor_source='shared_device_operator' then
    if not coalesce((v_actor.capabilities->>'offlineNoncritical')::boolean,false) then
      raise exception using errcode='42501',message='shared_device_offline_not_allowed'; end if;
    select task.* into v_task from public.routine_run_tasks task where task.id=nullif(input_payload->>'taskId','')::uuid;
    if v_task.id is null or v_task.criticality_snapshot='critical' and input_payload->>'finalAction' in('complete','not_applicable') then
      raise exception using errcode='42501',message='shared_device_critical_action_requires_online_reauthentication'; end if;
  end if;
  return public.apply_routine_offline_task_bundle_phase10j_base(input_client_instance_id,input_client_operation_id,input_payload,input_request_hash);
end $$;

create or replace function public.apply_routine_offline_run_finish_intent(input_client_instance_id uuid,input_client_operation_id uuid,
  input_run_id uuid,input_base_run_revision bigint,input_client_recorded_at timestamptz,input_request_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  if v_actor.actor_source='shared_device_operator' then raise exception using errcode='42501',message='shared_device_run_finish_requires_online_reauthentication'; end if;
  return public.apply_routine_offline_run_finish_intent_phase10j_base(input_client_instance_id,input_client_operation_id,input_run_id,
    input_base_run_revision,input_client_recorded_at,input_request_hash);
end $$;

create or replace function public.get_routine_sync_events(input_after_server_created_at timestamptz default null,
  input_after_event_id uuid default null,input_limit integer default 200,input_run_ids uuid[] default null,input_bundle_ids uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor record; v_limit integer; v_after timestamptz; v_events jsonb; v_count integer; v_next_time timestamptz; v_next_id uuid;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  if (input_after_server_created_at is null)<>(input_after_event_id is null) then raise exception using errcode='P0001',message='Sync cursor is incomplete.'; end if;
  v_limit:=least(greatest(coalesce(input_limit,200),1),500); v_after:=coalesce(input_after_server_created_at,clock_timestamp()-interval '14 days');
  with visible as(select event.* from public.routine_events event where event.organization_id=v_actor.organization_id
      and (event.server_created_at,event.id)>(v_after,coalesce(input_after_event_id,'00000000-0000-0000-0000-000000000000'::uuid))
      and (input_run_ids is null or event.run_id=any(input_run_ids)) and (input_bundle_ids is null or event.bundle_id=any(input_bundle_ids))
      and ((event.run_id is not null and public.routine_run_is_visible(event.run_id,event.organization_id))
        or (event.run_id is null and ((v_actor.actor_source='personal_auth' and (event.actor_auth_user_id=v_actor.actor_auth_user_id
          or v_actor.actor_role in('manager','shift_lead'))) or (v_actor.actor_source='shared_device_operator'
          and event.effective_operator_id=v_actor.effective_operator_id)))) order by event.server_created_at,event.id limit v_limit+1),
    page as(select * from visible order by server_created_at,id limit v_limit)
  select coalesce(jsonb_agg(to_jsonb(page) order by server_created_at,id),'[]'::jsonb),count(*) into v_events,v_count from page;
  select (value->>'server_created_at')::timestamptz,(value->>'id')::uuid into v_next_time,v_next_id
    from jsonb_array_elements(v_events) with ordinality item(value,ordinality) order by ordinality desc limit 1;
  return jsonb_build_object('transportMode',case when v_actor.actor_source='shared_device_operator' then 'cursor_polling' else 'postgres_realtime' end,
    'events',v_events,'nextCursor',case when v_count=0 then jsonb_build_object('serverCreatedAt',input_after_server_created_at,'eventId',input_after_event_id)
      else jsonb_build_object('serverCreatedAt',v_next_time,'eventId',v_next_id) end,
    'hasMore',v_count=v_limit,'serverNow',clock_timestamp(),
    'affectedRunIds',coalesce((select jsonb_agg(distinct value->>'run_id' order by value->>'run_id') from jsonb_array_elements(v_events) value
      where value->>'run_id' is not null),'[]'::jsonb),
    'affectedBundleIds',coalesce((select jsonb_agg(distinct value->>'bundle_id' order by value->>'bundle_id') from jsonb_array_elements(v_events) value
      where value->>'bundle_id' is not null),'[]'::jsonb),
    'affectedTaskIds',coalesce((select jsonb_agg(distinct value->>'task_id' order by value->>'task_id') from jsonb_array_elements(v_events) value
      where value->>'task_id' is not null),'[]'::jsonb));
end $$;

create or replace function public.get_routine_offline_operation_receipt(input_client_instance_id uuid,input_client_operation_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor record; v_instance public.routine_client_instances%rowtype; v_receipt jsonb;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  select instance.* into v_instance from public.routine_client_instances instance where instance.id=input_client_instance_id
    and instance.organization_id=v_actor.organization_id and instance.auth_user_id=v_actor.actor_auth_user_id
    and instance.shared_device_id is not distinct from v_actor.shared_device_id;
  if v_instance.id is null then raise exception using errcode='42501',message='Receipt lookup requires the owning client instance.'; end if;
  select to_jsonb(receipt) into v_receipt from public.routine_offline_operation_receipts receipt where receipt.organization_id=v_actor.organization_id
    and receipt.actor_auth_user_id=v_actor.actor_auth_user_id and receipt.actor_source=v_actor.actor_source
    and receipt.effective_operator_id is not distinct from v_actor.effective_operator_id and receipt.client_instance_id=input_client_instance_id
    and receipt.client_operation_id=input_client_operation_id;
  return v_receipt;
end $$;

alter table public.routine_delivery_records add column if not exists base_delivery_schema_version text;
alter table public.routine_delivery_records add column if not exists base_record_hash text;
alter table public.routine_delivery_records add column if not exists operator_identity_snapshot jsonb not null default '{}'::jsonb;
alter table public.routine_delivery_records add column if not exists generated_by_operator_id uuid references public.routine_operators(id);
alter table public.routine_delivery_records add column if not exists operator_session_id uuid references public.routine_operator_sessions(id);
alter table public.routine_delivery_records add column if not exists shared_device_id uuid references public.routine_shared_devices(id);
alter table public.routine_delivery_records add column if not exists actor_source text not null default 'personal_auth';
alter table public.routine_delivery_items add column if not exists base_item_schema_version text;
alter table public.routine_delivery_items add column if not exists base_item_hash text;
alter table public.routine_delivery_items add column if not exists operator_identity_snapshot jsonb not null default '{}'::jsonb;
alter table public.routine_delivery_items add column if not exists effective_operator_id uuid references public.routine_operators(id);
alter table public.routine_delivery_items add column if not exists operator_session_id uuid references public.routine_operator_sessions(id);
alter table public.routine_delivery_items add column if not exists shared_device_id uuid references public.routine_shared_devices(id);
alter table public.routine_delivery_items add column if not exists actor_source text not null default 'personal_auth';
do $phase10j_delivery_schema_checks$
begin
  alter table public.routine_delivery_records drop constraint if exists routine_delivery_records_schema_check;
  alter table public.routine_delivery_records add constraint routine_delivery_records_schema_check
    check(delivery_schema_version in('phase10g-v1','phase10h-v2','phase10j-v3'));
  alter table public.routine_delivery_items drop constraint if exists routine_delivery_items_schema_check;
  alter table public.routine_delivery_items add constraint routine_delivery_items_schema_check
    check(item_schema_version in('phase10g-v1','phase10h-v2','phase10j-v3'));
  alter table public.routine_delivery_items drop constraint if exists routine_delivery_items_transfer_evidence_check;
  alter table public.routine_delivery_items add constraint routine_delivery_items_transfer_evidence_check
    check(jsonb_typeof(transfer_evidence_snapshot)='object' and (item_schema_version in('phase10h-v2','phase10j-v3') or transfer_evidence_snapshot='{}'::jsonb));
end $phase10j_delivery_schema_checks$;

create or replace function public.routine_phase10j_delivery_actor_projection()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record; v_device public.routine_shared_devices%rowtype; v_identity jsonb; v_base_hash text;
begin
  begin select * into v_actor from public.routine_resolve_effective_actor(); exception when others then return new; end;
  if v_actor.actor_source<>'shared_device_operator' then return new; end if;
  select device.* into v_device from public.routine_shared_devices device where device.id=v_actor.shared_device_id;
  v_identity:=jsonb_build_object('effectiveOperatorId',v_actor.effective_operator_id,'linkedProfileId',v_actor.actor_profile_id,
    'sharedDeviceId',v_actor.shared_device_id,'sharedDeviceLabel',v_device.label,'operatorSessionId',v_actor.operator_session_id,
    'actorSource',v_actor.actor_source,'deviceAuthUserId',v_actor.actor_auth_user_id,'operatorName',v_actor.actor_display_name,
    'operatorRole',v_actor.actor_role);
  if public.routine_phase10j_json_has_secret(v_identity) then raise exception using errcode='P0001',message='Delivery identity contains forbidden material.'; end if;
  if tg_table_name='routine_delivery_records' then
    new.base_delivery_schema_version:=new.delivery_schema_version; new.base_record_hash:=new.record_hash; v_base_hash:=new.record_hash;
    new.delivery_schema_version:='phase10j-v3'; new.operator_identity_snapshot:=v_identity;
    new.generated_by_operator_id:=v_actor.effective_operator_id; new.operator_session_id:=v_actor.operator_session_id;
    new.shared_device_id:=v_actor.shared_device_id; new.actor_source:=v_actor.actor_source;
    new.record_hash:=public.routine_compute_delivery_record_hash(jsonb_build_object('baseRecordHash',v_base_hash,
      'schemaVersion','phase10j-v3','operatorIdentity',v_identity));
  else
    new.base_item_schema_version:=new.item_schema_version; new.base_item_hash:=new.item_hash; v_base_hash:=new.item_hash;
    new.item_schema_version:='phase10j-v3'; new.operator_identity_snapshot:=v_identity;
    new.effective_operator_id:=v_actor.effective_operator_id; new.operator_session_id:=v_actor.operator_session_id;
    new.shared_device_id:=v_actor.shared_device_id; new.actor_source:=v_actor.actor_source;
    new.item_hash:=public.routine_compute_delivery_item_hash(jsonb_build_object('baseItemHash',v_base_hash,
      'schemaVersion','phase10j-v3','operatorIdentity',v_identity));
  end if;
  return new;
end $$;
drop trigger if exists routine_phase10j_delivery_record_actor on public.routine_delivery_records;
create trigger routine_phase10j_delivery_record_actor before insert on public.routine_delivery_records for each row execute function public.routine_phase10j_delivery_actor_projection();
drop trigger if exists routine_phase10j_delivery_item_actor on public.routine_delivery_items;
create trigger routine_phase10j_delivery_item_actor before insert on public.routine_delivery_items for each row execute function public.routine_phase10j_delivery_actor_projection();

create or replace function public.routine_delivery_item_canonical_json(input_item_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_item public.routine_delivery_items%rowtype; v_base jsonb; v_base_hash text;
begin
  select item.* into v_item from public.routine_delivery_items item where item.id=input_item_id;
  v_base:=public.routine_delivery_item_canonical_json_phase10g(input_item_id);
  if v_item.item_schema_version='phase10g-v1' then return v_base; end if;
  if v_item.item_schema_version='phase10h-v2' then return v_base||jsonb_build_object('schemaVersion','phase10h-v2','transferEvidence',v_item.transfer_evidence_snapshot); end if;
  v_base_hash:=v_item.base_item_hash;
  return jsonb_build_object('baseItemHash',v_base_hash,'schemaVersion','phase10j-v3','operatorIdentity',v_item.operator_identity_snapshot);
end $$;

create or replace function public.routine_delivery_record_canonical_json(input_record_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_record public.routine_delivery_records%rowtype; v_base jsonb; v_base_hash text;
begin
  select record.* into v_record from public.routine_delivery_records record where record.id=input_record_id;
  v_base:=public.routine_delivery_record_canonical_json_phase10g(input_record_id);
  if v_record.delivery_schema_version='phase10g-v1' then return v_base; end if;
  if v_record.delivery_schema_version='phase10h-v2' then return v_base||jsonb_build_object('schemaVersion','phase10h-v2'); end if;
  v_base_hash:=v_record.base_record_hash;
  return jsonb_build_object('baseRecordHash',v_base_hash,'schemaVersion','phase10j-v3','operatorIdentity',v_record.operator_identity_snapshot);
end $$;

do $phase10j_delivery_preview_wrapper$
begin
  if to_regprocedure('public.preview_routine_run_delivery_phase10j_base(uuid)') is null then
    alter function public.preview_routine_run_delivery(uuid) rename to preview_routine_run_delivery_phase10j_base;
  end if;
end $phase10j_delivery_preview_wrapper$;
create or replace function public.preview_routine_run_delivery(input_run_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor record; v_device public.routine_shared_devices%rowtype; v_preview jsonb; v_identity jsonb; v_items jsonb;
begin
  v_preview:=public.preview_routine_run_delivery_phase10j_base(input_run_id);
  select * into v_actor from public.routine_resolve_effective_actor();
  if v_actor.actor_source<>'shared_device_operator' then return v_preview; end if;
  select device.* into v_device from public.routine_shared_devices device where device.id=v_actor.shared_device_id;
  v_identity:=jsonb_build_object('effectiveOperatorId',v_actor.effective_operator_id,'linkedProfileId',v_actor.actor_profile_id,
    'sharedDeviceId',v_actor.shared_device_id,'sharedDeviceLabel',v_device.label,'operatorSessionId',v_actor.operator_session_id,
    'actorSource',v_actor.actor_source,'deviceAuthUserId',v_actor.actor_auth_user_id,'operatorName',v_actor.actor_display_name,'operatorRole',v_actor.actor_role);
  select coalesce(jsonb_agg(value||jsonb_build_object('baseItemSchemaVersion',value->>'itemSchemaVersion','baseItemHash',value->>'itemHash',
    'itemSchemaVersion','phase10j-v3','operatorIdentity',v_identity,'itemHash',public.routine_compute_delivery_item_hash(
      jsonb_build_object('baseItemHash',value->>'itemHash','schemaVersion','phase10j-v3','operatorIdentity',v_identity))) order by ordinality),'[]'::jsonb)
    into v_items from jsonb_array_elements(coalesce(v_preview->'proposedItems','[]'::jsonb)) with ordinality item(value,ordinality);
  return v_preview||jsonb_build_object('deliverySchemaVersion','phase10j-v3','baseDeliverySchemaVersion',v_preview->>'deliverySchemaVersion',
    'operatorIdentity',v_identity,'proposedItems',v_items,'baseRecordHash',v_preview->>'proposedRecordHash',
    'proposedRecordHash',public.routine_compute_delivery_record_hash(jsonb_build_object('baseRecordHash',v_preview->>'proposedRecordHash',
      'schemaVersion','phase10j-v3','operatorIdentity',v_identity)));
end $$;

create or replace function public.routine_phase10h_actor()
returns table(actor_auth_user_id uuid,actor_profile_id uuid,organization_id uuid,actor_role text,actor_display_name text)
language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor record;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  if v_actor.actor_source='shared_device_operator' and v_actor.actor_profile_id is null then
    raise exception using errcode='42501',message='A linked personal profile is required for this operation.';
  end if;
  return query select case when v_actor.actor_source='shared_device_operator' then v_actor.actor_profile_id else v_actor.actor_auth_user_id end,
    coalesce(v_actor.actor_profile_id,v_actor.authenticated_profile_id),v_actor.organization_id,v_actor.actor_role,v_actor.actor_display_name;
end $$;

create or replace function public.routine_current_user_event_transfer_authority(input_event_operation_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_event_id uuid; v_actor record; v_profile public.user_profiles%rowtype; v_event public.event_operations%rowtype;
  v_assignment public.event_role_assignments%rowtype; v_handover public.event_responsibility_handovers%rowtype;
  v_role text; v_scope text; v_assignment_id text; v_source text;
begin
  begin v_event_id:=input_event_operation_id::uuid; exception when others then return jsonb_build_object('authorized',false,'reason','invalid_event_operation_id'); end;
  begin select * into v_actor from public.routine_resolve_effective_actor(); exception when others then return jsonb_build_object('authorized',false,'reason','active_actor_required'); end;
  if v_actor.actor_source='shared_device_operator' and (v_actor.actor_profile_id is null
      or not coalesce((v_actor.capabilities->>'eventTransferActions')::boolean,false)) then
    return jsonb_build_object('authorized',false,'reason','linked_event_transfer_capability_required');
  end if;
  select profile.* into v_profile from public.user_profiles profile where profile.id=v_actor.actor_profile_id and profile.active
    and profile.organization_id=v_actor.organization_id and not coalesce(profile.is_shared_device,false);
  if v_profile.id is null then return jsonb_build_object('authorized',false,'reason','active_linked_profile_required'); end if;
  select event_record.* into v_event from public.event_operations event_record where event_record.id=v_event_id
    and event_record.organization_id=v_actor.organization_id;
  if v_event.id is null then return jsonb_build_object('authorized',false,'reason','same_organization_event_not_found'); end if;
  select assignment.* into v_assignment from public.event_role_assignments assignment where assignment.event_id=v_event.id
    and assignment.organization_id=v_event.organization_id and assignment.active and assignment.assigned_auth_user_id=v_profile.id
    order by case when assignment.role_key in('event_floor_manager','cornerbar_manager','atrium_manager','workbar_manager','headrunner') then 0 else 1 end,
      assignment.created_at desc,assignment.id desc limit 1;
  select handover.* into v_handover from public.event_responsibility_handovers handover where handover.event_id=v_event.id
    and handover.organization_id=v_event.organization_id order by handover.created_at desc,handover.id desc limit 1;
  if v_assignment.id is not null then v_role:=v_assignment.role_key; v_scope:=coalesce(nullif(v_assignment.zone,''),'all');
    v_assignment_id:=v_assignment.id::text; v_source:='active_role_assignment';
  elsif v_event.active_responsible_auth_user_id=v_profile.id then v_role:='active_responsible'; v_scope:='all'; v_source:='event_active_responsible';
  elsif v_handover.id is not null and v_handover.to_auth_user_id=v_profile.id then v_role:='responsibility_handover';
    v_scope:=coalesce(nullif(v_handover.responsibility_scope,''),'all'); v_source:='latest_responsibility_handover';
  elsif v_profile.role in('manager','event_floor_manager') then v_role:='event_operations_manager'; v_scope:='all'; v_source:='event_operations_profile_role';
  else return jsonb_build_object('authorized',false,'reason','active_event_authority_required','eventOperationId',v_event.id,
    'eventStatus',v_event.status,'organizationId',v_event.organization_id); end if;
  return jsonb_build_object('authorized',v_event.status in('active','finished'),'reason',case when v_event.status in('active','finished') then null else 'event_status_not_compatible' end,
    'organizationId',v_event.organization_id,'eventOperationId',v_event.id,'eventStatus',v_event.status,'eventRoleAssignmentId',v_assignment_id,
    'eventRoleKey',v_role,'eventScope',v_scope,'authoritySource',v_source,'profileId',v_profile.id,
    'authUserId',v_actor.actor_auth_user_id,'actorSource',v_actor.actor_source,'effectiveOperatorId',v_actor.effective_operator_id);
end $$;

alter table public.routine_event_transfer_acceptances add column if not exists effective_operator_id uuid references public.routine_operators(id);
alter table public.routine_event_transfer_acceptances add column if not exists operator_session_id uuid references public.routine_operator_sessions(id);
alter table public.routine_event_transfer_acceptances add column if not exists shared_device_id uuid references public.routine_shared_devices(id);
alter table public.routine_event_transfer_acceptances add column if not exists authenticated_device_auth_user_id uuid references auth.users(id);
alter table public.routine_event_transfer_acceptances add column if not exists actor_source text not null default 'personal_auth';
alter table public.routine_event_transfer_acceptances add column if not exists operator_identity_snapshot jsonb not null default '{}'::jsonb;
alter table public.routine_event_transfer_acceptances add column if not exists operator_identity_hash text;
alter table public.routine_event_transfer_completions add column if not exists effective_operator_id uuid references public.routine_operators(id);
alter table public.routine_event_transfer_completions add column if not exists operator_session_id uuid references public.routine_operator_sessions(id);
alter table public.routine_event_transfer_completions add column if not exists shared_device_id uuid references public.routine_shared_devices(id);
alter table public.routine_event_transfer_completions add column if not exists authenticated_device_auth_user_id uuid references auth.users(id);
alter table public.routine_event_transfer_completions add column if not exists actor_source text not null default 'personal_auth';
alter table public.routine_event_transfer_completions add column if not exists operator_identity_snapshot jsonb not null default '{}'::jsonb;
alter table public.routine_event_transfer_completions add column if not exists operator_identity_hash text;

create or replace function public.routine_phase10j_event_transfer_actor_projection()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record; v_device public.routine_shared_devices%rowtype; v_identity jsonb;
begin
  begin select * into v_actor from public.routine_resolve_effective_actor(); exception when others then return new; end;
  if v_actor.actor_source<>'shared_device_operator' then return new; end if;
  select device.* into v_device from public.routine_shared_devices device where device.id=v_actor.shared_device_id;
  v_identity:=jsonb_build_object('effectiveOperatorId',v_actor.effective_operator_id,'linkedProfileId',v_actor.actor_profile_id,
    'sharedDeviceId',v_actor.shared_device_id,'sharedDeviceLabel',v_device.label,'operatorSessionId',v_actor.operator_session_id,
    'actorSource',v_actor.actor_source,'deviceAuthUserId',v_actor.actor_auth_user_id,'operatorName',v_actor.actor_display_name,'operatorRole',v_actor.actor_role);
  new.effective_operator_id:=v_actor.effective_operator_id; new.operator_session_id:=v_actor.operator_session_id;
  new.shared_device_id:=v_actor.shared_device_id; new.authenticated_device_auth_user_id:=v_actor.actor_auth_user_id;
  new.actor_source:=v_actor.actor_source; new.operator_identity_snapshot:=v_identity;
  new.operator_identity_hash:=public.routine_run_sha256(jsonb_build_object('schemaVersion','phase10j-v3','operatorIdentity',v_identity));
  return new;
end $$;
drop trigger if exists routine_phase10j_event_acceptance_actor on public.routine_event_transfer_acceptances;
create trigger routine_phase10j_event_acceptance_actor before insert on public.routine_event_transfer_acceptances for each row execute function public.routine_phase10j_event_transfer_actor_projection();
drop trigger if exists routine_phase10j_event_completion_actor on public.routine_event_transfer_completions;
create trigger routine_phase10j_event_completion_actor before insert on public.routine_event_transfer_completions for each row execute function public.routine_phase10j_event_transfer_actor_projection();

do $phase10j_event_completion_wrapper$
begin
  if to_regprocedure('public.complete_routine_event_transfer_phase10j_base(uuid,text,jsonb,boolean,boolean,text,bigint,uuid)') is null then
    alter function public.complete_routine_event_transfer(uuid,text,jsonb,boolean,boolean,text,bigint,uuid) rename to complete_routine_event_transfer_phase10j_base;
  end if;
end $phase10j_event_completion_wrapper$;
create or replace function public.complete_routine_event_transfer(input_transfer_id uuid,input_result_code text,input_evidence jsonb,
  input_physical_check_confirmed boolean,input_critical_confirmation boolean,input_completion_note text,
  input_expected_transfer_revision bigint,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_task_id uuid; v_critical boolean;
begin
  select transfer.from_task_id into v_task_id from public.routine_run_transfers transfer where transfer.id=input_transfer_id;
  select task.criticality_snapshot='critical' into v_critical from public.routine_run_tasks task where task.id=v_task_id;
  if v_critical then perform public.routine_require_fresh_operator_credential('complete_critical_event_transfer',v_task_id); end if;
  return public.complete_routine_event_transfer_phase10j_base(input_transfer_id,input_result_code,input_evidence,input_physical_check_confirmed,
    input_critical_confirmation,input_completion_note,input_expected_transfer_revision,input_idempotency_key);
end $$;

create or replace function public.routine_event_transfer_is_visible(input_transfer_id uuid,input_organization_id uuid)
returns boolean language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor record; v_transfer public.routine_run_transfers%rowtype;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  select transfer.* into v_transfer from public.routine_run_transfers transfer where transfer.id=input_transfer_id
    and transfer.organization_id=input_organization_id;
  if v_transfer.id is null or input_organization_id<>v_actor.organization_id then return false; end if;
  return public.routine_run_is_visible(v_transfer.from_run_id,input_organization_id)
    or (v_transfer.target_type='event_operation' and coalesce((public.routine_current_user_event_transfer_authority(v_transfer.target_event_id)->>'authorized')::boolean,false));
exception when others then return false;
end $$;

do $phase10j_consistency_constraints$
begin
  if not exists(select 1 from pg_constraint where conname='routine_events_actor_source_check') then
    alter table public.routine_events add constraint routine_events_actor_source_check check(actor_source in('personal_auth','shared_device_operator','system'));
  end if;
  if not exists(select 1 from pg_constraint where conname='routine_offline_receipts_actor_source_check') then
    alter table public.routine_offline_operation_receipts add constraint routine_offline_receipts_actor_source_check
      check(actor_source in('personal_auth','shared_device_operator'));
  end if;
  if not exists(select 1 from pg_constraint where conname='routine_delivery_records_phase10j_hash_check') then
    alter table public.routine_delivery_records add constraint routine_delivery_records_phase10j_hash_check check(
      delivery_schema_version<>'phase10j-v3' or (base_record_hash~'^[0-9a-f]{64}$' and base_delivery_schema_version in('phase10g-v1','phase10h-v2')
        and jsonb_typeof(operator_identity_snapshot)='object' and operator_identity_snapshot<>'{}'::jsonb));
  end if;
  if not exists(select 1 from pg_constraint where conname='routine_delivery_items_phase10j_hash_check') then
    alter table public.routine_delivery_items add constraint routine_delivery_items_phase10j_hash_check check(
      item_schema_version<>'phase10j-v3' or (base_item_hash~'^[0-9a-f]{64}$' and base_item_schema_version in('phase10g-v1','phase10h-v2')
        and jsonb_typeof(operator_identity_snapshot)='object' and operator_identity_snapshot<>'{}'::jsonb));
  end if;
end $phase10j_consistency_constraints$;

alter table public.routine_shared_devices enable row level security;
alter table public.routine_operators enable row level security;
alter table public.routine_shared_device_operator_access enable row level security;
alter table public.routine_operator_credentials enable row level security;
alter table public.routine_operator_auth_throttles enable row level security;
alter table public.routine_operator_auth_attempts enable row level security;
alter table public.routine_operator_sessions enable row level security;
alter table public.routine_operator_operations enable row level security;
alter table public.routine_operator_events enable row level security;

drop policy if exists routine_shared_devices_manager_select on public.routine_shared_devices;
create policy routine_shared_devices_manager_select on public.routine_shared_devices for select to authenticated using(
  organization_id=public.routine_current_user_organization_id() and public.routine_current_actor_source()='personal_auth'
  and public.routine_current_user_role()='manager');
drop policy if exists routine_operators_manager_select on public.routine_operators;
create policy routine_operators_manager_select on public.routine_operators for select to authenticated using(
  organization_id=public.routine_current_user_organization_id() and public.routine_current_actor_source()='personal_auth'
  and public.routine_current_user_role()='manager');
drop policy if exists routine_device_access_manager_select on public.routine_shared_device_operator_access;
create policy routine_device_access_manager_select on public.routine_shared_device_operator_access for select to authenticated using(
  organization_id=public.routine_current_user_organization_id() and public.routine_current_actor_source()='personal_auth'
  and public.routine_current_user_role()='manager');

drop policy if exists routine_offline_receipts_select on public.routine_offline_operation_receipts;
create policy routine_offline_receipts_select on public.routine_offline_operation_receipts for select to authenticated using(
  organization_id=public.routine_current_user_organization_id() and actor_auth_user_id=auth.uid()
  and actor_source=public.routine_current_actor_source()
  and effective_operator_id is not distinct from public.routine_current_effective_operator_id());
drop policy if exists routine_delivery_reconciliations_select on public.routine_delivery_reconciliations;
create policy routine_delivery_reconciliations_select on public.routine_delivery_reconciliations for select to authenticated using(
  organization_id=public.routine_current_user_organization_id() and public.routine_current_user_is_active()
  and (public.routine_current_user_can_coordinate_runs() or public.routine_run_is_visible(opening_run_id,organization_id)));
drop policy if exists routine_events_read on public.routine_events;
create policy routine_events_read on public.routine_events for select to authenticated using(
  organization_id=public.routine_current_user_organization_id() and public.routine_current_user_is_active()
  and public.routine_current_actor_source()='personal_auth' and ((run_id is not null and public.routine_run_is_visible(run_id,organization_id))
    or (run_id is null and (actor_auth_user_id=auth.uid() or public.routine_current_user_role() in('manager','shift_lead')))));

revoke all on public.routine_shared_devices,public.routine_operators,public.routine_shared_device_operator_access,
  public.routine_operator_credentials,public.routine_operator_auth_throttles,public.routine_operator_auth_attempts,
  public.routine_operator_sessions,public.routine_operator_operations,public.routine_operator_events from public,anon,authenticated;
grant select on public.routine_shared_devices,public.routine_operators,public.routine_shared_device_operator_access to authenticated;

revoke all on function public.routine_phase10j_request_hash(jsonb),public.routine_phase10j_json_has_secret(jsonb),
  public.routine_phase10j_require_manager(),public.routine_phase10j_shared_device_for_request(),public.routine_phase10j_validate_pin(text),
  public.routine_phase10j_device_guard(),public.routine_phase10j_operator_guard(),public.routine_phase10j_access_guard(),
  public.routine_phase10j_protected_row_guard(),public.routine_phase10j_immutable_guard(),public.routine_read_operator_session_header(),
  public.routine_parse_operator_session_token(text),public.routine_constant_time_equals(text,text),public.routine_operator_session_is_valid(uuid),
  public.routine_resolve_operator_session(),public.routine_operator_credential_is_fresh(uuid),public.routine_phase10j_existing_operation(uuid,uuid,uuid,text,uuid,text),
  public.routine_phase10j_record_operation(uuid,uuid,uuid,uuid,text,uuid,text,text,uuid,jsonb),
  public.routine_phase10j_record_event(uuid,uuid,uuid,uuid,text,uuid,uuid,text,jsonb,uuid),
  public.routine_phase10j_revoke_operator_sessions(uuid,uuid,text),public.routine_phase10j_session_payload(uuid),
  public.routine_phase10j_auth_failure(public.routine_shared_devices,uuid,uuid,boolean),public.routine_client_instance_guard(),
  public.routine_offline_receipt_guard(),public.routine_phase10j_event_actor_guard(),public.routine_run_participant_guard(),
  public.routine_bundle_participant_guard(),public.routine_phase10j_run_actor_projection(),public.routine_phase10j_task_actor_projection(),
  public.routine_phase10j_item_actor_projection(),public.routine_phase10j_verification_actor_projection(),
  public.routine_phase10j_delivery_actor_projection(),public.routine_phase10j_event_transfer_actor_projection(),
  public.routine_resolve_effective_actor(),public.routine_operator_credential_is_fresh(uuid),
  public.routine_require_fresh_operator_credential(text,uuid),public.routine_event_transfer_is_visible(uuid,uuid) from public,anon,authenticated;

revoke all on function public.complete_routine_task_phase10j_base(uuid,text,boolean,bigint,uuid),
  public.verify_routine_task_phase10j_base(uuid,text,text,boolean,bigint,uuid),
  public.complete_routine_run_verification_phase10j_base(uuid,text,jsonb,text,text,bigint,uuid),
  public.finish_routine_run_phase10j_base(uuid,bigint,uuid),public.apply_routine_offline_task_bundle_phase10j_base(uuid,uuid,jsonb,text),
  public.apply_routine_offline_run_finish_intent_phase10j_base(uuid,uuid,uuid,bigint,timestamptz,text),
  public.preview_routine_run_delivery_phase10j_base(uuid),
  public.complete_routine_event_transfer_phase10j_base(uuid,text,jsonb,boolean,boolean,text,bigint,uuid) from public,anon,authenticated;

revoke all on function public.register_routine_shared_device(uuid,text,text,jsonb,uuid),
  public.update_routine_shared_device(uuid,text,jsonb,bigint,uuid),public.set_routine_shared_device_active(uuid,boolean,text,bigint,uuid),
  public.create_routine_operator(text,text,uuid,text,text,timestamptz,timestamptz,text,uuid),
  public.update_routine_operator(uuid,text,text,timestamptz,timestamptz,bigint,uuid),public.set_routine_operator_active(uuid,boolean,text,bigint,uuid),
  public.rotate_routine_operator_pin(uuid,text,text,bigint,uuid),public.revoke_routine_operator_credential(uuid,text,uuid),
  public.replace_routine_shared_device_operator_access(uuid,jsonb,bigint,uuid),public.revoke_routine_operator_session(uuid,text,bigint,uuid),
  public.get_routine_operator_admin_workspace(),public.list_available_routine_operators(uuid),
  public.authenticate_routine_operator(uuid,uuid,uuid,text,text,uuid),public.get_current_routine_operator_session(),
  public.touch_routine_operator_session(),public.reauthenticate_routine_operator_session(text,uuid),public.end_routine_operator_session(text,uuid),
  public.get_routine_shared_device_context(),public.get_routine_operator_session_context(),
  public.get_routine_operator_security_history(date,date,uuid,uuid) from public,anon;
grant execute on function public.register_routine_shared_device(uuid,text,text,jsonb,uuid),
  public.update_routine_shared_device(uuid,text,jsonb,bigint,uuid),public.set_routine_shared_device_active(uuid,boolean,text,bigint,uuid),
  public.create_routine_operator(text,text,uuid,text,text,timestamptz,timestamptz,text,uuid),
  public.update_routine_operator(uuid,text,text,timestamptz,timestamptz,bigint,uuid),public.set_routine_operator_active(uuid,boolean,text,bigint,uuid),
  public.rotate_routine_operator_pin(uuid,text,text,bigint,uuid),public.revoke_routine_operator_credential(uuid,text,uuid),
  public.replace_routine_shared_device_operator_access(uuid,jsonb,bigint,uuid),public.revoke_routine_operator_session(uuid,text,bigint,uuid),
  public.get_routine_operator_admin_workspace(),public.list_available_routine_operators(uuid),
  public.authenticate_routine_operator(uuid,uuid,uuid,text,text,uuid),public.get_current_routine_operator_session(),
  public.touch_routine_operator_session(),public.reauthenticate_routine_operator_session(text,uuid),public.end_routine_operator_session(text,uuid),
  public.get_routine_shared_device_context(),public.get_routine_operator_session_context(),
  public.get_routine_operator_security_history(date,date,uuid,uuid) to authenticated;

revoke all on function public.complete_routine_task(uuid,text,boolean,bigint,uuid),public.verify_routine_task(uuid,text,text,boolean,bigint,uuid),
  public.complete_routine_run_verification(uuid,text,jsonb,text,text,bigint,uuid),public.finish_routine_run(uuid,bigint,uuid),
  public.apply_routine_offline_task_bundle(uuid,uuid,jsonb,text),public.apply_routine_offline_run_finish_intent(uuid,uuid,uuid,bigint,timestamptz,text),
  public.preview_routine_run_delivery(uuid),public.complete_routine_event_transfer(uuid,text,jsonb,boolean,boolean,text,bigint,uuid) from public,anon;
grant execute on function public.complete_routine_task(uuid,text,boolean,bigint,uuid),public.verify_routine_task(uuid,text,text,boolean,bigint,uuid),
  public.complete_routine_run_verification(uuid,text,jsonb,text,text,bigint,uuid),public.finish_routine_run(uuid,bigint,uuid),
  public.apply_routine_offline_task_bundle(uuid,uuid,jsonb,text),public.apply_routine_offline_run_finish_intent(uuid,uuid,uuid,bigint,timestamptz,text),
  public.preview_routine_run_delivery(uuid),public.complete_routine_event_transfer(uuid,text,jsonb,boolean,boolean,text,bigint,uuid) to authenticated;

-- These canonical hash helpers are owner-chain implementation details, not Data API entry points.
revoke all on function public.routine_delivery_item_canonical_json(uuid),
  public.routine_delivery_record_canonical_json(uuid),public.routine_current_authenticated_profile_id(),
  public.routine_current_effective_profile_id(),public.routine_current_effective_operator_id(),
  public.routine_current_shared_device_id(),public.routine_current_operator_session_id(),
  public.routine_current_actor_source(),public.routine_current_actor_display_name()
  from public,anon,authenticated;
grant execute on function public.routine_current_authenticated_profile_id(),
  public.routine_current_effective_profile_id(),public.routine_current_effective_operator_id(),
  public.routine_current_shared_device_id(),public.routine_current_operator_session_id(),
  public.routine_current_actor_source(),public.routine_current_actor_display_name() to authenticated;

notify pgrst,'reload schema';
