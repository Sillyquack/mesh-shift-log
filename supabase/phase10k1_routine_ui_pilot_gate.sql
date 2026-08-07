-- Phase 10K1: server-enforced Routine Engine UI release gate.
--
-- Additive only. This migration does not activate pilot/production mode, seed
-- routine content, or modify any legacy, Inventory, Asset, Event Operations,
-- Storage, or Auth data.

alter table public.routine_organization_settings
  add column if not exists ui_release_stage text not null default 'foundation';
alter table public.routine_organization_settings
  add column if not exists ui_contract_version text not null default 'phase10k1-v1';

do $phase10k1$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'routine_organization_settings_ui_release_stage_check'
      and conrelid = 'public.routine_organization_settings'::regclass
  ) then
    alter table public.routine_organization_settings
      add constraint routine_organization_settings_ui_release_stage_check
      check (ui_release_stage in ('foundation','manager_preview','staff_preview','pilot_ready','production_ready'));
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'routine_organization_settings_ui_contract_check'
      and conrelid = 'public.routine_organization_settings'::regclass
  ) then
    alter table public.routine_organization_settings
      add constraint routine_organization_settings_ui_contract_check
      check (ui_contract_version = trim(ui_contract_version) and nullif(ui_contract_version,'') is not null);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'user_profiles_id_org_unique'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_id_org_unique unique (id,organization_id);
  end if;
end;
$phase10k1$;

create table if not exists public.routine_pilot_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  identity_type text not null,
  user_profile_id uuid,
  operator_id uuid,
  access_level text not null default 'preview',
  active boolean not null default true,
  valid_from timestamptz,
  valid_until timestamptz,
  note text,
  revision bigint not null default 1,
  creation_idempotency_key uuid not null,
  creation_request_hash text not null,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid not null references auth.users(id),
  constraint routine_pilot_memberships_profile_fkey
    foreign key (user_profile_id,organization_id) references public.user_profiles(id,organization_id),
  constraint routine_pilot_memberships_operator_fkey
    foreign key (operator_id,organization_id) references public.routine_operators(id,organization_id),
  constraint routine_pilot_memberships_identity_type_check
    check (identity_type in ('personal_profile','shared_device_operator')),
  constraint routine_pilot_memberships_identity_shape_check check (
    (identity_type='personal_profile' and user_profile_id is not null and operator_id is null)
    or (identity_type='shared_device_operator' and operator_id is not null and user_profile_id is null)
  ),
  constraint routine_pilot_memberships_access_level_check
    check (access_level in ('preview','participant','coordinator')),
  constraint routine_pilot_memberships_validity_check
    check (valid_until is null or valid_from is null or valid_until>valid_from),
  constraint routine_pilot_memberships_note_check
    check (note is null or char_length(trim(note)) between 1 and 1000),
  constraint routine_pilot_memberships_revision_check check (revision>0),
  constraint routine_pilot_memberships_hash_check check (creation_request_hash~'^[0-9a-f]{64}$'),
  constraint routine_pilot_memberships_org_idempotency_unique
    unique (organization_id,creation_idempotency_key),
  constraint routine_pilot_memberships_id_org_unique unique (id,organization_id)
);

create unique index if not exists routine_pilot_memberships_profile_identity_unique
  on public.routine_pilot_memberships(organization_id,user_profile_id)
  where identity_type='personal_profile';
create unique index if not exists routine_pilot_memberships_operator_identity_unique
  on public.routine_pilot_memberships(organization_id,operator_id)
  where identity_type='shared_device_operator';
create index if not exists routine_pilot_memberships_org_active_idx
  on public.routine_pilot_memberships(organization_id,active,valid_until);

create table if not exists public.routine_ui_operations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  actor_auth_user_id uuid not null references auth.users(id),
  effective_operator_id uuid references public.routine_operators(id),
  operator_session_id uuid references public.routine_operator_sessions(id),
  actor_source text not null,
  operation_type text not null,
  idempotency_key uuid not null,
  request_hash text not null,
  resource_type text not null,
  resource_id uuid,
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint routine_ui_operations_actor_source_check
    check (actor_source in ('personal_auth','shared_device_operator')),
  constraint routine_ui_operations_type_check
    check (operation_type in ('set_engine_mode','replace_pilot_memberships')),
  constraint routine_ui_operations_resource_check
    check (resource_type in ('organization_settings','pilot_memberships')),
  constraint routine_ui_operations_hash_check check (request_hash~'^[0-9a-f]{64}$'),
  constraint routine_ui_operations_payload_check
    check (jsonb_typeof(response_payload)='object' and pg_column_size(response_payload)<=131072)
);

create unique index if not exists routine_ui_operations_replay_unique
  on public.routine_ui_operations(
    organization_id,actor_auth_user_id,coalesce(effective_operator_id,'00000000-0000-0000-0000-000000000000'::uuid),operation_type,idempotency_key
  );
create index if not exists routine_ui_operations_org_history_idx
  on public.routine_ui_operations(organization_id,created_at desc,id desc);

create or replace function public.routine_phase10k1_settings_guard()
returns trigger language plpgsql set search_path=pg_catalog
as $$
begin
  if tg_op='DELETE' then
    raise exception using errcode='42501',message='Routine UI settings cannot be deleted.';
  end if;
  if tg_op='INSERT' and new.mode<>'legacy'
      and coalesce(current_setting('mesh.routine_ui_internal',true),'')<>'mode' then
    raise exception using errcode='42501',message='Use set_routine_engine_mode for mode changes.';
  end if;
  if tg_op='UPDATE' then
    if new.mode is distinct from old.mode
        and coalesce(current_setting('mesh.routine_ui_internal',true),'')<>'mode' then
      raise exception using errcode='42501',message='Use set_routine_engine_mode for mode changes.';
    end if;
    if (new.ui_release_stage is distinct from old.ui_release_stage
        or new.ui_contract_version is distinct from old.ui_contract_version)
        and coalesce(current_setting('mesh.routine_ui_release_internal',true),'')<>'release' then
      raise exception using errcode='42501',message='Routine UI release state is deployment-controlled.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists routine_phase10k1_settings_guard_trigger on public.routine_organization_settings;
create trigger routine_phase10k1_settings_guard_trigger
before insert or update or delete on public.routine_organization_settings
for each row execute function public.routine_phase10k1_settings_guard();

