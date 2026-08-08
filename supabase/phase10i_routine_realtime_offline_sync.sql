-- Phase 10I: Realtime signals, authenticated offline receipts, conflict
-- preservation, and immutable late-delivery reconciliation.
--
-- Apply after Phase 10A, 10A1, and Phase 10B through Phase 10H. This migration creates no routine
-- content or operational rows. It does not touch Inventory, Asset Registry,
-- Event Operations, Auth configuration, Storage, or legacy routines.

do $phase10i_realtime_publication$
begin
  if exists(select 1 from pg_catalog.pg_publication where pubname='supabase_realtime')
     and not exists(select 1 from pg_catalog.pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename='routine_events') then
    execute 'alter publication supabase_realtime add table public.routine_events';
  end if;
end;
$phase10i_realtime_publication$;

create index if not exists routine_events_org_cursor_idx
  on public.routine_events(organization_id,server_created_at,id);
create index if not exists routine_events_org_run_cursor_idx
  on public.routine_events(organization_id,run_id,server_created_at,id);
create index if not exists routine_events_org_bundle_cursor_idx
  on public.routine_events(organization_id,bundle_id,server_created_at,id);

-- Registration/revocation idempotency is stored on the instance projection.
-- It is not an authority source and cannot be used to obtain run access.
create table if not exists public.routine_client_instances(
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  auth_user_id uuid not null references auth.users(id),
  user_profile_id uuid not null,
  app_version text not null,
  offline_schema_version text not null,
  platform_label text,
  registration_idempotency_key uuid not null,
  registration_request_hash text not null,
  revocation_idempotency_key uuid,
  revocation_request_hash text,
  revocation_reason text,
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_auth_user_id uuid references auth.users(id),
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routine_client_instances_identity_unique unique(id,organization_id,auth_user_id),
  constraint routine_client_instances_version_check check(
    app_version=trim(app_version) and offline_schema_version=trim(offline_schema_version)
    and char_length(app_version) between 1 and 80
    and char_length(offline_schema_version) between 1 and 80),
  constraint routine_client_instances_platform_check check(
    platform_label is null or (platform_label=trim(platform_label) and char_length(platform_label) between 1 and 120)),
  constraint routine_client_instances_hash_check check(registration_request_hash~'^[0-9a-f]{64}$'
    and (revocation_request_hash is null or revocation_request_hash~'^[0-9a-f]{64}$')),
  constraint routine_client_instances_revision_check check(revision>0),
  constraint routine_client_instances_revoke_check check(
    (revoked_at is null and revoked_by_auth_user_id is null and revocation_idempotency_key is null
      and revocation_request_hash is null and revocation_reason is null)
    or (revoked_at is not null and revoked_by_auth_user_id is not null
      and revocation_idempotency_key is not null and revocation_request_hash is not null
      and char_length(trim(revocation_reason)) between 1 and 1000))
);

create table if not exists public.routine_offline_operation_receipts(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  actor_auth_user_id uuid not null references auth.users(id),
  actor_profile_id uuid not null,
  client_instance_id uuid not null,
  client_operation_id uuid not null,
  operation_type text not null,
  request_hash text not null,
  receipt_status text not null,
  resource_type text not null,
  resource_id uuid,
  response_payload jsonb not null default '{}'::jsonb,
  conflict_payload jsonb not null default '{}'::jsonb,
  client_recorded_at timestamptz,
  client_time_authoritative boolean not null default false,
  server_received_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint routine_offline_receipts_instance_fkey
    foreign key(client_instance_id,organization_id,actor_auth_user_id)
    references public.routine_client_instances(id,organization_id,auth_user_id),
  constraint routine_offline_receipts_operation_unique
    unique(organization_id,actor_auth_user_id,client_instance_id,client_operation_id),
  constraint routine_offline_receipts_status_check check(receipt_status in('applied','conflict','rejected')),
  constraint routine_offline_receipts_operation_check check(operation_type in('task_bundle','run_finish_intent')),
  constraint routine_offline_receipts_resource_check check(resource_type in('task','run')),
  constraint routine_offline_receipts_hash_check check(request_hash~'^[0-9a-f]{64}$'),
  constraint routine_offline_receipts_json_check check(jsonb_typeof(response_payload)='object'
    and jsonb_typeof(conflict_payload)='object'
    and pg_column_size(response_payload)<=131072 and pg_column_size(conflict_payload)<=131072),
  constraint routine_offline_receipts_client_time_check check(not client_time_authoritative),
  constraint routine_offline_receipts_shape_check check(
    (receipt_status='applied' and completed_at is not null and response_payload<>'{}'::jsonb)
    or (receipt_status in('conflict','rejected') and completed_at is not null and conflict_payload<>'{}'::jsonb))
);

create table if not exists public.routine_delivery_reconciliations(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  trigger_type text not null,
  source_run_id uuid not null,
  delivery_record_id uuid,
  opening_run_id uuid not null,
  opening_task_id uuid not null,
  previous_comparison_id uuid,
  new_comparison_id uuid not null,
  comparison_result_snapshot text not null,
  linked_deviation_id uuid,
  reconciliation_reason text not null,
  reconciliation_hash text not null,
  operation_id uuid,
  created_at timestamptz not null default now(),
  created_by_actor_type text not null default 'system',
  constraint routine_delivery_reconciliations_source_fkey foreign key(source_run_id,organization_id)
    references public.routine_runs(id,organization_id),
  constraint routine_delivery_reconciliations_record_fkey foreign key(delivery_record_id,organization_id,source_run_id)
    references public.routine_delivery_records(id,organization_id,source_run_id),
  constraint routine_delivery_reconciliations_opening_task_fkey
    foreign key(opening_task_id,organization_id,opening_run_id)
    references public.routine_run_tasks(id,organization_id,run_id),
  constraint routine_delivery_reconciliations_previous_fkey
    foreign key(previous_comparison_id,organization_id,opening_run_id,opening_task_id)
    references public.routine_delivery_comparisons(id,organization_id,opening_run_id,opening_task_id),
  constraint routine_delivery_reconciliations_new_fkey
    foreign key(new_comparison_id,organization_id,opening_run_id,opening_task_id)
    references public.routine_delivery_comparisons(id,organization_id,opening_run_id,opening_task_id),
  constraint routine_delivery_reconciliations_deviation_fkey
    foreign key(linked_deviation_id,organization_id,opening_run_id,opening_task_id)
    references public.routine_deviations(id,organization_id,run_id,task_id),
  constraint routine_delivery_reconciliations_operation_fkey foreign key(operation_id,organization_id)
    references public.routine_run_operations(id,organization_id) deferrable initially deferred,
  constraint routine_delivery_reconciliations_semantic_unique unique(opening_task_id,new_comparison_id),
  constraint routine_delivery_reconciliations_trigger_check check(trigger_type in(
    'late_delivery_generated','source_run_reopened','source_run_refinished','manual_reconciliation')),
  constraint routine_delivery_reconciliations_actor_check check(created_by_actor_type in('system','user')),
  constraint routine_delivery_reconciliations_result_check check(comparison_result_snapshot in(
    'matched','mismatch','confirmed_prior_deviation','resolved_after_delivery','no_previous_delivery','not_comparable')),
  constraint routine_delivery_reconciliations_reason_check check(
    reconciliation_reason=trim(reconciliation_reason) and char_length(reconciliation_reason) between 1 and 1000),
  constraint routine_delivery_reconciliations_hash_check check(reconciliation_hash~'^[0-9a-f]{64}$')
);

create index if not exists routine_client_instances_actor_idx
  on public.routine_client_instances(organization_id,auth_user_id,last_seen_at desc);
create index if not exists routine_offline_receipts_actor_idx
  on public.routine_offline_operation_receipts(organization_id,actor_auth_user_id,server_received_at desc);
create index if not exists routine_offline_receipts_resource_idx
  on public.routine_offline_operation_receipts(organization_id,resource_type,resource_id,server_received_at desc);
create index if not exists routine_delivery_reconciliations_task_idx
  on public.routine_delivery_reconciliations(opening_task_id,created_at,id);
create index if not exists routine_delivery_reconciliations_source_idx
  on public.routine_delivery_reconciliations(source_run_id,created_at,id);

create or replace function public.routine_phase10i_immutable_guard()
returns trigger language plpgsql set search_path=pg_catalog
as $$ begin raise exception using errcode='P0001',message=tg_table_name||' rows are immutable.'; end $$;

create or replace function public.routine_phase10i_json_has_forbidden_key(input_value jsonb)
returns boolean language sql immutable set search_path=pg_catalog
as $$
  with recursive walk(value) as(
    select coalesce(input_value,'null'::jsonb)
    union all
    select child.value from walk parent cross join lateral(
      select value from jsonb_array_elements(parent.value) where jsonb_typeof(parent.value)='array'
      union all
      select value from jsonb_each(parent.value) where jsonb_typeof(parent.value)='object'
    ) child
  )
  select coalesce(exists(select 1 from walk where jsonb_typeof(value)='object' and exists(
    select 1 from jsonb_object_keys(value) key where lower(key) in(
      'password','token','access_token','refresh_token','service_role','api_key',
      'alarm_code','safe_code','payment_data','card_number'))),false);
$$;

create or replace function public.routine_phase10i_canonical_json(input_value jsonb)
returns text language plpgsql immutable set search_path=pg_catalog
as $$
declare v_type text:=jsonb_typeof(input_value); v_result text; v_pair record;
begin
  if v_type='object' then
    v_result:='{';
    for v_pair in select key,value from jsonb_each(input_value) order by key loop
      if v_result<>'{' then v_result:=v_result||','; end if;
      v_result:=v_result||to_jsonb(v_pair.key)::text||':'||public.routine_phase10i_canonical_json(v_pair.value);
    end loop;
    return v_result||'}';
  elsif v_type='array' then
    select '['||coalesce(string_agg(public.routine_phase10i_canonical_json(value),',' order by ordinal),'')||']'
      into v_result from jsonb_array_elements(input_value) with ordinality item(value,ordinal);
    return v_result;
  end if;
  return input_value::text;
end;
$$;

create or replace function public.routine_phase10i_request_hash(input_value jsonb)
returns text language sql immutable set search_path=pg_catalog
as $$ select encode(extensions.digest(public.routine_phase10i_canonical_json(input_value),'sha256'),'hex'); $$;

create or replace function public.routine_phase10i_uuid(input_value text)
returns uuid language sql immutable set search_path=pg_catalog
as $$ select (substr(md5(input_value),1,8)||'-'||substr(md5(input_value),9,4)||'-4'||substr(md5(input_value),14,3)
  ||'-a'||substr(md5(input_value),18,3)||'-'||substr(md5(input_value),21,12))::uuid; $$;

