-- Phase 10K3: operational employee workflow read models.
-- Apply after phase10k2_routine_manager_control_center.sql. This migration
-- advances only the UI contract, creates no operative content, and keeps the
-- Phase 10K1 server mutation gate authoritative.

do $phase10k3_release$
begin
  perform pg_catalog.set_config('mesh.routine_ui_release_internal','release',true);
  update public.routine_organization_settings settings
  set ui_release_stage='staff_preview',
      ui_contract_version='phase10k3-v1',
      revision=settings.revision+1,
      updated_at=pg_catalog.clock_timestamp()
  where settings.ui_release_stage='manager_preview';
end;
$phase10k3_release$;

create or replace function public.routine_phase10k3_employee_context()
returns jsonb
language plpgsql
volatile
security definer
set search_path=pg_catalog
as $$
declare
  v_access jsonb:=public.routine_current_user_access_summary();
  v_actor record;
  v_clock jsonb;
begin
  if not coalesce((v_access->>'previewAllowed')::boolean,false) then
    raise exception using errcode='42501',message=coalesce(v_access->>'accessReasonCode','routine_ui_not_authorized');
  end if;
  select * into v_actor from public.routine_resolve_effective_actor();
  v_clock:=public.get_routine_operational_clock();
  return jsonb_build_object(
    'access',v_access,
    'identity',jsonb_build_object(
      'actorAuthUserId',v_actor.actor_auth_user_id,
      'actorProfileId',v_actor.actor_profile_id,
      'organizationId',v_actor.organization_id,
      'role',v_actor.actor_role,
      'displayName',v_actor.actor_display_name,
      'actorSource',v_actor.actor_source,
      'effectiveOperatorId',v_actor.effective_operator_id,
      'sharedDeviceId',v_actor.shared_device_id,
      'operatorSessionId',v_actor.operator_session_id,
      'capabilities',v_actor.capabilities),
    'clock',v_clock);
end;
$$;

create or replace function public.routine_phase10k3_action(
  input_operational boolean,
  input_allowed boolean,
  input_denied_reason text
)
returns jsonb
language sql
immutable
set search_path=pg_catalog
as $$
  select jsonb_build_object(
    'allowed',coalesce(input_operational,false) and coalesce(input_allowed,false),
    'reasonCode',case
      when not coalesce(input_operational,false) then 'routine_ui_operational_access_required'
      when coalesce(input_allowed,false) then null
      else coalesce(input_denied_reason,'routine_action_not_allowed')
    end)
$$;

create or replace function public.routine_phase10k3_sanitize_row(input_row jsonb)
returns jsonb
language sql
immutable
set search_path=pg_catalog
as $$
  select case pg_catalog.jsonb_typeof(input_row)
    when 'object' then coalesce((select pg_catalog.jsonb_object_agg(entry.key,
      public.routine_phase10k3_sanitize_row(entry.value)) from pg_catalog.jsonb_each(input_row) entry
      where not entry.key=any(array[
        'organization_id','actor_auth_user_id','actor_profile_id','effective_operator_id','operator_id',
        'shared_device_id','operator_session_id','user_profile_id','created_by_auth_user_id','updated_by_auth_user_id',
        'started_by_auth_user_id','finished_by_auth_user_id','initial_assessed_by_auth_user_id',
        'completed_by_auth_user_id','last_status_changed_by_auth_user_id','submitted_by_auth_user_id',
        'accepted_by_auth_user_id','rejected_by_auth_user_id','cancelled_by_auth_user_id','resolved_by_auth_user_id',
        'detected_by_auth_user_id','evaluated_by_auth_user_id','proposed_by_auth_user_id','superseded_by_auth_user_id',
        'assigned_by_auth_user_id','ended_by_auth_user_id','verifier_auth_user_id','completed_by_auth_user_id_snapshot',
        'created_by_operator_id','updated_by_operator_id','started_by_operator_id','finished_by_operator_id',
        'initial_assessed_by_operator_id','completed_by_operator_id','last_status_changed_by_operator_id',
        'detected_by_operator_id','resolved_by_operator_id','proposed_by_operator_id','submitted_by_operator_id',
        'accepted_by_operator_id','rejected_by_operator_id','cancelled_by_operator_id','superseded_by_operator_id',
        'linked_user_profile_id_snapshot','creation_idempotency_key','creation_request_hash','idempotency_key',
        'request_hash','operation_id','client_instance_id','credential_hash','pin','token','session_token',
        'response_payload','result_payload']::text[])),'{}'::jsonb)
    when 'array' then coalesce((select pg_catalog.jsonb_agg(public.routine_phase10k3_sanitize_row(entry.value))
      from pg_catalog.jsonb_array_elements(input_row) entry),'[]'::jsonb)
    else input_row end
$$;

create or replace function public.get_routine_employee_home()
returns jsonb
language plpgsql
volatile
security definer
set search_path=pg_catalog
as $$
declare
  v_context jsonb:=public.routine_phase10k3_employee_context();
  v_access jsonb:=v_context->'access';
  v_identity jsonb:=v_context->'identity';
  v_org uuid:=(v_identity->>'organizationId')::uuid;
  v_date date:=(v_context->'clock'->>'operationalDate')::date;
  v_operational boolean:=coalesce((v_access->>'operationalAllowed')::boolean,false);
  v_actor_source text:=v_identity->>'actorSource';
  v_profile uuid:=nullif(v_identity->>'actorProfileId','')::uuid;
  v_operator uuid:=nullif(v_identity->>'effectiveOperatorId','')::uuid;
  v_event_requests jsonb:='[]'::jsonb;
  v_event record;
