-- Phase 10K2: manager-only control center read models and release readiness.
-- Apply after phase10k1_routine_ui_pilot_gate.sql. This migration is additive,
-- creates no operative content, performs no run/task mutation, and never
-- changes an organization's Routine Engine mode.

-- Release-stage installation is monotonic and timestamp-stable on reapply.
-- The K1 trigger admits release metadata only through this deployment-local
-- guard; it remains unavailable to application callers.
do $phase10k2_release$
begin
  perform pg_catalog.set_config('mesh.routine_ui_release_internal','release',true);
  update public.routine_organization_settings settings
  set ui_release_stage = 'manager_preview',
      ui_contract_version = 'phase10k2-v1',
      revision = settings.revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  where settings.ui_release_stage = 'foundation';
end;
$phase10k2_release$;

create or replace function public.routine_phase10k2_require_personal_manager()
returns public.user_profiles
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_profile public.user_profiles%rowtype;
begin
  select profile.* into v_profile
  from public.user_profiles profile
  where profile.id = (select auth.uid())
    and profile.active
    and profile.organization_id is not null
    and profile.role = 'manager'
    and not coalesce(profile.is_shared_device, false);
  if v_profile.id is null
     or public.routine_current_actor_source() is distinct from 'personal_auth' then
    raise exception using errcode = '42501',
      message = 'A personal authenticated manager is required for Routine Manager.';
  end if;
  return v_profile;
end;
$$;

-- K2 adds one missing logical-template mutation to the existing immutable K1
-- UI-operation contract. It does not introduce a parallel mutation ledger.
alter table public.routine_ui_operations drop constraint if exists routine_ui_operations_type_check;
alter table public.routine_ui_operations add constraint routine_ui_operations_type_check
  check (operation_type in ('set_engine_mode','replace_pilot_memberships','set_routine_template_active'));
alter table public.routine_ui_operations drop constraint if exists routine_ui_operations_resource_check;
alter table public.routine_ui_operations add constraint routine_ui_operations_resource_check
  check (resource_type in ('organization_settings','pilot_memberships','routine_template'));

-- Preserve every Phase 10J/K1 event type while admitting the optional K2
-- template-state event to the same immutable event ledger.
alter table public.routine_operator_events drop constraint if exists routine_operator_events_type_check;
alter table public.routine_operator_events add constraint routine_operator_events_type_check check(event_type in(
  'shared_device_registered','shared_device_updated','shared_device_disabled','operator_created','operator_updated','operator_disabled',
  'operator_credential_created','operator_credential_rotated','operator_credential_revoked','operator_auth_succeeded','operator_auth_failed',
  'operator_session_started','operator_session_reauthenticated','operator_session_ended','operator_session_revoked','operator_session_expired',
  'operator_access_updated','routine_engine_mode_changed','routine_pilot_memberships_replaced','routine_template_active_changed'));