create or replace function public.routine_phase10k1_membership_guard()
returns trigger language plpgsql set search_path=pg_catalog
as $$
begin
  if coalesce(current_setting('mesh.routine_ui_internal',true),'')<>'membership' then
    raise exception using errcode='42501',message='Pilot memberships may only be changed through manager RPCs.';
  end if;
  if tg_op='DELETE' then
    raise exception using errcode='42501',message='Pilot memberships are deactivated, never deleted.';
  end if;
  if tg_op='UPDATE' and (new.organization_id,new.identity_type,new.user_profile_id,new.operator_id,new.created_at,new.created_by_auth_user_id)
      is distinct from (old.organization_id,old.identity_type,old.user_profile_id,old.operator_id,old.created_at,old.created_by_auth_user_id) then
    raise exception using errcode='42501',message='Pilot membership identity and creation audit are immutable.';
  end if;
  return new;
end $$;

drop trigger if exists routine_phase10k1_membership_guard_trigger on public.routine_pilot_memberships;
create trigger routine_phase10k1_membership_guard_trigger
before insert or update or delete on public.routine_pilot_memberships
for each row execute function public.routine_phase10k1_membership_guard();

create or replace function public.routine_phase10k1_operation_guard()
returns trigger language plpgsql set search_path=pg_catalog
as $$
begin
  if tg_op<>'INSERT' then
    raise exception using errcode='42501',message='Routine UI operations are immutable.';
  end if;
  if coalesce(current_setting('mesh.routine_ui_internal',true),'')<>'operation' then
    raise exception using errcode='42501',message='Routine UI operations may only be written by authoritative RPCs.';
  end if;
  if public.routine_phase10j_json_has_secret(new.response_payload) then
    raise exception using errcode='22023',message='Routine UI operation payload contains forbidden credential material.';
  end if;
  return new;
end $$;

drop trigger if exists routine_phase10k1_operation_guard_trigger on public.routine_ui_operations;
create trigger routine_phase10k1_operation_guard_trigger
before insert or update or delete on public.routine_ui_operations
for each row execute function public.routine_phase10k1_operation_guard();

create or replace function public.routine_phase10k1_require_personal_manager()
returns public.user_profiles language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_profile public.user_profiles%rowtype;
begin
  select profile.* into v_profile from public.user_profiles profile
  where profile.id=(select auth.uid()) and profile.active and profile.organization_id is not null
    and not coalesce(profile.is_shared_device,false) and profile.role='manager';
  if v_profile.id is null then
    raise exception using errcode='42501',message='Personal manager access is required.';
  end if;
  return v_profile;
end $$;