begin
  for v_event in select transfer.id,transfer.from_run_id,transfer.from_task_id,transfer.target_event_id,
    transfer.status,transfer.reason,transfer.due_at,transfer.revision,transfer.proposed_at
    from public.routine_run_transfers transfer where transfer.organization_id=v_org
      and transfer.target_type='event_operation' and transfer.status in('proposed','accepted')
    order by transfer.proposed_at,transfer.id
  loop
    if public.routine_run_is_visible(v_event.from_run_id,v_org)
      or coalesce((public.routine_current_user_event_transfer_authority(v_event.target_event_id)->>'authorized')::boolean,false) then
      v_event_requests:=v_event_requests||jsonb_build_array(jsonb_build_object(
        'id',v_event.id,'fromRunId',v_event.from_run_id,'fromTaskId',v_event.from_task_id,
        'targetEventId',v_event.target_event_id,'status',v_event.status,'reason',v_event.reason,
        'dueAt',v_event.due_at,'revision',v_event.revision));
    end if;
  end loop;
  return public.routine_phase10k3_sanitize_row(jsonb_build_object(
    'contractVersion','phase10k3-v1',
    'access',v_access,
    'identity',v_identity,
    'operationalClock',v_context->'clock',
    'mode',v_access->>'mode',
    'uiReleaseStage',v_access->>'uiReleaseStage',
    'readOnlyPreview',not v_operational,
    'operationalAllowed',v_operational,
    'reasonCodes',jsonb_build_array(v_access->>'accessReasonCode'),
    'readOnlyMessage',case when v_operational then null else 'Read-only preview — operational actions are not enabled' end,
    'currentRuns',coalesce((select jsonb_agg(jsonb_build_object(
      'id',run.id,'routineKey',run.routine_key,'scopeKey',run.scope_key,'operationalDate',run.operational_date,
      'status',run.status,'revision',run.revision,'templateVersionNumber',run.template_version_number_snapshot,
      'snapshotState',run.snapshot_state,'snapshotHash',run.snapshot_hash,'startedAt',run.started_at,'finishedAt',run.finished_at,
      'participant',exists(select 1 from public.routine_run_participants participant where participant.run_id=run.id
        and participant.participation_status<>'removed' and ((v_actor_source='personal_auth' and participant.identity_type='personal_profile'
          and participant.user_profile_id=v_profile) or (v_actor_source='shared_device_operator'
          and participant.identity_type='shared_device_operator' and participant.operator_id=v_operator))))
      order by run.routine_key,run.scope_key,run.id)
      from public.routine_runs run where run.organization_id=v_org and run.operational_date=v_date
        and run.snapshot_state='ready' and public.routine_run_is_visible(run.id,run.organization_id)),'[]'::jsonb),
    'joinableRuns',case when not v_operational then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
      'id',run.id,'routineKey',run.routine_key,'scopeKey',run.scope_key,'operationalDate',run.operational_date,
      'status',run.status,'revision',run.revision,'canJoin',true) order by run.routine_key,run.scope_key,run.id)
      from public.routine_runs run where run.organization_id=v_org and run.operational_date=v_date and run.snapshot_state='ready'
        and run.status in('scheduled','in_progress','awaiting_final_verification','waiting_for_transfers','reopened')
        and not exists(select 1 from public.routine_run_participants participant where participant.run_id=run.id
          and participant.participation_status<>'removed' and ((v_actor_source='personal_auth' and participant.identity_type='personal_profile'
            and participant.user_profile_id=v_profile) or (v_actor_source='shared_device_operator'
            and participant.identity_type='shared_device_operator' and participant.operator_id=v_operator)))),'[]'::jsonb) end,
    'startableTemplates',coalesce((select jsonb_agg(jsonb_build_object(
      'templateId',template.id,'routineKey',template.routine_key,'name',template.name,'revision',template.revision,
      'currentPublishedVersionId',template.current_published_version_id,
      'action',public.routine_phase10k3_action(v_operational,(v_identity->>'role') in('manager','shift_lead'),'routine_run_coordinator_required'))
      order by template.routine_key,template.id) from public.routine_templates template
      where template.organization_id=v_org and template.active and template.current_published_version_id is not null),'[]'::jsonb),
    'doubleShiftBundles',coalesce((select jsonb_agg(jsonb_build_object(
      'id',bundle.id,'status',bundle.status,'scopeKey',bundle.scope_key,'operationalDate',bundle.operational_date,
      'openingRoutineKey',bundle.opening_routine_key,'closingRoutineKey',bundle.closing_routine_key,'revision',bundle.revision)
      order by bundle.scope_key,bundle.id) from public.routine_bundles bundle where bundle.organization_id=v_org
      and bundle.operational_date=v_date and public.routine_bundle_is_visible(bundle.id,bundle.organization_id)),'[]'::jsonb),
    'assignedTasks',coalesce((select jsonb_agg(jsonb_build_object(
      'id',task.id,'runId',task.run_id,'title',task.title_snapshot,'location',task.location_name_snapshot,
      'status',task.status,'outcome',task.outcome,'criticality',task.criticality_snapshot,'revision',task.revision)
      order by task.status,task.sort_order_snapshot,task.id) from public.routine_run_tasks task
      join public.routine_run_participants participant on participant.id=task.assigned_participant_id
      join public.routine_runs run on run.id=task.run_id
      where task.organization_id=v_org and run.operational_date=v_date and public.routine_run_is_visible(run.id,run.organization_id)
        and ((v_actor_source='personal_auth' and participant.identity_type='personal_profile' and participant.user_profile_id=v_profile)
          or (v_actor_source='shared_device_operator' and participant.identity_type='shared_device_operator' and participant.operator_id=v_operator))
        and task.status not in('completed','not_applicable','transferred','cancelled')),'[]'::jsonb),
    'openDeviations',coalesce((select jsonb_agg(jsonb_build_object(
      'id',deviation.id,'runId',deviation.run_id,'taskId',deviation.task_id,'category',deviation.category,
      'severity',deviation.severity,'status',deviation.status,'details',deviation.details,'dueAt',deviation.due_at)
      order by deviation.detected_at,deviation.id) from public.routine_deviations deviation
      where deviation.organization_id=v_org and deviation.status in('open','mitigated')
        and public.routine_run_is_visible(deviation.run_id,deviation.organization_id)),'[]'::jsonb),
    'pendingHandovers',coalesce((select jsonb_agg(jsonb_build_object(
      'id',handover.id,'handoverType',handover.handover_type,'fromRunId',handover.from_run_id,'toRunId',handover.to_run_id,
      'status',handover.status,'summary',handover.summary,'revision',handover.revision)
      order by handover.created_at,handover.id) from public.routine_handovers handover
      where handover.organization_id=v_org and handover.status in('draft','submitted') and (
        public.routine_run_is_visible(handover.from_run_id,handover.organization_id)
        or (handover.to_run_id is not null and public.routine_run_is_visible(handover.to_run_id,handover.organization_id)))),'[]'::jsonb),
    'pendingTransfers',coalesce((select jsonb_agg(jsonb_build_object(
      'id',transfer.id,'fromRunId',transfer.from_run_id,'fromTaskId',transfer.from_task_id,'targetType',transfer.target_type,
      'targetRunId',transfer.target_run_id,'status',transfer.status,'reason',transfer.reason,'dueAt',transfer.due_at,'revision',transfer.revision)
      order by transfer.proposed_at,transfer.id) from public.routine_run_transfers transfer
      where transfer.organization_id=v_org and transfer.status in('proposed','accepted') and (
        public.routine_run_is_visible(transfer.from_run_id,transfer.organization_id)
        or (transfer.target_run_id is not null and public.routine_run_is_visible(transfer.target_run_id,transfer.organization_id)))),'[]'::jsonb),
    'eventTransferRequests',v_event_requests,
    'sync',jsonb_build_object('transport',case when v_actor_source='shared_device_operator' then 'cursor_polling' else 'postgres_realtime' end,
      'serverConfirmed',true,'pendingCount',0,'conflictCount',0),
    'offline',jsonb_build_object('draftsAllowed',coalesce((v_identity->'capabilities'->>'offlineNoncritical')::boolean,v_actor_source='personal_auth'),
      'criticalActionsOnlineOnly',true,'timedActionsOnlineOnly',true,'serverCacheAuthoritative',true),
    'emptyStateReason',case when not exists(select 1 from public.routine_templates template where template.organization_id=v_org
      and template.active and template.current_published_version_id is not null) then 'routine_no_published_content' else null end));
end;
$$;