create or replace function public.set_routine_template_active(
  input_template_id uuid,
  input_active boolean,
  input_expected_revision bigint,
  input_reason text,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor public.user_profiles%rowtype := public.routine_phase10k2_require_personal_manager();
  v_template public.routine_templates%rowtype;
  v_hash text;
  v_replay jsonb;
  v_response jsonb;
  v_operation_id uuid;
  v_reason text := trim(coalesce(input_reason,''));
  v_changed boolean;
begin
  if input_template_id is null or input_active is null or input_expected_revision is null
      or input_idempotency_key is null or char_length(v_reason) not between 3 and 1000 then
    raise exception using errcode='22023',
      message='Template, active state, expected revision, trimmed reason, and idempotency key are required.';
  end if;

  v_hash := public.routine_phase10j_request_hash(jsonb_build_object(
    'templateId',input_template_id,
    'active',input_active,
    'expectedRevision',input_expected_revision,
    'reason',v_reason));
  v_replay := public.routine_phase10k1_existing_operation(
    v_actor.organization_id,v_actor.id,'set_routine_template_active',input_idempotency_key,v_hash);
  if v_replay is not null then return v_replay; end if;

  select template.* into v_template
  from public.routine_templates template
  where template.id=input_template_id
    and template.organization_id=v_actor.organization_id
  for update;
  if v_template.id is null then
    raise exception using errcode='P0001',message='Routine template was not found in this organization.';
  end if;

  -- A concurrent first use of the same key may have committed while this call
  -- waited for the row lock. Recheck before evaluating the expected revision.
  v_replay := public.routine_phase10k1_existing_operation(
    v_actor.organization_id,v_actor.id,'set_routine_template_active',input_idempotency_key,v_hash);
  if v_replay is not null then return v_replay; end if;

  if v_template.revision<>input_expected_revision then
    raise exception using errcode='40001',
      message='Routine template revision conflict.',
      detail=jsonb_build_object('templateId',v_template.id,'serverRevision',v_template.revision)::text;
  end if;

  v_changed := v_template.active is distinct from input_active;
  if v_changed then
    update public.routine_templates template
    set active=input_active,
        revision=template.revision+1,
        updated_at=pg_catalog.clock_timestamp(),
        updated_by_auth_user_id=v_actor.id
    where template.id=v_template.id
      and template.organization_id=v_actor.organization_id
    returning template.* into v_template;
  end if;

  v_response := jsonb_build_object(
    'templateId',v_template.id,
    'active',v_template.active,
    'revision',v_template.revision,
    'updatedAt',v_template.updated_at,
    'updatedBy',v_actor.display_name,
    'reason',v_reason,
    'changed',v_changed,
    'idempotentReplay',false,
    'hasCurrentPublishedVersion',v_template.current_published_version_id is not null,
    'hasActiveDraft',exists(select 1 from public.routine_template_versions version
      where version.template_id=v_template.id and version.organization_id=v_actor.organization_id and version.state='draft'),
    'deactivationConsequence','Deactivation prevents new runs from using this template. Published versions and historical runs are not changed.');

  v_operation_id := public.routine_phase10k1_record_operation(
    v_actor.organization_id,v_actor.id,'set_routine_template_active',input_idempotency_key,
    v_hash,'routine_template',v_template.id,v_response);
  if v_changed then
    perform public.routine_phase10j_record_event(
      v_actor.organization_id,null,null,null,'routine_template_active_changed',v_actor.id,v_actor.id,
      v_actor.display_name,jsonb_build_object('templateId',v_template.id,'routineKey',v_template.routine_key,
        'active',v_template.active,'reason',v_reason,'revision',v_template.revision,
        'uiOperationId',v_operation_id),null);
  end if;
  return v_response;
end;
$$;

-- Stable location identities and an acyclic hierarchy are database-enforced.
create or replace function public.routine_phase10k2_location_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'UPDATE' and new.location_key is distinct from old.location_key then
    raise exception using errcode = '42501', message = 'Routine location stable keys are immutable.';
  end if;
  if new.parent_location_id is not null and exists (
    with recursive descendants(id) as (
      select new.id
      union all
      select location.id
      from public.routine_locations location
      join descendants parent on location.parent_location_id = parent.id
      where location.organization_id = new.organization_id
    )
    select 1 from descendants where id = new.parent_location_id
  ) then
    raise exception using errcode = '23514', message = 'Routine location hierarchy cannot contain a cycle.';
  end if;
  return new;
end;
$$;

drop trigger if exists routine_phase10k2_location_guard_trigger on public.routine_locations;
create trigger routine_phase10k2_location_guard_trigger
before update on public.routine_locations
for each row execute function public.routine_phase10k2_location_guard();

create or replace function public.get_routine_foundation_editor_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor public.user_profiles%rowtype := public.routine_phase10k2_require_personal_manager();
begin
  return jsonb_build_object(
    'settings', (select to_jsonb(settings) - 'created_by_auth_user_id' - 'updated_by_auth_user_id'
      from public.routine_organization_settings settings where settings.organization_id = v_actor.organization_id),
    'locations', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', location.id, 'stableKey', location.location_key, 'name', location.name,
      'locationType', location.location_type, 'parentLocationId', location.parent_location_id,
      'sortOrder', location.sort_order, 'active', location.active, 'metadata', location.metadata,
      'revision', location.revision, 'updatedAt', location.updated_at,
      'updatedBy', updater.display_name) order by location.sort_order, location.location_key), '[]'::jsonb)
      from public.routine_locations location
      left join public.user_profiles updater on updater.id = location.updated_by_auth_user_id
      where location.organization_id = v_actor.organization_id),
    'locationSets', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', location_set.id, 'stableKey', location_set.set_key, 'name', location_set.name,
      'description', location_set.description, 'active', location_set.active,
      'revision', location_set.revision, 'updatedAt', location_set.updated_at,
      'members', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', member.id, 'locationId', member.location_id, 'sortOrder', member.sort_order,
        'required', member.required, 'metadata', member.metadata) order by member.sort_order), '[]'::jsonb)
        from public.routine_location_set_members member where member.location_set_id = location_set.id)
      ) order by location_set.set_key), '[]'::jsonb)
      from public.routine_location_sets location_set where location_set.organization_id = v_actor.organization_id),
    'standards', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', standard.id, 'stableKey', standard.standard_key, 'label', standard.label,
      'description', standard.description, 'valueType', standard.value_type, 'unit', standard.unit,
      'sourceKind', standard.source_kind, 'externalReadonly', standard.source_kind <> 'manual',
      'active', standard.active, 'revision', standard.revision, 'currentRevisionId', standard.current_revision_id,
      'revisions', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', revision.id, 'revisionNumber', revision.revision_number, 'value', revision.value_json,
        'effectiveFrom', revision.effective_from, 'reason', revision.reason,
        'contentHash', revision.content_hash, 'createdAt', revision.created_at,
        'createdBy', creator.display_name) order by revision.revision_number desc), '[]'::jsonb)
        from public.routine_standard_revisions revision
        left join public.user_profiles creator on creator.id = revision.created_by_auth_user_id
        where revision.standard_id = standard.id)
      ) order by standard.standard_key), '[]'::jsonb)
      from public.routine_standards standard where standard.organization_id = v_actor.organization_id),
    'sourceKinds', jsonb_build_array(
      jsonb_build_object('value','manual','label','Manual'),
      jsonb_build_object('value','inventory_readonly','label','Inventory · read only'),
      jsonb_build_object('value','asset_registry_readonly','label','Asset registry · read only'),
      jsonb_build_object('value','location_set','label','Location set')),
    'validationWarnings', (select coalesce(jsonb_agg(warning order by warning->>'key'), '[]'::jsonb) from (
      select jsonb_build_object('category','locations','key',location_set.set_key,'severity','blocker',
        'message','Empty location set blocks publication when used.') warning
      from public.routine_location_sets location_set
      where location_set.organization_id = v_actor.organization_id and location_set.active
        and not exists (select 1 from public.routine_location_set_members member where member.location_set_id = location_set.id)
      union all
      select jsonb_build_object('category','standards','key',standard.standard_key,'severity','blocker',
        'message','Active manual standard has no current immutable revision.')
      from public.routine_standards standard
      where standard.organization_id = v_actor.organization_id and standard.active
        and standard.source_kind = 'manual' and standard.current_revision_id is null
    ) warnings),
    'revisionNumbers', jsonb_build_object(
      'settings', (select settings.revision from public.routine_organization_settings settings where settings.organization_id=v_actor.organization_id),
      'locations', (select coalesce(max(location.revision),0) from public.routine_locations location where location.organization_id=v_actor.organization_id),
      'locationSets', (select coalesce(max(location_set.revision),0) from public.routine_location_sets location_set where location_set.organization_id=v_actor.organization_id),
      'standards', (select coalesce(max(standard.revision),0) from public.routine_standards standard where standard.organization_id=v_actor.organization_id))
  );
end;
$$;