create or replace function public.routine_client_instance_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_profile public.user_profiles%rowtype;
begin
  if tg_op='DELETE' then raise exception using errcode='P0001',message='Routine client instances cannot be deleted.'; end if;
  if current_setting('mesh.routine_sync_internal',true) is null then
    raise exception using errcode='P0001',message='Routine client instances require an authorized RPC.';
  end if;
  select profile.* into v_profile from public.user_profiles profile where profile.id=new.user_profile_id;
  if v_profile.id is null or v_profile.organization_id is distinct from new.organization_id
     or v_profile.id is distinct from new.auth_user_id or not v_profile.active
     or coalesce(v_profile.is_shared_device,false) then
    raise exception using errcode='P0001',message='Client instance requires an active personal same-organization identity.';
  end if;
  if tg_op='UPDATE' then
    if row(new.id,new.organization_id,new.auth_user_id,new.user_profile_id,new.registered_at,new.created_at,
      new.registration_idempotency_key,new.registration_request_hash)
      is distinct from row(old.id,old.organization_id,old.auth_user_id,old.user_profile_id,old.registered_at,old.created_at,
      old.registration_idempotency_key,old.registration_request_hash) then
      raise exception using errcode='P0001',message='Client instance identity and registration are immutable.';
    end if;
    if new.revision<=old.revision then raise exception using errcode='P0001',message='Client instance revision must increase.'; end if;
    new.updated_at:=clock_timestamp();
  end if;
  return new;
end;
$$;

create or replace function public.routine_offline_receipt_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_profile public.user_profiles%rowtype;
begin
  if tg_op<>'INSERT' then raise exception using errcode='P0001',message='Offline operation receipts are immutable.'; end if;
  if current_setting('mesh.routine_sync_internal',true) is null then
    raise exception using errcode='P0001',message='Offline receipts require an authorized RPC.';
  end if;
  select profile.* into v_profile from public.user_profiles profile where profile.id=new.actor_profile_id;
  if v_profile.id is null or v_profile.organization_id is distinct from new.organization_id
     or v_profile.id is distinct from new.actor_auth_user_id or not v_profile.active
     or coalesce(v_profile.is_shared_device,false) then
    raise exception using errcode='P0001',message='Offline receipt actor identity is invalid.';
  end if;
  if public.routine_phase10i_json_has_forbidden_key(new.response_payload)
     or public.routine_phase10i_json_has_forbidden_key(new.conflict_payload) then
    raise exception using errcode='P0001',message='Sensitive keys are forbidden in offline receipts.';
  end if;
  return new;
end;
$$;

create or replace function public.routine_delivery_reconciliation_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_new public.routine_delivery_comparisons%rowtype; v_previous public.routine_delivery_comparisons%rowtype;
begin
  if tg_op<>'INSERT' then raise exception using errcode='P0001',message='Delivery reconciliations are immutable.'; end if;
  if current_setting('mesh.routine_reconciliation_internal',true) is null then
    raise exception using errcode='P0001',message='Delivery reconciliation requires an authorized internal hook.';
  end if;
  select comparison.* into v_new from public.routine_delivery_comparisons comparison where comparison.id=new.new_comparison_id;
  if new.previous_comparison_id is not null then
    select comparison.* into v_previous from public.routine_delivery_comparisons comparison where comparison.id=new.previous_comparison_id;
    if v_new.supersedes_comparison_id is distinct from v_previous.id
       or v_new.opening_task_id is distinct from v_previous.opening_task_id then
      raise exception using errcode='P0001',message='New comparison must supersede the previous comparison for the same Opening task.';
    end if;
  end if;
  if v_new.comparison_result is distinct from new.comparison_result_snapshot then
    raise exception using errcode='P0001',message='Reconciliation result snapshot must match the new comparison.';
  end if;
  return new;
end;
$$;

drop trigger if exists routine_client_instances_guard on public.routine_client_instances;
create trigger routine_client_instances_guard before insert or update or delete on public.routine_client_instances
  for each row execute function public.routine_client_instance_guard();
drop trigger if exists routine_offline_receipts_guard on public.routine_offline_operation_receipts;
create trigger routine_offline_receipts_guard before insert or update or delete on public.routine_offline_operation_receipts
  for each row execute function public.routine_offline_receipt_guard();
drop trigger if exists routine_delivery_reconciliations_guard on public.routine_delivery_reconciliations;
create trigger routine_delivery_reconciliations_guard before insert or update or delete on public.routine_delivery_reconciliations
  for each row execute function public.routine_delivery_reconciliation_guard();

alter table public.routine_deviations drop constraint if exists routine_deviations_source_check;
alter table public.routine_deviations add constraint routine_deviations_source_check check(source_type in(
  'initial_check','control_result','blocked_task','opening_closing_mismatch','equipment_issue',
  'stock_issue','manager_override','manual','timing_issue','offline_evidence'));

-- Instance lifecycle events are organization-level diagnostics. Existing run
-- events retain their run FK and visibility; only the explicit instance event
-- types may have a null run/task/bundle shape.
alter table public.routine_events alter column run_id drop not null;
alter table public.routine_events drop constraint if exists routine_events_event_type_check;
alter table public.routine_events add constraint routine_events_event_type_check check(event_type in(
  'run_created','participant_joined','role_assigned','role_replaced','run_started',
  'run_final_verification_requested','task_claimed','task_released','task_started','task_system_started','task_paused',
  'initial_assessment_recorded','task_item_updated','task_comment_added','task_blocked',
  'task_not_applicable','task_completed','task_system_completed','task_reopened','deviation_opened','deviation_assigned',
  'deviation_mitigated','deviation_resolved','deviation_cancelled','timing_deviation_opened','manager_override_created',
  'task_verification_completed','run_verification_completed','handover_created','handover_updated',
  'handover_submitted','handover_accepted','transfer_proposed','transfer_accepted','transfer_rejected',
  'transfer_completed','transfer_cancelled','run_waiting_for_transfers','run_finished','run_reopened',
  'run_cancelled','history_correction_recorded','operational_date_resolved','condition_evaluated','condition_matched',
  'condition_not_matched','condition_evaluation_error','task_became_visible','task_became_available',
  'task_became_due','task_became_overdue','task_hard_deadline_missed','timing_deviation_resolved',
  'run_operational_date_superseded','delivery_record_generated','delivery_item_generated',
  'delivery_record_superseded','delivery_comparison_recorded','delivery_mismatch_detected',
  'prior_delivery_deviation_confirmed','prior_delivery_resolved_after_close','double_shift_bundle_created',
  'double_shift_run_linked','double_shift_participant_joined','double_shift_plan_confirmed',
  'double_shift_opening_transition_completed','double_shift_departure_recorded','double_shift_change_feed_reviewed',
  'double_shift_returned','double_shift_closing_reassigned','double_shift_status_changed','double_shift_finalized',
  'external_context_refreshed','external_event_change_detected','event_transfer_accepted','event_transfer_completed',
  'client_instance_registered','client_instance_revoked','offline_task_bundle_applied',
  'offline_action_evidence_recorded','offline_run_finish_applied','sync_conflict_recorded',
  'delivery_comparison_reconciled','late_delivery_linked','previous_delivery_invalidated'));

do $phase10i_event_shape_constraint$
begin
  if not exists(select 1 from pg_catalog.pg_constraint
    where conname='routine_events_run_or_instance_shape_check' and conrelid='public.routine_events'::regclass) then
    alter table public.routine_events add constraint routine_events_run_or_instance_shape_check check(
      run_id is not null or (event_type in('client_instance_registered','client_instance_revoked')
        and task_id is null and task_item_id is null and deviation_id is null and bundle_id is null));
  end if;
end;
$phase10i_event_shape_constraint$;

create or replace function public.routine_record_instance_event(
  input_instance_id uuid,input_event_type text,input_actor jsonb,input_payload jsonb,input_idempotency_key uuid
)
returns uuid language plpgsql security definer set search_path=pg_catalog
as $$
declare v_instance public.routine_client_instances%rowtype; v_clock jsonb; v_event_id uuid;
begin
  select instance.* into v_instance from public.routine_client_instances instance where instance.id=input_instance_id;
  if v_instance.id is null or input_event_type not in('client_instance_registered','client_instance_revoked') then
    raise exception using errcode='P0001',message='Invalid client instance event.';
  end if;
  if public.routine_phase10i_json_has_forbidden_key(input_payload) then
    raise exception using errcode='P0001',message='Sensitive keys are forbidden in sync events.';
  end if;
  v_clock:=public.get_routine_operational_clock();
  perform set_config('mesh.routine_run_internal','event',true);
  insert into public.routine_events(id,organization_id,operational_date,run_id,event_type,actor_type,
    actor_auth_user_id,actor_profile_id,actor_name_snapshot,actor_role_snapshot,payload,client_instance_id)
  values(public.routine_phase10i_uuid(input_instance_id::text||':'||input_event_type||':'||input_idempotency_key::text),
    v_instance.organization_id,(v_clock->>'operationalDate')::date,null,input_event_type,'user',
    (input_actor->>'authUserId')::uuid,(input_actor->>'profileId')::uuid,input_actor->>'displayName',
    input_actor->>'role',coalesce(input_payload,'{}'::jsonb),input_instance_id::text)
  on conflict(id) do nothing returning id into v_event_id;
  if v_event_id is null then
    v_event_id:=public.routine_phase10i_uuid(input_instance_id::text||':'||input_event_type||':'||input_idempotency_key::text);
  end if;
  return v_event_id;
end;
$$;