create or replace function public.routine_get_ui_release_state(input_organization_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  select jsonb_build_object(
    'mode',coalesce(settings.mode,'legacy'),
    'uiReleaseStage',coalesce(settings.ui_release_stage,'foundation'),
    'contractVersion',coalesce(settings.ui_contract_version,'phase10k1-v1'),
    'revision',coalesce(settings.revision,0),
    'timezone',coalesce(settings.timezone,'Europe/Oslo'),
    'operationalDayCutoff',coalesce(settings.operational_day_cutoff,'04:00'::time)::text,
    'sharedDeviceEnabled',coalesce(settings.shared_device_enabled,false)
  )
  from (select 1) singleton
  left join public.routine_organization_settings settings on settings.organization_id=input_organization_id;
$$;

create or replace function public.routine_current_pilot_membership()
returns public.routine_pilot_memberships language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor record; v_membership public.routine_pilot_memberships%rowtype; v_now timestamptz:=clock_timestamp();
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  select membership.* into v_membership from public.routine_pilot_memberships membership
  where membership.organization_id=v_actor.organization_id and membership.active
    and (membership.valid_from is null or membership.valid_from<=v_now)
    and (membership.valid_until is null or membership.valid_until>v_now)
    and ((v_actor.actor_source='personal_auth' and membership.identity_type='personal_profile'
          and membership.user_profile_id=v_actor.actor_profile_id)
      or (v_actor.actor_source='shared_device_operator' and membership.identity_type='shared_device_operator'
          and membership.operator_id=v_actor.effective_operator_id))
  limit 1;
  return v_membership;
exception when others then return null;
end $$;

create or replace function public.routine_current_user_access_summary()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare
  v_profile public.user_profiles%rowtype;
  v_linked_profile public.user_profiles%rowtype;
  v_device public.routine_shared_devices%rowtype;
  v_session public.routine_operator_sessions%rowtype;
  v_actor record;
  v_membership public.routine_pilot_memberships%rowtype;
  v_settings public.routine_organization_settings%rowtype;
  v_mode text:='legacy'; v_stage text:='foundation'; v_contract text:='phase10k1-v1';
  v_is_manager boolean:=false; v_has_actor boolean:=false; v_preview boolean:=false; v_operational boolean:=false;
  v_manager_preview boolean:=false; v_base_tasks boolean:=false; v_base_coordinate boolean:=false;
  v_access text; v_access_state text:='hidden'; v_reason text:='routine_ui_legacy'; v_actor_caps jsonb:='{}'::jsonb;
begin
  select profile.* into v_profile from public.user_profiles profile
  where profile.id=(select auth.uid()) and profile.active and profile.organization_id is not null;
  if v_profile.id is null then
    return jsonb_build_object('accessState','hidden','accessReasonCode','auth_required','previewAllowed',false,
      'operationalAllowed',false,'managerPreviewAllowed',false,'contractVersion',v_contract,'mode',v_mode,'uiReleaseStage',v_stage,'settingsRevision',0);
  end if;
  select settings.* into v_settings from public.routine_organization_settings settings
    where settings.organization_id=v_profile.organization_id;
  if v_settings.organization_id is not null then
    v_mode:=v_settings.mode; v_stage:=v_settings.ui_release_stage; v_contract:=v_settings.ui_contract_version;
  end if;
  v_is_manager:=not coalesce(v_profile.is_shared_device,false) and v_profile.role='manager';
  begin select * into v_actor from public.routine_resolve_effective_actor(); v_has_actor:=true; exception when others then v_has_actor:=false; end;
  if coalesce(v_profile.is_shared_device,false) and not v_has_actor then
    select device.* into v_device from public.routine_shared_devices device
    where device.user_profile_id=v_profile.id and device.organization_id=v_profile.organization_id and device.active;
    if v_mode<>'legacy' and v_device.id is not null and coalesce(v_settings.shared_device_enabled,false) then
      v_access_state:='operator_required'; v_reason:='routine_operator_required';
    end if;
    return jsonb_build_object('accessState',v_access_state,'accessReasonCode',v_reason,'previewAllowed',false,
      'operationalAllowed',false,'managerPreviewAllowed',false,'contractVersion',v_contract,'mode',v_mode,'uiReleaseStage',v_stage,
      'settingsRevision',coalesce(v_settings.revision,0),
      'organizationId',v_profile.organization_id,'identity',jsonb_build_object('actorSource','shared_device','kind','shared',
        'displayName',v_profile.display_name,'role',v_profile.role,'device',case when v_device.id is null then null else
          jsonb_build_object('id',v_device.id,'label',v_device.label,'active',v_device.active) end));
  end if;
  if not v_has_actor then
    return jsonb_build_object('accessState','hidden','accessReasonCode','routine_identity_unavailable','previewAllowed',false,
      'operationalAllowed',false,'managerPreviewAllowed',false,'contractVersion',v_contract,'mode',v_mode,'uiReleaseStage',v_stage,
      'settingsRevision',coalesce(v_settings.revision,0));
  end if;
  v_actor_caps:=coalesce(v_actor.capabilities,'{}'::jsonb);
  if v_actor.actor_profile_id is not null then
    select profile.* into v_linked_profile from public.user_profiles profile
    where profile.id=v_actor.actor_profile_id and profile.organization_id=v_actor.organization_id;
  end if;
  if v_actor.shared_device_id is not null then
    select device.* into v_device from public.routine_shared_devices device
    where device.id=v_actor.shared_device_id and device.organization_id=v_actor.organization_id;
  end if;
  if v_actor.operator_session_id is not null then
    select session.* into v_session from public.routine_operator_sessions session
    where session.id=v_actor.operator_session_id and session.organization_id=v_actor.organization_id;
  end if;
  select * into v_membership from public.routine_current_pilot_membership();
  v_access:=v_membership.access_level;
  v_base_tasks:=case when v_actor.actor_source='personal_auth' then v_actor.actor_role in('manager','shift_lead','staff')
    else coalesce((v_actor_caps->>'taskActions')::boolean,false) end;
  v_base_coordinate:=case when v_actor.actor_source='personal_auth' then v_actor.actor_role in('manager','shift_lead')
    else v_actor.actor_profile_id is not null and coalesce((v_actor_caps->>'runCoordination')::boolean,false) end;
  v_preview:=case
    when v_mode='shadow' then v_is_manager or v_membership.id is not null
    when v_mode='pilot' and v_stage in('pilot_ready','production_ready') then v_is_manager or v_membership.id is not null
    when v_mode='active' and v_stage='production_ready' then v_actor.actor_source='personal_auth' or v_membership.id is not null
    else false end;
  v_manager_preview:=v_preview and v_is_manager;
  v_operational:=case
    when v_mode='pilot' and v_stage in('pilot_ready','production_ready') then
      (v_is_manager or (v_membership.id is not null and v_access in('participant','coordinator'))) and v_base_tasks
    when v_mode='active' and v_stage='production_ready' then v_base_tasks
    else false end;
  if v_preview then
    v_access_state:=case when v_operational then 'operational' when v_manager_preview then 'manager_preview' else 'read_only_preview' end;
    v_reason:=case when v_operational then 'routine_ui_operational_allowed' else 'routine_ui_preview_only' end;
  elsif v_mode='legacy' then v_reason:='routine_ui_legacy';
  elsif v_mode='pilot' then v_reason:='routine_ui_not_pilot_ready';
  elsif v_mode='active' then v_reason:='routine_ui_not_production_ready';
  else v_access_state:='not_authorized'; v_reason:='routine_ui_membership_required'; end if;
  return jsonb_build_object(
    'organizationId',v_actor.organization_id,'contractVersion',v_contract,'mode',v_mode,'uiReleaseStage',v_stage,
    'settingsRevision',coalesce(v_settings.revision,0),
    'accessState',v_access_state,'accessReasonCode',v_reason,'previewAllowed',v_preview,'operationalAllowed',v_operational,
    'managerPreviewAllowed',v_manager_preview,'membership',case when v_membership.id is null then null else
      jsonb_build_object('id',v_membership.id,'identityType',v_membership.identity_type,'accessLevel',v_membership.access_level,
        'validFrom',v_membership.valid_from,'validUntil',v_membership.valid_until,'revision',v_membership.revision) end,
    'identity',jsonb_build_object('actorSource',v_actor.actor_source,'kind',case when v_actor.actor_source='personal_auth' then 'personal' else 'shared' end,
      'displayName',v_actor.actor_display_name,'role',v_actor.actor_role,'effectiveOperatorId',v_actor.effective_operator_id,
      'linkedProfile',case when v_linked_profile.id is null then null else jsonb_build_object('id',v_linked_profile.id,
        'displayName',v_linked_profile.display_name,'role',v_linked_profile.role,'active',v_linked_profile.active) end,
      'device',case when v_device.id is null then null else jsonb_build_object('id',v_device.id,'label',v_device.label,'active',v_device.active) end,
      'session',case when v_session.id is null then null else jsonb_build_object('id',v_session.id,'status',v_session.status,
        'expiresAt',v_session.expires_at,'idleExpiresAt',v_session.idle_expires_at,
        'lastCredentialVerifiedAt',v_session.last_credential_verified_at,
        'credentialFresh',public.routine_operator_credential_is_fresh(v_session.id)) end),
    'capabilities',jsonb_build_object(
      'manageConfiguration',v_manager_preview,'manageTemplates',v_manager_preview,'manageReferences',v_manager_preview,'manageOperators',v_manager_preview,
      'coordinateRuns',v_operational and v_base_coordinate and (v_is_manager or v_access='coordinator' or v_mode='active'),
      'performTasks',v_operational and v_base_tasks,
      'eventTransferActions',v_operational and case when v_actor.actor_source='personal_auth' then v_actor.actor_role in('manager','shift_lead')
        else coalesce((v_actor_caps->>'eventTransferActions')::boolean,false) end,
      'offlineNonCritical',v_operational and coalesce((v_actor_caps->>'offlineNoncritical')::boolean,v_actor.actor_source='personal_auth')));
end $$;

create or replace function public.routine_current_user_can_preview_engine()
returns boolean language sql stable security definer set search_path=pg_catalog
as $$ select coalesce((public.routine_current_user_access_summary()->>'previewAllowed')::boolean,false) $$;
create or replace function public.routine_current_user_can_use_operational_engine()
returns boolean language sql stable security definer set search_path=pg_catalog
as $$ select coalesce((public.routine_current_user_access_summary()->>'operationalAllowed')::boolean,false) $$;
create or replace function public.routine_current_user_can_access_manager_preview()
returns boolean language sql stable security definer set search_path=pg_catalog
as $$ select coalesce((public.routine_current_user_access_summary()->>'managerPreviewAllowed')::boolean,false) $$;

-- Existing permission entry points become server-gated. Configuration remains
-- personal-manager-only and is available in shadow; operational work never is.
create or replace function public.routine_current_user_can_manage_templates()
returns boolean language sql stable security definer set search_path=pg_catalog
as $$ select coalesce((public.routine_current_user_access_summary()->'capabilities'->>'manageTemplates')::boolean,false) $$;
create or replace function public.routine_current_user_can_coordinate_runs()
returns boolean language sql stable security definer set search_path=pg_catalog
as $$ select coalesce((public.routine_current_user_access_summary()->'capabilities'->>'coordinateRuns')::boolean,false) $$;
create or replace function public.routine_current_user_can_perform_tasks()
returns boolean language sql stable security definer set search_path=pg_catalog
as $$ select coalesce((public.routine_current_user_access_summary()->'capabilities'->>'performTasks')::boolean,false) $$;

create or replace function public.routine_run_is_visible(input_run_id uuid,input_organization_id uuid)
returns boolean language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor record; v_access jsonb:=public.routine_current_user_access_summary();
begin
  if not coalesce((v_access->>'previewAllowed')::boolean,false) then return false; end if;
  select * into v_actor from public.routine_resolve_effective_actor();
  return input_organization_id=v_actor.organization_id
    and exists(select 1 from public.routine_runs run where run.id=input_run_id and run.organization_id=input_organization_id and run.snapshot_state='ready')
    and (coalesce((v_access->>'managerPreviewAllowed')::boolean,false) or exists(
      select 1 from public.routine_run_participants participant where participant.run_id=input_run_id
        and participant.organization_id=input_organization_id and participant.participation_status<>'removed'
        and ((v_actor.actor_source='personal_auth' and participant.identity_type='personal_profile' and participant.user_profile_id=v_actor.actor_profile_id)
          or (v_actor.actor_source='shared_device_operator' and participant.identity_type='shared_device_operator'
            and participant.operator_id=v_actor.effective_operator_id))));
exception when others then return false;
end $$;

create or replace function public.routine_bundle_is_visible(input_bundle_id uuid,input_organization_id uuid)
returns boolean language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor record; v_access jsonb:=public.routine_current_user_access_summary();
begin
  if not coalesce((v_access->>'previewAllowed')::boolean,false) then return false; end if;
  select * into v_actor from public.routine_resolve_effective_actor();
  return input_organization_id=v_actor.organization_id and (
    coalesce((v_access->>'managerPreviewAllowed')::boolean,false)
    or exists(select 1 from public.routine_bundle_participants participant where participant.bundle_id=input_bundle_id
      and participant.organization_id=input_organization_id and participant.status<>'removed'
      and ((v_actor.actor_source='personal_auth' and participant.identity_type='personal_profile' and participant.user_profile_id=v_actor.actor_profile_id)
        or (v_actor.actor_source='shared_device_operator' and participant.identity_type='shared_device_operator'
          and participant.operator_id=v_actor.effective_operator_id)))
    or exists(select 1 from public.routine_bundle_runs link join public.routine_run_participants participant
      on participant.run_id=link.run_id and participant.organization_id=link.organization_id
      where link.bundle_id=input_bundle_id and link.organization_id=input_organization_id and participant.participation_status<>'removed'
      and ((v_actor.actor_source='personal_auth' and participant.identity_type='personal_profile' and participant.user_profile_id=v_actor.actor_profile_id)
        or (v_actor.actor_source='shared_device_operator' and participant.identity_type='shared_device_operator'
          and participant.operator_id=v_actor.effective_operator_id))));
exception when others then return false;
end $$;

create or replace function public.routine_phase10j_require_manager()
returns public.user_profiles language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_profile public.user_profiles%rowtype:=public.routine_phase10k1_require_personal_manager();
begin
  if not public.routine_current_user_can_access_manager_preview() then
    raise exception using errcode='42501',message='Routine manager preview access is required.';
  end if;
  return v_profile;
end $$;

create or replace function public.routine_phase10k1_existing_operation(
  input_organization_id uuid,input_actor_auth_user_id uuid,input_operation_type text,input_idempotency_key uuid,input_request_hash text
)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_operation public.routine_ui_operations%rowtype;
begin
  select operation.* into v_operation from public.routine_ui_operations operation
  where operation.organization_id=input_organization_id and operation.actor_auth_user_id=input_actor_auth_user_id
    and operation.effective_operator_id is null and operation.operation_type=input_operation_type
    and operation.idempotency_key=input_idempotency_key;
  if v_operation.id is null then return null; end if;
  if v_operation.request_hash<>input_request_hash then
    raise exception using errcode='23505',message='Idempotency key was already used with a different UI request.';
  end if;
  return v_operation.response_payload||jsonb_build_object('idempotentReplay',true);
end $$;

create or replace function public.routine_phase10k1_record_operation(
  input_organization_id uuid,input_actor_auth_user_id uuid,input_operation_type text,input_idempotency_key uuid,
  input_request_hash text,input_resource_type text,input_resource_id uuid,input_response jsonb
)
returns uuid language plpgsql security definer set search_path=pg_catalog
as $$
declare v_id uuid;
begin
  perform set_config('mesh.routine_ui_internal','operation',true);
  insert into public.routine_ui_operations(organization_id,actor_auth_user_id,actor_source,operation_type,idempotency_key,
    request_hash,resource_type,resource_id,response_payload)
  values(input_organization_id,input_actor_auth_user_id,'personal_auth',input_operation_type,input_idempotency_key,
    input_request_hash,input_resource_type,input_resource_id,input_response)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.set_routine_engine_mode(
  input_mode text,input_expected_revision bigint,input_reason text,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10k1_require_personal_manager();
  v_settings public.routine_organization_settings%rowtype; v_hash text; v_replay jsonb; v_response jsonb; v_operation uuid;
  v_reason text:=trim(coalesce(input_reason,''));
begin
  if input_idempotency_key is null or input_expected_revision is null or char_length(v_reason) not between 3 and 1000 then
    raise exception using errcode='22023',message='Mode, expected revision, reason, and idempotency key are required.';
  end if;
  if input_mode='pilot' then raise exception using errcode='42501',message='routine_ui_not_pilot_ready'; end if;
  if input_mode='active' then raise exception using errcode='42501',message='routine_ui_not_production_ready'; end if;
  if input_mode not in('legacy','shadow') then raise exception using errcode='22023',message='Invalid Routine Engine mode.'; end if;
  v_hash:=public.routine_phase10j_request_hash(jsonb_build_object('mode',input_mode,'expectedRevision',input_expected_revision,'reason',v_reason));
  v_replay:=public.routine_phase10k1_existing_operation(v_actor.organization_id,v_actor.id,'set_engine_mode',input_idempotency_key,v_hash);
  if v_replay is not null then return v_replay; end if;
  select settings.* into v_settings from public.routine_organization_settings settings
    where settings.organization_id=v_actor.organization_id for update;
  if v_settings.organization_id is null then
    if input_expected_revision<>0 then raise exception using errcode='40001',message='Routine settings revision conflict.'; end if;
    perform set_config('mesh.routine_ui_internal','mode',true);
    insert into public.routine_organization_settings(organization_id,mode,created_by_auth_user_id,updated_by_auth_user_id)
      values(v_actor.organization_id,input_mode,v_actor.id,v_actor.id) returning * into v_settings;
  else
    if v_settings.revision<>input_expected_revision then raise exception using errcode='40001',message='Routine settings revision conflict.'; end if;
    perform set_config('mesh.routine_ui_internal','mode',true);
    update public.routine_organization_settings set mode=input_mode,revision=revision+1,updated_at=clock_timestamp(),updated_by_auth_user_id=v_actor.id
      where organization_id=v_actor.organization_id returning * into v_settings;
  end if;
  v_response:=jsonb_build_object('settings',jsonb_build_object('mode',v_settings.mode,'uiReleaseStage',v_settings.ui_release_stage,
    'contractVersion',v_settings.ui_contract_version,'revision',v_settings.revision),'reason',v_reason,'idempotentReplay',false);
  v_operation:=public.routine_phase10k1_record_operation(v_actor.organization_id,v_actor.id,'set_engine_mode',input_idempotency_key,
    v_hash,'organization_settings',v_actor.organization_id,v_response);
  perform set_config('mesh.routine_operator_internal','ui',true);
  perform public.routine_phase10j_record_event(v_actor.organization_id,null,null,null,'routine_engine_mode_changed',v_actor.id,v_actor.id,
    v_actor.display_name,jsonb_build_object('mode',v_settings.mode,'reason',v_reason,'revision',v_settings.revision),null);
  return v_response;
end $$;

create or replace function public.replace_routine_pilot_memberships(
  input_entries jsonb,input_expected_settings_revision bigint,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10k1_require_personal_manager();
  v_settings public.routine_organization_settings%rowtype; v_entry jsonb; v_identity_type text; v_access text;
  v_profile public.user_profiles%rowtype; v_operator public.routine_operators%rowtype; v_valid_from timestamptz; v_valid_until timestamptz;
  v_canonical jsonb; v_hash text; v_replay jsonb; v_response jsonb; v_operation uuid; v_now timestamptz:=clock_timestamp();
  v_seen text[]:='{}'::text[]; v_key text;
begin
  if input_idempotency_key is null or input_expected_settings_revision is null or jsonb_typeof(input_entries)<>'array'
      or jsonb_array_length(input_entries)>500 then
    raise exception using errcode='22023',message='A bounded membership array, expected revision, and idempotency key are required.';
  end if;
  select coalesce(jsonb_agg(entry order by entry->>'identityType',coalesce(entry->>'userProfileId',entry->>'operatorId')),'[]'::jsonb)
    into v_canonical from jsonb_array_elements(input_entries) entry;
  v_hash:=public.routine_phase10j_request_hash(jsonb_build_object('entries',v_canonical,'expectedRevision',input_expected_settings_revision));
  v_replay:=public.routine_phase10k1_existing_operation(v_actor.organization_id,v_actor.id,'replace_pilot_memberships',input_idempotency_key,v_hash);
  if v_replay is not null then return v_replay; end if;
  select settings.* into v_settings from public.routine_organization_settings settings
    where settings.organization_id=v_actor.organization_id for update;
  if v_settings.organization_id is null or v_settings.revision<>input_expected_settings_revision then
    raise exception using errcode='40001',message='Routine settings revision conflict.';
  end if;
  if v_settings.mode<>'shadow' then raise exception using errcode='42501',message='Routine pilot membership management requires shadow mode.'; end if;
  perform set_config('mesh.routine_ui_internal','membership',true);
  for v_entry in select value from jsonb_array_elements(v_canonical) loop
    v_identity_type:=v_entry->>'identityType'; v_access:=coalesce(v_entry->>'accessLevel','preview');
    v_valid_from:=nullif(v_entry->>'validFrom','')::timestamptz; v_valid_until:=nullif(v_entry->>'validUntil','')::timestamptz;
    if v_identity_type not in('personal_profile','shared_device_operator') or v_access not in('preview','participant','coordinator')
        or (v_valid_until is not null and v_valid_from is not null and v_valid_until<=v_valid_from) then
      raise exception using errcode='22023',message='Invalid pilot membership entry.';
    end if;
    if v_identity_type='personal_profile' then
      v_key:='personal_profile:'||coalesce(v_entry->>'userProfileId','');
      select profile.* into v_profile from public.user_profiles profile where profile.id=(v_entry->>'userProfileId')::uuid
        and profile.organization_id=v_actor.organization_id and profile.active and not coalesce(profile.is_shared_device,false)
        and profile.role in('shift_lead','staff');
      if v_profile.id is null or (v_access='coordinator' and v_profile.role<>'shift_lead') then
        raise exception using errcode='42501',message='Pilot profile is inactive, cross-organization, shared-device, manager, counter, or over-privileged.';
      end if;
      if v_key=any(v_seen) then raise exception using errcode='23505',message='Duplicate pilot identity.'; end if;
      v_seen:=array_append(v_seen,v_key);
      insert into public.routine_pilot_memberships(organization_id,identity_type,user_profile_id,access_level,active,valid_from,valid_until,note,
        creation_idempotency_key,creation_request_hash,created_by_auth_user_id,updated_by_auth_user_id)
      values(v_actor.organization_id,v_identity_type,v_profile.id,v_access,coalesce((v_entry->>'active')::boolean,true),v_valid_from,v_valid_until,
        nullif(trim(v_entry->>'note'),''),gen_random_uuid(),public.routine_phase10j_request_hash(v_entry),v_actor.id,v_actor.id)
      on conflict (organization_id,user_profile_id) where identity_type='personal_profile' do update set access_level=excluded.access_level,
        active=excluded.active,valid_from=excluded.valid_from,valid_until=excluded.valid_until,note=excluded.note,
        revision=routine_pilot_memberships.revision+1,updated_at=v_now,updated_by_auth_user_id=v_actor.id;
    else
      v_key:='shared_device_operator:'||coalesce(v_entry->>'operatorId','');
      select operator.* into v_operator from public.routine_operators operator where operator.id=(v_entry->>'operatorId')::uuid
        and operator.organization_id=v_actor.organization_id and operator.active
        and (operator.valid_from is null or operator.valid_from<=v_now) and (operator.valid_until is null or operator.valid_until>v_now);
      if v_operator.id is null or (v_access='participant' and not exists(select 1 from public.routine_shared_device_operator_access access
          where access.operator_id=v_operator.id and access.active and access.allow_task_actions))
        or (v_access='coordinator' and not exists(select 1 from public.routine_shared_device_operator_access access
          where access.operator_id=v_operator.id and access.active and access.allow_run_coordination and v_operator.linked_user_profile_id is not null)) then
        raise exception using errcode='42501',message='Pilot operator is inactive, cross-organization, invalid, or over-privileged.';
      end if;
      if v_key=any(v_seen) then raise exception using errcode='23505',message='Duplicate pilot identity.'; end if;
      v_seen:=array_append(v_seen,v_key);
      insert into public.routine_pilot_memberships(organization_id,identity_type,operator_id,access_level,active,valid_from,valid_until,note,
        creation_idempotency_key,creation_request_hash,created_by_auth_user_id,updated_by_auth_user_id)
      values(v_actor.organization_id,v_identity_type,v_operator.id,v_access,coalesce((v_entry->>'active')::boolean,true),v_valid_from,v_valid_until,
        nullif(trim(v_entry->>'note'),''),gen_random_uuid(),public.routine_phase10j_request_hash(v_entry),v_actor.id,v_actor.id)
      on conflict (organization_id,operator_id) where identity_type='shared_device_operator' do update set access_level=excluded.access_level,
        active=excluded.active,valid_from=excluded.valid_from,valid_until=excluded.valid_until,note=excluded.note,
        revision=routine_pilot_memberships.revision+1,updated_at=v_now,updated_by_auth_user_id=v_actor.id;
    end if;
  end loop;
  update public.routine_pilot_memberships set active=false,revision=revision+1,updated_at=v_now,updated_by_auth_user_id=v_actor.id
  where organization_id=v_actor.organization_id and active and not (
    (identity_type='personal_profile' and ('personal_profile:'||user_profile_id::text)=any(v_seen))
    or (identity_type='shared_device_operator' and ('shared_device_operator:'||operator_id::text)=any(v_seen)));
  update public.routine_organization_settings set revision=revision+1,updated_at=v_now,updated_by_auth_user_id=v_actor.id
    where organization_id=v_actor.organization_id returning * into v_settings;
  v_response:=jsonb_build_object('settingsRevision',v_settings.revision,'memberships',
    (select coalesce(jsonb_agg(jsonb_build_object('id',membership.id,'identityType',membership.identity_type,
      'userProfileId',membership.user_profile_id,'operatorId',membership.operator_id,'accessLevel',membership.access_level,
      'active',membership.active,'validFrom',membership.valid_from,'validUntil',membership.valid_until,'note',membership.note,
      'revision',membership.revision) order by membership.identity_type,coalesce(membership.user_profile_id,membership.operator_id)),'[]'::jsonb)
      from public.routine_pilot_memberships membership where membership.organization_id=v_actor.organization_id),
    'idempotentReplay',false);
  v_operation:=public.routine_phase10k1_record_operation(v_actor.organization_id,v_actor.id,'replace_pilot_memberships',input_idempotency_key,
    v_hash,'pilot_memberships',v_actor.organization_id,v_response);
  perform set_config('mesh.routine_operator_internal','ui',true);
  perform public.routine_phase10j_record_event(v_actor.organization_id,null,null,null,'routine_pilot_memberships_replaced',v_actor.id,v_actor.id,
    v_actor.display_name,jsonb_build_object('settingsRevision',v_settings.revision,'membershipCount',jsonb_array_length(v_response->'memberships')),null);
  return v_response;
end $$;

create or replace function public.get_routine_pilot_admin_workspace()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10k1_require_personal_manager();
begin
  if not public.routine_current_user_can_access_manager_preview() then
    raise exception using errcode='42501',message='Routine manager preview access is required.';
  end if;
  return jsonb_build_object(
    'settings',public.routine_get_ui_release_state(v_actor.organization_id),
    'memberships',(select coalesce(jsonb_agg(jsonb_build_object('id',membership.id,'identityType',membership.identity_type,
      'userProfileId',membership.user_profile_id,'operatorId',membership.operator_id,'accessLevel',membership.access_level,
      'active',membership.active,'validFrom',membership.valid_from,'validUntil',membership.valid_until,'note',membership.note,
      'revision',membership.revision) order by membership.identity_type,coalesce(membership.user_profile_id,membership.operator_id)),'[]'::jsonb)
      from public.routine_pilot_memberships membership where membership.organization_id=v_actor.organization_id),
    'profiles',(select coalesce(jsonb_agg(jsonb_build_object('id',profile.id,'displayName',profile.display_name,'role',profile.role,'active',profile.active)
      order by profile.display_name),'[]'::jsonb) from public.user_profiles profile where profile.organization_id=v_actor.organization_id
      and profile.active and not coalesce(profile.is_shared_device,false) and profile.role in('shift_lead','staff')),
    'operators',(select coalesce(jsonb_agg(jsonb_build_object('id',operator.id,'displayName',operator.display_name,'role',operator.effective_role,
      'operatorType',operator.operator_type,'active',operator.active,'validUntil',operator.valid_until) order by operator.display_name),'[]'::jsonb)
      from public.routine_operators operator where operator.organization_id=v_actor.organization_id and operator.active));
end $$;

create or replace function public.get_routine_application_bootstrap()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_access jsonb:=public.routine_current_user_access_summary(); v_org uuid:=(v_access->>'organizationId')::uuid;
  v_settings public.routine_organization_settings%rowtype; v_now timestamptz:=clock_timestamp(); v_cutoff time:='04:00';
  v_preview boolean:=coalesce((v_access->>'previewAllowed')::boolean,false); v_manager boolean:=coalesce((v_access->>'managerPreviewAllowed')::boolean,false);
  v_published bigint:=0; v_drafts bigint:=0; v_runs bigint:=0; v_bundles bigint:=0; v_deviations bigint:=0;
begin
  if v_org is not null then select settings.* into v_settings from public.routine_organization_settings settings where settings.organization_id=v_org; end if;
  if v_settings.organization_id is not null then v_cutoff:=v_settings.operational_day_cutoff; end if;
  if v_preview then
    select count(*) into v_published from public.routine_template_versions version join public.routine_templates template on template.id=version.template_id
      where template.organization_id=v_org and template.active and version.state='published' and template.current_published_version_id=version.id;
    if v_manager then select count(*) into v_drafts from public.routine_template_versions where organization_id=v_org and state='draft'; end if;
    select count(*) into v_runs from public.routine_runs run where run.organization_id=v_org and public.routine_run_is_visible(run.id,run.organization_id);
    select count(*) into v_bundles from public.routine_bundles bundle where bundle.organization_id=v_org and public.routine_bundle_is_visible(bundle.id,bundle.organization_id);
    select count(*) into v_deviations from public.routine_deviations deviation where deviation.organization_id=v_org
      and deviation.status not in('resolved','cancelled') and public.routine_run_is_visible(deviation.run_id,deviation.organization_id);
  end if;
  return v_access||jsonb_build_object(
    'serverClock',jsonb_build_object('serverNow',v_now,'timezone',coalesce(v_settings.timezone,'Europe/Oslo'),
      'operationalDate',((v_now at time zone coalesce(v_settings.timezone,'Europe/Oslo'))-v_cutoff)::date,'cutoff',v_cutoff::text),
    'sync',jsonb_build_object('mode',case when not v_preview then 'disabled' when v_access->'identity'->>'actorSource'='shared_device_operator'
      then 'cursor_polling' else 'postgres_realtime' end,
      'realtimeAllowed',v_preview and v_access->'identity'->>'actorSource'='personal_auth',
      'cursorPollingRequired',v_preview and v_access->'identity'->>'actorSource'='shared_device_operator',
      'offlineAvailable',v_preview and coalesce((v_access->'capabilities'->>'offlineNonCritical')::boolean,false)),
    'summaries',case when v_preview then jsonb_build_object('publishedTemplateCount',v_published,
      'draftTemplateCount',case when v_manager then to_jsonb(v_drafts) else null end,'visibleRunCount',v_runs,
      'visibleBundleCount',v_bundles,'openDeviationCount',v_deviations) else '{}'::jsonb end,
    'backendVersion','phase10k1-v1','emptyStateReason',case when not v_preview then v_access->>'accessReasonCode'
      when v_published=0 then 'no_published_templates' when v_runs=0 then 'no_visible_runs' else null end);
end $$;

-- Keep operator discovery and session creation behind the same server gate.
create or replace function public.list_available_routine_operators(input_client_instance_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_device public.routine_shared_devices%rowtype:=public.routine_phase10j_shared_device_for_request();
  v_client public.routine_client_instances%rowtype; v_settings public.routine_organization_settings%rowtype;
begin
  select client.* into v_client from public.routine_client_instances client where client.id=input_client_instance_id
    and client.auth_user_id=auth.uid() and client.organization_id=v_device.organization_id and client.shared_device_id=v_device.id and client.revoked_at is null;
  if v_client.id is null then raise exception using errcode='42501',message='operator_auth_failed'; end if;
  select settings.* into v_settings from public.routine_organization_settings settings where settings.organization_id=v_device.organization_id;
  if v_settings.organization_id is null or not v_settings.shared_device_enabled or v_settings.mode='legacy'
      or (v_settings.mode='pilot' and v_settings.ui_release_stage not in('pilot_ready','production_ready'))
      or (v_settings.mode='active' and v_settings.ui_release_stage<>'production_ready') then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',operator.id,'displayName',operator.display_name,
    'role',operator.effective_role,'sortOrder',access.sort_order,'operatorType',operator.operator_type,
    'locked',coalesce(throttle.locked_until>clock_timestamp(),false),'validUntil',operator.valid_until) order by access.sort_order,operator.display_name)
    from public.routine_shared_device_operator_access access join public.routine_operators operator on operator.id=access.operator_id
    join public.routine_pilot_memberships membership on membership.operator_id=operator.id and membership.organization_id=operator.organization_id
      and membership.identity_type='shared_device_operator' and membership.active
      and (membership.valid_from is null or membership.valid_from<=clock_timestamp())
      and (membership.valid_until is null or membership.valid_until>clock_timestamp())
    left join public.routine_operator_auth_throttles throttle on throttle.shared_device_id=v_device.id and throttle.operator_id=operator.id
      and throttle.subject_type='operator'
    where access.shared_device_id=v_device.id and access.active and operator.active
      and (access.valid_from is null or access.valid_from<=clock_timestamp()) and (access.valid_until is null or access.valid_until>clock_timestamp())
      and (operator.valid_from is null or operator.valid_from<=clock_timestamp()) and (operator.valid_until is null or operator.valid_until>clock_timestamp())),'[]'::jsonb);
