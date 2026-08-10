begin;

-- Phase 10T aligns the five final effective personal-participant inserts with
-- the partial identity indexes introduced by Phase 10J. CREATE OR REPLACE
-- preserves each existing function's owner and ACL; no grants are changed.

create or replace function public.create_or_get_routine_run_phase10d(
  input_routine_key text,
  input_scope_key text,
  input_operational_date date,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_settings public.routine_organization_settings%rowtype;
  v_template public.routine_templates%rowtype;
  v_version public.routine_template_versions%rowtype;
  v_run public.routine_runs%rowtype;
  v_participant public.routine_run_participants%rowtype;
  v_request_hash text;
  v_replay jsonb;
  v_snapshot jsonb;
  v_response jsonb;
  v_routine_key text := lower(trim(coalesce(input_routine_key, '')));
  v_scope_key text := lower(trim(coalesce(input_scope_key, '')));
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role not in ('manager', 'shift_lead') then
    raise exception using errcode = 'P0001', message = 'Routine run coordinator permission is required.';
  end if;
  if input_operational_date is null or input_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'Operational date and idempotency key are required.';
  end if;
  if v_routine_key !~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
     or char_length(v_routine_key) > 80
     or v_scope_key !~ '^[a-z][a-z0-9]*(?:[-_:][a-z0-9]+)*$'
     or char_length(v_scope_key) > 120 then
    raise exception using errcode = 'P0001', message = 'Routine key or scope key has invalid syntax.';
  end if;

  v_request_hash := public.routine_run_request_hash(jsonb_build_object(
    'routineKey', v_routine_key, 'scopeKey', v_scope_key,
    'operationalDate', input_operational_date
  ));
  v_replay := public.routine_run_operation_replay(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'create_run',
    input_idempotency_key, v_request_hash
  );
  if v_replay is not null then return v_replay; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    v_actor.organization_id::text || '|' || input_operational_date::text
      || '|' || v_routine_key || '|' || v_scope_key, 10
  ));
  v_replay := public.routine_run_operation_replay(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'create_run',
    input_idempotency_key, v_request_hash
  );
  if v_replay is not null then return v_replay; end if;

  select settings.* into v_settings
  from public.routine_organization_settings settings
  where settings.organization_id = v_actor.organization_id
  for share;
  if v_settings.organization_id is null or v_settings.timezone <> 'Europe/Oslo' then
    raise exception using errcode = 'P0001', message = 'Routine organization settings with Europe/Oslo timezone are required.';
  end if;

  select template.* into v_template
  from public.routine_templates template
  where template.organization_id = v_actor.organization_id
    and template.routine_key = v_routine_key
    and template.active
    and template.current_published_version_id is not null
  for update;
  if v_template.id is null then
    raise exception using errcode = 'P0001', message = 'An active routine template with a current published version is required.';
  end if;
  select version.* into v_version
  from public.routine_template_versions version
  where version.id = v_template.current_published_version_id
    and version.organization_id = v_template.organization_id
    and version.template_id = v_template.id
    and version.state = 'published'
  for update;
  if v_version.id is null then
    raise exception using errcode = 'P0001', message = 'An active routine template with a current published version is required.';
  end if;
  if public.routine_template_version_content_hash(v_version.id) is distinct from v_version.content_hash then
    raise exception using errcode = 'P0001', message = 'Published routine template content hash verification failed.';
  end if;

  select run.* into v_run
  from public.routine_runs run
  where run.organization_id = v_actor.organization_id
    and run.operational_date = input_operational_date
    and run.routine_key = v_routine_key
    and run.scope_key = v_scope_key
    and run.status not in ('cancelled', 'superseded')
  for update;

  if v_run.id is null then
    insert into public.routine_runs (
      organization_id, routine_key, scope_key, operational_date, timezone,
      template_id, template_version_id, template_version_number_snapshot,
      template_content_hash_snapshot, creation_idempotency_key,
      creation_request_hash, created_by_auth_user_id, updated_by_auth_user_id
    ) values (
      v_actor.organization_id, v_routine_key, v_scope_key, input_operational_date,
      v_settings.timezone, v_template.id, v_version.id, v_version.version_number,
      v_version.content_hash, input_idempotency_key, v_request_hash,
      v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
    ) returning * into v_run;
    v_snapshot := public.routine_build_run_snapshot(v_run.id);
    select run.* into v_run from public.routine_runs run where run.id = v_run.id;
  else
    if v_run.snapshot_state <> 'ready' then
      raise exception using errcode = 'P0001', message = 'An authoritative routine run is not ready.';
    end if;
    v_snapshot := jsonb_build_object(
      'snapshotHash', v_run.snapshot_hash,
      'sectionCount', (select count(*) from public.routine_run_sections where run_id = v_run.id),
      'taskCount', (select count(*) from public.routine_run_tasks where run_id = v_run.id),
      'itemCount', (select count(*) from public.routine_run_task_items where run_id = v_run.id),
      'sourceCount', (select count(*) from public.routine_run_snapshot_sources where run_id = v_run.id),
      'conditionCount', (select count(*) from public.routine_run_condition_evaluations where run_id = v_run.id),
      'dependencyCount', (select count(*) from public.routine_run_task_dependencies where run_id = v_run.id),
      'relationCount', (select count(*) from public.routine_run_task_relations where run_id = v_run.id),
      'referenceImageCount', (select count(*) from public.routine_run_task_reference_images where run_id = v_run.id)
    );
  end if;

  insert into public.routine_run_participants (
    organization_id, run_id, user_profile_id, identity_type, display_name_snapshot,
    role_snapshot, participation_status, joined_at, creation_idempotency_key,
    created_by_auth_user_id, updated_by_auth_user_id
  ) values (
    v_actor.organization_id, v_run.id, v_actor.actor_profile_id, 'personal_profile',
    v_actor.actor_display_name, v_actor.actor_role, 'active', now(),
    input_idempotency_key, v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
  ) on conflict (run_id, user_profile_id) where identity_type = 'personal_profile' do nothing;
  select participant.* into v_participant
  from public.routine_run_participants participant
  where participant.run_id = v_run.id
    and participant.user_profile_id = v_actor.actor_profile_id
    and participant.identity_type = 'personal_profile';

  v_response := jsonb_build_object(
    'run', to_jsonb(v_run), 'participant', to_jsonb(v_participant),
    'snapshot', v_snapshot, 'idempotentReplay', false
  );
  perform public.routine_record_run_operation(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'create_run',
    input_idempotency_key, v_request_hash, 'run', v_run.id, v_response
  );
  return v_response;