create or replace function public.get_routine_run_action_context(input_run_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path=pg_catalog
as $$
declare
  v_context jsonb:=public.routine_phase10k3_employee_context();
  v_access jsonb:=v_context->'access';
  v_identity jsonb:=v_context->'identity';
  v_operational boolean:=coalesce((v_access->>'operationalAllowed')::boolean,false);
  v_run public.routine_runs%rowtype;
  v_workspace jsonb;
  v_participant public.routine_run_participants%rowtype;
  v_completion jsonb;
  v_completion_core jsonb;
  v_completion_time jsonb;
  v_completion_delivery jsonb;
  v_completion_blockers jsonb;
  v_completion_warnings jsonb;
  v_actor_source text:=v_identity->>'actorSource';
  v_server_now timestamptz:=(v_context->'clock'->>'serverNow')::timestamptz;
begin
  select run.* into v_run from public.routine_runs run where run.id=input_run_id;
  if v_run.id is null or not public.routine_run_is_visible(v_run.id,v_run.organization_id) then
    raise exception using errcode='42501',message='routine_run_not_visible';
  end if;
  select participant.* into v_participant from public.routine_run_participants participant
  where participant.run_id=v_run.id and participant.participation_status<>'removed' and (
    (v_actor_source='personal_auth' and participant.identity_type='personal_profile' and participant.user_profile_id=nullif(v_identity->>'actorProfileId','')::uuid)
    or (v_actor_source='shared_device_operator' and participant.identity_type='shared_device_operator'
      and participant.operator_id=nullif(v_identity->>'effectiveOperatorId','')::uuid)) limit 1;
  -- Both the current public workspace and the renamed 10E workspace resolve
  -- routine_validate_run_completion dynamically. After 10F that validator
  -- evaluates conditions and can append a system event. Start from the pure
  -- 10D projection and compose the later read models explicitly instead.
  v_workspace:=public.get_routine_run_workspace_phase10d(v_run.id);
  v_workspace:=jsonb_build_object(
    'run',public.routine_phase10k3_sanitize_row(v_workspace->'run'),
    'sections',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(value))
      from jsonb_array_elements(coalesce(v_workspace->'sections','[]'::jsonb)) value),'[]'::jsonb),
    'tasks',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(value))
      from jsonb_array_elements(coalesce(v_workspace->'tasks','[]'::jsonb)) value),'[]'::jsonb),
    'taskItems',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(value))
      from jsonb_array_elements(coalesce(v_workspace->'taskItems','[]'::jsonb)) value),'[]'::jsonb),
    'referenceImages',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(value))
      from jsonb_array_elements(coalesce(v_workspace->'referenceImages','[]'::jsonb)) value),'[]'::jsonb),
    'conditions',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(value))
      from jsonb_array_elements(coalesce(v_workspace->'conditions','[]'::jsonb)) value),'[]'::jsonb),
    'dependencies',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(value))
      from jsonb_array_elements(coalesce(v_workspace->'dependencies','[]'::jsonb)) value),'[]'::jsonb),
    'relations',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(value))
      from jsonb_array_elements(coalesce(v_workspace->'relations','[]'::jsonb)) value),'[]'::jsonb),
    'participants',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(value))
      from jsonb_array_elements(coalesce(v_workspace->'participants','[]'::jsonb)) value),'[]'::jsonb),
    'activeRoleAssignments',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(value))
      from jsonb_array_elements(coalesce(v_workspace->'activeRoleAssignments','[]'::jsonb)) value),'[]'::jsonb),
    'sync',coalesce(v_workspace->'sync','{}'::jsonb))||jsonb_build_object(
    'deviations',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(to_jsonb(row_value)) order by row_value.detected_at,row_value.id)
      from public.routine_deviations row_value where row_value.run_id=v_run.id),'[]'::jsonb),
    'managerOverrides',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(to_jsonb(row_value)) order by row_value.created_at,row_value.id)
      from public.routine_manager_overrides row_value where row_value.run_id=v_run.id),'[]'::jsonb),
    'taskVerifications',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(to_jsonb(row_value)) order by row_value.verified_at,row_value.id)
      from public.routine_task_verifications row_value where row_value.run_id=v_run.id),'[]'::jsonb),
    'runVerifications',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(to_jsonb(row_value)) order by row_value.verified_at,row_value.id)
      from public.routine_run_verifications row_value where row_value.run_id=v_run.id),'[]'::jsonb),
    'runVerificationItems',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(to_jsonb(row_value)) order by row_value.run_verification_id,row_value.sort_order)
      from public.routine_run_verification_items row_value where row_value.run_id=v_run.id),'[]'::jsonb),
    'handovers',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(to_jsonb(row_value)) order by row_value.created_at,row_value.id)
      from public.routine_handovers row_value where row_value.from_run_id=v_run.id or row_value.to_run_id=v_run.id),'[]'::jsonb),
    'handoverItems',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(to_jsonb(row_value)) order by row_value.handover_id,row_value.sort_order)
      from public.routine_handover_items row_value where row_value.from_run_id=v_run.id),'[]'::jsonb),
    'transfers',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(to_jsonb(row_value)) order by row_value.proposed_at,row_value.id)
      from public.routine_run_transfers row_value where row_value.from_run_id=v_run.id or row_value.target_run_id=v_run.id),'[]'::jsonb),
    'recentTaskComments',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(to_jsonb(row_value)) order by row_value.server_created_at desc,row_value.id desc)
      from (select event.* from public.routine_events event where event.run_id=v_run.id
        and event.event_type='task_comment_added' order by event.server_created_at desc,event.id desc limit 100) row_value),'[]'::jsonb),
    'corrections',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(to_jsonb(row_value)) order by row_value.created_at,row_value.id)
      from public.routine_corrections row_value where row_value.run_id=v_run.id),'[]'::jsonb));
  v_completion_core:=public.routine_validate_run_completion_core(v_run.id);
  v_completion_time:=public.routine_validate_run_completion_time(v_run.id);
  v_completion_delivery:=public.routine_validate_run_completion_delivery(v_run.id);
  v_completion_blockers:=coalesce(v_completion_core->'blockers','[]'::jsonb)
    ||coalesce(v_completion_time->'blockers','[]'::jsonb)||coalesce(v_completion_delivery->'blockers','[]'::jsonb);
  v_completion_warnings:=coalesce(v_completion_core->'warnings','[]'::jsonb)
    ||coalesce(v_completion_time->'warnings','[]'::jsonb)||coalesce(v_completion_delivery->'warnings','[]'::jsonb);
  v_completion:=jsonb_build_object('valid',jsonb_array_length(v_completion_blockers)=0,
    'blockers',v_completion_blockers,'warnings',v_completion_warnings,
    'acceptedTransferCount',coalesce((v_completion_core->>'acceptedTransferCount')::integer,0),
    'timing',v_completion_time,'delivery',v_completion_delivery);
  v_workspace:=v_workspace||jsonb_build_object(
    'tasks',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(to_jsonb(task))||jsonb_build_object(
        'timing',jsonb_build_object('serverNow',v_server_now,'live',public.routine_compute_task_timing_phase(task.id,v_server_now)),
        'dependencyStatus',public.routine_task_dependency_validation_at(task.id,v_server_now),
        'actorRelationship',jsonb_build_object('assignedTo',case when participant.id is null then null else
          jsonb_build_object('id',participant.id,'displayName',participant.display_name_snapshot,'role',participant.role_snapshot) end),
        'completedBy',(select event.actor_name_snapshot from public.routine_events event where event.task_id=task.id
          and event.event_type='task_completed' order by event.server_created_at desc,event.id desc limit 1),
        'activeDeviations',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(to_jsonb(deviation))
          order by deviation.detected_at,deviation.id) from public.routine_deviations deviation where deviation.task_id=task.id
          and deviation.status in('open','mitigated','accepted_temporarily')),'[]'::jsonb))
      order by task.sort_order_snapshot,task.id) from public.routine_run_tasks task
      left join public.routine_run_participants participant on participant.id=task.assigned_participant_id
      where task.run_id=v_run.id),'[]'::jsonb),
    'timing',public.get_routine_run_timing_state(v_run.id),
    'completionValidation',v_completion,'delivery',jsonb_build_object('preview',public.routine_preview_run_delivery(v_run.id)),
    'sync',coalesce(v_workspace->'sync','{}'::jsonb)||jsonb_build_object('serverConfirmed',true));
  return public.routine_phase10k3_sanitize_row(jsonb_build_object(
    'run',v_workspace,
    'participant',case when v_participant.id is null then null else jsonb_build_object('id',v_participant.id,'status',v_participant.participation_status,
      'displayName',v_participant.display_name_snapshot,'role',v_participant.role_snapshot,'revision',v_participant.revision) end,
    'actorRole',v_identity->>'role',
    'actions',jsonb_build_object(
      'canJoin',public.routine_phase10k3_action(v_operational,v_participant.id is null and v_run.status not in('finished','cancelled','superseded'),'routine_run_not_joinable'),
      'canStartRun',public.routine_phase10k3_action(v_operational,v_participant.id is not null and v_run.status in('scheduled','reopened'),'routine_run_not_startable'),
      'canRequestFinalVerification',public.routine_phase10k3_action(v_operational,v_participant.id is not null and v_run.status='in_progress','routine_run_not_ready_for_verification'),
      'canVerifyRun',public.routine_phase10k3_action(v_operational,v_participant.id is not null and v_run.status='awaiting_final_verification'
        and (not exists(select 1 from public.routine_run_tasks task where task.run_id=v_run.id and task.inclusion_state='included'
              and task.metadata_snapshot->>'runVerificationType' in('closing_responsible','manager','custom'))
          or exists(select 1 from public.routine_run_tasks task where task.run_id=v_run.id and task.inclusion_state='included'
              and task.metadata_snapshot->>'runVerificationType'='custom')
          or ((v_identity->>'role') in('manager','shift_lead') and exists(select 1 from public.routine_run_tasks task
              where task.run_id=v_run.id and task.inclusion_state='included' and task.metadata_snapshot->>'runVerificationType'='manager'))
          or (exists(select 1 from public.routine_run_role_assignments assignment where assignment.run_id=v_run.id
              and assignment.participant_id=v_participant.id and assignment.role_key='closing_responsible' and assignment.status='active')
            and exists(select 1 from public.routine_run_tasks task where task.run_id=v_run.id and task.inclusion_state='included'
              and task.metadata_snapshot->>'runVerificationType'='closing_responsible'))),
        'routine_run_verifier_role_required'),
      'canFinish',public.routine_phase10k3_action(v_operational,(v_identity->>'role') in('manager','shift_lead') and v_run.status in('awaiting_final_verification','waiting_for_transfers','reopened')
        and coalesce((v_completion->>'valid')::boolean,false),'routine_run_completion_blocked'),
      'canCreateHandover',public.routine_phase10k3_action(v_operational,(v_identity->>'role') in('manager','shift_lead')
        and v_run.status in('in_progress','awaiting_final_verification','waiting_for_transfers','reopened'),'routine_handover_creation_denied'),
      'canReopen',public.routine_phase10k3_action(v_operational,(v_identity->>'role')='manager' and v_run.status='finished','routine_run_reopen_denied'),
      'canCancel',public.routine_phase10k3_action(v_operational,(v_identity->>'role') in('manager','shift_lead') and v_run.status not in('finished','cancelled','superseded'),'routine_run_cancel_denied')),
    'progress',jsonb_build_object(
      'total',jsonb_array_length(coalesce(v_workspace->'tasks','[]'::jsonb)),
      'handled',(select count(*) from public.routine_run_tasks task where task.run_id=v_run.id and task.status in('completed','not_applicable','transferred','cancelled')),
      'remaining',(select count(*) from public.routine_run_tasks task where task.run_id=v_run.id and task.status not in('completed','not_applicable','transferred','cancelled')),
      'criticalRemaining',(select count(*) from public.routine_run_tasks task where task.run_id=v_run.id and task.criticality_snapshot='critical'
        and task.status not in('completed','not_applicable','transferred','cancelled')),
      'blocked',(select count(*) from public.routine_run_tasks task where task.run_id=v_run.id and task.status='blocked'),
      'deviations',(select count(*) from public.routine_deviations deviation where deviation.run_id=v_run.id and deviation.status in('open','mitigated','accepted_temporarily')),
      'timingWarnings',jsonb_array_length(coalesce(v_completion_warnings,'[]'::jsonb)),
      'pendingTransfers',(select count(*) from public.routine_run_transfers transfer where transfer.from_run_id=v_run.id and transfer.status in('proposed','accepted'))),
    'currentVerifications',jsonb_build_object('tasks',coalesce(v_workspace->'taskVerifications','[]'::jsonb),
      'run',coalesce(v_workspace->'runVerifications','[]'::jsonb)),
    'runVerificationOptions',coalesce((select jsonb_agg(jsonb_build_object(
      'verificationType',requirements.verification_type,
      'tasks',coalesce((select jsonb_agg(jsonb_build_object('taskId',task.id,'title',task.title_snapshot,
        'taskRevision',task.revision,'required',true) order by task.sort_order_snapshot,task.id)
        from public.routine_run_tasks task where task.run_id=v_run.id and task.inclusion_state='included'
          and task.metadata_snapshot->>'runVerificationType'=requirements.verification_type),'[]'::jsonb),
      'action',public.routine_phase10k3_action(v_operational,v_participant.id is not null
        and v_run.status='awaiting_final_verification' and case requirements.verification_type
          when 'manager' then (v_identity->>'role') in('manager','shift_lead')
          when 'closing_responsible' then exists(select 1 from public.routine_run_role_assignments assignment
            where assignment.run_id=v_run.id and assignment.participant_id=v_participant.id
              and assignment.role_key='closing_responsible' and assignment.status='active')
          else true end,'routine_run_verifier_role_required')) order by requirements.verification_type)
      from (select distinct task.metadata_snapshot->>'runVerificationType' verification_type
        from public.routine_run_tasks task where task.run_id=v_run.id and task.inclusion_state='included'
          and task.metadata_snapshot->>'runVerificationType' in('closing_responsible','manager','custom')
        union all select 'custom' where not exists(select 1 from public.routine_run_tasks task where task.run_id=v_run.id
          and task.inclusion_state='included' and task.metadata_snapshot->>'runVerificationType' in('closing_responsible','manager','custom'))
      ) requirements),'[]'::jsonb),
    'requiredVerifications',coalesce((select jsonb_agg(jsonb_build_object('taskId',task.id,'taskRevision',task.revision,
      'policy',task.verification_policy_snapshot,'title',task.title_snapshot) order by task.sort_order_snapshot,task.id)
      from public.routine_run_tasks task where task.run_id=v_run.id and task.inclusion_state='included'
        and task.status='completed' and task.verification_policy_snapshot<>'none'
        and not exists(select 1 from public.routine_task_verifications verification where verification.task_id=task.id
          and verification.task_revision_verified=task.revision and verification.result='passed')),'[]'::jsonb),
    'completionValidation',v_completion,
    'deliveryPreview',v_workspace->'delivery'->'preview',
    'handoverRequirements',coalesce(v_workspace->'handovers','[]'::jsonb),
    'pendingTransfers',coalesce(v_workspace->'transfers','[]'::jsonb),
    'activeResponsibilities',coalesce(v_workspace->'activeRoleAssignments','[]'::jsonb),
    'criticalReauthRequired',v_actor_source='shared_device_operator' and not public.routine_operator_credential_is_fresh(nullif(v_identity->>'operatorSessionId','')::uuid),
    'offlinePolicy',jsonb_build_object('finishOnlineOnly',v_actor_source='shared_device_operator','serverReceiptRequired',true,
      'queuedDoesNotChangeRunStatus',true),
    'readOnlyPreview',not v_operational,'reasonCode',case when v_operational then null else 'routine_ui_operational_access_required' end));