end $$;

create or replace function public.routine_phase10k1_operator_session_guard()
returns trigger language plpgsql set search_path=pg_catalog
as $$
declare v_settings public.routine_organization_settings%rowtype;
begin
  if tg_op<>'INSERT' then return new; end if;
  select settings.* into v_settings from public.routine_organization_settings settings where settings.organization_id=new.organization_id;
  if v_settings.organization_id is null or not v_settings.shared_device_enabled or v_settings.mode='legacy'
      or (v_settings.mode='pilot' and v_settings.ui_release_stage not in('pilot_ready','production_ready'))
      or (v_settings.mode='active' and v_settings.ui_release_stage<>'production_ready')
      or not exists(select 1 from public.routine_pilot_memberships membership where membership.organization_id=new.organization_id
        and membership.identity_type='shared_device_operator' and membership.operator_id=new.operator_id and membership.active
        and (membership.valid_from is null or membership.valid_from<=clock_timestamp())
        and (membership.valid_until is null or membership.valid_until>clock_timestamp())) then
    raise exception using errcode='42501',message='operator_auth_failed';
  end if;
  return new;
end $$;

drop trigger if exists routine_phase10k1_operator_session_guard_trigger on public.routine_operator_sessions;
create trigger routine_phase10k1_operator_session_guard_trigger before insert on public.routine_operator_sessions
for each row execute function public.routine_phase10k1_operator_session_guard();