end;
$$;

create or replace function public.join_routine_run_phase10d(
  input_run_id uuid,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_run public.routine_runs%rowtype;
  v_participant public.routine_run_participants%rowtype;
  v_request_hash text;
  v_replay jsonb;
  v_response jsonb;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role not in ('manager', 'shift_lead', 'staff') then
    raise exception using errcode = 'P0001', message = 'Active personal routine task-performer access is required.';
  end if;
  if input_run_id is null or input_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'Run and idempotency key are required.';
  end if;
  v_request_hash := public.routine_run_request_hash(jsonb_build_object('runId', input_run_id));
  v_replay := public.routine_run_operation_replay(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'join_run',
    input_idempotency_key, v_request_hash
  );
  if v_replay is not null then return v_replay; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    v_actor.organization_id::text || '|' || input_run_id::text
      || '|' || v_actor.actor_profile_id::text, 11
  ));
  v_replay := public.routine_run_operation_replay(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'join_run',
    input_idempotency_key, v_request_hash
  );
  if v_replay is not null then return v_replay; end if;

  select run.* into v_run
  from public.routine_runs run
  where run.id = input_run_id
    and run.organization_id = v_actor.organization_id
    and run.snapshot_state = 'ready'
    and run.status in (
      'scheduled', 'in_progress', 'awaiting_final_verification',
      'waiting_for_transfers', 'reopened'
    )
  for share;
  if v_run.id is null then
    raise exception using errcode = 'P0001', message = 'A joinable same-organization routine run was not found.';
  end if;

  insert into public.routine_run_participants (
    organization_id, run_id, user_profile_id, identity_type, display_name_snapshot,
    role_snapshot, participation_status, joined_at, creation_idempotency_key,
    created_by_auth_user_id, updated_by_auth_user_id
  ) values (
    v_actor.organization_id, v_run.id, v_actor.actor_profile_id, 'personal_profile',
    v_actor.actor_display_name, v_actor.actor_role, 'active', now(),
    input_idempotency_key, v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
  ) on conflict (run_id, user_profile_id) where identity_type = 'personal_profile' do nothing;
  select participant.* into v_participant
  from public.routine_run_participants participant
  where participant.run_id = v_run.id
    and participant.user_profile_id = v_actor.actor_profile_id
    and participant.identity_type = 'personal_profile';

  v_response := jsonb_build_object(
    'run', to_jsonb(v_run), 'participant', to_jsonb(v_participant),
    'idempotentReplay', false
  );
  perform public.routine_record_run_operation(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'join_run',
    input_idempotency_key, v_request_hash, 'participant', v_participant.id, v_response
  );
  return v_response;