end;
$$;

create or replace function public.get_routine_task_action_context(input_task_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path=pg_catalog
as $$
declare
  v_context jsonb:=public.routine_phase10k3_employee_context();
  v_access jsonb:=v_context->'access';
  v_identity jsonb:=v_context->'identity';
  v_operational boolean:=coalesce((v_access->>'operationalAllowed')::boolean,false);
  v_task public.routine_run_tasks%rowtype;
  v_participant public.routine_run_participants%rowtype;
  v_assigned public.routine_run_participants%rowtype;
  v_timing jsonb;
  v_dependency jsonb;
  v_actor_source text:=v_identity->>'actorSource';
  v_owns boolean:=false;
  v_critical_reauth boolean:=false;
  v_timing_can_claim boolean:=false;
  v_timing_can_start boolean:=false;
  v_timing_can_complete boolean:=false;
  v_dependency_valid boolean:=false;
  v_timing_reason text;
  v_verification_allowed boolean:=false;
  v_verification_reason text:='routine_task_verification_denied';
begin
  select task.* into v_task from public.routine_run_tasks task where task.id=input_task_id;
  if v_task.id is null or not public.routine_run_is_visible(v_task.run_id,v_task.organization_id) then
    raise exception using errcode='42501',message='routine_task_not_visible';
  end if;
  select participant.* into v_participant from public.routine_run_participants participant where participant.run_id=v_task.run_id
    and participant.participation_status<>'removed' and ((v_actor_source='personal_auth' and participant.identity_type='personal_profile'
      and participant.user_profile_id=nullif(v_identity->>'actorProfileId','')::uuid) or (v_actor_source='shared_device_operator'
      and participant.identity_type='shared_device_operator' and participant.operator_id=nullif(v_identity->>'effectiveOperatorId','')::uuid)) limit 1;
  if v_task.assigned_participant_id is not null then
    select participant.* into v_assigned from public.routine_run_participants participant where participant.id=v_task.assigned_participant_id;
  end if;
  v_owns:=v_participant.id is not null and v_task.assigned_participant_id=v_participant.id;
  v_timing:=public.get_routine_task_timing(v_task.id);
  v_dependency:=public.routine_task_dependency_validation(v_task.id);
  v_timing_can_claim:=coalesce((v_timing->'live'->>'canClaim')::boolean,false);
  v_timing_can_start:=coalesce((v_timing->'live'->>'canStart')::boolean,false);
  v_timing_can_complete:=coalesce((v_timing->'live'->>'canComplete')::boolean,false);
  v_dependency_valid:=coalesce((v_dependency->>'valid')::boolean,false);
  v_timing_reason:=coalesce(v_timing->'live'->>'reasonCode','routine_task_timing_unavailable');
  v_critical_reauth:=v_actor_source='shared_device_operator' and v_task.criticality_snapshot='critical'
    and not public.routine_operator_credential_is_fresh(nullif(v_identity->>'operatorSessionId','')::uuid);
  if v_participant.id is null then
    v_verification_reason:='routine_task_verifier_participant_required';
  elsif v_task.status<>'completed' then
    v_verification_reason:='routine_task_not_completed';
  elsif v_task.verification_policy_snapshot='none' then
    v_verification_reason:='routine_task_verification_not_required';
  elsif v_task.verification_policy_snapshot in('independent','second_person_required') and (
    (v_actor_source='personal_auth' and v_task.completed_by_auth_user_id=nullif(v_identity->>'actorAuthUserId','')::uuid)
    or (v_actor_source='shared_device_operator' and v_task.completed_by_operator_id=nullif(v_identity->>'effectiveOperatorId','')::uuid)
  ) then
    v_verification_reason:='routine_task_independent_verifier_required';
  elsif v_task.verification_policy_snapshot='manager_required' and (v_identity->>'role') not in('manager','shift_lead') then
    v_verification_reason:='routine_task_manager_verifier_required';
  elsif v_task.verification_policy_snapshot='closing_responsible' and not exists(
    select 1 from public.routine_run_role_assignments assignment where assignment.run_id=v_task.run_id
      and assignment.participant_id=v_participant.id and assignment.role_key='closing_responsible' and assignment.status='active'
  ) then
    v_verification_reason:='routine_task_closing_responsible_required';
  elsif v_critical_reauth then
    v_verification_reason:='routine_operator_reauthentication_required';
  else
    v_verification_allowed:=true;
    v_verification_reason:=null;
  end if;
  return public.routine_phase10k3_sanitize_row(jsonb_build_object(
    'task',public.routine_phase10k3_sanitize_row(to_jsonb(v_task))||jsonb_build_object(
        'completedBy',(select event.actor_name_snapshot from public.routine_events event where event.task_id=v_task.id
          and event.event_type='task_completed' order by event.server_created_at desc,event.id desc limit 1)),
    'timing',v_timing,
    'dependencyStatus',v_dependency,
    'condition',(select public.routine_phase10k3_sanitize_row(to_jsonb(condition)) from public.routine_run_condition_evaluations condition where condition.run_task_id=v_task.id),
    'actorRelationship',jsonb_build_object('participantId',v_participant.id,'isAssigned',v_owns,
      'assignedTo',case when v_assigned.id is null then null else jsonb_build_object('id',v_assigned.id,'displayName',v_assigned.display_name_snapshot,'role',v_assigned.role_snapshot) end),
    'runParticipants',coalesce((select jsonb_agg(jsonb_build_object('id',participant.id,
      'displayName',participant.display_name_snapshot,'role',participant.role_snapshot)
      order by participant.display_name_snapshot,participant.id) from public.routine_run_participants participant
      where participant.run_id=v_task.run_id and participant.participation_status<>'removed'),'[]'::jsonb),
    'deviationPolicy',jsonb_build_object('canAssign',public.routine_phase10k3_action(v_operational,
      public.routine_current_user_can_coordinate_runs(),'routine_deviation_assignment_requires_coordinator')),
    'initialAssessmentPolicy',jsonb_build_object('policy',v_task.initial_assessment_policy_snapshot,
      'recorded',v_task.initial_assessment is not null,'result',v_task.initial_assessment,
      'recordedBy',(select event.actor_name_snapshot from public.routine_events event where event.task_id=v_task.id
        and event.event_type='initial_assessment_recorded' order by event.server_created_at desc,event.id desc limit 1),
      'recordedAt',v_task.initial_assessed_at,
      'allowedChoices',case v_task.initial_assessment_policy_snapshot
        when 'ready_on_arrival' then jsonb_build_array('ready','correction_required')
        when 'control_result' then jsonb_build_array('ready','control_issue_found') else '[]'::jsonb end),
    'items',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(to_jsonb(item))
      order by item.sort_order_snapshot,item.item_key_snapshot) from public.routine_run_task_items item where item.run_task_id=v_task.id),'[]'::jsonb),
    'notApplicablePolicy',v_task.not_applicable_policy_snapshot,
    'criticality',v_task.criticality_snapshot,
    'verificationPolicy',v_task.verification_policy_snapshot,
    'activeDeviations',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(to_jsonb(deviation))||jsonb_build_object(
      'actions',jsonb_build_object(
        'canAssign',public.routine_phase10k3_action(v_operational,public.routine_current_user_can_coordinate_runs(),
          'routine_deviation_assignment_requires_coordinator'),
        'canMitigate',public.routine_phase10k3_action(v_operational,deviation.status='open' and
          (public.routine_current_user_can_coordinate_runs() or deviation.assigned_participant_id=v_participant.id),
          'routine_deviation_mitigation_denied'),
        'canResolve',public.routine_phase10k3_action(v_operational,deviation.status in('open','mitigated') and
          (public.routine_current_user_can_coordinate_runs() or deviation.assigned_participant_id=v_participant.id)
          and (deviation.severity<>'critical' or public.routine_current_user_can_coordinate_runs()),
          'routine_deviation_resolution_denied'),
        'canCancel',public.routine_phase10k3_action(v_operational,public.routine_current_user_can_coordinate_runs(),
          'routine_deviation_cancel_requires_coordinator')))
      order by deviation.detected_at,deviation.id) from public.routine_deviations deviation where deviation.task_id=v_task.id
      and deviation.status in('open','mitigated')),'[]'::jsonb),
    'activeOverride',(select public.routine_phase10k3_sanitize_row(to_jsonb(override_row)) from public.routine_manager_overrides override_row
      where override_row.task_id=v_task.id and public.routine_override_is_current(override_row.id) order by override_row.created_at desc limit 1),
    'verifications',coalesce((select jsonb_agg(jsonb_build_object('id',verification.id,'taskRevision',verification.task_revision_verified,
      'policy',verification.verification_policy_snapshot,'result',verification.result,'note',verification.note,
      'physicalRecheckConfirmed',verification.physical_recheck_confirmed,'verifier',verification.verifier_name_snapshot,
      'verifiedAt',verification.verified_at,'valid',verification.task_revision_verified=v_task.revision)
      order by verification.verified_at,verification.id) from public.routine_task_verifications verification
      where verification.task_id=v_task.id),'[]'::jsonb),
    'previousDelivery',public.get_previous_routine_delivery_for_task(v_task.id),
    'comparison',public.get_routine_delivery_comparison(v_task.id),
    'referenceImages',coalesce((select jsonb_agg(jsonb_build_object('id',reference.id,'referenceKey',reference.reference_key_snapshot,
      'caption',reference.caption_snapshot,'altText',reference.alt_text_snapshot,'state',reference.image_state_snapshot,
      'objectPath',reference.object_path_snapshot,'sortOrder',reference.sort_order_snapshot,'rowSnapshotHash',reference.row_snapshot_hash)
      order by reference.sort_order_snapshot,reference.reference_key_snapshot) from public.routine_run_task_reference_images reference
      where reference.run_task_id=v_task.id),'[]'::jsonb),
    'actions',jsonb_build_object(
      'canClaim',public.routine_phase10k3_action(v_operational,v_participant.id is not null and v_task.assigned_participant_id is null
        and v_task.status in('not_started','waiting') and v_timing_can_claim,
        case when not v_timing_can_claim then v_timing_reason else 'routine_task_not_claimable' end),
      'canRelease',public.routine_phase10k3_action(v_operational,v_owns and v_task.status in('not_started','waiting'),'routine_task_release_requires_pause'),
      'canStart',public.routine_phase10k3_action(v_operational,v_owns and v_task.status in('not_started','waiting')
        and v_task.inclusion_state='included' and v_timing_can_start and v_dependency_valid,
        case when not v_timing_can_start then v_timing_reason when not v_dependency_valid then 'routine_task_dependency_blocked'
          else 'routine_task_not_startable' end),
      'canPause',public.routine_phase10k3_action(v_operational,v_owns and v_task.status='in_progress','routine_task_not_pauseable'),
      'canAssess',public.routine_phase10k3_action(v_operational,v_owns and v_task.initial_assessment_policy_snapshot<>'none'
        and v_task.initial_assessment is null and v_timing_can_start and v_dependency_valid,
        case when not v_timing_can_start then v_timing_reason when not v_dependency_valid then 'routine_task_dependency_blocked'
          else 'routine_task_assessment_unavailable' end),
      'canUpdateItems',public.routine_phase10k3_action(v_operational,v_owns and v_task.status in('not_started','in_progress','waiting'),'routine_task_items_read_only'),
      'canComment',public.routine_phase10k3_action(v_operational,v_participant.id is not null,'routine_task_comment_denied'),
      'canBlock',public.routine_phase10k3_action(v_operational,v_owns and v_task.status in('not_started','in_progress','waiting'),'routine_task_block_denied'),
      'canMarkNotApplicable',public.routine_phase10k3_action(v_operational,v_owns and v_task.status<>'blocked'
        and v_task.not_applicable_policy_snapshot not in('forbidden','system_only')
        and (v_timing_can_start or (v_identity->>'role') in('manager','shift_lead')),
        case when v_task.status='blocked' then 'routine_task_blocked'
          when v_task.not_applicable_policy_snapshot in('forbidden','system_only') then 'routine_task_not_applicable_denied'
          else v_timing_reason end),
      'canComplete',public.routine_phase10k3_action(v_operational,v_owns and v_task.status in('in_progress','blocked')
        and v_timing_can_complete and v_dependency_valid and not v_critical_reauth,
        case when v_critical_reauth then 'routine_operator_reauthentication_required'
          when not v_timing_can_complete then v_timing_reason when not v_dependency_valid then 'routine_task_dependency_blocked'
          else 'routine_task_completion_blocked' end),
      'canReopen',public.routine_phase10k3_action(v_operational,(v_identity->>'role') in('manager','shift_lead')
        and v_task.status in('completed','not_applicable','transferred'),'routine_task_reopen_denied'),
      'canVerify',public.routine_phase10k3_action(v_operational,v_verification_allowed,v_verification_reason),
      'canTransfer',public.routine_phase10k3_action(v_operational,v_owns and v_task.status in('in_progress','waiting','blocked'),'routine_task_transfer_denied')),
    'criticalReauthRequired',v_critical_reauth,
    'offlinePolicy',jsonb_build_object('draftItemsAllowed',true,'commentQueueAllowed',true,
      'completionQueueAllowed',v_task.availability_mode_snapshot='manual' and v_task.criticality_snapshot<>'critical'
        and v_actor_source='personal_auth','timedNotApplicableOnlineOnly',v_task.availability_mode_snapshot<>'manual',
      'sharedCriticalOnlineOnly',v_actor_source='shared_device_operator' and v_task.criticality_snapshot='critical'),
    'readOnlyPreview',not v_operational,'reasonCode',case when v_operational then null else 'routine_ui_operational_access_required' end));