create or replace function public.routine_phase10k1_operational_guard()
returns trigger language plpgsql set search_path=pg_catalog
as $$
begin
  if not public.routine_current_user_can_use_operational_engine() then
    raise exception using errcode='42501',message='routine_ui_operational_access_required';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

drop trigger if exists routine_phase10k1_operational_guard_trigger on public.routine_runs;
create trigger routine_phase10k1_operational_guard_trigger before insert or update or delete on public.routine_runs for each row execute function public.routine_phase10k1_operational_guard();
drop trigger if exists routine_phase10k1_operational_guard_trigger on public.routine_run_tasks;
create trigger routine_phase10k1_operational_guard_trigger before insert or update or delete on public.routine_run_tasks for each row execute function public.routine_phase10k1_operational_guard();
drop trigger if exists routine_phase10k1_operational_guard_trigger on public.routine_run_task_items;
create trigger routine_phase10k1_operational_guard_trigger before insert or update or delete on public.routine_run_task_items for each row execute function public.routine_phase10k1_operational_guard();
drop trigger if exists routine_phase10k1_operational_guard_trigger on public.routine_deviations;
create trigger routine_phase10k1_operational_guard_trigger before insert or update or delete on public.routine_deviations for each row execute function public.routine_phase10k1_operational_guard();
drop trigger if exists routine_phase10k1_operational_guard_trigger on public.routine_task_verifications;
create trigger routine_phase10k1_operational_guard_trigger before insert or update or delete on public.routine_task_verifications for each row execute function public.routine_phase10k1_operational_guard();
drop trigger if exists routine_phase10k1_operational_guard_trigger on public.routine_run_verifications;
create trigger routine_phase10k1_operational_guard_trigger before insert or update or delete on public.routine_run_verifications for each row execute function public.routine_phase10k1_operational_guard();
drop trigger if exists routine_phase10k1_operational_guard_trigger on public.routine_handovers;
create trigger routine_phase10k1_operational_guard_trigger before insert or update or delete on public.routine_handovers for each row execute function public.routine_phase10k1_operational_guard();
drop trigger if exists routine_phase10k1_operational_guard_trigger on public.routine_run_transfers;
create trigger routine_phase10k1_operational_guard_trigger before insert or update or delete on public.routine_run_transfers for each row execute function public.routine_phase10k1_operational_guard();
drop trigger if exists routine_phase10k1_operational_guard_trigger on public.routine_bundles;
create trigger routine_phase10k1_operational_guard_trigger before insert or update or delete on public.routine_bundles for each row execute function public.routine_phase10k1_operational_guard();
drop trigger if exists routine_phase10k1_operational_guard_trigger on public.routine_bundle_steps;
create trigger routine_phase10k1_operational_guard_trigger before insert or update or delete on public.routine_bundle_steps for each row execute function public.routine_phase10k1_operational_guard();
drop trigger if exists routine_phase10k1_operational_guard_trigger on public.routine_delivery_records;
create trigger routine_phase10k1_operational_guard_trigger before insert or update or delete on public.routine_delivery_records for each row execute function public.routine_phase10k1_operational_guard();
drop trigger if exists routine_phase10k1_operational_guard_trigger on public.routine_delivery_items;
create trigger routine_phase10k1_operational_guard_trigger before insert or update or delete on public.routine_delivery_items for each row execute function public.routine_phase10k1_operational_guard();
drop trigger if exists routine_phase10k1_operational_guard_trigger on public.routine_delivery_comparisons;
create trigger routine_phase10k1_operational_guard_trigger before insert or update or delete on public.routine_delivery_comparisons for each row execute function public.routine_phase10k1_operational_guard();
drop trigger if exists routine_phase10k1_operational_guard_trigger on public.routine_event_transfer_acceptances;
create trigger routine_phase10k1_operational_guard_trigger before insert or update or delete on public.routine_event_transfer_acceptances for each row execute function public.routine_phase10k1_operational_guard();
drop trigger if exists routine_phase10k1_operational_guard_trigger on public.routine_event_transfer_completions;
create trigger routine_phase10k1_operational_guard_trigger before insert or update or delete on public.routine_event_transfer_completions for each row execute function public.routine_phase10k1_operational_guard();