end;
$$;

create or replace function public.routine_ensure_run_participant(
  input_run_id uuid,input_profile_id uuid,input_created_by uuid,input_key uuid
)
returns public.routine_run_participants language plpgsql security definer set search_path=pg_catalog
as $$
declare v_run public.routine_runs%rowtype; v_profile public.user_profiles%rowtype;
  v_participant public.routine_run_participants%rowtype;
begin
  select run.* into v_run from public.routine_runs run where run.id=input_run_id;
  select profile.* into v_profile from public.user_profiles profile where profile.id=input_profile_id;
  if v_run.id is null or v_profile.id is null or v_profile.organization_id is distinct from v_run.organization_id
     or not v_profile.active or coalesce(v_profile.is_shared_device,false)
     or v_profile.role not in ('manager','shift_lead','staff') then
    raise exception using errcode='P0001',message='An active personal same-organization routine participant is required.';
  end if;
  select participant.* into v_participant from public.routine_run_participants participant
    where participant.run_id=v_run.id and participant.user_profile_id=v_profile.id
      and participant.identity_type='personal_profile';
  if v_participant.id is not null then return v_participant; end if;
  insert into public.routine_run_participants(
    organization_id,run_id,user_profile_id,identity_type,display_name_snapshot,role_snapshot,
    participation_status,joined_at,creation_idempotency_key,created_by_auth_user_id,updated_by_auth_user_id
  ) values(v_run.organization_id,v_run.id,v_profile.id,'personal_profile',v_profile.display_name,v_profile.role,
    'assigned',clock_timestamp(),input_key,input_created_by,input_created_by)
  on conflict(run_id,user_profile_id) where identity_type='personal_profile' do nothing returning * into v_participant;
  if v_participant.id is null then select participant.* into v_participant from public.routine_run_participants participant
    where participant.run_id=v_run.id and participant.user_profile_id=v_profile.id
      and participant.identity_type='personal_profile'; end if;
  return v_participant;
end;
$$;

create or replace function public.routine_ensure_bundle_participant(
  input_bundle_id uuid,input_profile_id uuid,input_created_by uuid,input_key uuid
)
returns public.routine_bundle_participants language plpgsql security definer set search_path=pg_catalog
as $$
declare v_bundle public.routine_bundles%rowtype; v_profile public.user_profiles%rowtype;
  v_opening_run uuid; v_closing_run uuid; v_opening_participant public.routine_run_participants%rowtype;
  v_closing_participant public.routine_run_participants%rowtype; v_participant public.routine_bundle_participants%rowtype;
  v_step_key text;
begin
  select bundle.* into v_bundle from public.routine_bundles bundle where bundle.id=input_bundle_id;
  select profile.* into v_profile from public.user_profiles profile where profile.id=input_profile_id;
  select
    (select link.run_id from public.routine_bundle_runs link where link.bundle_id=v_bundle.id and link.phase='opening'),
    (select link.run_id from public.routine_bundle_runs link where link.bundle_id=v_bundle.id and link.phase='closing')
    into v_opening_run,v_closing_run;
  if v_bundle.id is null or v_opening_run is null or v_closing_run is null or v_profile.id is null
     or v_profile.organization_id is distinct from v_bundle.organization_id or not v_profile.active
     or coalesce(v_profile.is_shared_device,false) or v_profile.role not in ('manager','shift_lead','staff') then
    raise exception using errcode='P0001',message='Bundle participant and both linked runs must be valid.';
  end if;
  v_opening_participant:=public.routine_ensure_run_participant(v_opening_run,v_profile.id,input_created_by,
    public.routine_phase10h_uuid(input_key::text||'|opening'));
  v_closing_participant:=public.routine_ensure_run_participant(v_closing_run,v_profile.id,input_created_by,
    public.routine_phase10h_uuid(input_key::text||'|closing'));
  select participant.* into v_participant from public.routine_bundle_participants participant
    where participant.bundle_id=v_bundle.id and participant.user_profile_id=v_profile.id
      and participant.identity_type='personal_profile';
  if v_participant.id is null then
    insert into public.routine_bundle_participants(
      organization_id,bundle_id,user_profile_id,identity_type,opening_run_participant_id,closing_run_participant_id,
      display_name_snapshot,role_snapshot,creation_idempotency_key,created_by_auth_user_id,updated_by_auth_user_id
    ) values(v_bundle.organization_id,v_bundle.id,v_profile.id,'personal_profile',v_opening_participant.id,v_closing_participant.id,
      v_profile.display_name,v_profile.role,input_key,input_created_by,input_created_by)
    on conflict(bundle_id,user_profile_id) where identity_type='personal_profile' do nothing returning * into v_participant;
    if v_participant.id is null then select participant.* into v_participant from public.routine_bundle_participants participant
      where participant.bundle_id=v_bundle.id and participant.user_profile_id=v_profile.id
      and participant.identity_type='personal_profile'; end if;
  end if;
  foreach v_step_key in array array['ds01_confirm_plan','ds02_opening_transition','ds03_return_review'] loop
    insert into public.routine_bundle_steps(organization_id,bundle_id,bundle_participant_id,step_key)
    values(v_bundle.organization_id,v_bundle.id,v_participant.id,v_step_key)
    on conflict(bundle_id,bundle_participant_id,step_key) where bundle_participant_id is not null do nothing;
  end loop;
  insert into public.routine_bundle_steps(organization_id,bundle_id,bundle_participant_id,step_key)
    values(v_bundle.organization_id,v_bundle.id,null,'ds04_bundle_finalized')
    on conflict(bundle_id,step_key) where bundle_participant_id is null do nothing;
  return v_participant;