end;
$$;

create or replace function public.get_routine_handover_action_context(input_handover_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path=pg_catalog
as $$
declare
  v_context jsonb:=public.routine_phase10k3_employee_context();
  v_access jsonb:=v_context->'access';
  v_operational boolean:=coalesce((v_access->>'operationalAllowed')::boolean,false);
  v_handover public.routine_handovers%rowtype;
  v_source_visible boolean:=false;
  v_target_visible boolean:=false;
begin
  select handover.* into v_handover from public.routine_handovers handover where handover.id=input_handover_id;
  if v_handover.id is null then raise exception using errcode='42501',message='routine_handover_not_visible'; end if;
  v_source_visible:=public.routine_run_is_visible(v_handover.from_run_id,v_handover.organization_id);
  v_target_visible:=v_handover.to_run_id is not null and public.routine_run_is_visible(v_handover.to_run_id,v_handover.organization_id);
  if not v_source_visible and not v_target_visible then raise exception using errcode='42501',message='routine_handover_not_visible'; end if;
  return public.routine_phase10k3_sanitize_row(jsonb_build_object(
    'handover',public.routine_phase10k3_sanitize_row(to_jsonb(v_handover)),
    'items',coalesce((select jsonb_agg(public.routine_phase10k3_sanitize_row(to_jsonb(item)) order by item.sort_order,item.id)
      from public.routine_handover_items item where item.handover_id=v_handover.id),'[]'::jsonb),
    'actorRelation',case when v_source_visible then 'source' when v_target_visible then 'target' else 'none' end,
    'actions',jsonb_build_object(
      'canEdit',public.routine_phase10k3_action(v_operational,v_source_visible and (v_context->'identity'->>'role') in('manager','shift_lead') and v_handover.status='draft','routine_handover_not_editable'),
      'canRefresh',public.routine_phase10k3_action(v_operational,v_source_visible and (v_context->'identity'->>'role') in('manager','shift_lead') and v_handover.status='draft','routine_handover_not_refreshable'),
      'canSubmit',public.routine_phase10k3_action(v_operational,v_source_visible and (v_context->'identity'->>'role') in('manager','shift_lead') and v_handover.status='draft','routine_handover_not_submittable'),
      'canAccept',public.routine_phase10k3_action(v_operational,v_target_visible and v_handover.status='submitted','routine_handover_not_acceptable')),
    'readOnlyPreview',not v_operational));
end;
$$;

create or replace function public.get_routine_transfer_action_context(input_transfer_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path=pg_catalog
as $$
declare
  v_context jsonb:=public.routine_phase10k3_employee_context();
  v_access jsonb:=v_context->'access';
  v_identity jsonb:=v_context->'identity';
  v_operational boolean:=coalesce((v_access->>'operationalAllowed')::boolean,false);
  v_transfer public.routine_run_transfers%rowtype;
  v_source_visible boolean:=false;
  v_target_visible boolean:=false;
  v_event_visible boolean:=false;
  v_event_workspace jsonb:=null;
begin
  select transfer.* into v_transfer from public.routine_run_transfers transfer where transfer.id=input_transfer_id;
  if v_transfer.id is null then raise exception using errcode='42501',message='routine_transfer_not_visible'; end if;
  v_source_visible:=public.routine_run_is_visible(v_transfer.from_run_id,v_transfer.organization_id);
  v_target_visible:=v_transfer.target_run_id is not null and public.routine_run_is_visible(v_transfer.target_run_id,v_transfer.organization_id);
  if v_transfer.target_type='event_operation' then
    v_event_visible:=coalesce((public.routine_current_user_event_transfer_authority(v_transfer.target_event_id)->>'authorized')::boolean,false);
    if v_source_visible or v_event_visible then
      v_event_workspace:=jsonb_build_object(
        'sourceTask',(select jsonb_build_object('id',task.id,'taskKey',task.task_key_snapshot,'title',task.title_snapshot,
          'criticality',task.criticality_snapshot,'status',task.status,'rowSnapshotHash',task.row_snapshot_hash)
          from public.routine_run_tasks task where task.id=v_transfer.from_task_id),
        'evidenceRequirements',coalesce((select jsonb_agg(jsonb_build_object('sourceTaskItemId',item.id,
          'itemKey',item.item_key_snapshot,'label',item.label_snapshot,'itemType',item.item_type_snapshot,
          'required',item.required_snapshot,'inputSchema',item.input_schema_snapshot,
          'options',coalesce(item.input_schema_snapshot->'options','[]'::jsonb),'unit',item.input_schema_snapshot->>'unit',
          'sourceIdentity',jsonb_strip_nulls(jsonb_build_object('name',coalesce(item.location_name_snapshot,
            item.source_record_snapshot->>'name',item.external_source_id_snapshot,item.label_snapshot),
            'key',coalesce(item.location_key_snapshot,item.external_source_id_snapshot,item.item_key_snapshot))),
          'rowSnapshotHash',item.row_snapshot_hash)
          order by item.sort_order_snapshot,item.item_key_snapshot) from public.routine_run_task_items item
          where item.run_task_id=v_transfer.from_task_id and item.active_snapshot),'[]'::jsonb),
        'acceptance',(select public.routine_phase10k3_sanitize_row(to_jsonb(acceptance))
          from public.routine_event_transfer_acceptances acceptance where acceptance.transfer_id=v_transfer.id),
        'completion',(select public.routine_phase10k3_sanitize_row(to_jsonb(completion))
          from public.routine_event_transfer_completions completion where completion.transfer_id=v_transfer.id),
        'authority',public.routine_current_user_event_transfer_authority(v_transfer.target_event_id));
    end if;
  end if;
  if not v_source_visible and not v_target_visible and not v_event_visible then
    raise exception using errcode='42501',message='routine_transfer_not_visible';
  end if;
  return public.routine_phase10k3_sanitize_row(jsonb_build_object(
    'transfer',public.routine_phase10k3_sanitize_row(to_jsonb(v_transfer)),
    'sourceTask',(select jsonb_build_object('id',task.id,'title',task.title_snapshot,'location',task.location_name_snapshot,
      'status',task.status,'criticality',task.criticality_snapshot,'revision',task.revision) from public.routine_run_tasks task where task.id=v_transfer.from_task_id),
    'actorRelation',case when v_event_visible then 'event_target' when v_target_visible then 'routine_target' when v_source_visible then 'source' else 'none' end,
    'eventContext',case when v_event_workspace is null then null else jsonb_build_object(
      'sourceTask',v_event_workspace->'sourceTask','evidenceRequirements',v_event_workspace->'evidenceRequirements',
      'acceptance',v_event_workspace->'acceptance','completion',v_event_workspace->'completion','authority',v_event_workspace->'authority') end,
    'actions',jsonb_build_object(
      'canAccept',public.routine_phase10k3_action(v_operational,(v_target_visible or v_event_visible) and v_transfer.status='proposed','routine_transfer_not_acceptable'),
      'canReject',public.routine_phase10k3_action(v_operational,(v_event_visible or (v_source_visible and (v_identity->>'role') in('manager','shift_lead'))) and v_transfer.status='proposed','routine_transfer_not_rejectable'),
      'canComplete',public.routine_phase10k3_action(v_operational,(v_event_visible or (v_source_visible and (v_identity->>'role') in('manager','shift_lead'))) and v_transfer.status='accepted','routine_transfer_not_completable'),
      'canCancel',public.routine_phase10k3_action(v_operational,v_source_visible and (v_identity->>'role') in('manager','shift_lead') and v_transfer.status in('proposed','accepted'),'routine_transfer_not_cancellable')),
    'criticalReauthRequired',(v_identity->>'actorSource')='shared_device_operator'
      and (select task.criticality_snapshot='critical' from public.routine_run_tasks task where task.id=v_transfer.from_task_id)
      and not public.routine_operator_credential_is_fresh(nullif(v_identity->>'operatorSessionId','')::uuid),
    'criticalConfirmationRequired',coalesce((select task.criticality_snapshot='critical'
      from public.routine_run_tasks task where task.id=v_transfer.from_task_id),false),
    'readOnlyPreview',not v_operational));
end;
$$;

create or replace function public.get_double_shift_action_context(input_bundle_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path=pg_catalog
as $$
declare
  v_context jsonb:=public.routine_phase10k3_employee_context();
  v_access jsonb:=v_context->'access';
  v_identity jsonb:=v_context->'identity';
  v_operational boolean:=coalesce((v_access->>'operationalAllowed')::boolean,false);
  v_bundle public.routine_bundles%rowtype;
  v_participant public.routine_bundle_participants%rowtype;
  v_closing_participant public.routine_bundle_participants%rowtype;
  v_opening public.routine_runs%rowtype;
  v_closing public.routine_runs%rowtype;
  v_change_feed jsonb;
  v_actor_source text:=v_identity->>'actorSource';
begin
  select bundle.* into v_bundle from public.routine_bundles bundle where bundle.id=input_bundle_id;
  if v_bundle.id is null or not public.routine_bundle_is_visible(v_bundle.id,v_bundle.organization_id) then
    raise exception using errcode='42501',message='routine_double_shift_not_visible';
  end if;
  select participant.* into v_participant from public.routine_bundle_participants participant
    where participant.bundle_id=v_bundle.id and participant.status<>'removed' and (
      (v_actor_source='personal_auth' and participant.identity_type='personal_profile'
        and participant.user_profile_id=nullif(v_identity->>'actorProfileId','')::uuid)
      or (v_actor_source='shared_device_operator' and participant.identity_type='shared_device_operator'
        and participant.operator_id=nullif(v_identity->>'effectiveOperatorId','')::uuid)) limit 1;
  select run.* into v_opening from public.routine_bundle_runs link join public.routine_runs run on run.id=link.run_id
    where link.bundle_id=v_bundle.id and link.phase='opening';
  select run.* into v_closing from public.routine_bundle_runs link join public.routine_runs run on run.id=link.run_id
    where link.bundle_id=v_bundle.id and link.phase='closing';
  select participant.* into v_closing_participant from public.routine_bundle_participants participant
    where participant.bundle_id=v_bundle.id and participant.closing_run_participant_id is not null
      and participant.status not in('closing_reassigned','removed') order by participant.created_at desc,participant.id desc limit 1;
  if v_participant.id is not null then
    v_change_feed:=public.get_double_shift_change_feed(v_bundle.id,v_participant.id);
  else
    v_change_feed:=jsonb_build_object('transitionCompletedAt',public.routine_get_bundle_transition_instant(v_bundle.id,null),
      'serverNow',clock_timestamp(),'entries','[]'::jsonb,
      'feedHash',public.routine_compute_double_shift_change_feed_hash('[]'::jsonb));
  end if;
  return public.routine_phase10k3_sanitize_row(jsonb_build_object(
    'bundle',jsonb_build_object(
      'bundle',jsonb_build_object('id',v_bundle.id,'status',v_bundle.status,'operationalDate',v_bundle.operational_date,
        'operational_date',v_bundle.operational_date,'timezone',v_bundle.timezone,'scopeKey',v_bundle.scope_key,
        'openingRoutineKey',v_bundle.opening_routine_key,'closingRoutineKey',v_bundle.closing_routine_key,
        'revision',v_bundle.revision,'startedAt',v_bundle.started_at,'completedAt',v_bundle.completed_at,
        'expected_closing_start_at',(select min(timing.start_at) from public.routine_run_task_timings timing where timing.run_id=v_closing.id)),
      'currentParticipant',case when v_participant.id is null then null else jsonb_build_object('id',v_participant.id,
        'displayName',v_participant.display_name_snapshot,'role',v_participant.role_snapshot,'status',v_participant.status,
        'expectedReturnAt',v_participant.expected_return_at,'actualReturnAt',v_participant.actual_return_at,
        'interimOwnerParticipantId',v_participant.interim_owner_participant_id,'revision',v_participant.revision) end,
      'runs',jsonb_build_object('opening',jsonb_build_object('id',v_opening.id,'status',v_opening.status,
        'routineKey',v_opening.routine_key,'operationalDate',v_opening.operational_date,'revision',v_opening.revision),
        'closing',jsonb_build_object('id',v_closing.id,'status',v_closing.status,'routineKey',v_closing.routine_key,
          'operationalDate',v_closing.operational_date,'revision',v_closing.revision)),
      'participants',coalesce((select jsonb_agg(jsonb_build_object('id',participant.id,'displayName',participant.display_name_snapshot,
        'role',participant.role_snapshot,'status',participant.status,'expectedReturnAt',participant.expected_return_at,
        'actualReturnAt',participant.actual_return_at) order by participant.created_at,participant.id)
        from public.routine_bundle_participants participant where participant.bundle_id=v_bundle.id and participant.status<>'removed'),'[]'::jsonb),
      'roles',coalesce((select jsonb_agg(jsonb_build_object('runId',assignment.run_id,'roleKey',assignment.role_key,
        'scopeKey',assignment.scope_key,'participantId',assignment.participant_id) order by assignment.run_id,assignment.role_key,assignment.scope_key)
        from public.routine_run_role_assignments assignment where assignment.run_id in(v_opening.id,v_closing.id)
          and assignment.status='active'),'[]'::jsonb),
      'eventContext',jsonb_build_object('label',case when exists(select 1 from public.routine_run_external_context_states state
          where state.run_id in(v_opening.id,v_closing.id)) then 'Linked Event context available' else 'No linked Event context' end,
        'sourceCount',(select count(*) from public.routine_run_external_context_states state where state.run_id in(v_opening.id,v_closing.id))),
      'missingCriticalRoles',to_jsonb(array(select required.role_key from unnest(array[
        'opening_responsible','closing_responsible','cash_register_responsible','locking_alarm_responsible']) required(role_key)
        where not exists(select 1 from public.routine_run_role_assignments assignment where assignment.run_id in(v_opening.id,v_closing.id)
          and assignment.role_key=required.role_key and assignment.status='active') order by required.role_key)),
      'interimOwner',(select jsonb_build_object('id',interim.id,'displayName',interim.display_name_snapshot)
        from public.routine_bundle_participants interim where interim.id=v_participant.interim_owner_participant_id)),
    'actions',jsonb_build_object(
      'canConfirmDS01',public.routine_phase10k3_action(v_operational,v_bundle.status='scheduled' and v_participant.id is not null,'routine_ds01_unavailable'),
      'canSubmitDS02',public.routine_phase10k3_action(v_operational,v_bundle.status='opening_complete' and v_participant.id is not null,'routine_ds02_unavailable'),
      'canReturnDS03',public.routine_phase10k3_action(v_operational,v_bundle.status in('between_shifts','closing_due') and v_participant.id is not null,'routine_ds03_unavailable'),
      'canReassignClosing',public.routine_phase10k3_action(v_operational,(v_identity->>'role') in('manager','shift_lead')
        and v_closing_participant.id is not null and v_bundle.status not in('completed','cancelled'),'routine_double_shift_reassignment_denied')),
    'expectedReturnAt',v_participant.expected_return_at,
    'actualReturnAt',v_participant.actual_return_at,
    'changeFeed',v_change_feed||jsonb_build_object('hash',v_change_feed->>'feedHash'),
    'reassignmentState',jsonb_build_object('closingParticipantId',v_closing_participant.id,
      'closingAssignedTo',v_closing_participant.display_name_snapshot,
      'history',coalesce((select jsonb_agg(jsonb_build_object('id',reassignment.id,
        'fromParticipantId',reassignment.from_bundle_participant_id,'toParticipantId',reassignment.to_bundle_participant_id,
        'reason',reassignment.reason,'createdBy',reassignment.created_by_name_snapshot,'createdAt',reassignment.created_at)
        order by reassignment.created_at,reassignment.id) from public.routine_bundle_reassignments reassignment
        where reassignment.bundle_id=v_bundle.id),'[]'::jsonb)),
    'openingSummary',jsonb_build_object('status',v_opening.status,
      'corrections',(select count(*) from public.routine_corrections correction where correction.run_id=v_opening.id),
      'openDeviations',(select count(*) from public.routine_deviations deviation where deviation.run_id=v_opening.id
        and deviation.status in('open','mitigated','accepted_temporarily')),
      'rooms','Server summary','technicalIssues',(select count(*) from public.routine_deviations deviation
        where deviation.run_id=v_opening.id and deviation.category in('technical','equipment'))),
    'closingSummary',jsonb_build_object('status',v_closing.status,'revision',v_closing.revision),
    'pendingEventTransfers',coalesce((select jsonb_agg(jsonb_build_object('id',transfer.id,'fromRunId',transfer.from_run_id,
      'fromTaskId',transfer.from_task_id,'targetEventId',transfer.target_event_id,'status',transfer.status,
      'reason',transfer.reason,'dueAt',transfer.due_at,'revision',transfer.revision) order by transfer.proposed_at,transfer.id)
      from public.routine_run_transfers transfer where transfer.from_run_id in(v_opening.id,v_closing.id)
        and transfer.target_type='event_operation' and transfer.status in('proposed','accepted')),'[]'::jsonb),
    'ds04Summary',jsonb_build_object('completionEligibility',jsonb_build_object('openingFinished',v_opening.status='finished',
      'closingFinished',v_closing.status='finished','bundleCompleted',v_bundle.status='completed'),
      'delivery',jsonb_build_object('preview',public.routine_preview_run_delivery(v_closing.id)),
      'personalOutcome',case when v_participant.id is null then null else public.routine_double_shift_personal_outcome(v_participant.id) end,
      'reassignmentCount',(select count(*) from public.routine_bundle_reassignments reassignment where reassignment.bundle_id=v_bundle.id)),
    'readOnlyPreview',not v_operational));
end;
$$;

revoke all on function public.routine_phase10k3_employee_context(),public.routine_phase10k3_action(boolean,boolean,text),
  public.routine_phase10k3_sanitize_row(jsonb)
  from public,anon,authenticated;

revoke all on function public.get_routine_employee_home(),public.get_routine_run_action_context(uuid),
  public.get_routine_task_action_context(uuid),public.get_routine_handover_action_context(uuid),
  public.get_routine_transfer_action_context(uuid),public.get_double_shift_action_context(uuid)
  from public,anon,authenticated;

grant execute on function public.get_routine_employee_home(),public.get_routine_run_action_context(uuid),
  public.get_routine_task_action_context(uuid),public.get_routine_handover_action_context(uuid),
  public.get_routine_transfer_action_context(uuid),public.get_double_shift_action_context(uuid)
  to authenticated;