alter table public.routine_pilot_memberships enable row level security;
alter table public.routine_ui_operations enable row level security;

drop policy if exists routine_pilot_memberships_read on public.routine_pilot_memberships;
create policy routine_pilot_memberships_read on public.routine_pilot_memberships for select to authenticated using (
  organization_id=(select public.routine_current_user_organization_id()) and (
    ((select public.routine_current_actor_source())='personal_auth' and user_profile_id=(select public.routine_current_effective_profile_id()))
    or ((select public.routine_current_actor_source())='shared_device_operator' and operator_id=(select public.routine_current_effective_operator_id()))
    or ((select public.routine_current_actor_source())='personal_auth' and (select public.routine_current_user_role())='manager')
  )
);
drop policy if exists routine_ui_operations_manager_read on public.routine_ui_operations;
create policy routine_ui_operations_manager_read on public.routine_ui_operations for select to authenticated using (
  organization_id=(select public.routine_current_user_organization_id())
  and (select public.routine_current_actor_source())='personal_auth'
  and (select public.routine_current_user_role())='manager'
);

revoke all on table public.routine_pilot_memberships,public.routine_ui_operations from public,anon,authenticated;
grant select on table public.routine_pilot_memberships,public.routine_ui_operations to authenticated;

-- UI event types extend the existing immutable operator/security event ledger.
alter table public.routine_operator_events drop constraint if exists routine_operator_events_type_check;
alter table public.routine_operator_events add constraint routine_operator_events_type_check check(event_type in(
  'shared_device_registered','shared_device_updated','shared_device_disabled','operator_created','operator_updated','operator_disabled',
  'operator_credential_created','operator_credential_rotated','operator_credential_revoked','operator_auth_succeeded','operator_auth_failed',
  'operator_session_started','operator_session_reauthenticated','operator_session_ended','operator_session_revoked','operator_session_expired',
  'operator_access_updated','routine_engine_mode_changed','routine_pilot_memberships_replaced'));