create or replace function public.get_routine_template_editor_workspace(
  input_template_id uuid,
  input_version_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor public.user_profiles%rowtype := public.routine_phase10k2_require_personal_manager();
  v_template public.routine_templates%rowtype;
  v_version public.routine_template_versions%rowtype;
  v_validation jsonb;
begin
  select template.* into v_template from public.routine_templates template
  where template.id = input_template_id and template.organization_id = v_actor.organization_id;
  if v_template.id is null then raise exception using errcode='P0001', message='Routine template was not found in this organization.'; end if;
  if input_version_id is null then
    select version.* into v_version from public.routine_template_versions version
    where version.template_id = v_template.id
    order by (version.state='draft') desc, version.version_number desc limit 1;
  else
    select version.* into v_version from public.routine_template_versions version
    where version.id=input_version_id and version.template_id=v_template.id and version.organization_id=v_actor.organization_id;
  end if;
  if v_version.id is null then raise exception using errcode='P0001', message='Routine template version was not found.'; end if;
  v_validation := public.validate_routine_template_version(v_version.id, array[v_version.id]);
  return jsonb_build_object(
    'template', to_jsonb(v_template)-'creation_idempotency_key',
    'templateStatus',jsonb_build_object(
      'active',v_template.active,
      'revision',v_template.revision,
      'updatedAt',v_template.updated_at,
      'updatedBy',(select profile.display_name from public.user_profiles profile where profile.id=v_template.updated_by_auth_user_id),
      'hasCurrentPublishedVersion',v_template.current_published_version_id is not null,
      'hasActiveDraft',exists(select 1 from public.routine_template_versions candidate
        where candidate.template_id=v_template.id and candidate.organization_id=v_actor.organization_id and candidate.state='draft'),
      'deactivationConsequence','Deactivation prevents new runs from using this template. Published versions and historical runs are not changed.'),
    'version', to_jsonb(v_version)-'creation_idempotency_key',
    'immutable', v_version.state <> 'draft',
    'sections', (select coalesce(jsonb_agg(to_jsonb(section) order by section.sort_order), '[]'::jsonb)
      from public.routine_template_sections section where section.version_id=v_version.id),
    'tasks', (select coalesce(jsonb_agg(to_jsonb(task) order by section.sort_order,task.sort_order), '[]'::jsonb)
      from public.routine_template_tasks task join public.routine_template_sections section on section.id=task.section_id
      where task.version_id=v_version.id),
    'taskItems', (select coalesce(jsonb_agg(to_jsonb(item) order by task.sort_order,item.sort_order), '[]'::jsonb)
      from public.routine_template_task_items item join public.routine_template_tasks task on task.id=item.task_id
      where item.version_id=v_version.id),
    'dependencies', (select coalesce(jsonb_agg(to_jsonb(dependency) order by dependency.predecessor_task_id,dependency.successor_task_id), '[]'::jsonb)
      from public.routine_template_task_dependencies dependency where dependency.version_id=v_version.id),
    'relations', (select coalesce(jsonb_agg(to_jsonb(relation) order by relation.source_task_id,relation.target_routine_key,relation.target_task_key), '[]'::jsonb)
      from public.routine_template_task_relations relation where relation.version_id=v_version.id),
    'referenceLinks', (select coalesce(jsonb_agg(to_jsonb(link) order by link.task_id,link.sort_order), '[]'::jsonb)
      from public.routine_template_task_reference_images link where link.version_id=v_version.id),
    'referenceChoices', (select coalesce(jsonb_agg(jsonb_build_object('id',reference.id,'stableKey',reference.reference_key,
      'label',reference.label,'active',reference.active,'currentState',image.state,'placeholderText',reference.placeholder_text,
      'usedByPublished',exists(select 1 from public.routine_template_task_reference_images usage
        join public.routine_template_versions published on published.id=usage.version_id and published.state='published'
        where usage.reference_id=reference.id and usage.active)) order by reference.reference_key), '[]'::jsonb)
      from public.routine_reference_images reference left join public.routine_reference_image_versions image on image.id=reference.current_version_id
      where reference.organization_id=v_actor.organization_id),
    'locationChoices', (select coalesce(jsonb_agg(jsonb_build_object('id',location.id,'stableKey',location.location_key,'name',location.name,'active',location.active)
      order by location.sort_order,location.location_key),'[]'::jsonb) from public.routine_locations location where location.organization_id=v_actor.organization_id),
    'locationSetChoices', (select coalesce(jsonb_agg(jsonb_build_object('id',location_set.id,'stableKey',location_set.set_key,'name',location_set.name,
      'active',location_set.active,'memberCount',(select count(*) from public.routine_location_set_members member where member.location_set_id=location_set.id))
      order by location_set.set_key),'[]'::jsonb) from public.routine_location_sets location_set where location_set.organization_id=v_actor.organization_id),
    'standardChoices', (select coalesce(jsonb_agg(jsonb_build_object('id',standard.id,'stableKey',standard.standard_key,'label',standard.label,
      'valueType',standard.value_type,'sourceKind',standard.source_kind,'active',standard.active,'currentRevisionId',standard.current_revision_id)
      order by standard.standard_key),'[]'::jsonb) from public.routine_standards standard where standard.organization_id=v_actor.organization_id),
    'validation', v_validation,
    'publicationDependencies', (select coalesce(jsonb_agg(jsonb_build_object('sourceTaskId',relation.source_task_id,'targetRoutineKey',relation.target_routine_key,
      'targetTaskKey',relation.target_task_key,'relationType',relation.relation_type) order by relation.target_routine_key,relation.target_task_key),'[]'::jsonb)
      from public.routine_template_task_relations relation where relation.version_id=v_version.id),
    'currentPublishedSummary', (select case when published.id is null then null else jsonb_build_object('id',published.id,'versionNumber',published.version_number,
      'contentHash',published.content_hash,'publishedAt',published.published_at,'publishNote',published.publish_note) end
      from (select 1) anchor left join public.routine_template_versions published on published.id=v_template.current_published_version_id),
    'revisions', jsonb_build_object('template',v_template.revision,'version',v_version.revision)
  );
end;
$$;

create or replace function public.get_routine_template_version_diff(input_from_version_id uuid,input_to_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare
  v_actor public.user_profiles%rowtype:=public.routine_phase10k2_require_personal_manager();
  v_from public.routine_template_versions%rowtype; v_to public.routine_template_versions%rowtype;
begin
  select version.* into v_from from public.routine_template_versions version where version.id=input_from_version_id and version.organization_id=v_actor.organization_id;
  select version.* into v_to from public.routine_template_versions version where version.id=input_to_version_id and version.organization_id=v_actor.organization_id;
  if v_from.id is null or v_to.id is null then raise exception using errcode='P0001',message='Both diff versions must belong to this organization.'; end if;
  if v_from.template_id is distinct from v_to.template_id then raise exception using errcode='22023',message='Template diff versions must belong to the same logical template.'; end if;
  return jsonb_build_object(
    'fromVersion',jsonb_build_object('id',v_from.id,'number',v_from.version_number,'state',v_from.state),
    'toVersion',jsonb_build_object('id',v_to.id,'number',v_to.version_number,'state',v_to.state),
    'metadataChanges',(select coalesce(jsonb_agg(change),'[]'::jsonb) from (select jsonb_build_object('field','name','oldValue',v_from.name,'newValue',v_to.name) change where v_from.name is distinct from v_to.name
      union all select jsonb_build_object('field','description','oldValue',v_from.description,'newValue',v_to.description) where v_from.description is distinct from v_to.description) changes),
    'sections',jsonb_build_object(
      'added',(select coalesce(jsonb_agg(t.section_key order by t.sort_order),'[]'::jsonb) from public.routine_template_sections t where t.version_id=v_to.id and not exists(select 1 from public.routine_template_sections f where f.version_id=v_from.id and f.section_key=t.section_key)),
      'changed',(select coalesce(jsonb_agg(jsonb_build_object('key',t.section_key,'oldValue',jsonb_build_object('title',f.title,'description',f.description,'phaseType',f.phase_type,'active',f.active),'newValue',jsonb_build_object('title',t.title,'description',t.description,'phaseType',t.phase_type,'active',t.active)) order by t.sort_order),'[]'::jsonb) from public.routine_template_sections t join public.routine_template_sections f on f.version_id=v_from.id and f.section_key=t.section_key where t.version_id=v_to.id and (f.title,f.description,f.phase_type,f.active) is distinct from (t.title,t.description,t.phase_type,t.active)),
      'deactivated',(select coalesce(jsonb_agg(t.section_key order by t.sort_order),'[]'::jsonb) from public.routine_template_sections t join public.routine_template_sections f on f.version_id=v_from.id and f.section_key=t.section_key where t.version_id=v_to.id and f.active and not t.active),
      'reordered',(select coalesce(jsonb_agg(jsonb_build_object('key',t.section_key,'from',f.sort_order,'to',t.sort_order) order by t.sort_order),'[]'::jsonb) from public.routine_template_sections t join public.routine_template_sections f on f.version_id=v_from.id and f.section_key=t.section_key where t.version_id=v_to.id and f.sort_order<>t.sort_order)),
    'tasks',jsonb_build_object(
      'added',(select coalesce(jsonb_agg(t.task_key order by t.sort_order),'[]'::jsonb) from public.routine_template_tasks t where t.version_id=v_to.id and not exists(select 1 from public.routine_template_tasks f where f.version_id=v_from.id and f.task_key=t.task_key)),
      'changed',(select coalesce(jsonb_agg(jsonb_build_object('key',t.task_key,'oldValue',jsonb_build_object('title',f.title,'instructions',f.instructions,'doneCriteria',f.done_criteria,'active',f.active),'newValue',jsonb_build_object('title',t.title,'instructions',t.instructions,'doneCriteria',t.done_criteria,'active',t.active)) order by t.sort_order),'[]'::jsonb) from public.routine_template_tasks t join public.routine_template_tasks f on f.version_id=v_from.id and f.task_key=t.task_key where t.version_id=v_to.id and (f.title,f.instructions,f.done_criteria,f.active) is distinct from (t.title,t.instructions,t.done_criteria,t.active)),
      'deactivated',(select coalesce(jsonb_agg(t.task_key order by t.sort_order),'[]'::jsonb) from public.routine_template_tasks t join public.routine_template_tasks f on f.version_id=v_from.id and f.task_key=t.task_key where t.version_id=v_to.id and f.active and not t.active),
      'reordered',(select coalesce(jsonb_agg(jsonb_build_object('key',t.task_key,'from',f.sort_order,'to',t.sort_order) order by t.sort_order),'[]'::jsonb) from public.routine_template_tasks t join public.routine_template_tasks f on f.version_id=v_from.id and f.task_key=t.task_key where t.version_id=v_to.id and f.sort_order<>t.sort_order)),
    'taskItems',jsonb_build_object('addedCount',(select count(*) from public.routine_template_task_items item where item.version_id=v_to.id and not exists(select 1 from public.routine_template_task_items prior join public.routine_template_tasks pt on pt.id=prior.task_id join public.routine_template_tasks nt on nt.id=item.task_id where prior.version_id=v_from.id and pt.task_key=nt.task_key and prior.item_key=item.item_key)),
      'changedCount',(select count(*) from public.routine_template_task_items item join public.routine_template_tasks nt on nt.id=item.task_id join public.routine_template_tasks pt on pt.version_id=v_from.id and pt.task_key=nt.task_key join public.routine_template_task_items prior on prior.task_id=pt.id and prior.item_key=item.item_key where item.version_id=v_to.id and (prior.label,prior.item_type,prior.required,prior.source_kind,prior.source_config,prior.input_schema,prior.sort_order,prior.active) is distinct from (item.label,item.item_type,item.required,item.source_kind,item.source_config,item.input_schema,item.sort_order,item.active))),
    'dependencies',jsonb_build_object('fromCount',(select count(*) from public.routine_template_task_dependencies where version_id=v_from.id),'toCount',(select count(*) from public.routine_template_task_dependencies where version_id=v_to.id)),
    'relations',jsonb_build_object('fromCount',(select count(*) from public.routine_template_task_relations where version_id=v_from.id),'toCount',(select count(*) from public.routine_template_task_relations where version_id=v_to.id),'deliveryComparisonCount',(select count(*) from public.routine_template_task_relations where version_id=v_to.id and relation_type='delivery_comparison')),
    'referenceLinks',jsonb_build_object('fromCount',(select count(*) from public.routine_template_task_reference_images where version_id=v_from.id),'toCount',(select count(*) from public.routine_template_task_reference_images where version_id=v_to.id)),
    'timingPolicyChanges',(select coalesce(jsonb_agg(t.task_key order by t.task_key),'[]'::jsonb) from public.routine_template_tasks t join public.routine_template_tasks f on f.version_id=v_from.id and f.task_key=t.task_key where t.version_id=v_to.id and (f.task_type,f.criticality,f.mandatory,f.initial_assessment_policy,f.completion_policy,f.not_applicable_policy,f.verification_policy,f.repeat_policy,f.availability_mode,f.visible_day_offset,f.visible_from_local_time,f.start_day_offset,f.start_from_local_time,f.target_day_offset,f.target_local_time,f.overdue_day_offset,f.overdue_local_time,f.hard_deadline_day_offset,f.hard_deadline_local_time,f.condition_json) is distinct from (t.task_type,t.criticality,t.mandatory,t.initial_assessment_policy,t.completion_policy,t.not_applicable_policy,t.verification_policy,t.repeat_policy,t.availability_mode,t.visible_day_offset,t.visible_from_local_time,t.start_day_offset,t.start_from_local_time,t.target_day_offset,t.target_local_time,t.overdue_day_offset,t.overdue_local_time,t.hard_deadline_day_offset,t.hard_deadline_local_time,t.condition_json)),
    'validationImpact',jsonb_build_object('from',public.validate_routine_template_version(v_from.id,array[v_from.id]),'to',public.validate_routine_template_version(v_to.id,array[v_to.id])),
    'contentHashes',jsonb_build_object('from',coalesce(v_from.content_hash,public.routine_template_version_content_hash(v_from.id)),'to',coalesce(v_to.content_hash,public.routine_template_version_content_hash(v_to.id)))
  );
end $$;

create or replace function public.preview_routine_template_publication_batch(input_version_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10k2_require_personal_manager();
  v_id uuid; v_version public.routine_template_versions%rowtype; v_template public.routine_templates%rowtype;
  v_validation jsonb; v_versions jsonb:='[]'::jsonb; v_blockers jsonb:='[]'::jsonb; v_warnings jsonb:='[]'::jsonb;
begin
  if input_version_ids is null or cardinality(input_version_ids)=0 or cardinality(input_version_ids)>100
    or (select count(distinct id) from unnest(input_version_ids) id)<>cardinality(input_version_ids) then
    raise exception using errcode='22023',message='Publication preview requires one to 100 unique version IDs.';
  end if;
  for v_id in select version.id from public.routine_template_versions version join public.routine_templates template on template.id=version.template_id
    where version.id=any(input_version_ids) and version.organization_id=v_actor.organization_id order by template.routine_key
  loop
    select * into v_version from public.routine_template_versions where id=v_id;
    select * into v_template from public.routine_templates where id=v_version.template_id;
    v_validation:=public.validate_routine_template_version(v_id,input_version_ids);
    v_blockers:=v_blockers||coalesce((select jsonb_agg(jsonb_build_object('versionId',v_id,'routineKey',v_template.routine_key,'issue',issue)) from jsonb_array_elements(v_validation->'blockers') issue),'[]'::jsonb);
    v_warnings:=v_warnings||coalesce((select jsonb_agg(jsonb_build_object('versionId',v_id,'routineKey',v_template.routine_key,'issue',issue)) from jsonb_array_elements(v_validation->'warnings') issue),'[]'::jsonb);
    v_versions:=v_versions||jsonb_build_array(jsonb_build_object('versionId',v_id,'templateId',v_template.id,'routineKey',v_template.routine_key,
      'versionNumber',v_version.version_number,'revision',v_version.revision,'state',v_version.state,
      'computedHash',public.routine_template_version_content_hash(v_id),'validation',v_validation,
      'replaces',v_template.current_published_version_id,
      'diffSummary',case when v_template.current_published_version_id is null then null else public.get_routine_template_version_diff(v_template.current_published_version_id,v_id) end));
  end loop;
  if jsonb_array_length(v_versions)<>cardinality(input_version_ids) then raise exception using errcode='42501',message='Every preview version must belong to this organization.'; end if;
  return jsonb_build_object('valid',jsonb_array_length(v_blockers)=0,'blockers',v_blockers,'warnings',v_warnings,'versions',v_versions,
    'crossTemplateRelations',(select coalesce(jsonb_agg(jsonb_build_object('versionId',relation.version_id,'sourceTaskId',relation.source_task_id,'targetRoutineKey',relation.target_routine_key,'targetTaskKey',relation.target_task_key,'relationType',relation.relation_type) order by relation.target_routine_key,relation.target_task_key),'[]'::jsonb) from public.routine_template_task_relations relation where relation.version_id=any(input_version_ids)),
    'publicationOrder',(select jsonb_agg(version.id order by template.routine_key) from public.routine_template_versions version join public.routine_templates template on template.id=version.template_id where version.id=any(input_version_ids) and version.organization_id=v_actor.organization_id));
end $$;

create or replace function public.get_routine_reference_manager_workspace()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10k2_require_personal_manager();
begin
  return jsonb_build_object(
    'references',(select coalesce(jsonb_agg(jsonb_build_object('id',reference.id,'stableKey',reference.reference_key,'label',reference.label,
      'description',reference.description,'placeholderText',reference.placeholder_text,'active',reference.active,'revision',reference.revision,
      'current',case when current.id is null then null else jsonb_build_object('id',current.id,'versionNumber',current.version_number,'state',current.state,
        'mimeType',current.mime_type,'byteSize',current.byte_size,'caption',current.caption,'altText',current.alt_text,'objectPath',current.object_path,'finalizedAt',current.finalized_at) end,
      'usageCount',(select count(*) from public.routine_template_task_reference_images usage where usage.reference_id=reference.id and usage.active),
      'publishedUsageCount',(select count(*) from public.routine_template_task_reference_images usage join public.routine_template_versions version on version.id=usage.version_id and version.state='published' where usage.reference_id=reference.id and usage.active),
      'versions',(select coalesce(jsonb_agg(jsonb_build_object('id',version.id,'versionNumber',version.version_number,'state',version.state,
        'mimeType',version.mime_type,'byteSize',version.byte_size,'caption',version.caption,'altText',version.alt_text,
        'objectPath',version.object_path,'createdAt',version.created_at,'finalizedAt',version.finalized_at,'orphanedAt',version.orphaned_at) order by version.version_number desc),'[]'::jsonb) from public.routine_reference_image_versions version where version.reference_id=reference.id)
      ) order by reference.reference_key),'[]'::jsonb) from public.routine_reference_images reference left join public.routine_reference_image_versions current on current.id=reference.current_version_id where reference.organization_id=v_actor.organization_id),
    'usage',(select coalesce(jsonb_agg(jsonb_build_object('referenceId',link.reference_id,'versionId',link.version_id,'taskId',link.task_id,
      'taskItemId',link.task_item_id,'buttonLabel',link.button_label,'contextNote',link.context_note,'sortOrder',link.sort_order,'active',link.active,
      'templateState',version.state,'routineKey',template.routine_key,'taskKey',task.task_key,'itemKey',item.item_key) order by template.routine_key,task.task_key,link.sort_order),'[]'::jsonb)
      from public.routine_template_task_reference_images link join public.routine_template_versions version on version.id=link.version_id
      join public.routine_templates template on template.id=version.template_id join public.routine_template_tasks task on task.id=link.task_id
      left join public.routine_template_task_items item on item.id=link.task_item_id where link.organization_id=v_actor.organization_id),
    'pendingSummary',(select jsonb_build_object('pendingUploads',count(*) filter(where state='pending_upload'),'orphanedUploads',count(*) filter(where state='orphaned')) from public.routine_reference_image_versions where organization_id=v_actor.organization_id),
    'cleanupSummary',(select jsonb_build_object('pending',count(*) filter(where completed_at is null),'completed',count(*) filter(where completed_at is not null)) from public.routine_reference_image_cleanup_queue where organization_id=v_actor.organization_id),
    'revision',(select coalesce(max(revision),0) from public.routine_reference_images where organization_id=v_actor.organization_id));
end $$;

create or replace function public.get_routine_release_readiness()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10k2_require_personal_manager();
  v_settings public.routine_organization_settings%rowtype; v_template_blockers integer; v_categories jsonb;
  v_active_opening integer; v_active_closing integer; v_active_double integer;
  v_inactive_opening integer; v_inactive_closing integer; v_inactive_double integer;
begin
  select * into v_settings from public.routine_organization_settings where organization_id=v_actor.organization_id;
  select count(*) into v_template_blockers from public.routine_template_versions version where version.organization_id=v_actor.organization_id and version.state='draft' and jsonb_array_length(public.validate_routine_template_version(version.id,array[version.id])->'blockers')>0;
  select count(*) filter(where template.active and lower(template.routine_key) like '%opening%'),
      count(*) filter(where template.active and lower(template.routine_key) like '%closing%'),
      count(*) filter(where template.active and lower(template.routine_key) like '%double%'),
      count(*) filter(where not template.active and lower(template.routine_key) like '%opening%'),
      count(*) filter(where not template.active and lower(template.routine_key) like '%closing%'),
      count(*) filter(where not template.active and lower(template.routine_key) like '%double%')
    into v_active_opening,v_active_closing,v_active_double,v_inactive_opening,v_inactive_closing,v_inactive_double
  from public.routine_templates template
  join public.routine_template_versions version on version.id=template.current_published_version_id
  where template.organization_id=v_actor.organization_id;
  v_categories:=jsonb_build_object(
    'foundation',jsonb_build_object('ready',v_settings.organization_id is not null,'blockers',case when v_settings.organization_id is null then jsonb_build_array('Routine Engine settings are missing.') else '[]'::jsonb end,'warnings','[]'::jsonb,'evidenceCounts',jsonb_build_object('settings',case when v_settings.organization_id is null then 0 else 1 end)),
    'locations',jsonb_build_object('ready',exists(select 1 from public.routine_locations where organization_id=v_actor.organization_id and active),'blockers',case when exists(select 1 from public.routine_locations where organization_id=v_actor.organization_id and active) then '[]'::jsonb else jsonb_build_array('No active routine locations are configured.') end,'warnings',case when not exists(select 1 from public.routine_locations where organization_id=v_actor.organization_id and active and location_type='door') then jsonb_build_array('Door and lock configuration is missing.') else '[]'::jsonb end,'evidenceCounts',jsonb_build_object('activeLocations',(select count(*) from public.routine_locations where organization_id=v_actor.organization_id and active),'locationSets',(select count(*) from public.routine_location_sets where organization_id=v_actor.organization_id and active))),
    'standards',jsonb_build_object('ready',not exists(select 1 from public.routine_standards where organization_id=v_actor.organization_id and active and source_kind='manual' and current_revision_id is null),'blockers',(select coalesce(jsonb_agg('Missing current revision: '||standard.standard_key),'[]'::jsonb) from public.routine_standards standard where standard.organization_id=v_actor.organization_id and standard.active and standard.source_kind='manual' and standard.current_revision_id is null),'warnings',case when not exists(select 1 from public.routine_standards where organization_id=v_actor.organization_id and standard_key~*'(coffee|canister|cup|glass)') then jsonb_build_array('Coffee Canister, cup and glass targets are not configured.') else '[]'::jsonb end,'evidenceCounts',jsonb_build_object('activeStandards',(select count(*) from public.routine_standards where organization_id=v_actor.organization_id and active),'currentRevisions',(select count(*) from public.routine_standards where organization_id=v_actor.organization_id and current_revision_id is not null))),
    'templates',jsonb_build_object('ready',v_template_blockers=0 and v_active_opening>0 and v_active_closing>0,'blockers',(case when v_template_blockers>0 then jsonb_build_array(v_template_blockers||' draft template(s) have validation blockers.') else '[]'::jsonb end)||(case when v_active_opening=0 and v_inactive_opening>0 then jsonb_build_array('Published Opening template is inactive.') when v_active_opening=0 then jsonb_build_array('No published Opening template.') else '[]'::jsonb end)||(case when v_active_closing=0 and v_inactive_closing>0 then jsonb_build_array('Published Closing template is inactive.') when v_active_closing=0 then jsonb_build_array('No published Closing template.') else '[]'::jsonb end),'warnings','[]'::jsonb,'evidenceCounts',jsonb_build_object('publishedOpening',v_active_opening,'publishedClosing',v_active_closing,'inactivePublishedOpening',v_inactive_opening,'inactivePublishedClosing',v_inactive_closing,'draftsWithBlockers',v_template_blockers)),
    'references',jsonb_build_object('ready',true,'blockers','[]'::jsonb,'warnings',(select coalesce(jsonb_agg('Placeholder image: '||reference.reference_key),'[]'::jsonb) from public.routine_reference_images reference join public.routine_reference_image_versions version on version.id=reference.current_version_id where reference.organization_id=v_actor.organization_id and reference.active and version.state='placeholder'),'evidenceCounts',jsonb_build_object('logicalReferences',(select count(*) from public.routine_reference_images where organization_id=v_actor.organization_id),'activeImages',(select count(*) from public.routine_reference_image_versions where organization_id=v_actor.organization_id and state='active_image'))),
    'operators',jsonb_build_object('ready',not v_settings.shared_device_enabled or (exists(select 1 from public.routine_shared_devices where organization_id=v_actor.organization_id and active) and exists(select 1 from public.routine_operators where organization_id=v_actor.organization_id and active)),'blockers',case when v_settings.shared_device_enabled and not exists(select 1 from public.routine_shared_devices where organization_id=v_actor.organization_id and active) then jsonb_build_array('Shared-device support is enabled but no active device exists.') else '[]'::jsonb end,'warnings','[]'::jsonb,'evidenceCounts',jsonb_build_object('activeDevices',(select count(*) from public.routine_shared_devices where organization_id=v_actor.organization_id and active),'activeOperators',(select count(*) from public.routine_operators where organization_id=v_actor.organization_id and active))),
    'pilotAccess',jsonb_build_object('ready',exists(select 1 from public.routine_pilot_memberships where organization_id=v_actor.organization_id and active),'blockers',case when exists(select 1 from public.routine_pilot_memberships where organization_id=v_actor.organization_id and active) then '[]'::jsonb else jsonb_build_array('No active pilot memberships are configured.') end,'warnings',jsonb_build_array('Membership does not enable operative runs while mode is shadow.'),'evidenceCounts',jsonb_build_object('activeMemberships',(select count(*) from public.routine_pilot_memberships where organization_id=v_actor.organization_id and active))),
    'operationalContent',jsonb_build_object('ready',v_active_opening+v_inactive_opening>0 and v_active_closing+v_inactive_closing>0 and v_active_double+v_inactive_double>0,'blockers',(case when v_active_opening+v_inactive_opening=0 then jsonb_build_array('O01–O37 content is not seeded.') else '[]'::jsonb end)||(case when v_active_closing+v_inactive_closing=0 then jsonb_build_array('C01–C46 content is not seeded.') else '[]'::jsonb end)||(case when v_active_double+v_inactive_double=0 then jsonb_build_array('DS01–DS04 content is not seeded.') else '[]'::jsonb end),'warnings','[]'::jsonb,'evidenceCounts',jsonb_build_object('opening',v_active_opening+v_inactive_opening,'closing',v_active_closing+v_inactive_closing,'doubleShift',v_active_double+v_inactive_double)),
    'security',jsonb_build_object('ready',true,'blockers','[]'::jsonb,'warnings','[]'::jsonb,'evidenceCounts',jsonb_build_object('activeSessions',(select count(*) from public.routine_operator_sessions where organization_id=v_actor.organization_id and status='active'))),
    'testing',jsonb_build_object('ready',false,'blockers',jsonb_build_array('Release verification evidence must be reviewed before a later release-stage change.'),'warnings','[]'::jsonb,'evidenceCounts',jsonb_build_object('verifiedByMigration',0)));
  return jsonb_build_object('releaseStage',v_settings.ui_release_stage,'mode',v_settings.mode,'ready',false,'categories',v_categories);
end $$;

create or replace function public.get_routine_manager_control_center()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor public.user_profiles%rowtype:=public.routine_phase10k2_require_personal_manager();
begin
  return jsonb_build_object(
    'applicationBootstrap',public.get_routine_application_bootstrap(),
    'foundation',public.get_routine_foundation_editor_workspace(),
    'pilotAccess',jsonb_build_object(
      'memberships',(select coalesce(jsonb_agg(jsonb_build_object('id',membership.id,'identityType',membership.identity_type,
        'userProfileId',membership.user_profile_id,'operatorId',membership.operator_id,'accessLevel',membership.access_level,
        'active',membership.active,'validFrom',membership.valid_from,'validUntil',membership.valid_until,'note',membership.note,
        'revision',membership.revision) order by membership.identity_type,coalesce(membership.user_profile_id,membership.operator_id)),'[]'::jsonb)
        from public.routine_pilot_memberships membership where membership.organization_id=v_actor.organization_id),
      'profiles',(select coalesce(jsonb_agg(jsonb_build_object('id',profile.id,'displayName',profile.display_name,
        'role',profile.role,'active',profile.active) order by profile.display_name),'[]'::jsonb)
        from public.user_profiles profile where profile.organization_id=v_actor.organization_id and profile.active
          and not coalesce(profile.is_shared_device,false) and profile.role in('shift_lead','staff')),
      'operators',(select coalesce(jsonb_agg(jsonb_build_object('id',operator.id,'displayName',operator.display_name,
        'effectiveRole',operator.effective_role,'operatorType',operator.operator_type,'active',operator.active,
        'validUntil',operator.valid_until) order by operator.display_name),'[]'::jsonb)
        from public.routine_operators operator where operator.organization_id=v_actor.organization_id and operator.active)),
    'templates',(select coalesce(jsonb_agg(jsonb_build_object('id',template.id,'routineKey',template.routine_key,'name',template.name,
      'description',template.description,'active',template.active,'revision',template.revision,'updatedAt',template.updated_at,
      'updatedBy',updater.display_name,'currentPublishedVersionId',template.current_published_version_id,
      'hasCurrentPublishedVersion',published.id is not null,'hasActiveDraft',draft.id is not null,
      'deactivationConsequence','Deactivation prevents new runs from using this template. Published versions and historical runs are not changed.',
      'currentPublishedVersion',case when published.id is null then null else jsonb_build_object('id',published.id,'versionNumber',published.version_number,'contentHash',published.content_hash,'publishedAt',published.published_at) end,
      'activeDraft',case when draft.id is null then null else jsonb_build_object('id',draft.id,'versionNumber',draft.version_number,'revision',draft.revision,'updatedAt',draft.updated_at) end,
      'validation',case when draft.id is null then null else public.validate_routine_template_version(draft.id,array[draft.id]) end,
      'linkedRelationships',(select coalesce(jsonb_agg(jsonb_build_object('sourceTaskId',relation.source_task_id,
        'targetRoutineKey',relation.target_routine_key,'targetTaskKey',relation.target_task_key,
        'relationType',relation.relation_type) order by relation.target_routine_key,relation.target_task_key),'[]'::jsonb)
        from public.routine_template_task_relations relation
        where relation.version_id=coalesce(draft.id,published.id)
          and (relation.target_routine_key ilike '%opening%' or relation.target_routine_key ilike '%closing%')),
      'counts',jsonb_build_object('sections',(select count(*) from public.routine_template_sections where version_id=coalesce(draft.id,published.id)),'tasks',(select count(*) from public.routine_template_tasks where version_id=coalesce(draft.id,published.id)),'items',(select count(*) from public.routine_template_task_items where version_id=coalesce(draft.id,published.id)),'references',(select count(*) from public.routine_template_task_reference_images where version_id=coalesce(draft.id,published.id)))
      ) order by template.routine_key),'[]'::jsonb) from public.routine_templates template
      left join public.user_profiles updater on updater.id=template.updated_by_auth_user_id
      left join public.routine_template_versions published on published.id=template.current_published_version_id
      left join public.routine_template_versions draft on draft.template_id=template.id and draft.state='draft'
      where template.organization_id=v_actor.organization_id),
    'references',public.get_routine_reference_manager_workspace(),
    'operatorAdministration',public.get_routine_operator_admin_workspace(),
    'activeSessionSummary',(select jsonb_build_object('active',count(*) filter(where status='active'),'recent',count(*) filter(where created_at>clock_timestamp()-interval '30 days')) from public.routine_operator_sessions where organization_id=v_actor.organization_id),
    'releaseReadiness',public.get_routine_release_readiness(),
    'profileChoices',(select coalesce(jsonb_agg(jsonb_build_object('id',profile.id,'displayName',profile.display_name,
      'role',profile.role,'active',profile.active,'isSharedDevice',coalesce(profile.is_shared_device,false)) order by profile.display_name),'[]'::jsonb)
      from public.user_profiles profile where profile.organization_id=v_actor.organization_id and profile.active),
    'contractVersion','phase10k2-v1');
end $$;

revoke all on function public.routine_phase10k2_require_personal_manager() from public,anon,authenticated;
revoke all on function public.routine_phase10k2_location_guard() from public,anon,authenticated;
revoke all on function public.get_routine_manager_control_center() from public,anon,authenticated;
revoke all on function public.get_routine_foundation_editor_workspace() from public,anon,authenticated;
revoke all on function public.get_routine_template_editor_workspace(uuid,uuid) from public,anon,authenticated;
revoke all on function public.get_routine_template_version_diff(uuid,uuid) from public,anon,authenticated;
revoke all on function public.preview_routine_template_publication_batch(uuid[]) from public,anon,authenticated;
revoke all on function public.get_routine_reference_manager_workspace() from public,anon,authenticated;
revoke all on function public.get_routine_release_readiness() from public,anon,authenticated;
revoke all on function public.set_routine_template_active(uuid,boolean,bigint,text,uuid) from public,anon,authenticated;

grant execute on function public.get_routine_manager_control_center() to authenticated;
grant execute on function public.get_routine_foundation_editor_workspace() to authenticated;
grant execute on function public.get_routine_template_editor_workspace(uuid,uuid) to authenticated;
grant execute on function public.get_routine_template_version_diff(uuid,uuid) to authenticated;
grant execute on function public.preview_routine_template_publication_batch(uuid[]) to authenticated;
grant execute on function public.get_routine_reference_manager_workspace() to authenticated;
grant execute on function public.get_routine_release_readiness() to authenticated;
grant execute on function public.set_routine_template_active(uuid,boolean,bigint,text,uuid) to authenticated;
