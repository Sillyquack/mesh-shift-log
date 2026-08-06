-- Phase 10K4: immutable history, read-only legacy adapter, pilot hardening,
-- release attestations and controlled pilot gates.
--
-- Additive only. This migration does not seed routine content, promote an
-- organization, change Routine Engine mode, pause pilot work, or mutate any
-- legacy, Inventory, Event Operations, Storage object, or Auth data.

alter table public.routine_organization_settings
  add column if not exists pilot_new_work_paused boolean not null default false,
  add column if not exists pilot_pause_reason text,
  add column if not exists pilot_paused_at timestamptz,
  add column if not exists pilot_paused_by_auth_user_id uuid references auth.users(id);

do $phase10k4_settings_constraints$
begin
  alter table public.routine_organization_settings
    drop constraint if exists routine_organization_settings_pilot_pause_check;
  alter table public.routine_organization_settings
    add constraint routine_organization_settings_pilot_pause_check check (
      (pilot_new_work_paused and pilot_pause_reason is not null
        and char_length(trim(pilot_pause_reason)) between 3 and 1000
        and pilot_paused_at is not null and pilot_paused_by_auth_user_id is not null)
      or
      (not pilot_new_work_paused and pilot_pause_reason is null
        and pilot_paused_at is null and pilot_paused_by_auth_user_id is null)
    );
end;
$phase10k4_settings_constraints$;

do $phase10k4_release_contract$
begin
  perform set_config('mesh.routine_ui_release_internal','release',true);
  update public.routine_organization_settings settings
  set ui_contract_version='phase10k4-v1',
      updated_at=clock_timestamp()
  where settings.ui_contract_version='phase10k3-v1';
end;
$phase10k4_release_contract$;

create table if not exists public.routine_release_attestations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  target_release_stage text not null,
  readiness_hash text not null,
  readiness_snapshot jsonb not null,
  attestation_note text not null,
  status text not null default 'accepted',
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  created_by_name_snapshot text not null,
  operation_id uuid not null references public.routine_ui_operations(id),
  constraint routine_release_attestations_target_check
    check (target_release_stage in ('pilot_ready','production_ready')),
  constraint routine_release_attestations_status_check
    check (status in ('accepted','invalidated')),
  constraint routine_release_attestations_hash_check
    check (readiness_hash ~ '^[0-9a-f]{64}$'),
  constraint routine_release_attestations_snapshot_check
    check (jsonb_typeof(readiness_snapshot)='object' and pg_column_size(readiness_snapshot)<=262144),
  constraint routine_release_attestations_note_check
    check (char_length(trim(attestation_note)) between 3 and 4000),
  constraint routine_release_attestations_actor_check
    check (char_length(trim(created_by_name_snapshot)) between 1 and 200),
  constraint routine_release_attestations_operation_unique unique(operation_id),
  constraint routine_release_attestations_id_org_unique unique(id,organization_id)
);

create unique index if not exists routine_release_attestations_accepted_hash_unique
  on public.routine_release_attestations(organization_id,target_release_stage,readiness_hash)
  where status='accepted';
create index if not exists routine_release_attestations_org_created_idx
  on public.routine_release_attestations(organization_id,created_at desc,id desc);

create table if not exists public.routine_e2e_verification_attestations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  contract_version text not null,
  browser_engines text[] not null,
  evidence_hash text not null,
  evidence_snapshot jsonb not null,
  attestation_note text not null,
  status text not null default 'accepted',
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  created_by_name_snapshot text not null,
  operation_id uuid not null references public.routine_ui_operations(id),
  constraint routine_e2e_attestations_contract_check check(contract_version='phase10k4-v1'),
  constraint routine_e2e_attestations_engine_check check(
    browser_engines @> array['chromium','webkit']::text[]
    and browser_engines <@ array['chromium','webkit']::text[]
  ),
  constraint routine_e2e_attestations_hash_check check(evidence_hash~'^[0-9a-f]{64}$'),
  constraint routine_e2e_attestations_snapshot_check
    check(jsonb_typeof(evidence_snapshot)='object' and pg_column_size(evidence_snapshot)<=262144),
  constraint routine_e2e_attestations_note_check check(char_length(trim(attestation_note)) between 3 and 4000),
  constraint routine_e2e_attestations_status_check check(status in('accepted','invalidated')),
  constraint routine_e2e_attestations_actor_check check(char_length(trim(created_by_name_snapshot)) between 1 and 200),
  constraint routine_e2e_attestations_operation_unique unique(operation_id)
);
create unique index if not exists routine_e2e_attestations_accepted_hash_unique
  on public.routine_e2e_verification_attestations(organization_id,contract_version,evidence_hash)
  where status='accepted';

create or replace function public.routine_phase10k4_immutable_attestation_guard()
returns trigger language plpgsql set search_path=pg_catalog
as $$
begin
  if tg_op='INSERT' and coalesce(current_setting('mesh.routine_release_attestation_internal',true),'')<>'insert' then
    raise exception using errcode='42501',message='Release attestations may only be created through controlled manager RPCs.';
  end if;
  if tg_op in('UPDATE','DELETE') then
    raise exception using errcode='42501',message='Release attestations are immutable.';
  end if;
  return new;
end $$;

drop trigger if exists routine_release_attestations_immutable on public.routine_release_attestations;
create trigger routine_release_attestations_immutable
before insert or update or delete on public.routine_release_attestations
for each row execute function public.routine_phase10k4_immutable_attestation_guard();
drop trigger if exists routine_e2e_attestations_immutable on public.routine_e2e_verification_attestations;
create trigger routine_e2e_attestations_immutable
before insert or update or delete on public.routine_e2e_verification_attestations
for each row execute function public.routine_phase10k4_immutable_attestation_guard();

alter table public.routine_release_attestations enable row level security;
alter table public.routine_e2e_verification_attestations enable row level security;
revoke all privileges on table public.routine_release_attestations from public,anon,authenticated;
revoke all privileges on table public.routine_e2e_verification_attestations from public,anon,authenticated;

-- Extend the existing immutable UI operation ledger without exposing it as a
-- history timeline or granting any direct application DML.
alter table public.routine_ui_operations drop constraint if exists routine_ui_operations_type_check;
alter table public.routine_ui_operations add constraint routine_ui_operations_type_check check(operation_type in(
  'set_engine_mode','replace_pilot_memberships','set_routine_template_active',
  'promote_release_stage','set_pilot_pause','record_e2e_attestation'));
alter table public.routine_ui_operations drop constraint if exists routine_ui_operations_resource_check;
alter table public.routine_ui_operations add constraint routine_ui_operations_resource_check check(resource_type in(
  'organization_settings','pilot_memberships','routine_template','release_attestation','e2e_verification'));

alter table public.routine_operator_events drop constraint if exists routine_operator_events_type_check;
alter table public.routine_operator_events add constraint routine_operator_events_type_check check(event_type in(
  'shared_device_registered','shared_device_updated','shared_device_disabled','operator_created','operator_updated','operator_disabled',
  'operator_credential_created','operator_credential_rotated','operator_credential_revoked','operator_auth_succeeded','operator_auth_failed',
  'operator_session_started','operator_session_reauthenticated','operator_session_ended','operator_session_revoked','operator_session_expired',
  'operator_access_updated','routine_engine_mode_changed','routine_pilot_memberships_replaced','routine_template_active_changed',
  'routine_release_promoted','routine_pilot_pause_changed','routine_e2e_verification_attested'));

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
    if (new.pilot_new_work_paused,new.pilot_pause_reason,new.pilot_paused_at,new.pilot_paused_by_auth_user_id)
       is distinct from
       (old.pilot_new_work_paused,old.pilot_pause_reason,old.pilot_paused_at,old.pilot_paused_by_auth_user_id)
       and coalesce(current_setting('mesh.routine_pilot_internal',true),'')<>'pause' then
      raise exception using errcode='42501',message='Pilot pause state may only be changed through its manager RPC.';
    end if;
  end if;
  return new;
end $$;

create or replace function public.routine_phase10k4_category(
  input_ready boolean,input_blockers jsonb,input_warnings jsonb,input_evidence jsonb
)
returns jsonb language sql immutable set search_path=pg_catalog
as $$
  select jsonb_build_object(
    'ready',coalesce(input_ready,false),
    'blockers',coalesce(input_blockers,'[]'::jsonb),
    'warnings',coalesce(input_warnings,'[]'::jsonb),
    'evidence',coalesce(input_evidence,'{}'::jsonb),
    'evidenceHash',encode(extensions.digest(convert_to(coalesce(input_evidence,'{}'::jsonb)::text,'UTF8'),'sha256'),'hex')
  )