create or replace function public.register_routine_client_instance(
  input_client_instance_id uuid,input_app_version text,input_offline_schema_version text,
  input_platform_label text,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record; v_instance public.routine_client_instances%rowtype; v_hash text; v_actor_json jsonb;
begin
  select * into v_actor from public.routine_resolve_actor();
  if input_client_instance_id is null or input_idempotency_key is null then
    raise exception using errcode='P0001',message='Client instance and idempotency IDs are required.';
  end if;
  v_hash:=public.routine_phase10i_request_hash(jsonb_build_object('clientInstanceId',input_client_instance_id,
    'appVersion',trim(coalesce(input_app_version,'')),'offlineSchemaVersion',trim(coalesce(input_offline_schema_version,'')),
    'platformLabel',nullif(trim(coalesce(input_platform_label,'')),'')));
  select instance.* into v_instance from public.routine_client_instances instance
    where instance.id=input_client_instance_id for update;
  if v_instance.id is not null then
    if v_instance.auth_user_id is distinct from v_actor.actor_auth_user_id
       or v_instance.organization_id is distinct from v_actor.organization_id then
      raise exception using errcode='42501',message='Client instance belongs to another actor.';
    end if;
    if v_instance.registration_request_hash<>v_hash then
      raise exception using errcode='P0001',message='Client instance registration request does not match its original hash.';
    end if;
    return jsonb_build_object('instance',to_jsonb(v_instance),'operationalClock',public.get_routine_operational_clock(),
      'idempotentReplay',true);
  end if;
  perform set_config('mesh.routine_sync_internal','register',true);
  insert into public.routine_client_instances(id,organization_id,auth_user_id,user_profile_id,app_version,
    offline_schema_version,platform_label,registration_idempotency_key,registration_request_hash)
  values(input_client_instance_id,v_actor.organization_id,v_actor.actor_auth_user_id,v_actor.actor_profile_id,
    trim(input_app_version),trim(input_offline_schema_version),nullif(trim(coalesce(input_platform_label,'')),''),
    input_idempotency_key,v_hash) returning * into v_instance;
  v_actor_json:=jsonb_build_object('authUserId',v_actor.actor_auth_user_id,'profileId',v_actor.actor_profile_id,
    'displayName',v_actor.actor_display_name,'role',v_actor.actor_role);
  perform public.routine_record_instance_event(v_instance.id,'client_instance_registered',v_actor_json,
    jsonb_build_object('clientInstanceId',v_instance.id,'appVersion',v_instance.app_version,
      'offlineSchemaVersion',v_instance.offline_schema_version),input_idempotency_key);
  return jsonb_build_object('instance',to_jsonb(v_instance),'operationalClock',public.get_routine_operational_clock(),
    'idempotentReplay',false);
end;
$$;

create or replace function public.touch_routine_client_instance(
  input_client_instance_id uuid,input_app_version text,input_offline_schema_version text
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record; v_instance public.routine_client_instances%rowtype; v_now timestamptz:=clock_timestamp();
begin
  select * into v_actor from public.routine_resolve_actor();
  select instance.* into v_instance from public.routine_client_instances instance
    where instance.id=input_client_instance_id for update;
  if v_instance.id is null or v_instance.auth_user_id<>v_actor.actor_auth_user_id
     or v_instance.organization_id<>v_actor.organization_id then
    raise exception using errcode='42501',message='Only the owning actor may touch a client instance.';
  end if;
  if v_instance.revoked_at is not null then raise exception using errcode='P0001',message='Client instance is revoked.'; end if;
  if v_instance.app_version<>trim(coalesce(input_app_version,''))
     or v_instance.offline_schema_version<>trim(coalesce(input_offline_schema_version,''))
     or v_instance.last_seen_at<=v_now-interval '5 minutes' then
    perform set_config('mesh.routine_sync_internal','touch',true);
    update public.routine_client_instances set app_version=trim(input_app_version),
      offline_schema_version=trim(input_offline_schema_version),last_seen_at=v_now,revision=revision+1
      where id=v_instance.id returning * into v_instance;
  end if;
  return jsonb_build_object('instance',to_jsonb(v_instance),'serverNow',v_now);
end;
$$;

create or replace function public.revoke_routine_client_instance(
  input_client_instance_id uuid,input_expected_revision bigint,input_reason text,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor record; v_instance public.routine_client_instances%rowtype; v_hash text; v_reason text;
  v_actor_json jsonb;
begin
  select * into v_actor from public.routine_resolve_actor();
  v_reason:=nullif(trim(coalesce(input_reason,'')),'');
  if v_reason is null or char_length(v_reason)>1000 then raise exception using errcode='P0001',message='A bounded revocation reason is required.'; end if;
  v_hash:=public.routine_phase10i_request_hash(jsonb_build_object('clientInstanceId',input_client_instance_id,
    'expectedRevision',input_expected_revision,'reason',v_reason));
  select instance.* into v_instance from public.routine_client_instances instance
    where instance.id=input_client_instance_id for update;
  if v_instance.id is null or v_instance.organization_id<>v_actor.organization_id
     or (v_instance.auth_user_id<>v_actor.actor_auth_user_id and v_actor.actor_role<>'manager') then
    raise exception using errcode='42501',message='Client instance revocation is not authorized.';
  end if;
  if v_instance.revoked_at is not null then
    if v_instance.revocation_idempotency_key=input_idempotency_key and v_instance.revocation_request_hash=v_hash then
      return jsonb_build_object('instance',to_jsonb(v_instance),'idempotentReplay',true);
    end if;
    raise exception using errcode='P0001',message='Client instance is already revoked.';
  end if;
  if v_instance.revision<>input_expected_revision then
    raise exception using errcode='40001',message='Stale client instance revision; refresh before revocation.';
  end if;
  perform set_config('mesh.routine_sync_internal','revoke',true);
  update public.routine_client_instances set revoked_at=clock_timestamp(),revoked_by_auth_user_id=v_actor.actor_auth_user_id,
    revocation_idempotency_key=input_idempotency_key,revocation_request_hash=v_hash,revocation_reason=v_reason,
    revision=revision+1 where id=v_instance.id returning * into v_instance;
  v_actor_json:=jsonb_build_object('authUserId',v_actor.actor_auth_user_id,'profileId',v_actor.actor_profile_id,
    'displayName',v_actor.actor_display_name,'role',v_actor.actor_role);
  perform public.routine_record_instance_event(v_instance.id,'client_instance_revoked',v_actor_json,
    jsonb_build_object('clientInstanceId',v_instance.id,'reason',v_reason),input_idempotency_key);
  return jsonb_build_object('instance',to_jsonb(v_instance),'idempotentReplay',false);
end;
$$;

create or replace function public.routine_phase10i_assert_instance(input_instance_id uuid,input_actor jsonb)
returns public.routine_client_instances language plpgsql security definer set search_path=pg_catalog
as $$
declare v_instance public.routine_client_instances%rowtype;
begin
  select instance.* into v_instance from public.routine_client_instances instance where instance.id=input_instance_id;
  if v_instance.id is null or v_instance.organization_id is distinct from (input_actor->>'organizationId')::uuid
     or v_instance.auth_user_id is distinct from (input_actor->>'authUserId')::uuid then
    raise exception using errcode='42501',message='Offline operation requires the actor own the client instance.';
  end if;
  if v_instance.revoked_at is not null then raise exception using errcode='P0001',message='Client instance is revoked.'; end if;
  return v_instance;
end;
$$;

create or replace function public.routine_phase10i_existing_receipt(
  input_organization_id uuid,input_actor_auth_user_id uuid,input_client_instance_id uuid,
  input_client_operation_id uuid,input_request_hash text
)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_receipt public.routine_offline_operation_receipts%rowtype;
begin
  select receipt.* into v_receipt from public.routine_offline_operation_receipts receipt
  where receipt.organization_id=input_organization_id and receipt.actor_auth_user_id=input_actor_auth_user_id
    and receipt.client_instance_id=input_client_instance_id and receipt.client_operation_id=input_client_operation_id;
  if v_receipt.id is null then return null; end if;
  if v_receipt.request_hash<>input_request_hash then
    raise exception using errcode='P0001',message='Client operation ID was already used with a different request.';
  end if;
  return to_jsonb(v_receipt)||jsonb_build_object('idempotentReplay',true);
end;
$$;

create or replace function public.routine_phase10i_record_receipt(
  input_actor jsonb,input_client_instance_id uuid,input_client_operation_id uuid,input_operation_type text,
  input_request_hash text,input_receipt_status text,input_resource_type text,input_resource_id uuid,
  input_response_payload jsonb,input_conflict_payload jsonb,input_client_recorded_at timestamptz
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_receipt public.routine_offline_operation_receipts%rowtype;
begin
  perform set_config('mesh.routine_sync_internal','receipt',true);
  insert into public.routine_offline_operation_receipts(organization_id,actor_auth_user_id,actor_profile_id,
    client_instance_id,client_operation_id,operation_type,request_hash,receipt_status,resource_type,resource_id,
    response_payload,conflict_payload,client_recorded_at,client_time_authoritative,completed_at)
  values((input_actor->>'organizationId')::uuid,(input_actor->>'authUserId')::uuid,
    (input_actor->>'profileId')::uuid,input_client_instance_id,input_client_operation_id,input_operation_type,
    input_request_hash,input_receipt_status,input_resource_type,input_resource_id,coalesce(input_response_payload,'{}'::jsonb),
    coalesce(input_conflict_payload,'{}'::jsonb),input_client_recorded_at,false,clock_timestamp())
  on conflict(organization_id,actor_auth_user_id,client_instance_id,client_operation_id) do nothing
  returning * into v_receipt;
  if v_receipt.id is null then
    select receipt.* into v_receipt from public.routine_offline_operation_receipts receipt
    where receipt.organization_id=(input_actor->>'organizationId')::uuid
      and receipt.actor_auth_user_id=(input_actor->>'authUserId')::uuid
      and receipt.client_instance_id=input_client_instance_id
      and receipt.client_operation_id=input_client_operation_id;
    if v_receipt.request_hash<>input_request_hash then
      raise exception using errcode='P0001',message='Client operation ID was already used with a different request.';
    end if;
  end if;
  return to_jsonb(v_receipt);
end;
$$;

create or replace function public.get_routine_sync_events(
  input_after_server_created_at timestamptz default null,input_after_event_id uuid default null,
  input_limit integer default 200,input_run_ids uuid[] default null,input_bundle_ids uuid[] default null
)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor record; v_limit integer; v_after timestamptz; v_events jsonb; v_count integer;
  v_next_time timestamptz; v_next_id uuid;
begin
  select * into v_actor from public.routine_resolve_actor();
  if (input_after_server_created_at is null)<>(input_after_event_id is null) then
    raise exception using errcode='P0001',message='Sync cursor timestamp and event ID must both be supplied or both be null.';
  end if;
  v_limit:=least(greatest(coalesce(input_limit,200),1),500);
  v_after:=coalesce(input_after_server_created_at,clock_timestamp()-interval '14 days');
  with visible as(
    select event.* from public.routine_events event
    where event.organization_id=v_actor.organization_id
      and (event.server_created_at,event.id)>(v_after,coalesce(input_after_event_id,'00000000-0000-0000-0000-000000000000'::uuid))
      and (input_run_ids is null or event.run_id=any(input_run_ids))
      and (input_bundle_ids is null or event.bundle_id=any(input_bundle_ids))
      and ((event.run_id is not null and public.routine_run_is_visible(event.run_id,event.organization_id))
        or (event.run_id is null and (event.actor_auth_user_id=v_actor.actor_auth_user_id
          or v_actor.actor_role in('manager','shift_lead'))))
    order by event.server_created_at,event.id limit v_limit+1
  ), page as(select * from visible order by server_created_at,id limit v_limit)
  select coalesce(jsonb_agg(to_jsonb(page) order by server_created_at,id),'[]'::jsonb),count(*)
    into v_events,v_count from page;
  select (value->>'server_created_at')::timestamptz,(value->>'id')::uuid into v_next_time,v_next_id
    from jsonb_array_elements(v_events) with ordinality item(value,ordinality) order by ordinality desc limit 1;
  return jsonb_build_object('events',v_events,
    'nextCursor',case when v_count=0 then jsonb_build_object('serverCreatedAt',input_after_server_created_at,'eventId',input_after_event_id)
      else jsonb_build_object('serverCreatedAt',v_next_time,'eventId',v_next_id) end,
    'hasMore',(select count(*)>v_limit from public.routine_events event where event.organization_id=v_actor.organization_id
      and (event.server_created_at,event.id)>(v_after,coalesce(input_after_event_id,'00000000-0000-0000-0000-000000000000'::uuid))
      and (input_run_ids is null or event.run_id=any(input_run_ids)) and (input_bundle_ids is null or event.bundle_id=any(input_bundle_ids))
      and ((event.run_id is not null and public.routine_run_is_visible(event.run_id,event.organization_id)) or
        (event.run_id is null and (event.actor_auth_user_id=v_actor.actor_auth_user_id or v_actor.actor_role in('manager','shift_lead'))))),
    'serverNow',clock_timestamp(),
    'affectedRunIds',coalesce((select jsonb_agg(distinct value->>'run_id' order by value->>'run_id')
      from jsonb_array_elements(v_events) value where value->>'run_id' is not null),'[]'::jsonb),
    'affectedBundleIds',coalesce((select jsonb_agg(distinct value->>'bundle_id' order by value->>'bundle_id')
      from jsonb_array_elements(v_events) value where value->>'bundle_id' is not null),'[]'::jsonb),
    'affectedTaskIds',coalesce((select jsonb_agg(distinct value->>'task_id' order by value->>'task_id')
      from jsonb_array_elements(v_events) value where value->>'task_id' is not null),'[]'::jsonb));
end;
$$;

create or replace function public.get_routine_offline_operation_receipt(
  input_client_instance_id uuid,input_client_operation_id uuid
)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor record; v_instance public.routine_client_instances%rowtype; v_receipt jsonb;
begin
  select * into v_actor from public.routine_resolve_actor();
  select instance.* into v_instance from public.routine_client_instances instance
    where instance.id=input_client_instance_id and instance.organization_id=v_actor.organization_id
      and instance.auth_user_id=v_actor.actor_auth_user_id;
  if v_instance.id is null then raise exception using errcode='42501',message='Receipt lookup requires the owning client instance.'; end if;
  select to_jsonb(receipt) into v_receipt from public.routine_offline_operation_receipts receipt
    where receipt.organization_id=v_actor.organization_id and receipt.actor_auth_user_id=v_actor.actor_auth_user_id
      and receipt.client_instance_id=input_client_instance_id and receipt.client_operation_id=input_client_operation_id;
  return v_receipt;
end;
$$;

create or replace function public.get_routine_sync_health(input_date_from date,input_date_to date)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor record;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role<>'manager' then raise exception using errcode='42501',message='Manager access is required for sync health.'; end if;
  if input_date_from is null or input_date_to is null or input_date_to<input_date_from
     or input_date_to-input_date_from>31 then
    raise exception using errcode='P0001',message='Sync health requires a valid interval of at most 31 days.';
  end if;
  return jsonb_build_object(
    'activeClientInstances',(select count(*) from public.routine_client_instances instance
      where instance.organization_id=v_actor.organization_id and instance.revoked_at is null),
    'lastSeenAt',(select max(instance.last_seen_at) from public.routine_client_instances instance
      where instance.organization_id=v_actor.organization_id),
    'receiptCounts',coalesce((select jsonb_object_agg(receipt_status,total) from(
      select receipt.receipt_status,count(*) total from public.routine_offline_operation_receipts receipt
      where receipt.organization_id=v_actor.organization_id
        and receipt.server_received_at>=(input_date_from::timestamp at time zone 'UTC')
        and receipt.server_received_at<((input_date_to+1)::timestamp at time zone 'UTC') group by receipt.receipt_status) counts),'{}'::jsonb),
    'lateReconciliationCount',(select count(*) from public.routine_delivery_reconciliations reconciliation
      where reconciliation.organization_id=v_actor.organization_id and reconciliation.created_at::date between input_date_from and input_date_to),
    'affectedRunCount',(select count(distinct receipt.resource_id) from public.routine_offline_operation_receipts receipt
      where receipt.organization_id=v_actor.organization_id and receipt.resource_type='run'
        and receipt.server_received_at::date between input_date_from and input_date_to));
end;
$$;

create or replace function public.routine_validate_offline_task_bundle(input_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_allowed text[]:=array['taskId','baseTaskRevision','clientRecordedAt','initialAssessment','itemUpdates',
  'comments','finalAction','pauseReason','block','notApplicableReason','completionNote','criticalConfirmation'];
  v_action text; v_item jsonb; v_db_item public.routine_run_task_items%rowtype; v_validation jsonb;
begin
  if input_payload is null or jsonb_typeof(input_payload)<>'object' then
    return jsonb_build_object('valid',false,'errorCode','offline_bundle_must_be_object');
  end if;
  if pg_column_size(input_payload)>262144 then return jsonb_build_object('valid',false,'errorCode','offline_bundle_too_large'); end if;
  if exists(select 1 from jsonb_object_keys(input_payload) key where not key=any(v_allowed)) then
    return jsonb_build_object('valid',false,'errorCode','offline_bundle_unknown_top_level_key');
  end if;
  if public.routine_phase10i_json_has_forbidden_key(input_payload) then
    return jsonb_build_object('valid',false,'errorCode','offline_bundle_forbidden_sensitive_key');
  end if;
  if nullif(input_payload->>'taskId','') is null then
    return jsonb_build_object('valid',false,'errorCode','offline_bundle_task_id_required');
  end if;
  begin perform (input_payload->>'taskId')::uuid; exception when others then
    return jsonb_build_object('valid',false,'errorCode','offline_bundle_task_id_required'); end;
  if not(input_payload?'baseTaskRevision') or coalesce((input_payload->>'baseTaskRevision')::bigint,0)<=0 then
    return jsonb_build_object('valid',false,'errorCode','offline_bundle_base_revision_required');
  end if;
  if jsonb_typeof(coalesce(input_payload->'itemUpdates','[]'::jsonb))<>'array'
     or jsonb_array_length(coalesce(input_payload->'itemUpdates','[]'::jsonb))>100 then
    return jsonb_build_object('valid',false,'errorCode','offline_bundle_item_limit');
  end if;
  if jsonb_typeof(coalesce(input_payload->'comments','[]'::jsonb))<>'array'
     or jsonb_array_length(coalesce(input_payload->'comments','[]'::jsonb))>20 then
    return jsonb_build_object('valid',false,'errorCode','offline_bundle_comment_limit');
  end if;
  if exists(select 1 from jsonb_array_elements(coalesce(input_payload->'comments','[]'::jsonb)) comment
    where jsonb_typeof(comment)<>'string' or char_length(trim(comment#>>'{}')) not between 1 and 4000) then
    return jsonb_build_object('valid',false,'errorCode','offline_bundle_comment_invalid');
  end if;
  if exists(select 1 from jsonb_array_elements(coalesce(input_payload->'itemUpdates','[]'::jsonb)) item
    group by item->>'taskItemId' having count(*)>1) then
    return jsonb_build_object('valid',false,'errorCode','offline_bundle_duplicate_item');
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(input_payload->'itemUpdates','[]'::jsonb)) loop
    if jsonb_typeof(v_item)<>'object' or exists(select 1 from jsonb_object_keys(v_item) key
      where key<>all(array['taskItemId','baseRevision','status','value','resultCode','reason'])) then
      return jsonb_build_object('valid',false,'errorCode','offline_bundle_item_shape_invalid');
    end if;
    begin
      select item.* into v_db_item from public.routine_run_task_items item
      where item.id=(v_item->>'taskItemId')::uuid and item.run_task_id=(input_payload->>'taskId')::uuid;
    exception when others then return jsonb_build_object('valid',false,'errorCode','offline_bundle_item_id_invalid'); end;
    if v_db_item.id is null or coalesce((v_item->>'baseRevision')::bigint,0)<=0 then
      return jsonb_build_object('valid',false,'errorCode','offline_bundle_item_not_found');
    end if;
    v_validation:=public.routine_validate_task_item_value(v_db_item.item_type_snapshot,v_db_item.input_schema_snapshot,
      v_item->>'status',coalesce(v_item->'value','{}'::jsonb),nullif(trim(coalesce(v_item->>'resultCode','')),''),
      nullif(trim(coalesce(v_item->>'reason','')),''));
    if not coalesce((v_validation->>'valid')::boolean,false) then
      return jsonb_build_object('valid',false,'errorCode','offline_bundle_typed_item_invalid','taskItemId',v_db_item.id);
    end if;
  end loop;
  v_action:=input_payload->>'finalAction';
  if v_action not in('save_progress','pause','block','not_applicable','complete') then
    return jsonb_build_object('valid',false,'errorCode','offline_bundle_final_action_invalid');
  end if;
  if (v_action='pause' and char_length(trim(coalesce(input_payload->>'pauseReason',''))) not between 1 and 2000)
     or (v_action='block' and (jsonb_typeof(input_payload->'block')<>'object'
       or coalesce(input_payload#>>'{block,category}','')='' or coalesce(input_payload#>>'{block,reasonCode}','')=''))
     or (v_action='not_applicable' and char_length(trim(coalesce(input_payload->>'notApplicableReason',''))) not between 1 and 4000)
     or (v_action<>'pause' and nullif(trim(coalesce(input_payload->>'pauseReason','')),'') is not null)
     or (v_action<>'block' and input_payload->'block' is not null and input_payload->'block'<>'null'::jsonb)
     or (v_action<>'not_applicable' and nullif(trim(coalesce(input_payload->>'notApplicableReason','')),'') is not null)
     or (v_action<>'complete' and nullif(trim(coalesce(input_payload->>'completionNote','')),'') is not null) then
    return jsonb_build_object('valid',false,'errorCode','offline_bundle_action_payload_inconsistent');
  end if;
  return jsonb_build_object('valid',true,'taskId',input_payload->>'taskId','baseTaskRevision',input_payload->'baseTaskRevision',
    'itemCount',jsonb_array_length(coalesce(input_payload->'itemUpdates','[]'::jsonb)),
    'commentCount',jsonb_array_length(coalesce(input_payload->'comments','[]'::jsonb)),
    'clientTimeAuthoritative',false);
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('valid',false,'errorCode','offline_bundle_field_type_invalid');
end;
$$;

create or replace function public.routine_record_sync_run_event(
  input_run_id uuid,input_task_id uuid,input_deviation_id uuid,input_event_type text,input_actor_type text,
  input_actor jsonb,input_payload jsonb,input_client_instance_id uuid,input_client_operation_id uuid
)
returns uuid language plpgsql security definer set search_path=pg_catalog
as $$
declare v_run public.routine_runs%rowtype; v_id uuid;
begin
  select run.* into v_run from public.routine_runs run where run.id=input_run_id;
  if v_run.id is null or public.routine_phase10i_json_has_forbidden_key(input_payload) then
    raise exception using errcode='P0001',message='Invalid sync event.';
  end if;
  v_id:=public.routine_phase10i_uuid(coalesce(input_client_operation_id::text,input_run_id::text)
    ||':'||input_event_type||':'||coalesce(input_task_id::text,''));
  perform set_config('mesh.routine_run_internal','event',true);
  insert into public.routine_events(id,organization_id,operational_date,run_id,task_id,deviation_id,event_type,
    actor_type,actor_auth_user_id,actor_profile_id,actor_name_snapshot,actor_role_snapshot,payload,
    client_instance_id,client_event_at)
  values(v_id,v_run.organization_id,v_run.operational_date,v_run.id,input_task_id,input_deviation_id,input_event_type,
    input_actor_type,case when input_actor_type='user' then (input_actor->>'authUserId')::uuid end,
    case when input_actor_type='user' then (input_actor->>'profileId')::uuid end,
    case when input_actor_type='user' then input_actor->>'displayName' else 'Routine Sync Engine' end,
    case when input_actor_type='user' then input_actor->>'role' else null end,coalesce(input_payload,'{}'::jsonb),
    case when input_client_instance_id is null then null else input_client_instance_id::text end,
    nullif(input_payload->>'clientRecordedAt','')::timestamptz)
  on conflict(id) do nothing;
  return v_id;
end;
$$;

create or replace function public.routine_phase10i_conflict_payload(input_task_id uuid,input_expected bigint,input_code text)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$ select jsonb_build_object('resourceId',task.id,'expectedRevision',input_expected,'currentRevision',task.revision,
  'currentStatus',task.status,'currentAssignee',task.assigned_participant_id,'currentCompleter',task.completed_by_auth_user_id,
  'serverUpdatedAt',task.last_status_changed_at,'conflictCode',input_code) from public.routine_run_tasks task where task.id=input_task_id; $$;

create or replace function public.apply_routine_offline_task_bundle(
  input_client_instance_id uuid,input_client_operation_id uuid,input_payload jsonb,input_request_hash text
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor_record record; v_actor jsonb; v_instance public.routine_client_instances%rowtype;
  v_hash text; v_replay jsonb; v_validation jsonb; v_task public.routine_run_tasks%rowtype;
  v_run public.routine_runs%rowtype; v_item jsonb; v_comment jsonb; v_response jsonb; v_receipt jsonb;
  v_error text; v_error_state text; v_code text; v_action text; v_deviation_id uuid; v_index integer:=0;
  v_client_recorded_at timestamptz;
begin
  select * into v_actor_record from public.routine_resolve_actor();
  v_actor:=jsonb_build_object('organizationId',v_actor_record.organization_id,'authUserId',v_actor_record.actor_auth_user_id,
    'profileId',v_actor_record.actor_profile_id,'displayName',v_actor_record.actor_display_name,'role',v_actor_record.actor_role);
  v_instance:=public.routine_phase10i_assert_instance(input_client_instance_id,v_actor);
  v_hash:=public.routine_phase10i_request_hash(input_payload);
  if input_request_hash is distinct from v_hash then raise exception using errcode='P0001',message='Offline request hash mismatch.'; end if;
  v_replay:=public.routine_phase10i_existing_receipt(v_actor_record.organization_id,v_actor_record.actor_auth_user_id,
    input_client_instance_id,input_client_operation_id,v_hash);
  if v_replay is not null then return jsonb_build_object('receipt',v_replay); end if;
  v_validation:=public.routine_validate_offline_task_bundle(input_payload);
  begin v_client_recorded_at:=nullif(input_payload->>'clientRecordedAt','')::timestamptz; exception when others then v_client_recorded_at:=null; end;
  if not coalesce((v_validation->>'valid')::boolean,false) then
    v_receipt:=public.routine_phase10i_record_receipt(v_actor,input_client_instance_id,input_client_operation_id,
      'task_bundle',v_hash,'rejected','task',nullif(input_payload->>'taskId','')::uuid,'{}'::jsonb,
      jsonb_build_object('conflictCode',v_validation->>'errorCode'),v_client_recorded_at);
    return jsonb_build_object('receipt',v_receipt,'rejected',true);
  end if;
  select task.* into v_task from public.routine_run_tasks task where task.id=(input_payload->>'taskId')::uuid;
  select run.* into v_run from public.routine_runs run where run.id=v_task.run_id;
  perform public.routine_lifecycle_context(v_run.id);
  v_action:=input_payload->>'finalAction';
  if v_action in('complete','not_applicable') and exists(select 1 from public.routine_run_task_timings timing
    where timing.task_id=v_task.id and (timing.availability_mode_snapshot='time_window'
      or v_task.task_type_snapshot='checkpoint' or timing.visible_local_time_snapshot is not null
      or timing.start_local_time_snapshot is not null or timing.target_local_time_snapshot is not null
      or timing.overdue_local_time_snapshot is not null or timing.hard_deadline_local_time_snapshot is not null
      or exists(select 1 from public.routine_run_task_dependencies dependency
        where dependency.successor_run_task_id=v_task.id and dependency.dependency_type_snapshot='must_reach_time'))) then
    v_receipt:=public.routine_phase10i_record_receipt(v_actor,input_client_instance_id,input_client_operation_id,
      'task_bundle',v_hash,'conflict','task',v_task.id,'{}'::jsonb,
      public.routine_phase10i_conflict_payload(v_task.id,(input_payload->>'baseTaskRevision')::bigint,
        'offline_timed_action_requires_online_confirmation'),v_client_recorded_at);
    perform public.routine_record_sync_run_event(v_run.id,v_task.id,null,'sync_conflict_recorded','user',v_actor,
      jsonb_build_object('conflictCode','offline_timed_action_requires_online_confirmation'),
      input_client_instance_id,input_client_operation_id);
    return jsonb_build_object('receipt',v_receipt,'conflict',true);
  end if;
  begin
    select task.* into v_task from public.routine_run_tasks task where task.id=(input_payload->>'taskId')::uuid for update;
    select run.* into v_run from public.routine_runs run where run.id=v_task.run_id for update;
    perform 1 from public.routine_run_task_items item where item.run_task_id=v_task.id order by item.id for update;
    if v_task.revision<>(input_payload->>'baseTaskRevision')::bigint then
      raise exception using errcode='40001',message='offline_task_revision_conflict';
    end if;
    if exists(select 1 from jsonb_array_elements(coalesce(input_payload->'itemUpdates','[]'::jsonb)) proposed
      join public.routine_run_task_items item on item.id=(proposed->>'taskItemId')::uuid
      where item.revision<>(proposed->>'baseRevision')::bigint) then
      raise exception using errcode='40001',message='offline_item_revision_conflict';
    end if;
    if v_task.status in('not_started','waiting') then
      v_response:=public.claim_routine_task(v_task.id,v_task.revision,
        public.routine_phase10i_uuid(input_client_operation_id::text||':claim'));
      select * into v_task from public.routine_run_tasks where id=v_task.id;
      v_response:=public.start_routine_task(v_task.id,v_task.revision,
        public.routine_phase10i_uuid(input_client_operation_id::text||':start'));
      select * into v_task from public.routine_run_tasks where id=v_task.id;
    end if;
    if input_payload->'initialAssessment' is not null and input_payload->'initialAssessment'<>'null'::jsonb
       and v_task.initial_assessment is null then
      v_response:=public.record_routine_initial_assessment(v_task.id,input_payload#>>'{initialAssessment,assessment}',
        input_payload#>>'{initialAssessment,reasonCode}',input_payload#>>'{initialAssessment,details}',v_task.revision,
        public.routine_phase10i_uuid(input_client_operation_id::text||':assessment'));
      select * into v_task from public.routine_run_tasks where id=v_task.id;
    end if;
    for v_item in select value from jsonb_array_elements(coalesce(input_payload->'itemUpdates','[]'::jsonb)) loop
      v_index:=v_index+1;
      v_response:=public.update_routine_task_item((v_item->>'taskItemId')::uuid,v_item->>'status',
        coalesce(v_item->'value','{}'::jsonb),v_item->>'resultCode',v_item->>'reason',
        (v_item->>'baseRevision')::bigint,public.routine_phase10i_uuid(input_client_operation_id::text||':item:'||v_index));
      select * into v_task from public.routine_run_tasks where id=v_task.id;
    end loop;
    v_index:=0;
    for v_comment in select value from jsonb_array_elements(coalesce(input_payload->'comments','[]'::jsonb)) loop
      v_index:=v_index+1;
      v_response:=public.add_routine_task_comment(v_task.id,v_comment#>>'{}',
        public.routine_phase10i_uuid(input_client_operation_id::text||':comment:'||v_index));
    end loop;
    if v_action='pause' then
      v_response:=public.pause_routine_task(v_task.id,input_payload->>'pauseReason',v_task.revision,
        public.routine_phase10i_uuid(input_client_operation_id::text||':final'));
    elsif v_action='block' then
      v_response:=public.block_routine_task(v_task.id,input_payload#>>'{block,category}',input_payload#>>'{block,reasonCode}',
        input_payload#>>'{block,details}',input_payload#>>'{block,severity}',nullif(input_payload#>>'{block,dueAt}','')::timestamptz,
        v_task.revision,public.routine_phase10i_uuid(input_client_operation_id::text||':final'));
    elsif v_action='not_applicable' then
      v_response:=public.mark_routine_task_not_applicable(v_task.id,input_payload->>'notApplicableReason',v_task.revision,
        public.routine_phase10i_uuid(input_client_operation_id::text||':final'));
    elsif v_action='complete' then
      v_response:=public.complete_routine_task(v_task.id,input_payload->>'completionNote',
        coalesce((input_payload->>'criticalConfirmation')::boolean,false),v_task.revision,
        public.routine_phase10i_uuid(input_client_operation_id::text||':final'));
    end if;
    select task.* into v_task from public.routine_run_tasks task where task.id=v_task.id;
    select run.* into v_run from public.routine_runs run where run.id=v_task.run_id;
    if v_action='complete' and v_task.criticality_snapshot='critical' then
      v_deviation_id:=public.routine_phase10i_uuid(input_client_operation_id::text||':offline-evidence:'||v_task.id::text);
      perform set_config('mesh.routine_run_internal','lifecycle',true);
      insert into public.routine_deviations(id,organization_id,run_id,task_id,source_type,category,reason_code,details,
        severity,status,detected_at,detected_by_auth_user_id,detected_by_name_snapshot,blocking)
      values(v_deviation_id,v_task.organization_id,v_task.run_id,v_task.id,'offline_evidence','sync',
        'offline_action_time_unverified','Physical action was submitted offline; client-recorded time is unverified metadata.',
        'critical','open',clock_timestamp(),v_actor_record.actor_auth_user_id,v_actor_record.actor_display_name,false)
      on conflict(id) do nothing;
      perform public.routine_record_sync_run_event(v_run.id,v_task.id,v_deviation_id,'offline_action_evidence_recorded','user',v_actor,
        jsonb_build_object('clientRecordedAt',v_client_recorded_at,'clientTimeAuthoritative',false,
          'officialCompletedAt',v_task.completed_at),input_client_instance_id,input_client_operation_id);
    end if;
  exception when others then
    get stacked diagnostics v_error=message_text,v_error_state=returned_sqlstate;
    if v_error_state not in('40001','P0001','42501') then raise; end if;
  end;
  if v_error is not null then
    v_code:=case when v_error_state='40001' or v_error~*'stale|revision' then 'stale_revision'
      when v_error~'offline_timed_action_requires_online_confirmation' then 'offline_timed_action_requires_online_confirmation'
      else 'server_rejected' end;
    v_receipt:=public.routine_phase10i_record_receipt(v_actor,input_client_instance_id,input_client_operation_id,
      'task_bundle',v_hash,case when v_code in('stale_revision','offline_timed_action_requires_online_confirmation') then 'conflict' else 'rejected' end,
      'task',v_task.id,'{}'::jsonb,public.routine_phase10i_conflict_payload(v_task.id,
        (input_payload->>'baseTaskRevision')::bigint,v_code),v_client_recorded_at);
    if public.routine_run_is_visible(v_run.id,v_run.organization_id) then
      perform public.routine_record_sync_run_event(v_run.id,v_task.id,null,'sync_conflict_recorded','user',v_actor,
        jsonb_build_object('conflictCode',v_code),input_client_instance_id,input_client_operation_id);
    end if;
    return jsonb_build_object('receipt',v_receipt,'conflict',v_code<>'server_rejected','rejected',v_code='server_rejected');
  end if;
  v_receipt:=public.routine_phase10i_record_receipt(v_actor,input_client_instance_id,input_client_operation_id,
    'task_bundle',v_hash,'applied','task',v_task.id,jsonb_build_object('taskId',v_task.id,'taskRevision',v_task.revision,
      'runId',v_run.id,'runRevision',v_run.revision),'{}'::jsonb,v_client_recorded_at);
  perform public.routine_record_sync_run_event(v_run.id,v_task.id,v_deviation_id,'offline_task_bundle_applied','user',v_actor,
    jsonb_build_object('finalAction',v_action,'clientRecordedAt',v_client_recorded_at,'clientTimeAuthoritative',false),
    input_client_instance_id,input_client_operation_id);
  return jsonb_build_object('receipt',v_receipt,'task',to_jsonb(v_task),'items',coalesce((select jsonb_agg(to_jsonb(item)
    order by item.sort_order_snapshot,item.id) from public.routine_run_task_items item where item.run_task_id=v_task.id),'[]'::jsonb),
    'run',jsonb_build_object('id',v_run.id,'status',v_run.status,'revision',v_run.revision),
    'events',coalesce((select jsonb_agg(to_jsonb(event) order by event.server_created_at,event.id)
      from public.routine_events event where event.client_instance_id=input_client_instance_id::text
        and event.run_id=v_run.id and event.task_id=v_task.id),'[]'::jsonb));
end;
$$;

create or replace function public.apply_routine_offline_run_finish_intent(
  input_client_instance_id uuid,input_client_operation_id uuid,input_run_id uuid,
  input_base_run_revision bigint,input_client_recorded_at timestamptz,input_request_hash text
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_actor_record record; v_actor jsonb; v_instance public.routine_client_instances%rowtype;
  v_request jsonb; v_hash text; v_replay jsonb; v_run public.routine_runs%rowtype;
  v_response jsonb; v_receipt jsonb; v_error text; v_state text; v_code text;
begin
  select * into v_actor_record from public.routine_resolve_actor();
  v_actor:=jsonb_build_object('organizationId',v_actor_record.organization_id,'authUserId',v_actor_record.actor_auth_user_id,
    'profileId',v_actor_record.actor_profile_id,'displayName',v_actor_record.actor_display_name,'role',v_actor_record.actor_role);
  v_instance:=public.routine_phase10i_assert_instance(input_client_instance_id,v_actor);
  v_request:=jsonb_build_object('runId',input_run_id,'baseRunRevision',input_base_run_revision,
    'clientRecordedAt',input_client_recorded_at);
  v_hash:=public.routine_phase10i_request_hash(v_request);
  if input_request_hash is distinct from v_hash then raise exception using errcode='P0001',message='Offline finish request hash mismatch.'; end if;
  v_replay:=public.routine_phase10i_existing_receipt(v_actor_record.organization_id,v_actor_record.actor_auth_user_id,
    input_client_instance_id,input_client_operation_id,v_hash);
  if v_replay is not null then return jsonb_build_object('receipt',v_replay); end if;
  begin
    select run.* into v_run from public.routine_runs run where run.id=input_run_id for update;
    perform public.routine_lifecycle_context(input_run_id);
    if v_run.revision<>input_base_run_revision then raise exception using errcode='40001',message='offline_run_revision_conflict'; end if;
    v_response:=public.finish_routine_run(input_run_id,input_base_run_revision,
      public.routine_phase10i_uuid(input_client_operation_id::text||':finish'));
    select run.* into v_run from public.routine_runs run where run.id=input_run_id;
  exception when others then
    get stacked diagnostics v_error=message_text,v_state=returned_sqlstate;
    if v_state not in('40001','P0001','42501') then raise; end if;
  end;
  if v_error is not null then
    v_code:=case when v_state='40001' or v_error~*'stale|revision' then 'stale_revision' else 'server_rejected' end;
    v_receipt:=public.routine_phase10i_record_receipt(v_actor,input_client_instance_id,input_client_operation_id,
      'run_finish_intent',v_hash,case when v_code='stale_revision' then 'conflict' else 'rejected' end,'run',input_run_id,
      '{}'::jsonb,jsonb_build_object('resourceId',input_run_id,'expectedRevision',input_base_run_revision,
        'currentRevision',v_run.revision,'currentStatus',v_run.status,'serverUpdatedAt',clock_timestamp(),'conflictCode',v_code),
      input_client_recorded_at);
    if v_run.id is not null and public.routine_run_is_visible(v_run.id,v_run.organization_id) then
      perform public.routine_record_sync_run_event(v_run.id,null,null,'sync_conflict_recorded','user',v_actor,
        jsonb_build_object('conflictCode',v_code),input_client_instance_id,input_client_operation_id);
    end if;
    return jsonb_build_object('receipt',v_receipt,'conflict',v_code='stale_revision','rejected',v_code='server_rejected');
  end if;
  v_receipt:=public.routine_phase10i_record_receipt(v_actor,input_client_instance_id,input_client_operation_id,
    'run_finish_intent',v_hash,'applied','run',v_run.id,jsonb_build_object('runId',v_run.id,'runRevision',v_run.revision,
      'status',v_run.status,'finishSequence',v_run.current_finish_sequence),'{}'::jsonb,input_client_recorded_at);
  perform public.routine_record_sync_run_event(v_run.id,null,null,'offline_run_finish_applied','user',v_actor,
    jsonb_build_object('clientRecordedAt',input_client_recorded_at,'clientTimeAuthoritative',false,
      'officialFinishedAt',v_run.finished_at),input_client_instance_id,input_client_operation_id);
  return jsonb_build_object('receipt',v_receipt,'run',to_jsonb(v_run),'finish',v_response);
end;
$$;

create or replace function public.routine_compute_delivery_reconciliation_hash(input_value jsonb)
returns text language sql immutable set search_path=pg_catalog
as $$ select public.routine_phase10i_request_hash(input_value); $$;

create or replace function public.routine_find_initial_assessment_operation(input_opening_task_id uuid)
returns public.routine_run_operations language sql stable security definer set search_path=pg_catalog
as $$
  select operation.* from public.routine_run_operations operation
  where operation.operation_type='initial_assessment' and operation.resource_type='task'
    and operation.resource_id=input_opening_task_id order by operation.created_at,operation.id limit 1;
$$;

create or replace function public.routine_reconcile_opening_comparison_for_task(
  input_opening_task_id uuid,input_trigger_type text,input_source_run_id uuid,input_delivery_record_id uuid default null,
  input_reconciliation_reason text default 'Delivery eligibility changed.'
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_task public.routine_run_tasks%rowtype; v_run public.routine_runs%rowtype;
  v_operation public.routine_run_operations%rowtype; v_latest public.routine_delivery_comparisons%rowtype;
  v_plan jsonb; v_selection jsonb; v_payload jsonb; v_hash text; v_new public.routine_delivery_comparisons%rowtype;
  v_reconciliation_id uuid; v_reconciliation_hash text; v_linked_deviation uuid; v_actor_name text;
begin
  if input_trigger_type not in('late_delivery_generated','source_run_reopened','source_run_refinished','manual_reconciliation') then
    raise exception using errcode='P0001',message='Unknown delivery reconciliation trigger.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(input_opening_task_id::text,10));
  select task.* into v_task from public.routine_run_tasks task where task.id=input_opening_task_id;
  select run.* into v_run from public.routine_runs run where run.id=v_task.run_id;
  if v_task.id is null or v_task.initial_assessment is null then return jsonb_build_object('applied',false,'reason','assessment_missing'); end if;
  v_operation:=public.routine_find_initial_assessment_operation(v_task.id);
  if v_operation.id is null then return jsonb_build_object('applied',false,'reason','assessment_operation_missing'); end if;
  select comparison.* into v_latest from public.routine_delivery_comparisons comparison
    where comparison.opening_task_id=v_task.id order by comparison.comparison_sequence desc,comparison.id desc limit 1;
  v_linked_deviation:=nullif(v_operation.response_payload#>>'{deviation,id}','')::uuid;
  v_plan:=public.routine_compare_opening_assessment_to_delivery(v_task.id,v_task.initial_assessment,v_operation.id,'{}'::jsonb);
  if not coalesce((v_plan->>'createComparison')::boolean,false) then return jsonb_build_object('applied',false,'reason','no_target_contract'); end if;
  v_selection:=coalesce(v_plan->'selection','{}'::jsonb);
  v_payload:=jsonb_build_object('openingRunId',v_run.id,'openingTaskId',v_task.id,'openingOperationalDate',v_run.operational_date,
    'openingInitialAssessment',v_task.initial_assessment,'deliveryRecordId',nullif(v_selection->>'deliveryRecordId','')::uuid,
    'deliveryItemId',nullif(v_selection->>'deliveryItemId','')::uuid,'deliveryItemHash',nullif(v_selection->>'itemHash',''),
    'sourceClosingRunId',nullif(v_selection->>'sourceRunId','')::uuid,'sourceClosingTaskId',nullif(v_selection->>'sourceTaskId','')::uuid,
    'sourceOperationalDate',nullif(v_selection->>'sourceOperationalDate','')::date,'comparisonMode',v_plan->>'comparisonMode',
    'deliveryReportedStatus',nullif(v_selection->>'reportedStatus',''),'comparisonResult',v_plan->>'comparisonResult',
    'linkedDeviationId',v_linked_deviation,
    'previousDeliveryHadOverride',coalesce((v_selection->>'previousDeliveryHadOverride')::boolean,false),
    'previousDeliveryHadDeviation',coalesce((v_selection->>'previousDeliveryHadDeviation')::boolean,false));
  v_hash:=public.routine_compute_delivery_comparison_hash(v_payload);
  if v_latest.id is not null and v_latest.comparison_hash=v_hash then
    return jsonb_build_object('applied',false,'reason','semantic_noop','comparisonId',v_latest.id);
  end if;
  select coalesce(v_latest.compared_by_name_snapshot,profile.display_name,'Routine assessment actor') into v_actor_name
    from public.user_profiles profile where profile.id=v_operation.actor_auth_user_id;
  perform set_config('mesh.routine_delivery_internal','reconciliation',true);
  insert into public.routine_delivery_comparisons(organization_id,opening_run_id,opening_task_id,comparison_sequence,
    supersedes_comparison_id,delivery_record_id,delivery_item_id,source_closing_run_id,source_closing_task_id,
    source_operational_date,opening_operational_date,opening_initial_assessment,comparison_mode,delivery_reported_status,
    comparison_result,previous_delivery_had_override,previous_delivery_had_deviation,linked_deviation_id,
    assessment_operation_id,compared_at,compared_by_auth_user_id,compared_by_name_snapshot,comparison_hash)
  values(v_run.organization_id,v_run.id,v_task.id,coalesce(v_latest.comparison_sequence,0)+1,v_latest.id,
    nullif(v_selection->>'deliveryRecordId','')::uuid,nullif(v_selection->>'deliveryItemId','')::uuid,
    nullif(v_selection->>'sourceRunId','')::uuid,nullif(v_selection->>'sourceTaskId','')::uuid,
    nullif(v_selection->>'sourceOperationalDate','')::date,v_run.operational_date,v_task.initial_assessment,
    v_plan->>'comparisonMode',nullif(v_selection->>'reportedStatus',''),v_plan->>'comparisonResult',
    coalesce((v_selection->>'previousDeliveryHadOverride')::boolean,false),
    coalesce((v_selection->>'previousDeliveryHadDeviation')::boolean,false),v_linked_deviation,
    v_operation.id,clock_timestamp(),v_operation.actor_auth_user_id,v_actor_name,v_hash) returning * into v_new;
  v_reconciliation_hash:=public.routine_compute_delivery_reconciliation_hash(jsonb_build_object(
    'triggerType',input_trigger_type,'sourceRunId',input_source_run_id,'deliveryRecordId',input_delivery_record_id,
    'openingTaskId',v_task.id,'previousComparisonId',v_latest.id,'newComparisonId',v_new.id,
    'comparisonHash',v_new.comparison_hash,'reason',input_reconciliation_reason));
  v_reconciliation_id:=public.routine_phase10i_uuid(v_reconciliation_hash);
  perform set_config('mesh.routine_reconciliation_internal','reconcile',true);
  insert into public.routine_delivery_reconciliations(id,organization_id,trigger_type,source_run_id,delivery_record_id,
    opening_run_id,opening_task_id,previous_comparison_id,new_comparison_id,comparison_result_snapshot,
    linked_deviation_id,reconciliation_reason,reconciliation_hash,operation_id,created_by_actor_type)
  values(v_reconciliation_id,v_run.organization_id,input_trigger_type,input_source_run_id,input_delivery_record_id,
    v_run.id,v_task.id,v_latest.id,v_new.id,v_new.comparison_result,v_linked_deviation,input_reconciliation_reason,
    v_reconciliation_hash,null,'system') on conflict(opening_task_id,new_comparison_id) do nothing;
  perform public.routine_record_sync_run_event(v_run.id,v_task.id,v_linked_deviation,'delivery_comparison_reconciled','system','{}'::jsonb,
    jsonb_build_object('previousComparisonId',v_latest.id,'newComparisonId',v_new.id,'comparisonResult',v_new.comparison_result,
      'triggerType',input_trigger_type),null,v_reconciliation_id);
  perform public.routine_record_sync_run_event(v_run.id,v_task.id,v_linked_deviation,
    case when input_trigger_type='source_run_reopened' then 'previous_delivery_invalidated' else 'late_delivery_linked' end,
    'system','{}'::jsonb,jsonb_build_object('sourceRunId',input_source_run_id,'deliveryRecordId',input_delivery_record_id,
      'newComparisonId',v_new.id),null,public.routine_phase10i_uuid(v_reconciliation_id::text||':link'));
  return jsonb_build_object('applied',true,'comparison',to_jsonb(v_new),'reconciliationId',v_reconciliation_id);
end;
$$;

create or replace function public.routine_reconcile_delivery_comparisons_for_record(
  input_delivery_record_id uuid,input_trigger_type text default 'late_delivery_generated'
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_record public.routine_delivery_records%rowtype; v_task record; v_results jsonb:='[]'::jsonb;
begin
  select record.* into v_record from public.routine_delivery_records record where record.id=input_delivery_record_id;
  if v_record.id is null then return jsonb_build_object('applied',false,'reason','delivery_record_not_found'); end if;
  for v_task in select task.id from public.routine_run_tasks task join public.routine_runs run on run.id=task.run_id
    where run.organization_id=v_record.organization_id and run.operational_date>v_record.operational_date
      and task.initial_assessment is not null order by run.operational_date,task.id loop
    v_results:=v_results||jsonb_build_array(public.routine_reconcile_opening_comparison_for_task(v_task.id,
      input_trigger_type,v_record.source_run_id,v_record.id,'A current Closing delivery became available.'));
  end loop;
  return jsonb_build_object('applied',true,'results',v_results);
end;
$$;

create or replace function public.routine_reconcile_delivery_comparisons_for_source_run(
  input_source_run_id uuid,input_trigger_type text
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_source public.routine_runs%rowtype; v_record_id uuid; v_task record; v_results jsonb:='[]'::jsonb;
begin
  select run.* into v_source from public.routine_runs run where run.id=input_source_run_id;
  select record.id into v_record_id from public.routine_delivery_records record where record.source_run_id=input_source_run_id
    order by record.source_finish_sequence desc,record.id desc limit 1;
  for v_task in select task.id from public.routine_run_tasks task join public.routine_runs run on run.id=task.run_id
    where run.organization_id=v_source.organization_id and run.operational_date>v_source.operational_date
      and task.initial_assessment is not null order by run.operational_date,task.id loop
    v_results:=v_results||jsonb_build_array(public.routine_reconcile_opening_comparison_for_task(v_task.id,
      input_trigger_type,input_source_run_id,v_record_id,
      case when input_trigger_type='source_run_reopened' then 'The previously selected Closing delivery became ineligible.'
        else 'A refinish created a new current Closing delivery.' end));
  end loop;
  return jsonb_build_object('applied',true,'results',v_results);
end;
$$;

do $phase10i_lifecycle_hooks$
begin
  if to_regprocedure('public.routine_finalize_run_extension_phase10i_base(uuid)') is null then
    alter function public.routine_finalize_run_extension(uuid) rename to routine_finalize_run_extension_phase10i_base;
  end if;
  if to_regprocedure('public.reopen_routine_run_phase10i_base(uuid,text,bigint,uuid)') is null then
    alter function public.reopen_routine_run(uuid,text,bigint,uuid) rename to reopen_routine_run_phase10i_base;
  end if;
  if to_regprocedure('public.routine_validate_run_completion_phase10i_base(uuid)') is null then
    alter function public.routine_validate_run_completion(uuid) rename to routine_validate_run_completion_phase10i_base;
  end if;
end;
$phase10i_lifecycle_hooks$;

create or replace function public.routine_validate_run_completion(input_run_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare v_result jsonb; v_warnings jsonb;
begin
  v_result:=public.routine_validate_run_completion_phase10i_base(input_run_id);
  v_warnings:=coalesce(v_result->'warnings','[]'::jsonb);
  if exists(select 1 from public.routine_deviations deviation where deviation.run_id=input_run_id
    and deviation.source_type='offline_evidence') then
    v_warnings:=v_warnings||jsonb_build_array('offline_action_time_unverified');
  end if;
  return jsonb_set(v_result,'{warnings}',v_warnings,true);
end;
$$;

create or replace function public.routine_finalize_run_extension(input_run_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_delivery jsonb; v_reconciliation jsonb; v_record_id uuid; v_trigger text;
begin
  v_delivery:=public.routine_finalize_run_extension_phase10i_base(input_run_id);
  v_record_id:=nullif(v_delivery->>'deliveryRecordId','')::uuid;
  if coalesce((v_delivery->>'applied')::boolean,false) and v_record_id is not null then
    v_trigger:=case when coalesce((v_delivery->>'sourceFinishSequence')::integer,1)>1
      then 'source_run_refinished' else 'late_delivery_generated' end;
    v_reconciliation:=public.routine_reconcile_delivery_comparisons_for_record(v_record_id,v_trigger);
  else v_reconciliation:=jsonb_build_object('applied',false,'reason','no_delivery_record'); end if;
  return v_delivery||jsonb_build_object('lateDeliveryReconciliation',v_reconciliation);
end;
$$;

create or replace function public.reopen_routine_run(
  input_run_id uuid,input_reason text,input_expected_run_revision bigint,input_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_response jsonb; v_reconciliation jsonb;
begin
  v_response:=public.reopen_routine_run_phase10i_base(input_run_id,input_reason,input_expected_run_revision,input_idempotency_key);
  if not coalesce((v_response->>'idempotentReplay')::boolean,false) then
    v_reconciliation:=public.routine_reconcile_delivery_comparisons_for_source_run(input_run_id,'source_run_reopened');
  else v_reconciliation:=jsonb_build_object('applied',false,'reason','idempotent_replay'); end if;
  return v_response||jsonb_build_object('lateDeliveryReconciliation',v_reconciliation);
end;
$$;

create or replace function public.get_routine_delivery_reconciliation_history(input_opening_task_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_task public.routine_run_tasks%rowtype; v_context record; v_latest public.routine_delivery_comparisons%rowtype;
begin
  select task.* into v_task from public.routine_run_tasks task where task.id=input_opening_task_id;
  select * into v_context from public.routine_lifecycle_context(v_task.run_id);
  select comparison.* into v_latest from public.routine_delivery_comparisons comparison
    where comparison.opening_task_id=v_task.id order by comparison.comparison_sequence desc,comparison.id desc limit 1;
  return jsonb_build_object(
    'latestComparison',case when v_latest.id is null then null else to_jsonb(v_latest) end,
    'comparisonHistory',coalesce((select jsonb_agg(to_jsonb(comparison) order by comparison.comparison_sequence,comparison.id)
      from public.routine_delivery_comparisons comparison where comparison.opening_task_id=v_task.id),'[]'::jsonb),
    'reconciliations',coalesce((select jsonb_agg(to_jsonb(reconciliation) order by reconciliation.created_at,reconciliation.id)
      from public.routine_delivery_reconciliations reconciliation where reconciliation.opening_task_id=v_task.id),'[]'::jsonb),
    'previousSourceDelivery',case when v_latest.supersedes_comparison_id is null then null else(select jsonb_build_object(
      'comparison',to_jsonb(previous),'record',to_jsonb(record),'item',to_jsonb(item))
      from public.routine_delivery_comparisons previous left join public.routine_delivery_records record on record.id=previous.delivery_record_id
      left join public.routine_delivery_items item on item.id=previous.delivery_item_id where previous.id=v_latest.supersedes_comparison_id) end,
    'currentSourceDelivery',(select jsonb_build_object('record',to_jsonb(record),'item',to_jsonb(item))
      from public.routine_delivery_records record join public.routine_delivery_items item on item.delivery_record_id=record.id
      where record.id=v_latest.delivery_record_id and item.id=v_latest.delivery_item_id),
    'linkedDeviation',(select to_jsonb(deviation) from public.routine_deviations deviation where deviation.id=v_latest.linked_deviation_id),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',event.id,'eventType',event.event_type,
      'serverCreatedAt',event.server_created_at,'payload',event.payload) order by event.server_created_at,event.id)
      from public.routine_events event where event.task_id=v_task.id and event.event_type in(
        'delivery_comparison_recorded','delivery_comparison_reconciled','late_delivery_linked','previous_delivery_invalidated')),'[]'::jsonb),
    'corrections',coalesce((select jsonb_agg(to_jsonb(correction) order by correction.created_at,correction.id)
      from public.routine_corrections correction where correction.run_id=v_task.run_id and correction.entity_id in(
        select comparison.id from public.routine_delivery_comparisons comparison where comparison.opening_task_id=v_task.id)),'[]'::jsonb));
end;
$$;

do $phase10i_read_hooks$
begin
  if to_regprocedure('public.get_routine_delivery_comparison_phase10i_base(uuid)') is null then
    alter function public.get_routine_delivery_comparison(uuid) rename to get_routine_delivery_comparison_phase10i_base;
  end if;
  if to_regprocedure('public.get_routine_run_workspace_phase10i_base(uuid)') is null then
    alter function public.get_routine_run_workspace(uuid) rename to get_routine_run_workspace_phase10i_base;
  end if;
  if to_regprocedure('public.get_routine_task_timeline_phase10i_base(uuid)') is null then
    alter function public.get_routine_task_timeline(uuid) rename to get_routine_task_timeline_phase10i_base;
  end if;
  if to_regprocedure('public.get_routine_run_timeline_phase10i_base(uuid)') is null then
    alter function public.get_routine_run_timeline(uuid) rename to get_routine_run_timeline_phase10i_base;
  end if;
  if to_regprocedure('public.list_routine_delivery_mismatches_phase10i_base(date,date,text)') is null then
    alter function public.list_routine_delivery_mismatches(date,date,text) rename to list_routine_delivery_mismatches_phase10i_base;
  end if;
end;
$phase10i_read_hooks$;

create or replace function public.get_routine_delivery_comparison(input_opening_task_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$ declare v_base jsonb; begin
  v_base:=public.get_routine_delivery_comparison_phase10i_base(input_opening_task_id);
  return v_base||jsonb_build_object('reconciliationHistory',public.get_routine_delivery_reconciliation_history(input_opening_task_id));
end $$;

create or replace function public.get_routine_run_workspace(input_run_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $$ declare v_base jsonb; begin
  v_base:=public.get_routine_run_workspace_phase10i_base(input_run_id);
  return v_base||jsonb_build_object('deliveryReconciliations',coalesce((select jsonb_agg(
    public.get_routine_delivery_reconciliation_history(task.id) order by task.sort_order_snapshot,task.id)
    from public.routine_run_tasks task where task.run_id=input_run_id and task.initial_assessment is not null),'[]'::jsonb),
    'offlineEvidenceWarnings',coalesce((select jsonb_agg(to_jsonb(deviation) order by deviation.detected_at,deviation.id)
      from public.routine_deviations deviation where deviation.run_id=input_run_id and deviation.source_type='offline_evidence'),'[]'::jsonb),
    'sync',(coalesce(v_base->'sync','{}'::jsonb)||jsonb_build_object('readOnlyPhase','10I','realtimeAuthority',false)));
end $$;

create or replace function public.get_routine_task_timeline(input_task_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$ declare v_base jsonb; begin
  v_base:=public.get_routine_task_timeline_phase10i_base(input_task_id);
  return v_base||jsonb_build_object('deliveryReconciliation',public.get_routine_delivery_reconciliation_history(input_task_id));
end $$;

create or replace function public.get_routine_run_timeline(input_run_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$ declare v_base jsonb; begin
  v_base:=public.get_routine_run_timeline_phase10i_base(input_run_id);
  return v_base||jsonb_build_object('deliveryReconciliations',coalesce((select jsonb_agg(to_jsonb(reconciliation)
    order by reconciliation.created_at,reconciliation.id) from public.routine_delivery_reconciliations reconciliation
    where reconciliation.opening_run_id=input_run_id),'[]'::jsonb));
end $$;

create or replace function public.list_routine_delivery_mismatches(
  input_date_from date,input_date_to date,input_status_filter text default null
)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$ declare v_base jsonb; begin
  v_base:=public.list_routine_delivery_mismatches_phase10i_base(input_date_from,input_date_to,input_status_filter);
  return coalesce((select jsonb_agg(item.value||jsonb_build_object('reconciliationHistory',coalesce((
    select jsonb_agg(to_jsonb(reconciliation) order by reconciliation.created_at,reconciliation.id)
    from public.routine_delivery_reconciliations reconciliation
    where reconciliation.opening_task_id=nullif(item.value->>'openingTaskId','')::uuid),'[]'::jsonb))
    order by item.ordinality) from jsonb_array_elements(v_base) with ordinality item(value,ordinality)),'[]'::jsonb);
end $$;

alter table public.routine_client_instances enable row level security;
alter table public.routine_offline_operation_receipts enable row level security;
alter table public.routine_delivery_reconciliations enable row level security;

drop policy if exists routine_client_instances_select on public.routine_client_instances;
create policy routine_client_instances_select on public.routine_client_instances for select to authenticated using(
  organization_id=public.routine_current_user_organization_id() and public.routine_current_user_is_active()
  and not public.current_user_is_shared_device() and (auth_user_id=auth.uid() or public.routine_current_user_role()='manager'));
drop policy if exists routine_offline_receipts_select on public.routine_offline_operation_receipts;
create policy routine_offline_receipts_select on public.routine_offline_operation_receipts for select to authenticated using(
  organization_id=public.routine_current_user_organization_id() and actor_auth_user_id=auth.uid()
  and public.routine_current_user_is_active() and not public.current_user_is_shared_device());
drop policy if exists routine_delivery_reconciliations_select on public.routine_delivery_reconciliations;
create policy routine_delivery_reconciliations_select on public.routine_delivery_reconciliations for select to authenticated using(
  organization_id=public.routine_current_user_organization_id() and public.routine_current_user_is_active()
  and not public.current_user_is_shared_device() and (public.routine_current_user_role() in('manager','shift_lead')
    or public.routine_run_is_visible(opening_run_id,organization_id)));
drop policy if exists routine_events_read on public.routine_events;
create policy routine_events_read on public.routine_events for select to authenticated using(
  organization_id=public.routine_current_user_organization_id() and public.routine_current_user_is_active()
  and not public.current_user_is_shared_device() and ((run_id is not null and public.routine_run_is_visible(run_id,organization_id))
    or (run_id is null and (actor_auth_user_id=auth.uid() or public.routine_current_user_role() in('manager','shift_lead')))));

revoke all on public.routine_client_instances,public.routine_offline_operation_receipts,
  public.routine_delivery_reconciliations from public,anon,authenticated;
grant select on public.routine_client_instances,public.routine_offline_operation_receipts,
  public.routine_delivery_reconciliations to authenticated;

revoke all on function public.routine_phase10i_json_has_forbidden_key(jsonb),
  public.routine_phase10i_canonical_json(jsonb),public.routine_phase10i_request_hash(jsonb),
  public.routine_phase10i_uuid(text),public.routine_client_instance_guard(),public.routine_offline_receipt_guard(),
  public.routine_delivery_reconciliation_guard(),public.routine_record_instance_event(uuid,text,jsonb,jsonb,uuid),
  public.routine_phase10i_assert_instance(uuid,jsonb),
  public.routine_phase10i_existing_receipt(uuid,uuid,uuid,uuid,text),
  public.routine_phase10i_record_receipt(jsonb,uuid,uuid,text,text,text,text,uuid,jsonb,jsonb,timestamptz),
  public.routine_record_sync_run_event(uuid,uuid,uuid,text,text,jsonb,jsonb,uuid,uuid),
  public.routine_phase10i_conflict_payload(uuid,bigint,text),
  public.routine_compute_delivery_reconciliation_hash(jsonb),public.routine_find_initial_assessment_operation(uuid),
  public.routine_reconcile_opening_comparison_for_task(uuid,text,uuid,uuid,text),
  public.routine_reconcile_delivery_comparisons_for_record(uuid,text),
  public.routine_reconcile_delivery_comparisons_for_source_run(uuid,text) from public,anon,authenticated;

revoke all on function public.register_routine_client_instance(uuid,text,text,text,uuid),
  public.touch_routine_client_instance(uuid,text,text),public.revoke_routine_client_instance(uuid,bigint,text,uuid),
  public.get_routine_sync_events(timestamptz,uuid,integer,uuid[],uuid[]),
  public.get_routine_offline_operation_receipt(uuid,uuid),public.get_routine_sync_health(date,date),
  public.routine_validate_offline_task_bundle(jsonb),public.apply_routine_offline_task_bundle(uuid,uuid,jsonb,text),
  public.apply_routine_offline_run_finish_intent(uuid,uuid,uuid,bigint,timestamptz,text),
  public.get_routine_delivery_reconciliation_history(uuid) from public,anon;
grant execute on function public.register_routine_client_instance(uuid,text,text,text,uuid),
  public.touch_routine_client_instance(uuid,text,text),public.revoke_routine_client_instance(uuid,bigint,text,uuid),
  public.get_routine_sync_events(timestamptz,uuid,integer,uuid[],uuid[]),
  public.get_routine_offline_operation_receipt(uuid,uuid),public.get_routine_sync_health(date,date),
  public.routine_validate_offline_task_bundle(jsonb),public.apply_routine_offline_task_bundle(uuid,uuid,jsonb,text),
  public.apply_routine_offline_run_finish_intent(uuid,uuid,uuid,bigint,timestamptz,text),
  public.get_routine_delivery_reconciliation_history(uuid) to authenticated;

-- Recreated lifecycle/read wrappers must match the established public/helper boundary immediately.
revoke all on function public.routine_phase10i_immutable_guard(),public.routine_validate_run_completion(uuid),
  public.routine_finalize_run_extension(uuid),
  public.reopen_routine_run(uuid,text,bigint,uuid),public.get_routine_delivery_comparison(uuid),
  public.get_routine_run_workspace(uuid),public.get_routine_task_timeline(uuid),
  public.get_routine_run_timeline(uuid),public.list_routine_delivery_mismatches(date,date,text)
  from public,anon,authenticated;
grant execute on function public.reopen_routine_run(uuid,text,bigint,uuid),
  public.get_routine_delivery_comparison(uuid),public.get_routine_run_workspace(uuid),
  public.get_routine_task_timeline(uuid),public.get_routine_run_timeline(uuid),
  public.list_routine_delivery_mismatches(date,date,text) to authenticated;

do $phase10i_reload$
begin perform pg_notify('pgrst','reload schema'); exception when others then null; end;
$phase10i_reload$;