end;
$$;

create or replace function public.routine_ensure_closing_bundle_participant(
  input_bundle_id uuid,input_profile_id uuid,input_created_by uuid,input_key uuid
)
returns public.routine_bundle_participants language plpgsql security definer set search_path=pg_catalog
as $$
declare v_bundle public.routine_bundles%rowtype; v_profile public.user_profiles%rowtype;
  v_closing_run uuid; v_closing_participant public.routine_run_participants%rowtype;
  v_participant public.routine_bundle_participants%rowtype; v_step_key text;
begin
  select bundle.* into v_bundle from public.routine_bundles bundle where bundle.id=input_bundle_id;
  select profile.* into v_profile from public.user_profiles profile where profile.id=input_profile_id;
  select link.run_id into v_closing_run from public.routine_bundle_runs link
    where link.bundle_id=input_bundle_id and link.phase='closing';
  if v_bundle.id is null or v_closing_run is null or v_profile.id is null
     or v_profile.organization_id is distinct from v_bundle.organization_id or not v_profile.active
     or coalesce(v_profile.is_shared_device,false) or v_profile.role not in ('manager','shift_lead','staff') then
    raise exception using errcode='P0001',message='An active personal same-organization Closing participant is required.';
  end if;
  v_closing_participant:=public.routine_ensure_run_participant(v_closing_run,v_profile.id,input_created_by,
    public.routine_phase10h_uuid(input_key::text||'|closing'));
  select participant.* into v_participant from public.routine_bundle_participants participant
    where participant.bundle_id=v_bundle.id and participant.user_profile_id=v_profile.id
      and participant.identity_type='personal_profile';
  if v_participant.id is null then
    insert into public.routine_bundle_participants(
      organization_id,bundle_id,user_profile_id,identity_type,closing_run_participant_id,display_name_snapshot,role_snapshot,
      creation_idempotency_key,created_by_auth_user_id,updated_by_auth_user_id
    ) values(v_bundle.organization_id,v_bundle.id,v_profile.id,'personal_profile',v_closing_participant.id,v_profile.display_name,
      v_profile.role,input_key,input_created_by,input_created_by)
    on conflict(bundle_id,user_profile_id) where identity_type='personal_profile' do nothing returning * into v_participant;
    if v_participant.id is null then
      select participant.* into v_participant from public.routine_bundle_participants participant
        where participant.bundle_id=v_bundle.id and participant.user_profile_id=v_profile.id
      and participant.identity_type='personal_profile';
    end if;
  elsif v_participant.closing_run_participant_id is null then
    perform set_config('mesh.routine_bundle_internal','closing-participant',true);
    update public.routine_bundle_participants set closing_run_participant_id=v_closing_participant.id,
      revision=revision+1,updated_by_auth_user_id=input_created_by
      where id=v_participant.id returning * into v_participant;
  end if;
  foreach v_step_key in array array['ds01_confirm_plan','ds02_opening_transition','ds03_return_review'] loop
    insert into public.routine_bundle_steps(organization_id,bundle_id,bundle_participant_id,step_key)
      values(v_bundle.organization_id,v_bundle.id,v_participant.id,v_step_key)
      on conflict(bundle_id,bundle_participant_id,step_key) where bundle_participant_id is not null do nothing;
  end loop;
  return v_participant;
end;
$$;

commit;