$$;

create or replace function public.routine_compute_pilot_readiness(input_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare
  v_settings public.routine_organization_settings%rowtype;
  v_categories jsonb; v_blockers jsonb:='[]'::jsonb; v_warnings jsonb:='[]'::jsonb;
  v_opening integer; v_closing integer; v_inactive_opening integer; v_inactive_closing integer;
  v_validation_blockers integer; v_door_count integer; v_set_count integer; v_standard_count integer;
  v_placeholder_count integer; v_missing_caption_count integer; v_memberships integer; v_unscoped integer;
  v_storage_ready boolean; v_realtime_ready boolean; v_security_ready boolean; v_e2e_ready boolean;
  v_shared_ready boolean; v_content_ready boolean; v_batch_ids uuid[];
  v_category jsonb;
begin
  select settings.* into v_settings from public.routine_organization_settings settings
    where settings.organization_id=input_organization_id;
  if v_settings.organization_id is null then
    return jsonb_build_object('ready',false,'blockers',jsonb_build_array('Routine organization settings are missing.'),
      'warnings','[]'::jsonb,'categories','{}'::jsonb);
  end if;

  select count(*) filter(where lower(template.routine_key)='opening' and template.active and version.state='published'),
         count(*) filter(where lower(template.routine_key)='closing' and template.active and version.state='published'),
         count(*) filter(where lower(template.routine_key)='opening' and not template.active and version.state='published'),
         count(*) filter(where lower(template.routine_key)='closing' and not template.active and version.state='published'),
         array_agg(version.id order by template.routine_key) filter(where lower(template.routine_key) in('opening','closing')
           and template.active and version.state='published')
  into v_opening,v_closing,v_inactive_opening,v_inactive_closing,v_batch_ids
  from public.routine_templates template
  left join public.routine_template_versions version on version.id=template.current_published_version_id
  where template.organization_id=input_organization_id;

  select count(*)
  into v_validation_blockers
  from public.routine_template_versions version
  join public.routine_templates template on template.id=version.template_id
  cross join lateral jsonb_array_elements_text(
    public.validate_routine_template_version(version.id,v_batch_ids)->'blockers') blocker(value)
  where template.organization_id=input_organization_id and version.id=any(coalesce(v_batch_ids,'{}'::uuid[]))
    and blocker.value<>'Version must be a draft.';

  select count(*) into v_door_count from public.routine_locations
    where organization_id=input_organization_id and active and location_type='door';
  select count(*) into v_set_count from public.routine_location_sets
    where organization_id=input_organization_id and active;
  select count(*) into v_standard_count from public.routine_standards
    where organization_id=input_organization_id and active and current_revision_id is not null
      and standard_key in('coffee_canister_target','coffee_cup_full_target','wine_glass_full_target');
  select count(*),count(*) filter(where nullif(trim(version.caption),'') is null)
  into v_placeholder_count,v_missing_caption_count
  from public.routine_reference_images reference
  join public.routine_reference_image_versions version on version.id=reference.current_version_id
  where reference.organization_id=input_organization_id and reference.active and version.state='placeholder';
  select count(*) into v_memberships from public.routine_pilot_memberships membership
    where membership.organization_id=input_organization_id and membership.active
      and membership.access_level in('participant','coordinator')
      and (membership.valid_from is null or membership.valid_from<=clock_timestamp())
      and (membership.valid_until is null or membership.valid_until>clock_timestamp());
  select (select count(*) from public.shift_sessions where organization_id is null)
    +(select count(*) from public.task_completions where organization_id is null)
    +(select count(*) from public.handover_notes where organization_id is null)
    +(select count(*) from public.close_day_archives where organization_id is null)
    +(select count(*) from public.manager_daily_reviews where organization_id is null)
  into v_unscoped;
  select exists(select 1 from storage.buckets bucket where bucket.id='routine-reference-images'
    and bucket.name='routine-reference-images' and not bucket.public and bucket.file_size_limit=5242880
    and bucket.allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[]
    and bucket.allowed_mime_types <@ array['image/jpeg','image/png','image/webp']::text[]) into v_storage_ready;
  select exists(select 1 from pg_catalog.pg_publication publication
    join pg_catalog.pg_publication_rel relation on relation.prpubid=publication.oid
    where publication.pubname='supabase_realtime' and relation.prrelid='public.routine_events'::regclass)
    into v_realtime_ready;
  select bool_and(class.relrowsecurity) and not exists(
    select 1 from information_schema.role_table_grants grant_row
    where grant_row.table_schema='public' and grant_row.table_name in('routine_release_attestations','routine_e2e_verification_attestations')
      and grant_row.grantee in('anon','authenticated') and grant_row.privilege_type in('INSERT','UPDATE','DELETE'))
  into v_security_ready from pg_catalog.pg_class class
  where class.oid in('public.routine_release_attestations'::regclass,'public.routine_e2e_verification_attestations'::regclass);
  select exists(select 1 from public.routine_e2e_verification_attestations attestation
    where attestation.organization_id=input_organization_id and attestation.contract_version='phase10k4-v1'
      and attestation.status='accepted' and attestation.browser_engines @> array['chromium','webkit']::text[])
  into v_e2e_ready;
  v_shared_ready:=not v_settings.shared_device_enabled or exists(
    select 1 from public.routine_shared_devices device
    where device.organization_id=input_organization_id and device.active and exists(
      select 1 from public.routine_shared_device_operator_access access
      join public.routine_operators operator on operator.id=access.operator_id and operator.organization_id=access.organization_id
      where access.shared_device_id=device.id and access.organization_id=device.organization_id
        and access.active and operator.active));
  select v_opening>0 and v_closing>0 and exists(
    select 1 from public.routine_template_versions version
    join public.routine_templates template on template.id=version.template_id
    where template.organization_id=input_organization_id and lower(template.routine_key)='opening'
      and version.id=template.current_published_version_id and version.publish_note ilike '%[pilot-approved]%')
    and exists(
    select 1 from public.routine_template_versions version
    join public.routine_templates template on template.id=version.template_id
    where template.organization_id=input_organization_id and lower(template.routine_key)='closing'
      and version.id=template.current_published_version_id and version.publish_note ilike '%[pilot-approved]%')
    and to_regprocedure('public.create_or_get_double_shift_bundle(text,text,text,date,uuid)') is not null
  into v_content_ready;

  v_categories:=jsonb_build_object(
    'databaseFoundation',public.routine_phase10k4_category(true,'[]'::jsonb,'[]'::jsonb,
      jsonb_build_object('historyTables',2,'contract','phase10k4-v1')),
    'security',public.routine_phase10k4_category(v_security_ready,
      case when v_security_ready then '[]'::jsonb else jsonb_build_array('Routine history RLS or grants do not match the K4 contract.') end,
      '[]'::jsonb,jsonb_build_object('rlsAndGrantFingerprintValid',v_security_ready)),
    'releaseContract',public.routine_phase10k4_category(v_settings.ui_contract_version='phase10k4-v1',
      case when v_settings.ui_contract_version='phase10k4-v1' then '[]'::jsonb else jsonb_build_array('Phase 10K4 UI contract is not installed.') end,
      '[]'::jsonb,jsonb_build_object('contractVersion',v_settings.ui_contract_version,'pilotNewWorkPaused',v_settings.pilot_new_work_paused)),
    'operationalTemplates',public.routine_phase10k4_category(v_opening>0 and v_closing>0,
      (case when v_opening=0 then jsonb_build_array(case when v_inactive_opening>0 then 'Published Opening template is inactive.' else 'Missing active published Opening template.' end) else '[]'::jsonb end)
      ||(case when v_closing=0 then jsonb_build_array(case when v_inactive_closing>0 then 'Published Closing template is inactive.' else 'Missing active published Closing template.' end) else '[]'::jsonb end),
      '[]'::jsonb,jsonb_build_object('opening',v_opening,'closing',v_closing)),
    'templateValidation',public.routine_phase10k4_category(v_validation_blockers=0,
      case when v_validation_blockers=0 then '[]'::jsonb else jsonb_build_array(v_validation_blockers||' template validation blocker(s) remain.') end,
      '[]'::jsonb,jsonb_build_object('blockerCount',v_validation_blockers)),
    'locationsAndRoutes',public.routine_phase10k4_category(v_door_count>0 and v_set_count>0,
      (case when v_door_count=0 then jsonb_build_array('Door/lock configuration is missing.') else '[]'::jsonb end)
      ||(case when v_set_count=0 then jsonb_build_array('Required location sets are missing.') else '[]'::jsonb end),
      '[]'::jsonb,jsonb_build_object('activeDoors',v_door_count,'activeLocationSets',v_set_count)),
    'standards',public.routine_phase10k4_category(v_standard_count=3,
      (case when not exists(select 1 from public.routine_standards where organization_id=input_organization_id and active and current_revision_id is not null and standard_key='coffee_canister_target') then jsonb_build_array('Coffee Canister target is missing.') else '[]'::jsonb end)
      ||(case when not exists(select 1 from public.routine_standards where organization_id=input_organization_id and active and current_revision_id is not null and standard_key='coffee_cup_full_target') then jsonb_build_array('Coffee-cup full/service-ready target is missing.') else '[]'::jsonb end)
      ||(case when not exists(select 1 from public.routine_standards where organization_id=input_organization_id and active and current_revision_id is not null and standard_key='wine_glass_full_target') then jsonb_build_array('Wine-glass full/service-ready target is missing.') else '[]'::jsonb end),
      '[]'::jsonb,jsonb_build_object('requiredTargets',v_standard_count)),
    'referenceImages',public.routine_phase10k4_category(true,'[]'::jsonb,
      (case when v_placeholder_count>0 then jsonb_build_array(v_placeholder_count||' reference placeholder(s) remain.') else '[]'::jsonb end)
      ||(case when v_missing_caption_count>0 then jsonb_build_array(v_missing_caption_count||' reference caption(s) are missing.') else '[]'::jsonb end),
      jsonb_build_object('placeholders',v_placeholder_count,'missingCaptions',v_missing_caption_count)),
    'operatorsAndDevices',public.routine_phase10k4_category(v_shared_ready,
      case when v_shared_ready then '[]'::jsonb else jsonb_build_array('Shared-device/operator configuration is invalid.') end,
      case when not v_settings.shared_device_enabled then jsonb_build_array('No shared device is configured or required.') else '[]'::jsonb end,
      jsonb_build_object('sharedDeviceRequired',v_settings.shared_device_enabled,'valid',v_shared_ready)),
    'pilotMemberships',public.routine_phase10k4_category(v_memberships>0,
      case when v_memberships>0 then '[]'::jsonb else jsonb_build_array('At least one active participant pilot membership is required.') end,
      '[]'::jsonb,jsonb_build_object('activeParticipants',v_memberships)),
    'realtimeAndSync',public.routine_phase10k4_category(v_realtime_ready,
      case when v_realtime_ready then '[]'::jsonb else jsonb_build_array('Routine Realtime publication is missing or invalid.') end,
      '[]'::jsonb,jsonb_build_object('routineEventsPublished',v_realtime_ready)),
    'storage',public.routine_phase10k4_category(v_storage_ready,
      case when v_storage_ready then '[]'::jsonb else jsonb_build_array('Routine reference-image bucket contract is invalid.') end,
      '[]'::jsonb,jsonb_build_object('bucketContractValid',v_storage_ready)),
    'operationalContent',public.routine_phase10k4_category(v_content_ready,
      case when v_content_ready then '[]'::jsonb else jsonb_build_array('Approved Opening, Closing and Double Shift pilot content is missing.') end,
      '[]'::jsonb,jsonb_build_object('pilotApproved',v_content_ready)),
    'legacySafety',public.routine_phase10k4_category(true,'[]'::jsonb,
      case when v_unscoped>0 then jsonb_build_array(v_unscoped||' unscoped legacy row(s) require manual ownership review.') else '[]'::jsonb end,
      jsonb_build_object('unscopedLegacyCount',v_unscoped,'automaticAssignment',false)),
    'endToEndVerification',public.routine_phase10k4_category(v_e2e_ready,
      case when v_e2e_ready then '[]'::jsonb else jsonb_build_array('A current Chromium and WebKit end-to-end verification attestation is required.') end,
      jsonb_build_array('Existing non-blocking production chunk-size warning must remain reviewed.'),
      jsonb_build_object('attested',v_e2e_ready,'requiredEngines',jsonb_build_array('chromium','webkit')))
  );
  select coalesce(jsonb_agg(blocker.value order by category.key),'[]'::jsonb) into v_blockers
    from jsonb_each(v_categories) category(key,value),lateral jsonb_array_elements_text(category.value->'blockers') blocker(value);
  select coalesce(jsonb_agg(warning.value order by category.key),'[]'::jsonb) into v_warnings
    from jsonb_each(v_categories) category(key,value),lateral jsonb_array_elements_text(category.value->'warnings') warning(value);
  return jsonb_build_object('ready',jsonb_array_length(v_blockers)=0,'blockers',v_blockers,
    'warnings',v_warnings,'categories',v_categories);
end $$;

create or replace function public.routine_compute_pilot_readiness_hash(input_organization_id uuid)
returns text language sql stable security definer set search_path=pg_catalog
as $$
  select encode(extensions.digest(convert_to(public.routine_compute_pilot_readiness(input_organization_id)::text,'UTF8'),'sha256'),'hex')
$$;

create or replace function public.get_routine_pilot_readiness()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10k1_require_personal_manager();
  v_settings public.routine_organization_settings%rowtype; v_snapshot jsonb;
begin
  select settings.* into v_settings from public.routine_organization_settings settings
    where settings.organization_id=v_actor.organization_id;
  v_snapshot:=public.routine_compute_pilot_readiness(v_actor.organization_id);
  return v_snapshot||jsonb_build_object('readinessHash',public.routine_compute_pilot_readiness_hash(v_actor.organization_id),
    'generatedAt',clock_timestamp(),'currentStage',v_settings.ui_release_stage,'currentMode',v_settings.mode,
    'settingsRevision',v_settings.revision,'pilotNewWorkPaused',v_settings.pilot_new_work_paused,
    'acceptedAttestation',(select to_jsonb(attestation)-'readiness_snapshot' from public.routine_release_attestations attestation
      where attestation.organization_id=v_actor.organization_id and attestation.target_release_stage='pilot_ready'
        and attestation.status='accepted' order by attestation.created_at desc limit 1));
end $$;

create or replace function public.record_routine_e2e_verification_attestation(
  input_evidence_snapshot jsonb,input_attestation_note text,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10k1_require_personal_manager();
  v_note text:=trim(coalesce(input_attestation_note,'')); v_hash text; v_request_hash text;
  v_replay jsonb; v_response jsonb; v_operation uuid; v_id uuid:=gen_random_uuid();
begin
  if input_idempotency_key is null or jsonb_typeof(input_evidence_snapshot)<>'object'
     or char_length(v_note) not between 3 and 4000 then
    raise exception using errcode='22023',message='E2E evidence object, note, and idempotency key are required.';
  end if;
  if not (input_evidence_snapshot->'browserEngines' @> '["chromium","webkit"]'::jsonb)
     or coalesce((input_evidence_snapshot->>'allPassed')::boolean,false) is not true then
    raise exception using errcode='22023',message='Chromium and WebKit must both pass before E2E attestation.';
  end if;
  v_hash:=encode(extensions.digest(convert_to(input_evidence_snapshot::text,'UTF8'),'sha256'),'hex');
  v_request_hash:=public.routine_phase10j_request_hash(jsonb_build_object('evidenceHash',v_hash,'note',v_note));
  v_replay:=public.routine_phase10k1_existing_operation(v_actor.organization_id,v_actor.id,'record_e2e_attestation',input_idempotency_key,v_request_hash);
  if v_replay is not null then return v_replay; end if;
  v_response:=jsonb_build_object('attestation',jsonb_build_object('id',v_id,'evidenceHash',v_hash,
    'contractVersion','phase10k4-v1','browserEngines',jsonb_build_array('chromium','webkit'),'status','accepted'),
    'idempotentReplay',false);
  v_operation:=public.routine_phase10k1_record_operation(v_actor.organization_id,v_actor.id,'record_e2e_attestation',
    input_idempotency_key,v_request_hash,'e2e_verification',v_id,v_response);
  perform set_config('mesh.routine_release_attestation_internal','insert',true);
  insert into public.routine_e2e_verification_attestations(id,organization_id,contract_version,browser_engines,
    evidence_hash,evidence_snapshot,attestation_note,created_by_auth_user_id,created_by_name_snapshot,operation_id)
  values(v_id,v_actor.organization_id,'phase10k4-v1',array['chromium','webkit'],v_hash,input_evidence_snapshot,
    v_note,v_actor.id,v_actor.display_name,v_operation);
  perform set_config('mesh.routine_operator_internal','ui',true);
  perform public.routine_phase10j_record_event(v_actor.organization_id,null,null,null,'routine_e2e_verification_attested',
    v_actor.id,v_actor.id,v_actor.display_name,jsonb_build_object('evidenceHash',v_hash),null);
  return v_response;
end $$;

create or replace function public.promote_routine_ui_release_stage(
  input_target_stage text,input_expected_settings_revision bigint,input_expected_readiness_hash text,
  input_attestation_note text,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10k1_require_personal_manager();
  v_settings public.routine_organization_settings%rowtype; v_snapshot jsonb; v_hash text; v_request_hash text;
  v_replay jsonb; v_response jsonb; v_operation uuid; v_attestation_id uuid:=gen_random_uuid();
  v_note text:=trim(coalesce(input_attestation_note,''));
begin
  if input_target_stage<>'pilot_ready' then
    raise exception using errcode='42501',message=case when input_target_stage='production_ready' then 'routine_ui_not_production_ready' else 'Only pilot_ready promotion is available in Phase 10K4.' end;
  end if;
  if input_idempotency_key is null or input_expected_settings_revision is null
     or input_expected_readiness_hash !~ '^[0-9a-f]{64}$' or char_length(v_note) not between 3 and 4000 then
    raise exception using errcode='22023',message='Expected revision, readiness hash, note, and idempotency key are required.';
  end if;
  v_request_hash:=public.routine_phase10j_request_hash(jsonb_build_object('targetStage',input_target_stage,
    'expectedRevision',input_expected_settings_revision,'expectedReadinessHash',input_expected_readiness_hash,'note',v_note));
  v_replay:=public.routine_phase10k1_existing_operation(v_actor.organization_id,v_actor.id,'promote_release_stage',input_idempotency_key,v_request_hash);
  if v_replay is not null then return v_replay; end if;
  select settings.* into v_settings from public.routine_organization_settings settings
    where settings.organization_id=v_actor.organization_id for update;
  if v_settings.ui_release_stage<>'staff_preview' then raise exception using errcode='42501',message='Release promotion requires staff_preview.'; end if;
  if v_settings.revision<>input_expected_settings_revision then raise exception using errcode='40001',message='Routine settings revision conflict.'; end if;
  v_snapshot:=public.routine_compute_pilot_readiness(v_actor.organization_id);
  v_hash:=public.routine_compute_pilot_readiness_hash(v_actor.organization_id);
  if v_hash<>input_expected_readiness_hash then raise exception using errcode='40001',message='Stale pilot readiness hash.'; end if;
  if not coalesce((v_snapshot->>'ready')::boolean,false) then raise exception using errcode='42501',message='Pilot readiness still has blockers.'; end if;
  perform set_config('mesh.routine_ui_release_internal','release',true);
  update public.routine_organization_settings set ui_release_stage='pilot_ready',revision=revision+1,
    updated_at=clock_timestamp(),updated_by_auth_user_id=v_actor.id
  where organization_id=v_actor.organization_id returning * into v_settings;
  v_response:=jsonb_build_object('settings',jsonb_build_object('mode',v_settings.mode,'uiReleaseStage',v_settings.ui_release_stage,
    'contractVersion',v_settings.ui_contract_version,'revision',v_settings.revision),'attestation',jsonb_build_object(
    'id',v_attestation_id,'targetReleaseStage','pilot_ready','readinessHash',v_hash,'status','accepted'),'idempotentReplay',false);
  v_operation:=public.routine_phase10k1_record_operation(v_actor.organization_id,v_actor.id,'promote_release_stage',
    input_idempotency_key,v_request_hash,'release_attestation',v_attestation_id,v_response);
  perform set_config('mesh.routine_release_attestation_internal','insert',true);
  insert into public.routine_release_attestations(id,organization_id,target_release_stage,readiness_hash,
    readiness_snapshot,attestation_note,created_by_auth_user_id,created_by_name_snapshot,operation_id)
  values(v_attestation_id,v_actor.organization_id,'pilot_ready',v_hash,v_snapshot,v_note,v_actor.id,v_actor.display_name,v_operation);
  perform set_config('mesh.routine_operator_internal','ui',true);
  perform public.routine_phase10j_record_event(v_actor.organization_id,null,null,null,'routine_release_promoted',
    v_actor.id,v_actor.id,v_actor.display_name,jsonb_build_object('targetStage','pilot_ready','readinessHash',v_hash,
      'revision',v_settings.revision),null);
  return v_response;
end $$;

do $phase10k4_mode_base$
begin
  if to_regprocedure('public.set_routine_engine_mode_phase10k4_base(text,bigint,text,uuid)') is null then
    alter function public.set_routine_engine_mode(text,bigint,text,uuid) rename to set_routine_engine_mode_phase10k4_base;
  end if;
end;
$phase10k4_mode_base$;

create or replace function public.set_routine_engine_mode(
  input_mode text,input_expected_revision bigint,input_reason text,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10k1_require_personal_manager();
  v_settings public.routine_organization_settings%rowtype; v_reason text:=trim(coalesce(input_reason,''));
  v_readiness jsonb; v_hash text; v_request_hash text; v_replay jsonb; v_response jsonb;
begin
  if input_mode='active' then raise exception using errcode='42501',message='routine_ui_not_production_ready'; end if;
  if input_mode not in('legacy','shadow','pilot') or input_idempotency_key is null
     or input_expected_revision is null or char_length(v_reason) not between 3 and 1000 then
    raise exception using errcode='22023',message='Mode, expected revision, reason, and idempotency key are required.';
  end if;
  if input_mode='pilot' then
    v_request_hash:=public.routine_phase10j_request_hash(jsonb_build_object('mode','pilot','expectedRevision',input_expected_revision,'reason',v_reason));
    v_replay:=public.routine_phase10k1_existing_operation(v_actor.organization_id,v_actor.id,'set_engine_mode',input_idempotency_key,v_request_hash);
    if v_replay is not null then return v_replay; end if;
  end if;
  select settings.* into v_settings from public.routine_organization_settings settings
    where settings.organization_id=v_actor.organization_id for update;
  if v_settings.revision<>input_expected_revision then raise exception using errcode='40001',message='Routine settings revision conflict.'; end if;
  if input_mode<>'pilot' then
    if v_settings.mode='pilot' and input_mode<>'shadow' then
      raise exception using errcode='42501',message='Pilot mode may only roll back to shadow.';
    end if;
    if v_settings.mode='pilot' and input_mode='shadow' and (
      exists(select 1 from public.routine_runs run where run.organization_id=v_actor.organization_id
        and run.status in('in_progress','reopened','awaiting_final_verification','waiting_for_transfers'))
      or exists(select 1 from public.routine_bundles bundle where bundle.organization_id=v_actor.organization_id
        and bundle.status not in('completed','cancelled'))
    ) then raise exception using errcode='42501',message='Active Routine work blocks pilot rollback to shadow.'; end if;
    return public.set_routine_engine_mode_phase10k4_base(input_mode,input_expected_revision,v_reason,input_idempotency_key);
  end if;
  if v_settings.mode<>'shadow' then raise exception using errcode='42501',message='Pilot activation requires shadow mode.'; end if;
  if v_settings.ui_release_stage<>'pilot_ready' then raise exception using errcode='42501',message='routine_ui_not_pilot_ready'; end if;
  v_readiness:=public.routine_compute_pilot_readiness(v_actor.organization_id);
  v_hash:=public.routine_compute_pilot_readiness_hash(v_actor.organization_id);
  if not coalesce((v_readiness->>'ready')::boolean,false) then raise exception using errcode='42501',message='Pilot readiness is no longer current.'; end if;
  if not exists(select 1 from public.routine_release_attestations attestation
    where attestation.organization_id=v_actor.organization_id and attestation.target_release_stage='pilot_ready'
      and attestation.readiness_hash=v_hash and attestation.status='accepted') then
    raise exception using errcode='42501',message='Matching accepted pilot readiness attestation is required.';
  end if;
  if not exists(select 1 from public.routine_pilot_memberships membership
    where membership.organization_id=v_actor.organization_id and membership.active
      and membership.access_level in('participant','coordinator')
      and (membership.valid_from is null or membership.valid_from<=clock_timestamp())
      and (membership.valid_until is null or membership.valid_until>clock_timestamp())) then
    raise exception using errcode='42501',message='At least one active participant pilot membership is required.';
  end if;
  perform set_config('mesh.routine_ui_internal','mode',true);
  update public.routine_organization_settings set mode='pilot',revision=revision+1,
    updated_at=clock_timestamp(),updated_by_auth_user_id=v_actor.id
  where organization_id=v_actor.organization_id returning * into v_settings;
  v_response:=jsonb_build_object('settings',jsonb_build_object('mode',v_settings.mode,
    'uiReleaseStage',v_settings.ui_release_stage,'contractVersion',v_settings.ui_contract_version,'revision',v_settings.revision),
    'reason',v_reason,'readinessHash',v_hash,'idempotentReplay',false);
  perform public.routine_phase10k1_record_operation(v_actor.organization_id,v_actor.id,'set_engine_mode',input_idempotency_key,
    v_request_hash,'organization_settings',v_actor.organization_id,v_response);
  perform set_config('mesh.routine_operator_internal','ui',true);
  perform public.routine_phase10j_record_event(v_actor.organization_id,null,null,null,'routine_engine_mode_changed',
    v_actor.id,v_actor.id,v_actor.display_name,jsonb_build_object('mode','pilot','reason',v_reason,
      'revision',v_settings.revision,'readinessHash',v_hash),null);
  return v_response;
end $$;

create or replace function public.set_routine_pilot_new_work_paused(
  input_paused boolean,input_reason text,input_expected_revision bigint,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10k1_require_personal_manager();
  v_settings public.routine_organization_settings%rowtype; v_reason text:=trim(coalesce(input_reason,''));
  v_request_hash text; v_replay jsonb; v_response jsonb;
begin
  if input_idempotency_key is null or input_expected_revision is null or char_length(v_reason) not between 3 and 1000 then
    raise exception using errcode='22023',message='Pilot pause state, reason, expected revision, and idempotency key are required.';
  end if;
  v_request_hash:=public.routine_phase10j_request_hash(jsonb_build_object('paused',input_paused,
    'reason',v_reason,'expectedRevision',input_expected_revision));
  v_replay:=public.routine_phase10k1_existing_operation(v_actor.organization_id,v_actor.id,'set_pilot_pause',input_idempotency_key,v_request_hash);
  if v_replay is not null then return v_replay; end if;
  select settings.* into v_settings from public.routine_organization_settings settings
    where settings.organization_id=v_actor.organization_id for update;
  if v_settings.mode<>'pilot' then raise exception using errcode='42501',message='Pilot pause is only available while mode is pilot.'; end if;
  if v_settings.revision<>input_expected_revision then raise exception using errcode='40001',message='Routine settings revision conflict.'; end if;
  perform set_config('mesh.routine_pilot_internal','pause',true);
  update public.routine_organization_settings set pilot_new_work_paused=input_paused,
    pilot_pause_reason=case when input_paused then v_reason else null end,
    pilot_paused_at=case when input_paused then clock_timestamp() else null end,
    pilot_paused_by_auth_user_id=case when input_paused then v_actor.id else null end,
    revision=revision+1,updated_at=clock_timestamp(),updated_by_auth_user_id=v_actor.id
  where organization_id=v_actor.organization_id returning * into v_settings;
  v_response:=jsonb_build_object('settings',jsonb_build_object('mode',v_settings.mode,
    'uiReleaseStage',v_settings.ui_release_stage,'pilotNewWorkPaused',v_settings.pilot_new_work_paused,
    'pilotPauseReason',v_settings.pilot_pause_reason,'pilotPausedAt',v_settings.pilot_paused_at,
    'revision',v_settings.revision),'reason',v_reason,'idempotentReplay',false);
  perform public.routine_phase10k1_record_operation(v_actor.organization_id,v_actor.id,'set_pilot_pause',input_idempotency_key,
    v_request_hash,'organization_settings',v_actor.organization_id,v_response);
  perform set_config('mesh.routine_operator_internal','ui',true);
  perform public.routine_phase10j_record_event(v_actor.organization_id,null,null,null,'routine_pilot_pause_changed',
    v_actor.id,v_actor.id,v_actor.display_name,jsonb_build_object('paused',input_paused,'reason',v_reason,
      'revision',v_settings.revision),null);
  return v_response;
end $$;

create or replace function public.routine_phase10k4_new_work_allowed(input_organization_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select not coalesce((select settings.mode='pilot' and settings.pilot_new_work_paused
    from public.routine_organization_settings settings where settings.organization_id=input_organization_id),false)
$$;

do $phase10k4_work_wrappers$
begin
  if to_regprocedure('public.create_or_get_routine_run_phase10k4_base(text,text,date,uuid)') is null then
    alter function public.create_or_get_routine_run(text,text,date,uuid) rename to create_or_get_routine_run_phase10k4_base;
  end if;
  if to_regprocedure('public.create_or_get_double_shift_bundle_phase10k4_base(text,text,text,date,uuid)') is null then
    alter function public.create_or_get_double_shift_bundle(text,text,text,date,uuid) rename to create_or_get_double_shift_bundle_phase10k4_base;
  end if;
  if to_regprocedure('public.start_routine_run_phase10k4_base(uuid,bigint,uuid)') is null then
    alter function public.start_routine_run(uuid,bigint,uuid) rename to start_routine_run_phase10k4_base;
  end if;
end;
$phase10k4_work_wrappers$;

create or replace function public.create_or_get_routine_run(input_routine_key text,input_scope_key text,input_operational_date date,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  if not public.routine_phase10k4_new_work_allowed(v_actor.organization_id) then
    raise exception using errcode='42501',message='routine_pilot_new_work_paused';
  end if;
  return public.create_or_get_routine_run_phase10k4_base(input_routine_key,input_scope_key,input_operational_date,input_idempotency_key);
end $$;

create or replace function public.create_or_get_double_shift_bundle(input_opening_routine_key text,input_closing_routine_key text,
  input_scope_key text,input_operational_date date default null,input_idempotency_key uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  if not public.routine_phase10k4_new_work_allowed(v_actor.organization_id) then
    raise exception using errcode='42501',message='routine_pilot_new_work_paused';
  end if;
  return public.create_or_get_double_shift_bundle_phase10k4_base(input_opening_routine_key,input_closing_routine_key,
    input_scope_key,input_operational_date,input_idempotency_key);
end $$;

create or replace function public.start_routine_run(input_run_id uuid,input_expected_revision bigint,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_run public.routine_runs%rowtype;
begin
  select run.* into v_run from public.routine_runs run where run.id=input_run_id;
  if v_run.status='scheduled' and not public.routine_phase10k4_new_work_allowed(v_run.organization_id) then
    raise exception using errcode='42501',message='routine_pilot_new_work_paused';
  end if;
  return public.start_routine_run_phase10k4_base(input_run_id,input_expected_revision,input_idempotency_key);
end $$;

-- Manager/participant history helpers. Operation ledgers are intentionally
-- absent; corrections and overrides remain separate immutable collections.
create or replace function public.routine_phase10k4_history_actor()
returns table(organization_id uuid,actor_auth_user_id uuid,actor_profile_id uuid,effective_operator_id uuid,
  actor_source text,actor_role text,is_manager boolean)
language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor record;
begin
  select * into v_actor from public.routine_resolve_effective_actor();
  if v_actor.organization_id is null then raise exception using errcode='42501',message='Active Routine identity is required.'; end if;
  return query select v_actor.organization_id,v_actor.actor_auth_user_id,v_actor.actor_profile_id,
    v_actor.effective_operator_id,v_actor.actor_source,v_actor.actor_role,
    v_actor.actor_source='personal_auth' and v_actor.actor_role='manager';
end $$;

create or replace function public.routine_phase10k4_run_visible(input_run_id uuid)
returns boolean language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor record;
begin
  select * into v_actor from public.routine_phase10k4_history_actor();
  if v_actor.is_manager then
    return exists(select 1 from public.routine_runs run where run.id=input_run_id and run.organization_id=v_actor.organization_id);
  end if;
  return exists(select 1 from public.routine_run_participants participant
    where participant.run_id=input_run_id and participant.organization_id=v_actor.organization_id
      and participant.participation_status<>'removed' and (
        (v_actor.actor_source='personal_auth' and participant.identity_type='personal_profile'
          and participant.user_profile_id=v_actor.actor_profile_id)
        or (v_actor.actor_source='shared_device_operator' and participant.identity_type='shared_device_operator'
          and participant.operator_id=v_actor.effective_operator_id)));
end $$;

create or replace function public.list_routine_v2_history(
  input_date_from date,input_date_to date,input_routine_key text default null,input_status text default null,
  input_actor_id uuid default null,input_has_deviation boolean default null,input_has_mismatch boolean default null,
  input_limit integer default 100,input_cursor jsonb default null
)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor record; v_limit integer:=least(greatest(coalesce(input_limit,100),1),100);
  v_from date:=coalesce(input_date_from,current_date-interval '31 days'); v_to date:=coalesce(input_date_to,current_date);
  v_cursor_date date; v_cursor_id uuid; v_rows jsonb; v_count integer; v_has_more boolean; v_next_cursor jsonb;
begin
  select * into v_actor from public.routine_phase10k4_history_actor();
  if v_to<v_from or v_to-v_from>366 then raise exception using errcode='22023',message='History date range must be between 0 and 366 days.'; end if;
  if input_actor_id is not null and not v_actor.is_manager then raise exception using errcode='42501',message='Actor filters require personal manager access.'; end if;
  if input_cursor is not null then
    v_cursor_date:=(input_cursor->>'operationalDate')::date; v_cursor_id:=(input_cursor->>'id')::uuid;
  end if;
  with visible as(
    select run.* from public.routine_runs run
    where run.organization_id=v_actor.organization_id and run.operational_date between v_from and v_to
      and (v_actor.is_manager or public.routine_phase10k4_run_visible(run.id))
      and (input_routine_key is null or run.routine_key=lower(trim(input_routine_key)))
      and (input_status is null or run.status=input_status)
      and (input_actor_id is null or exists(select 1 from public.routine_run_participants participant
        where participant.run_id=run.id and (participant.user_profile_id=input_actor_id or participant.operator_id=input_actor_id)))
      and (input_has_deviation is null or input_has_deviation=exists(select 1 from public.routine_deviations deviation where deviation.run_id=run.id))
      and (input_has_mismatch is null or input_has_mismatch=exists(select 1 from public.routine_delivery_comparisons comparison
        where comparison.opening_run_id=run.id and comparison.comparison_result='mismatch'))
      and (v_cursor_date is null or (run.operational_date,run.id)<(v_cursor_date,v_cursor_id))
    order by run.operational_date desc,run.id desc limit v_limit+1),
  page as(select * from visible order by operational_date desc,id desc limit v_limit)
  select coalesce(jsonb_agg(jsonb_build_object('id',run.id,'sourceSystem','routine_engine_v2','sourceConfidence','authoritative',
    'operationalDate',run.operational_date,'routineKey',run.routine_key,'scopeKey',run.scope_key,'status',run.status,
    'templateVersionNumber',run.template_version_number_snapshot,'templateContentHash',run.template_content_hash_snapshot,
    'snapshotHash',run.snapshot_hash,'reopenCount',run.reopen_count,'finishSequence',run.current_finish_sequence,
    'availableFields',jsonb_build_array('templateVersion','snapshotHash','participants','taskOutcomes','immutableEventTimeline',
      'deviations','managerOverrides','verification','handover','transfer','delivery','comparison','doubleShift','syncEvidence','corrections'),
    'unavailableFields','[]'::jsonb,
    'participantCount',(select count(*) from public.routine_run_participants participant where participant.run_id=run.id),
    'deviationCount',(select count(*) from public.routine_deviations deviation where deviation.run_id=run.id),
    'hasMismatch',exists(select 1 from public.routine_delivery_comparisons comparison where comparison.opening_run_id=run.id and comparison.comparison_result='mismatch'))
    order by run.operational_date desc,run.id desc),'[]'::jsonb),count(*),
    (select count(*) from visible)>v_limit,
    (select jsonb_build_object('operationalDate',last_run.operational_date,'id',last_run.id)
      from page last_run order by last_run.operational_date,last_run.id limit 1)
  into v_rows,v_count,v_has_more,v_next_cursor from page run;
  return jsonb_build_object('sourceSystem','routine_engine_v2','items',v_rows,'hasMore',v_has_more,
    'nextCursor',case when v_count=0 then null else v_next_cursor end);
end $$;

create or replace function public.get_routine_v2_history_run(input_run_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_run public.routine_runs%rowtype; v_actor record;
begin
  select * into v_actor from public.routine_phase10k4_history_actor();
  if not public.routine_phase10k4_run_visible(input_run_id) then raise exception using errcode='42501',message='Routine history is not visible to this actor.'; end if;
  select run.* into v_run from public.routine_runs run where run.id=input_run_id;
  return jsonb_build_object('sourceSystem','routine_engine_v2','sourceConfidence','authoritative','run',to_jsonb(v_run),
    'actions',jsonb_build_object('canCreateManagerOverride',v_actor.is_manager and v_run.status not in('cancelled','superseded'),
      'canRecordCorrection',v_actor.is_manager,'canReopenRun',v_actor.is_manager and v_run.status='finished',
      'canCancelRun',v_actor.is_manager and v_run.status not in('finished','cancelled','superseded'),
      'reopenTaskIds',case when v_actor.is_manager and v_run.status not in('finished','cancelled','superseded') then
        (select coalesce(jsonb_agg(task.id order by task.sort_order_snapshot,task.id),'[]'::jsonb)
          from public.routine_run_tasks task where task.run_id=v_run.id and task.status in('completed','not_applicable','transferred')) else '[]'::jsonb end,
      'assignDeviationIds',case when v_actor.is_manager then
        (select coalesce(jsonb_agg(deviation.id order by deviation.detected_at,deviation.id),'[]'::jsonb)
          from public.routine_deviations deviation where deviation.run_id=v_run.id and deviation.status not in('resolved','cancelled')) else '[]'::jsonb end,
      'mitigateDeviationIds',case when v_actor.is_manager then
        (select coalesce(jsonb_agg(deviation.id order by deviation.detected_at,deviation.id),'[]'::jsonb)
          from public.routine_deviations deviation where deviation.run_id=v_run.id and deviation.status='open') else '[]'::jsonb end,
      'resolveDeviationIds',case when v_actor.is_manager then
        (select coalesce(jsonb_agg(deviation.id order by deviation.detected_at,deviation.id),'[]'::jsonb)
          from public.routine_deviations deviation where deviation.run_id=v_run.id and deviation.status in('open','mitigated')) else '[]'::jsonb end,
      'cancelDeviationIds',case when v_actor.is_manager then
        (select coalesce(jsonb_agg(deviation.id order by deviation.detected_at,deviation.id),'[]'::jsonb)
          from public.routine_deviations deviation where deviation.run_id=v_run.id and deviation.status not in('resolved','cancelled')) else '[]'::jsonb end),
    'participants',(select coalesce(jsonb_agg(to_jsonb(participant) order by participant.joined_at,participant.id),'[]'::jsonb) from public.routine_run_participants participant where participant.run_id=v_run.id),
    'tasks',(select coalesce(jsonb_agg(to_jsonb(task) order by task.sort_order_snapshot,task.id),'[]'::jsonb) from public.routine_run_tasks task where task.run_id=v_run.id),
    'events',(select coalesce(jsonb_agg(to_jsonb(event)-'operation_id' order by event.server_created_at,event.id),'[]'::jsonb) from public.routine_events event where event.run_id=v_run.id),
    'deviations',(select coalesce(jsonb_agg(to_jsonb(deviation) order by deviation.detected_at,deviation.id),'[]'::jsonb) from public.routine_deviations deviation where deviation.run_id=v_run.id),
    'managerOverrides',(select coalesce(jsonb_agg(to_jsonb(override_row) order by override_row.created_at,override_row.id),'[]'::jsonb) from public.routine_manager_overrides override_row where override_row.run_id=v_run.id),
    'taskVerifications',(select coalesce(jsonb_agg(to_jsonb(verification) order by verification.verified_at,verification.id),'[]'::jsonb) from public.routine_task_verifications verification where verification.run_id=v_run.id),
    'runVerifications',(select coalesce(jsonb_agg(to_jsonb(verification) order by verification.verified_at,verification.id),'[]'::jsonb) from public.routine_run_verifications verification where verification.run_id=v_run.id),
    'handovers',(select coalesce(jsonb_agg(to_jsonb(handover) order by handover.created_at,handover.id),'[]'::jsonb) from public.routine_handovers handover where handover.from_run_id=v_run.id or handover.to_run_id=v_run.id),
    'transfers',(select coalesce(jsonb_agg(to_jsonb(transfer) order by transfer.proposed_at,transfer.id),'[]'::jsonb) from public.routine_run_transfers transfer where transfer.from_run_id=v_run.id or transfer.target_run_id=v_run.id),
    'deliveries',(select coalesce(jsonb_agg(to_jsonb(record) order by record.source_finish_sequence,record.id),'[]'::jsonb) from public.routine_delivery_records record where record.source_run_id=v_run.id),
    'comparisons',(select coalesce(jsonb_agg(to_jsonb(comparison) order by comparison.comparison_sequence,comparison.id),'[]'::jsonb) from public.routine_delivery_comparisons comparison where comparison.opening_run_id=v_run.id or comparison.source_closing_run_id=v_run.id),
    'doubleShift',(select coalesce(jsonb_agg(jsonb_build_object('bundle',to_jsonb(bundle),'phase',link.phase) order by bundle.operational_date,bundle.id),'[]'::jsonb) from public.routine_bundle_runs link join public.routine_bundles bundle on bundle.id=link.bundle_id where link.run_id=v_run.id),
    'corrections',(select coalesce(jsonb_agg(to_jsonb(correction) order by correction.created_at,correction.id),'[]'::jsonb) from public.routine_corrections correction where correction.run_id=v_run.id),
    'syncEvidence',(select coalesce(jsonb_agg(jsonb_build_object('eventId',event.id,'actorSource',event.actor_source,
      'clientInstanceId',event.client_instance_id,'clientEventAt',event.client_event_at,'serverCreatedAt',event.server_created_at)
      order by event.server_created_at,event.id),'[]'::jsonb) from public.routine_events event where event.run_id=v_run.id
      and (event.client_instance_id is not null or event.actor_source='shared_device_operator')));
end $$;

create or replace function public.get_routine_v2_history_task(input_task_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_task public.routine_run_tasks%rowtype;
begin
  select task.* into v_task from public.routine_run_tasks task where task.id=input_task_id;
  if v_task.id is null or not public.routine_phase10k4_run_visible(v_task.run_id) then raise exception using errcode='42501',message='Routine task history is not visible to this actor.'; end if;
  return jsonb_build_object('sourceSystem','routine_engine_v2','sourceConfidence','authoritative','task',to_jsonb(v_task),
    'items',(select coalesce(jsonb_agg(to_jsonb(item) order by item.sort_order_snapshot,item.id),'[]'::jsonb) from public.routine_run_task_items item where item.run_task_id=v_task.id),
    'events',(select coalesce(jsonb_agg(to_jsonb(event)-'operation_id' order by event.server_created_at,event.id),'[]'::jsonb) from public.routine_events event where event.task_id=v_task.id),
    'deviations',(select coalesce(jsonb_agg(to_jsonb(deviation) order by deviation.detected_at,deviation.id),'[]'::jsonb) from public.routine_deviations deviation where deviation.task_id=v_task.id),
    'managerOverrides',(select coalesce(jsonb_agg(to_jsonb(override_row) order by override_row.created_at,override_row.id),'[]'::jsonb) from public.routine_manager_overrides override_row where override_row.task_id=v_task.id),
    'verifications',(select coalesce(jsonb_agg(to_jsonb(verification) order by verification.verified_at,verification.id),'[]'::jsonb) from public.routine_task_verifications verification where verification.task_id=v_task.id),
    'corrections',(select coalesce(jsonb_agg(to_jsonb(correction) order by correction.created_at,correction.id),'[]'::jsonb) from public.routine_corrections correction where correction.run_id=v_task.run_id and correction.entity_id=v_task.id));
end $$;

create or replace function public.get_routine_manager_review_dashboard(input_date_from date,input_date_to date)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10k1_require_personal_manager();
  v_from date:=coalesce(input_date_from,current_date-interval '31 days'); v_to date:=coalesce(input_date_to,current_date);
begin
  if v_to<v_from or v_to-v_from>366 then raise exception using errcode='22023',message='Review date range must be between 0 and 366 days.'; end if;
  return jsonb_build_object('dateFrom',v_from,'dateTo',v_to,
    'runs',(select count(*) from public.routine_runs run where run.organization_id=v_actor.organization_id and run.operational_date between v_from and v_to),
    'finishedRuns',(select count(*) from public.routine_runs run where run.organization_id=v_actor.organization_id and run.operational_date between v_from and v_to and run.status='finished'),
    'reopenedRuns',(select count(*) from public.routine_runs run where run.organization_id=v_actor.organization_id and run.operational_date between v_from and v_to and run.reopen_count>0),
    'openDeviations',(select count(*) from public.routine_deviations deviation join public.routine_runs run on run.id=deviation.run_id where run.organization_id=v_actor.organization_id and run.operational_date between v_from and v_to and deviation.status in('open','mitigated','accepted_temporarily')),
    'overrideFollowups',(select count(*) from public.routine_manager_overrides override_row join public.routine_runs run on run.id=override_row.run_id where run.organization_id=v_actor.organization_id and run.operational_date between v_from and v_to and override_row.follow_up_due_at<=clock_timestamp()),
    'mismatches',(select count(*) from public.routine_delivery_comparisons comparison where comparison.organization_id=v_actor.organization_id and comparison.opening_operational_date between v_from and v_to and comparison.comparison_result='mismatch'),
    'corrections',(select count(*) from public.routine_corrections correction join public.routine_runs run on run.id=correction.run_id where correction.organization_id=v_actor.organization_id and run.operational_date between v_from and v_to));
end $$;

create or replace function public.list_routine_override_followups(input_status_filter text default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10k1_require_personal_manager();
begin
  return coalesce((select jsonb_agg(row_value.payload order by row_value.due_at,row_value.id) from(
    select override_row.id,override_row.follow_up_due_at due_at,jsonb_build_object('id',override_row.id,'runId',override_row.run_id,
      'taskId',override_row.task_id,'overrideType',override_row.override_type,'reason',override_row.reason,
      'remainingRisk',override_row.remaining_risk,'temporaryMeasure',override_row.temporary_measure,
      'followUpOwnerParticipantId',override_row.follow_up_owner_participant_id,'followUpDueAt',override_row.follow_up_due_at,
      'expiresAt',override_row.expires_at,'createdAt',override_row.created_at,'createdBy',override_row.created_by_name_snapshot,
      'status',case when exists(select 1 from public.routine_manager_overrides newer where newer.supersedes_override_id=override_row.id) then 'superseded'
        when override_row.expires_at is not null and override_row.expires_at<=clock_timestamp() then 'expired'
        when override_row.follow_up_due_at<=clock_timestamp() then 'overdue' else 'open' end) payload
    from public.routine_manager_overrides override_row where override_row.organization_id=v_actor.organization_id
      and (input_status_filter is null or input_status_filter=case when exists(select 1 from public.routine_manager_overrides newer where newer.supersedes_override_id=override_row.id) then 'superseded'
        when override_row.expires_at is not null and override_row.expires_at<=clock_timestamp() then 'expired'
        when override_row.follow_up_due_at<=clock_timestamp() then 'overdue' else 'open' end)
  ) row_value),'[]'::jsonb);
end $$;

create or replace function public.list_routine_history_corrections(input_date_from date,input_date_to date)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10k1_require_personal_manager();
  v_from date:=coalesce(input_date_from,current_date-interval '31 days'); v_to date:=coalesce(input_date_to,current_date);
begin
  if v_to<v_from or v_to-v_from>366 then raise exception using errcode='22023',message='Correction date range must be between 0 and 366 days.'; end if;
  return coalesce((select jsonb_agg(to_jsonb(correction) order by correction.created_at desc,correction.id desc)
    from public.routine_corrections correction join public.routine_runs run on run.id=correction.run_id
    where correction.organization_id=v_actor.organization_id and run.operational_date between v_from and v_to),'[]'::jsonb);
end $$;

create or replace function public.get_routine_legacy_history_summary()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10k1_require_personal_manager();
begin
  return jsonb_build_object('sourceSystem','legacy_shift_log','sourceConfidence','legacy_record_only',
    'sameOrganization',jsonb_build_object(
      'shiftSessions',(select count(*) from public.shift_sessions where organization_id=v_actor.organization_id),
      'taskCompletions',(select count(*) from public.task_completions where organization_id=v_actor.organization_id),
      'handoverNotes',(select count(*) from public.handover_notes where organization_id=v_actor.organization_id),
      'closeDayArchives',(select count(*) from public.close_day_archives where organization_id=v_actor.organization_id),
      'managerDailyReviews',(select count(*) from public.manager_daily_reviews where organization_id=v_actor.organization_id)),
    'unscopedLegacyCount',(select (select count(*) from public.shift_sessions where organization_id is null)
      +(select count(*) from public.task_completions where organization_id is null)
      +(select count(*) from public.handover_notes where organization_id is null)
      +(select count(*) from public.close_day_archives where organization_id is null)
      +(select count(*) from public.manager_daily_reviews where organization_id is null)),
    'automaticAssignment',false,'detailsForUnscopedRows',false);
end $$;

create or replace function public.list_routine_legacy_history(
  input_date_from date,input_date_to date,input_limit integer default 100,input_cursor jsonb default null
)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10k1_require_personal_manager();
  v_from date:=coalesce(input_date_from,current_date-interval '31 days'); v_to date:=coalesce(input_date_to,current_date);
  v_limit integer:=least(greatest(coalesce(input_limit,100),1),100); v_items jsonb; v_cursor_date date; v_cursor_id uuid;
  v_has_more boolean; v_next_cursor jsonb; v_count integer;
begin
  if v_to<v_from or v_to-v_from>366 then raise exception using errcode='22023',message='Legacy history date range must be between 0 and 366 days.'; end if;
  if input_cursor is not null then
    v_cursor_date:=(input_cursor->>'operationalDate')::date; v_cursor_id:=(input_cursor->>'id')::uuid;
  end if;
  with legacy as(
    select session.id,session.shift_date record_date,'shift_session' record_type,session.shift_key title,session.status,
      jsonb_build_object('displayName',session.display_name,'startedAt',session.started_at,'finishedAt',session.finished_at) available
      from public.shift_sessions session where session.organization_id=v_actor.organization_id and session.shift_date between v_from and v_to
        and (v_cursor_date is null or (session.shift_date,session.id)<(v_cursor_date,v_cursor_id))
    union all select completion.id,completion.shift_date,'task_completion',coalesce(completion.task_title,completion.task_id),completion.status,
      jsonb_build_object('completedAt',completion.completed_at,'completedBy',completion.completed_by_name) from public.task_completions completion
      where completion.organization_id=v_actor.organization_id and completion.shift_date between v_from and v_to
        and (v_cursor_date is null or (completion.shift_date,completion.id)<(v_cursor_date,v_cursor_id))
    union all select note.id,note.note_date,'handover_note',coalesce(note.shift_key,'Handover'), 'recorded',
      jsonb_build_object('createdBy',note.created_by_name,'createdAt',note.created_at) from public.handover_notes note
      where note.organization_id=v_actor.organization_id and note.note_date between v_from and v_to
        and (v_cursor_date is null or (note.note_date,note.id)<(v_cursor_date,v_cursor_id))
    union all select archive.id,archive.close_date,'close_day_archive','Close day',archive.status,
      jsonb_build_object('closedBy',archive.closed_by_name,'closedAt',archive.closed_at,'checksPassed',archive.checks_passed,'totalChecks',archive.total_checks)
      from public.close_day_archives archive where archive.organization_id=v_actor.organization_id and archive.close_date between v_from and v_to
        and (v_cursor_date is null or (archive.close_date,archive.id)<(v_cursor_date,v_cursor_id))
    union all select review.id,review.review_date,'manager_daily_review','Manager daily review',
      case when review.signed_off_at is null then 'draft' else 'signed' end,
      jsonb_build_object('signedOffBy',review.signed_off_by_name,'signedOffAt',review.signed_off_at)
      from public.manager_daily_reviews review where review.organization_id=v_actor.organization_id and review.review_date between v_from and v_to
        and (v_cursor_date is null or (review.review_date,review.id)<(v_cursor_date,v_cursor_id))
    order by record_date desc,id desc limit v_limit+1),
  page as(select * from legacy order by record_date desc,id desc limit v_limit)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'operationalDate',record_date,'recordType',record_type,
    'title',title,'status',status,'sourceSystem','legacy_shift_log','sourceConfidence','legacy_record_only',
    'availableFields',available,'unavailableFields',jsonb_build_array('templateVersion','snapshotHash','immutableEventTimeline',
      'verification','doubleShift','deliveryComparison')) order by record_date desc,id desc),'[]'::jsonb),count(*),
    (select count(*) from legacy)>v_limit,
    (select jsonb_build_object('operationalDate',last_row.record_date,'id',last_row.id)
      from page last_row order by last_row.record_date,last_row.id limit 1)
  into v_items,v_count,v_has_more,v_next_cursor from page;
  return jsonb_build_object('sourceSystem','legacy_shift_log','items',v_items,'hasMore',v_has_more,
    'nextCursor',case when v_count=0 then null else v_next_cursor end);
end $$;

create or replace function public.get_unified_routine_history(
  input_date_from date,input_date_to date,input_limit integer default 100,input_cursor jsonb default null
)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10k1_require_personal_manager();
  v_v2 jsonb; v_legacy jsonb; v_limit integer:=least(greatest(coalesce(input_limit,100),1),100);
  v_items jsonb; v_next_cursor jsonb;
begin
  v_v2:=public.list_routine_v2_history(input_date_from,input_date_to,null,null,null,null,null,v_limit,input_cursor);
  v_legacy:=public.list_routine_legacy_history(input_date_from,input_date_to,v_limit,input_cursor);
  with combined as(select value item from jsonb_array_elements(v_v2->'items') union all
    select value item from jsonb_array_elements(v_legacy->'items')),
  page as(select item from combined order by item->>'operationalDate' desc,item->>'id' desc limit v_limit)
  select coalesce(jsonb_agg(item order by item->>'operationalDate' desc,item->>'id' desc),'[]'::jsonb),
    (select jsonb_build_object('operationalDate',last_item.item->>'operationalDate','id',last_item.item->>'id')
      from page last_item order by last_item.item->>'operationalDate',last_item.item->>'id' limit 1)
  into v_items,v_next_cursor from page;
  return jsonb_build_object('items',v_items,'hasMore',(v_v2->>'hasMore')::boolean or (v_legacy->>'hasMore')::boolean,
    'nextCursor',v_next_cursor,
    'sources',jsonb_build_array(
      jsonb_build_object('sourceSystem','routine_engine_v2','sourceConfidence','authoritative'),
      jsonb_build_object('sourceSystem','legacy_shift_log','sourceConfidence','legacy_record_only')),
    'unscopedLegacyCount',public.get_routine_legacy_history_summary()->'unscopedLegacyCount');
end $$;

-- Private helpers are revoked from application roles. Public entry points are
-- authenticated-only and every write entry point still performs personal
-- manager authentication inside the function.
revoke all on function public.routine_phase10k4_immutable_attestation_guard(),
  public.routine_phase10k4_category(boolean,jsonb,jsonb,jsonb),
  public.routine_compute_pilot_readiness(uuid),public.routine_compute_pilot_readiness_hash(uuid),
  public.routine_phase10k4_new_work_allowed(uuid),public.routine_phase10k4_history_actor(),
  public.routine_phase10k4_run_visible(uuid),
  public.set_routine_engine_mode_phase10k4_base(text,bigint,text,uuid),
  public.create_or_get_routine_run_phase10k4_base(text,text,date,uuid),
  public.create_or_get_double_shift_bundle_phase10k4_base(text,text,text,date,uuid),
  public.start_routine_run_phase10k4_base(uuid,bigint,uuid)
from public,anon,authenticated;

revoke all on function public.get_routine_pilot_readiness(),
  public.record_routine_e2e_verification_attestation(jsonb,text,uuid),
  public.promote_routine_ui_release_stage(text,bigint,text,text,uuid),
  public.set_routine_engine_mode(text,bigint,text,uuid),
  public.set_routine_pilot_new_work_paused(boolean,text,bigint,uuid),
  public.create_or_get_routine_run(text,text,date,uuid),
  public.create_or_get_double_shift_bundle(text,text,text,date,uuid),
  public.start_routine_run(uuid,bigint,uuid),
  public.list_routine_v2_history(date,date,text,text,uuid,boolean,boolean,integer,jsonb),
  public.get_routine_v2_history_run(uuid),public.get_routine_v2_history_task(uuid),
  public.get_routine_manager_review_dashboard(date,date),public.list_routine_override_followups(text),
  public.list_routine_history_corrections(date,date),public.get_routine_legacy_history_summary(),
  public.list_routine_legacy_history(date,date,integer,jsonb),
  public.get_unified_routine_history(date,date,integer,jsonb)
from public,anon,authenticated;

grant execute on function public.get_routine_pilot_readiness(),
  public.record_routine_e2e_verification_attestation(jsonb,text,uuid),
  public.promote_routine_ui_release_stage(text,bigint,text,text,uuid),
  public.set_routine_engine_mode(text,bigint,text,uuid),
  public.set_routine_pilot_new_work_paused(boolean,text,bigint,uuid),
  public.create_or_get_routine_run(text,text,date,uuid),
  public.create_or_get_double_shift_bundle(text,text,text,date,uuid),
  public.start_routine_run(uuid,bigint,uuid),
  public.list_routine_v2_history(date,date,text,text,uuid,boolean,boolean,integer,jsonb),
  public.get_routine_v2_history_run(uuid),public.get_routine_v2_history_task(uuid),
  public.get_routine_manager_review_dashboard(date,date),public.list_routine_override_followups(text),
  public.list_routine_history_corrections(date,date),public.get_routine_legacy_history_summary(),
  public.list_routine_legacy_history(date,date,integer,jsonb),
  public.get_unified_routine_history(date,date,integer,jsonb)
to authenticated;