revoke all on function public.routine_phase10k1_settings_guard(),public.routine_phase10k1_membership_guard(),
  public.routine_phase10k1_operation_guard(),public.routine_phase10k1_require_personal_manager(),
  public.routine_get_ui_release_state(uuid),public.routine_current_pilot_membership(),public.routine_current_user_access_summary(),
  public.routine_phase10k1_existing_operation(uuid,uuid,text,uuid,text),
  public.routine_phase10k1_record_operation(uuid,uuid,text,uuid,text,text,uuid,jsonb),
  public.routine_phase10k1_operator_session_guard(),public.routine_phase10k1_operational_guard() from public,anon,authenticated;

revoke all on function public.routine_current_user_can_preview_engine(),public.routine_current_user_can_use_operational_engine(),
  public.routine_current_user_can_access_manager_preview(),public.set_routine_engine_mode(text,bigint,text,uuid),
  public.replace_routine_pilot_memberships(jsonb,bigint,uuid),public.get_routine_pilot_admin_workspace(),
  public.get_routine_application_bootstrap() from public,anon,authenticated;

grant execute on function public.routine_current_user_can_preview_engine(),public.routine_current_user_can_use_operational_engine(),
  public.routine_current_user_can_access_manager_preview(),public.set_routine_engine_mode(text,bigint,text,uuid),
  public.replace_routine_pilot_memberships(jsonb,bigint,uuid),public.get_routine_pilot_admin_workspace(),
  public.get_routine_application_bootstrap() to authenticated;

-- Reassert the pre-existing grants after replacing these definitions.
grant execute on function public.routine_current_user_can_manage_templates(),public.routine_current_user_can_coordinate_runs(),
  public.routine_current_user_can_perform_tasks(),public.list_available_routine_operators(uuid) to authenticated;
