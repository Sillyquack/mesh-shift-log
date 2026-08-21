-- Phase 10AB: exact Mesh 1.5R activation-recovery surface.
--
-- This terminal migration is schema-only. It exposes one read-only preview and
-- one exact-purpose manager operation. No content, publication, membership,
-- release-stage, mode, Routine work, Stock Count, or image state is changed by
-- applying this migration.

begin;

alter table public.routine_ui_operations
  drop constraint if exists routine_ui_operations_type_check;
alter table public.routine_ui_operations
  add constraint routine_ui_operations_type_check check(operation_type in(
    'set_engine_mode','replace_pilot_memberships','set_routine_template_active',
    'promote_release_stage','set_pilot_pause','record_e2e_attestation',
    'activate_mesh_content_1_5r_recovery'));
alter table public.routine_ui_operations
  drop constraint if exists routine_ui_operations_resource_check;
alter table public.routine_ui_operations
  add constraint routine_ui_operations_resource_check check(resource_type in(
    'organization_settings','pilot_memberships','routine_template',
    'release_attestation','e2e_verification','content_pack_recovery'));

create or replace function public.preview_mesh_routine_content_1_5r_activation_recovery()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor public.user_profiles%rowtype := public.routine_phase10k2_require_personal_manager();
  v_pack jsonb := public.routine_mesh_content_pack_v1();
  v_settings public.routine_organization_settings%rowtype;
  v_installation_1_1 public.routine_content_pack_installations%rowtype;
  v_installation_1_5 public.routine_content_pack_installations%rowtype;
  v_opening public.routine_template_versions%rowtype;
  v_closing public.routine_template_versions%rowtype;
  v_current jsonb;
  v_baseline jsonb;
  v_target jsonb;
  v_entry jsonb;
  v_key text;
  v_status text;
  v_differences jsonb := '[]'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := jsonb_build_array(
    'Preparation preserves the reviewed 1.1R drafts as immutable discarded history.',
    'Installation does not publish content, create work, add memberships, attest E2E, or change mode/stage.'
  );
  v_draft_evidence jsonb;
  v_state jsonb;
  v_state_hash text;
  v_latest_operation jsonb;
  v_published_templates jsonb;
  v_pilot_memberships jsonb;
  v_publication_count bigint;
  v_membership_count bigint;
  v_e2e_count bigint;
  v_active_run_count bigint;
  v_active_bundle_count bigint;
  v_active_stock_count bigint;
  v_1_5_count bigint;
  v_complete boolean := false;
  v_expected_creates jsonb := jsonb_build_array(
    jsonb_build_object('resourceType','location','key','main-storage-fridge'),
    jsonb_build_object('resourceType','location','key','main-storage-left-reserve'),
    jsonb_build_object('resourceType','location','key','main-storage-express-shelf'),
    jsonb_build_object('resourceType','location','key','main-storage-keg-storage'),
    jsonb_build_object('resourceType','standard','key','main-storage-express-shelf-refill'),
    jsonb_build_object('resourceType','reference','key','main-storage-fridge'),
    jsonb_build_object('resourceType','reference','key','main-storage-express-shelf')
  );
begin
  if v_pack->>'packKey' is distinct from 'mesh-routine-content'
     or v_pack->>'packVersion' is distinct from '1.5R'
     or v_pack->>'packHash' is distinct from '710c9412eabc8f2e9c5a6488499ac4654cd7c94b62138eaed9563ab5f0203c9c' then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code','provider_mismatch','message','The exact mesh-routine-content@1.5R provider is not installed.'
    ));
  end if;

  select settings.* into v_settings
  from public.routine_organization_settings settings
  where settings.organization_id = v_actor.organization_id;

  select installation.* into v_installation_1_1
  from public.routine_content_pack_installations installation
  where installation.organization_id = v_actor.organization_id
    and installation.id = 'c5e43e3a-f9af-4565-98ab-7465d76593c3'
    and installation.pack_key = 'mesh-routine-content'
    and installation.pack_version = '1.1R'
    and installation.pack_hash = 'c149a8416a867dcb7d87224f3ae8e2a214e5ca4954613b118521ebe5ae3aff2a';

  select installation.* into v_installation_1_5
  from public.routine_content_pack_installations installation
  where installation.organization_id = v_actor.organization_id
    and installation.pack_key = 'mesh-routine-content'
    and installation.pack_version = '1.5R';

  select version.* into v_opening
  from public.routine_template_versions version
  where version.organization_id = v_actor.organization_id
    and version.id = '73896e75-1509-4215-ac4a-a36b033e6d18';
  select version.* into v_closing
  from public.routine_template_versions version
  where version.organization_id = v_actor.organization_id
    and version.id = '072fee93-eda7-406c-87b3-d5186cd26944';

  select count(*) into v_publication_count
  from public.routine_template_versions version
  where version.organization_id = v_actor.organization_id and version.state = 'published';
  select count(*) into v_membership_count
  from public.routine_pilot_memberships membership
  where membership.organization_id = v_actor.organization_id and membership.active;
  select count(*) into v_e2e_count
  from public.routine_e2e_verification_attestations attestation
  where attestation.organization_id = v_actor.organization_id;
  select count(*) into v_active_run_count
  from public.routine_runs run
  where run.organization_id = v_actor.organization_id
    and run.status in ('in_progress','reopened','awaiting_final_verification','waiting_for_transfers');
  select count(*) into v_active_bundle_count
  from public.routine_bundles bundle
  where bundle.organization_id = v_actor.organization_id
    and bundle.status not in ('completed','cancelled');
  select count(*) into v_active_stock_count
  from public.inventory_count_sessions session
  where session.organization_id = v_actor.organization_id
    and session.status in ('draft','in_progress');
  select count(*) into v_1_5_count
  from public.routine_content_pack_installations installation
  where installation.organization_id = v_actor.organization_id
    and installation.pack_key = 'mesh-routine-content'
    and installation.pack_version = '1.5R';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',version.id,'templateId',version.template_id,'versionNumber',version.version_number,
    'contentHash',version.content_hash,'publicationGroupId',version.publication_group_id,
    'publishNote',version.publish_note,'publishedAt',version.published_at
  ) order by version.template_id,version.id),'[]'::jsonb) into v_published_templates
  from public.routine_template_versions version
  where version.organization_id=v_actor.organization_id and version.state='published';
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',membership.id,'identityType',membership.identity_type,'userProfileId',membership.user_profile_id,
    'accessLevel',membership.access_level,'active',membership.active,'validFrom',membership.valid_from,
    'validUntil',membership.valid_until,'note',membership.note,'profileRole',profile.role,
    'profileIsSharedDevice',profile.is_shared_device
  ) order by membership.id),'[]'::jsonb) into v_pilot_memberships
  from public.routine_pilot_memberships membership
  left join public.user_profiles profile on profile.id=membership.user_profile_id
    and profile.organization_id=membership.organization_id
  where membership.organization_id=v_actor.organization_id and membership.active;

  v_complete := v_1_5_count = 1
    and v_installation_1_5.pack_hash = '710c9412eabc8f2e9c5a6488499ac4654cd7c94b62138eaed9563ab5f0203c9c'
    and v_installation_1_5.opening_template_id = '20377d92-bf85-4fb6-a4c9-5db847fd5f57'
    and v_installation_1_5.closing_template_id = 'ede9b1ca-44b6-489e-97ea-3abab57ab6a1'
    and v_installation_1_5.opening_draft_version_id is distinct from '73896e75-1509-4215-ac4a-a36b033e6d18'
    and v_installation_1_5.closing_draft_version_id is distinct from '072fee93-eda7-406c-87b3-d5186cd26944'
    and v_opening.state = 'discarded'
    and v_closing.state = 'discarded'
    and v_opening.discarded_at is not null
    and v_closing.discarded_at is not null
    and v_opening.discarded_by_auth_user_id is not null
    and v_closing.discarded_by_auth_user_id is not null
    and v_opening.discard_reason = 'Preserved immutable pre-1.5R reviewed draft before installing exact mesh-routine-content@1.5R.'
    and v_closing.discard_reason = 'Preserved immutable pre-1.5R reviewed draft before installing exact mesh-routine-content@1.5R.'
    and public.routine_template_version_content_hash(v_opening.id) = 'a3d2038b7bc0d3b3e75baee5ce63a1c0ffeea8c4b13331c88ea474e10a4f2e4a'
    and public.routine_template_version_content_hash(v_closing.id) = '04124b4ab3ddc94e384012e85201cf271efd335187e75f3dd1475fb81aa50d98'
    and exists(select 1 from public.routine_template_versions installed_opening
      where installed_opening.organization_id=v_actor.organization_id
        and installed_opening.id=v_installation_1_5.opening_draft_version_id
        and installed_opening.template_id=v_installation_1_5.opening_template_id
        and installed_opening.state in('draft','published')
        and public.routine_template_version_content_hash(installed_opening.id)
          = v_installation_1_5.installed_resource_summary->>'openingDraftContentHash')
    and exists(select 1 from public.routine_template_versions installed_closing
      where installed_closing.organization_id=v_actor.organization_id
        and installed_closing.id=v_installation_1_5.closing_draft_version_id
        and installed_closing.template_id=v_installation_1_5.closing_template_id
        and installed_closing.state in('draft','published')
        and public.routine_template_version_content_hash(installed_closing.id)
          = v_installation_1_5.installed_resource_summary->>'closingDraftContentHash')
    and v_installation_1_5.installed_resource_summary @> jsonb_build_object(
      'openingSections',3,'openingTasks',37,'closingSections',2,'closingTasks',46,
      'unresolvedRequirements',0,'published',false,'runsCreated',false);

  -- Exact location baseline/target classification.
  select jsonb_build_object(
    'id',location.id,'revision',location.revision,'name',location.name,
    'locationType',location.location_type,'parentLocationId',location.parent_location_id,
    'sortOrder',location.sort_order,'metadata',location.metadata,'active',location.active
  ) into v_current
  from public.routine_locations location
  where location.organization_id = v_actor.organization_id
    and location.location_key = 'workbar-non-alcoholic-fridge';
  v_baseline := jsonb_build_object(
    'id','5d279ff8-6e6c-4e2a-bde1-a27cd8763841','revision',1,
    'name','Workbar Non-Alcoholic Fridge','locationType','fridge','parentLocationId',null,
    'sortOrder',22,'metadata','{}'::jsonb,'active',true
  );
  v_target := jsonb_build_object(
    'id','5d279ff8-6e6c-4e2a-bde1-a27cd8763841','revision',2,
    'name','Workbar Non-Alco Fridge','locationType','fridge','parentLocationId',null,
    'sortOrder',26,'metadata','{}'::jsonb,'active',true
  );
  v_status := case when v_current = v_baseline then 'baseline' when v_current = v_target then 'target' else 'third_state' end;
  v_differences := v_differences || jsonb_build_array(jsonb_build_object(
    'resourceType','location','key','workbar-non-alcoholic-fridge','id','5d279ff8-6e6c-4e2a-bde1-a27cd8763841',
    'status',v_status,'current',v_current,'target',v_target,
    'beforeHash',encode(extensions.digest(convert_to(coalesce(v_current,'null'::jsonb)::text,'UTF8'),'sha256'),'hex'),
    'targetHash',encode(extensions.digest(convert_to(v_target::text,'UTF8'),'sha256'),'hex')
  ));
  if v_status = 'third_state' then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','resource_third_state','key','workbar-non-alcoholic-fridge'));
  end if;

  -- Exact location-set member identity, order, required flag, and metadata classification.
  select jsonb_build_object(
    'id',location_set.id,'revision',location_set.revision,'name',location_set.name,
    'description',location_set.description,'active',location_set.active,
    'members',coalesce((select jsonb_agg(jsonb_build_object(
      'locationKey',location.location_key,'sortOrder',member.sort_order,
      'required',member.required,'metadata',member.metadata
    ) order by member.sort_order)
    from public.routine_location_set_members member
    join public.routine_locations location on location.id = member.location_id
      and location.organization_id = member.organization_id
    where member.organization_id = v_actor.organization_id
      and member.location_set_id = location_set.id),'[]'::jsonb)
  ) into v_current
  from public.routine_location_sets location_set
  where location_set.organization_id = v_actor.organization_id
    and location_set.set_key = 'serviceware-recovery-route';
  select value into v_entry from jsonb_array_elements(v_pack->'locationSets') value where value->>'key'='serviceware-recovery-route';
  v_baseline := jsonb_build_object(
    'id','c49581b2-e52b-4873-96b9-3579a5b85d96','revision',2,'name',v_entry->>'name',
    'description',v_entry->'description','active',true,
    'members',(select jsonb_agg(jsonb_build_object(
      'locationKey',member.value#>>'{}','sortOrder',member.ordinality-1,
      'required',true,'metadata',jsonb_build_object('managerIncomplete',true)
    ) order by member.ordinality)
    from jsonb_array_elements(v_entry->'members') with ordinality member(value,ordinality))
  );
  v_target := jsonb_set(jsonb_set(v_baseline,'{revision}','3'::jsonb),'{members}',
    (select jsonb_agg(jsonb_build_object(
      'locationKey',member.value#>>'{}','sortOrder',member.ordinality-1,
      'required',true,'metadata',v_entry->'metadata'
    ) order by member.ordinality)
    from jsonb_array_elements(v_entry->'members') with ordinality member(value,ordinality)));
  v_status := case when v_current = v_baseline then 'baseline' when v_current = v_target then 'target' else 'third_state' end;
  v_differences := v_differences || jsonb_build_array(jsonb_build_object(
    'resourceType','locationSet','key','serviceware-recovery-route','id','c49581b2-e52b-4873-96b9-3579a5b85d96',
    'status',v_status,'current',v_current,'target',v_target,
    'beforeHash',encode(extensions.digest(convert_to(coalesce(v_current,'null'::jsonb)::text,'UTF8'),'sha256'),'hex'),
    'targetHash',encode(extensions.digest(convert_to(v_target::text,'UTF8'),'sha256'),'hex')
  ));
  if v_status = 'third_state' then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','resource_third_state','key','serviceware-recovery-route'));
  end if;

  -- The five standards are classified against immutable production baselines
  -- and exact provider targets. Metadata-only corrections retain revision 1.
  for v_key in select unnest(array[
    'workbar-milk-fridge-target','workbar-coffee-canister-assigned-target',
    'serviceware-office-recovery-route-confirmation','fridge-closing-rules',
    'cornerbar-operating-standard'
  ])
  loop
    select value into v_entry from jsonb_array_elements(v_pack->'standards') value where value->>'key'=v_key;
    select jsonb_build_object(
      'id',standard.id,'revision',standard.revision,'label',standard.label,
      'description',standard.description,'valueType',standard.value_type,
      'sourceKind',standard.source_kind,'active',standard.active,
      'revisionNumber',revision.revision_number,'value',revision.value_json,
      'reason',revision.reason,'revisionCount',(select count(*) from public.routine_standard_revisions all_revision
        where all_revision.organization_id=v_actor.organization_id and all_revision.standard_id=standard.id),
      'currentRevisionId',standard.current_revision_id,'currentRevisionHash',revision.content_hash
    ) into v_current
    from public.routine_standards standard
    left join public.routine_standard_revisions revision on revision.id=standard.current_revision_id
      and revision.organization_id=standard.organization_id
    where standard.organization_id=v_actor.organization_id and standard.standard_key=v_key;

    if v_key='workbar-milk-fridge-target' then
      v_baseline := jsonb_build_object('id','de6530b6-b5f3-44d5-b7e7-f1bfea37430d','revision',2,
        'label','Workbar Milk Fridge target','description',null,'valueType','object','sourceKind','manual','active',true,
        'revisionNumber',1,'value','{"regularMilk":2,"oatly":2}'::jsonb,
        'reason','Approved Mesh operational standards amendment 2026-08-07.','revisionCount',1,
        'currentRevisionId','2ffe2d30-f444-4449-bc64-0ce85728c92c','currentRevisionHash','c9ec8c4d490b279d812712dda7e26ed3');
      v_target := jsonb_build_object('id','de6530b6-b5f3-44d5-b7e7-f1bfea37430d','revision',4,
        'label',v_entry->>'label','description',v_entry->'description','valueType',v_entry->>'valueType','sourceKind',v_entry->>'sourceKind','active',true,
        'revisionNumber',2,'value',v_entry->'currentRevision'->'value','reason',v_entry->'currentRevision'->>'reason','revisionCount',2);
    elsif v_key='workbar-coffee-canister-assigned-target' then
      v_baseline := jsonb_build_object('id','badc7c4d-8162-4d48-a4be-31e9ef65d36f','revision',2,
        'label','Workbar-assigned Coffee Canister target','description',null,'valueType','object','sourceKind','manual','active',true,
        'revisionNumber',1,'value',v_entry->'currentRevision'->'value','reason',v_entry->'currentRevision'->>'reason','revisionCount',1,
        'currentRevisionId','17d4f2d1-7660-4c1c-9997-465a9e07ef30','currentRevisionHash','aae7cc7b83392283824d575e06c2e98e');
      v_target := jsonb_set(jsonb_set(v_baseline,'{revision}','3'::jsonb),'{label}',to_jsonb(v_entry->>'label'));
    elsif v_key='serviceware-office-recovery-route-confirmation' then
      v_baseline := jsonb_build_object('id','34f83f63-279c-4294-b381-1417ce446692','revision',2,
        'label',v_entry->>'label','description','Unresolved publication and readiness blocker.','valueType','object','sourceKind','location_set','active',true,
        'revisionNumber',1,'value',v_entry->'currentRevision'->'value','reason',v_entry->'currentRevision'->>'reason','revisionCount',1,
        'currentRevisionId','efda6906-6689-4d87-9b54-f6866d589745','currentRevisionHash','78cfae7e1361fc4a2b2cdc007b3b78d7');
      v_target := jsonb_set(jsonb_set(v_baseline,'{revision}','3'::jsonb),'{description}','null'::jsonb);
    elsif v_key='fridge-closing-rules' then
      v_baseline := jsonb_build_object('id','722ab761-19f0-4a36-ac2b-09c0f844c4f4','revision',2,
        'label',v_entry->>'label','description',v_entry->'description','valueType','object','sourceKind','manual','active',true,
        'revisionNumber',1,'value',null,'reason','Approved Mesh operational standards amendment 2026-08-07.','revisionCount',1,
        'currentRevisionId','d74b6594-866e-4986-8548-2c07c75b76dc','currentRevisionHash','8870646d91877d166b32870a1680729d');
      v_target := jsonb_build_object('id','722ab761-19f0-4a36-ac2b-09c0f844c4f4','revision',3,
        'label',v_entry->>'label','description',v_entry->'description','valueType',v_entry->>'valueType','sourceKind',v_entry->>'sourceKind','active',true,
        'revisionNumber',2,'value',v_entry->'currentRevision'->'value','reason',v_entry->'currentRevision'->>'reason','revisionCount',2);
    else
      v_baseline := jsonb_build_object('id','693d07e5-dcd2-4c70-bbc5-54d13b6e83ed','revision',2,
        'label',v_entry->>'label','description',v_entry->'description','valueType','object','sourceKind','manual','active',true,
        'revisionNumber',1,'value',null,'reason','Approved Mesh operational standards amendment 2026-08-07.','revisionCount',1,
        'currentRevisionId','54cd9dfe-828b-4f72-95c0-3173cd9e38e2','currentRevisionHash','a7c6498e222fe8acf02a361d7ac385ad');
      v_target := jsonb_build_object('id','693d07e5-dcd2-4c70-bbc5-54d13b6e83ed','revision',3,
        'label',v_entry->>'label','description',v_entry->'description','valueType',v_entry->>'valueType','sourceKind',v_entry->>'sourceKind','active',true,
        'revisionNumber',2,'value',v_entry->'currentRevision'->'value','reason',v_entry->'currentRevision'->>'reason','revisionCount',2);
    end if;

    -- Baseline hashes pin the large immutable fridge/corner values. Target
    -- comparison intentionally permits the newly generated revision UUID/hash
    -- only after every semantic field and exact revision count matches.
    if v_key in ('fridge-closing-rules','cornerbar-operating-standard') then
      if (v_current-'value') = (v_baseline-'value') then v_status:='baseline';
      elsif (v_current-array['currentRevisionId','currentRevisionHash']) = v_target then v_status:='target';
      else v_status:='third_state'; end if;
    elsif v_key='workbar-milk-fridge-target' then
      if v_current=v_baseline then v_status:='baseline';
      elsif (v_current-array['currentRevisionId','currentRevisionHash'])=v_target then v_status:='target';
      else v_status:='third_state'; end if;
    else
      v_status := case when v_current=v_baseline then 'baseline' when v_current=v_target then 'target' else 'third_state' end;
    end if;
    v_differences := v_differences || jsonb_build_array(jsonb_build_object(
      'resourceType','standard','key',v_key,'id',v_current->>'id','status',v_status,
      'current',v_current,'target',v_target,
      'beforeHash',encode(extensions.digest(convert_to(coalesce(v_current,'null'::jsonb)::text,'UTF8'),'sha256'),'hex'),
      'targetHash',encode(extensions.digest(convert_to(v_target::text,'UTF8'),'sha256'),'hex')
    ));
    if v_status='third_state' then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','resource_third_state','key',v_key));
    end if;
  end loop;

  v_draft_evidence := jsonb_build_object(
    'opening',jsonb_build_object(
      'templateId','20377d92-bf85-4fb6-a4c9-5db847fd5f57','draftId',v_opening.id,
      'state',v_opening.state,'revision',v_opening.revision,
      'discardedAt',v_opening.discarded_at,'discardedByAuthUserId',v_opening.discarded_by_auth_user_id,
      'discardReason',v_opening.discard_reason,
      'contentHash',case when v_opening.id is null then null else public.routine_template_version_content_hash(v_opening.id) end,
      'exportSha256','352ecad48ece237345657d116fd2abbb8ac49b7b792c6a525963b95965f5f54c',
      'counts',jsonb_build_object(
        'sections',(select count(*) from public.routine_template_sections where organization_id=v_actor.organization_id and version_id=v_opening.id),
        'tasks',(select count(*) from public.routine_template_tasks where organization_id=v_actor.organization_id and version_id=v_opening.id),
        'items',(select count(*) from public.routine_template_task_items where organization_id=v_actor.organization_id and version_id=v_opening.id),
        'references',(select count(*) from public.routine_template_task_reference_images where organization_id=v_actor.organization_id and version_id=v_opening.id),
        'relations',(select count(*) from public.routine_template_task_relations where organization_id=v_actor.organization_id and version_id=v_opening.id),
        'dependencies',(select count(*) from public.routine_template_task_dependencies where organization_id=v_actor.organization_id and version_id=v_opening.id))
    ),
    'closing',jsonb_build_object(
      'templateId','ede9b1ca-44b6-489e-97ea-3abab57ab6a1','draftId',v_closing.id,
      'state',v_closing.state,'revision',v_closing.revision,
      'discardedAt',v_closing.discarded_at,'discardedByAuthUserId',v_closing.discarded_by_auth_user_id,
      'discardReason',v_closing.discard_reason,
      'contentHash',case when v_closing.id is null then null else public.routine_template_version_content_hash(v_closing.id) end,
      'exportSha256','9d39148cb1ee65ff0efa23ac28aaf83584586540314a80aa3928929fd4a86f06',
      'counts',jsonb_build_object(
        'sections',(select count(*) from public.routine_template_sections where organization_id=v_actor.organization_id and version_id=v_closing.id),
        'tasks',(select count(*) from public.routine_template_tasks where organization_id=v_actor.organization_id and version_id=v_closing.id),
        'items',(select count(*) from public.routine_template_task_items where organization_id=v_actor.organization_id and version_id=v_closing.id),
        'references',(select count(*) from public.routine_template_task_reference_images where organization_id=v_actor.organization_id and version_id=v_closing.id),
        'relations',(select count(*) from public.routine_template_task_relations where organization_id=v_actor.organization_id and version_id=v_closing.id),
        'dependencies',(select count(*) from public.routine_template_task_dependencies where organization_id=v_actor.organization_id and version_id=v_closing.id))
    ),
    'fieldLevelProof',jsonb_build_object('editedTasks',15,'editedItems',19,'differences',129,'conflicts',0,'unknownEdits',0)
  );

  if not v_complete then
    if v_settings.organization_id is null or v_settings.mode<>'shadow' or v_settings.ui_release_stage<>'staff_preview'
       or v_settings.revision<>4 or v_settings.shared_device_enabled then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','settings_drift','message','Expected shadow/staff_preview revision 4 with shared devices disabled.'));
    end if;
    if v_installation_1_1.id is null
       or v_installation_1_1.opening_template_id<>'20377d92-bf85-4fb6-a4c9-5db847fd5f57'
       or v_installation_1_1.opening_draft_version_id<>'73896e75-1509-4215-ac4a-a36b033e6d18'
       or v_installation_1_1.closing_template_id<>'ede9b1ca-44b6-489e-97ea-3abab57ab6a1'
       or v_installation_1_1.closing_draft_version_id<>'072fee93-eda7-406c-87b3-d5186cd26944' then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','installation_1_1_drift'));
    end if;
    if v_opening.state<>'draft' or v_opening.revision<>18
       or public.routine_template_version_content_hash(v_opening.id)<>'a3d2038b7bc0d3b3e75baee5ce63a1c0ffeea8c4b13331c88ea474e10a4f2e4a'
       or v_draft_evidence->'opening'->'counts'<>jsonb_build_object('sections',3,'tasks',37,'items',239,'references',30,'relations',12,'dependencies',9) then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','opening_draft_drift'));
    end if;
    if v_closing.state<>'draft' or v_closing.revision<>25
       or public.routine_template_version_content_hash(v_closing.id)<>'04124b4ab3ddc94e384012e85201cf271efd335187e75f3dd1475fb81aa50d98'
       or v_draft_evidence->'closing'->'counts'<>jsonb_build_object('sections',2,'tasks',46,'items',358,'references',58,'relations',6,'dependencies',32) then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','closing_draft_drift'));
    end if;
    if v_publication_count<>0 or v_membership_count<>0 or v_e2e_count<>0 or v_active_run_count<>0
       or v_active_bundle_count<>0 or v_active_stock_count<>0 or v_1_5_count<>0 then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','activation_precondition_drift'));
    end if;
  end if;

  v_state := jsonb_build_object(
    'contractVersion','phase10ab-v1','organizationId',v_actor.organization_id,
    'settings',jsonb_build_object('mode',v_settings.mode,'stage',v_settings.ui_release_stage,
      'revision',v_settings.revision,'sharedDeviceEnabled',v_settings.shared_device_enabled),
    'provider',jsonb_build_object('packKey',v_pack->>'packKey','packVersion',v_pack->>'packVersion','packHash',v_pack->>'packHash'),
    'installed1_1',case when v_installation_1_1.id is null then null else jsonb_build_object(
      'id',v_installation_1_1.id,'packVersion',v_installation_1_1.pack_version,'packHash',v_installation_1_1.pack_hash) end,
    'drafts',v_draft_evidence,'resources',v_differences,
    'publishedTemplates',v_published_templates,'pilotMemberships',v_pilot_memberships,
    'counts',jsonb_build_object('publications',v_publication_count,'pilotMemberships',v_membership_count,
      'e2eAttestations',v_e2e_count,'activeRuns',v_active_run_count,'activeBundles',v_active_bundle_count,
      'activeRoutineWork',v_active_run_count+v_active_bundle_count,'activeStockCounts',v_active_stock_count,
      'installations1_5R',v_1_5_count),
    'installation1_5',case when v_installation_1_5.id is null then null else jsonb_build_object(
      'id',v_installation_1_5.id,'packHash',v_installation_1_5.pack_hash,
      'openingTemplateId',v_installation_1_5.opening_template_id,'openingDraftVersionId',v_installation_1_5.opening_draft_version_id,
      'closingTemplateId',v_installation_1_5.closing_template_id,'closingDraftVersionId',v_installation_1_5.closing_draft_version_id,
      'summary',v_installation_1_5.installed_resource_summary) end
  );
  v_state_hash := encode(extensions.digest(convert_to(v_state::text,'UTF8'),'sha256'),'hex');

  select operation.response_payload into v_latest_operation
  from public.routine_ui_operations operation
  where operation.organization_id=v_actor.organization_id
    and operation.operation_type='activate_mesh_content_1_5r_recovery'
    and operation.resource_type='content_pack_recovery'
  order by operation.created_at desc,operation.id desc
  limit 1;

  return jsonb_build_object(
    'contractVersion','phase10ab-v1','valid',jsonb_array_length(v_blockers)=0,
    'blockers',v_blockers,'warnings',v_warnings,'resourceDifferences',v_differences,
    'preservedDraftEvidence',v_draft_evidence,'operationAlreadyComplete',v_complete,
    'expectedResourcesToCreate',v_expected_creates,'stateHash',v_state_hash,
    'provider',v_state->'provider','settings',v_state->'settings','counts',v_state->'counts',
    'installation1_5',v_state->'installation1_5','operationEvidence',v_latest_operation,
    'publishedTemplates',v_state->'publishedTemplates','pilotMemberships',v_state->'pilotMemberships',
    'actor',jsonb_build_object('profileId',v_actor.id,'role',v_actor.role,'displayName',v_actor.display_name)
  );
end;
$$;

create or replace function public.apply_mesh_routine_content_1_5r_activation_recovery(
  input_expected_state_hash text,
  input_operation_note text,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor public.user_profiles%rowtype := public.routine_phase10k2_require_personal_manager();
  v_pack jsonb := public.routine_mesh_content_pack_v1();
  v_note text := trim(coalesce(input_operation_note,''));
  v_preview jsonb;
  v_locked_preview jsonb;
  v_analysis jsonb;
  v_install_preview jsonb;
  v_install_result jsonb;
  v_final jsonb;
  v_replay jsonb;
  v_request_hash text;
  v_operation_id uuid;
  v_entry jsonb;
  v_members jsonb;
  v_opening_create jsonb;
  v_closing_create jsonb;
  v_opening_new uuid;
  v_closing_new uuid;
  v_child_key uuid;
  v_expected_conflicts jsonb := jsonb_build_array(
    jsonb_build_object('resourceType','templateDraft','key','opening','reason','manager_draft_would_be_overwritten'),
    jsonb_build_object('resourceType','templateDraft','key','closing','reason','manager_draft_would_be_overwritten')
  );
  v_expected_creates jsonb := jsonb_build_array(
    jsonb_build_object('resourceType','location','key','main-storage-fridge'),
    jsonb_build_object('resourceType','location','key','main-storage-left-reserve'),
    jsonb_build_object('resourceType','location','key','main-storage-express-shelf'),
    jsonb_build_object('resourceType','location','key','main-storage-keg-storage'),
    jsonb_build_object('resourceType','standard','key','main-storage-express-shelf-refill'),
    jsonb_build_object('resourceType','reference','key','main-storage-fridge'),
    jsonb_build_object('resourceType','reference','key','main-storage-express-shelf')
  );
  v_preserve_reason text := 'Preserved immutable pre-1.5R reviewed draft before installing exact mesh-routine-content@1.5R.';
begin
  if input_idempotency_key is null or input_expected_state_hash !~ '^[0-9a-f]{64}$'
     or char_length(v_note) not between 8 and 2000 then
    raise exception using errcode='22023',
      message='Expected state hash, operation note of at least 8 characters, and idempotency key are required.';
  end if;
  if v_pack->>'packKey'<>'mesh-routine-content' or v_pack->>'packVersion'<>'1.5R'
     or v_pack->>'packHash'<>'710c9412eabc8f2e9c5a6488499ac4654cd7c94b62138eaed9563ab5f0203c9c' then
    raise exception using errcode='42501',message='The exact mesh-routine-content@1.5R provider is required.';
  end if;

  v_request_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'operationVersion','phase10ab-v1','expectedStateHash',input_expected_state_hash,
    'providerHash',v_pack->>'packHash','note',v_note,
    'openingDraftId','73896e75-1509-4215-ac4a-a36b033e6d18',
    'closingDraftId','072fee93-eda7-406c-87b3-d5186cd26944'
  )::text,'UTF8'),'sha256'),'hex');

  perform pg_advisory_xact_lock(hashtextextended(
    'activation-recovery:'||v_actor.organization_id::text||':mesh-routine-content@1.5R',101011));
  v_replay := public.routine_phase10k1_existing_operation(
    v_actor.organization_id,v_actor.id,'activate_mesh_content_1_5r_recovery',
    input_idempotency_key,v_request_hash);
  if v_replay is not null then return v_replay; end if;

  v_preview := public.preview_mesh_routine_content_1_5r_activation_recovery();
  if (v_preview->>'operationAlreadyComplete')::boolean then
    return v_preview || jsonb_build_object('idempotentReplay',false);
  end if;
  if v_preview->>'stateHash' is distinct from input_expected_state_hash then
    raise exception using errcode='40001',message='Activation recovery state is stale.',
      detail=jsonb_build_object('serverStateHash',v_preview->>'stateHash')::text;
  end if;
  if not (v_preview->>'valid')::boolean then
    raise exception using errcode='22023',message='Activation recovery preview contains blockers.',detail=(v_preview->'blockers')::text;
  end if;

  perform settings.organization_id from public.routine_organization_settings settings
    where settings.organization_id=v_actor.organization_id for update;
  perform location.id from public.routine_locations location
    where location.organization_id=v_actor.organization_id and location.location_key='workbar-non-alcoholic-fridge' for update;
  perform location_set.id from public.routine_location_sets location_set
    where location_set.organization_id=v_actor.organization_id and location_set.set_key='serviceware-recovery-route' for update;
  perform standard.id from public.routine_standards standard
    where standard.organization_id=v_actor.organization_id and standard.standard_key in(
      'workbar-milk-fridge-target','workbar-coffee-canister-assigned-target',
      'serviceware-office-recovery-route-confirmation','fridge-closing-rules','cornerbar-operating-standard')
    order by standard.id for update;
  perform version.id from public.routine_template_versions version
    where version.organization_id=v_actor.organization_id
      and version.id in('73896e75-1509-4215-ac4a-a36b033e6d18','072fee93-eda7-406c-87b3-d5186cd26944')
    order by version.id for update;

  v_locked_preview := public.preview_mesh_routine_content_1_5r_activation_recovery();
  if v_locked_preview->>'stateHash' is distinct from input_expected_state_hash
     or not (v_locked_preview->>'valid')::boolean then
    raise exception using errcode='40001',message='Activation recovery state changed while acquiring locks.';
  end if;

  update public.routine_locations location
  set name='Workbar Non-Alco Fridge',sort_order=26,revision=2,
      updated_by_auth_user_id=v_actor.id
  where location.organization_id=v_actor.organization_id
    and location.id='5d279ff8-6e6c-4e2a-bde1-a27cd8763841'
    and location.location_key='workbar-non-alcoholic-fridge' and location.revision=1;
  if found is false then raise exception using errcode='40001',message='Workbar Non-Alco Fridge baseline changed.'; end if;

  select value into v_entry from jsonb_array_elements(v_pack->'locationSets') value
  where value->>'key'='serviceware-recovery-route';
  select jsonb_agg(jsonb_build_object(
    'locationId',location.id,'sortOrder',member.ordinality-1,'required',true,'metadata',v_entry->'metadata'
  ) order by member.ordinality) into v_members
  from jsonb_array_elements(v_entry->'members') with ordinality member(value,ordinality)
  join public.routine_locations location on location.organization_id=v_actor.organization_id
    and location.location_key=member.value#>>'{}';
  if jsonb_array_length(v_members)<>12 then raise exception using errcode='40001',message='Serviceware route membership changed.'; end if;
  perform public.replace_routine_location_set_members(
    'c49581b2-e52b-4873-96b9-3579a5b85d96',v_members,2);

  update public.routine_standards standard
  set label='Workbar Milk Fridge',revision=3,updated_by_auth_user_id=v_actor.id
  where standard.organization_id=v_actor.organization_id
    and standard.id='de6530b6-b5f3-44d5-b7e7-f1bfea37430d' and standard.revision=2;
  if found is false then raise exception using errcode='40001',message='Workbar Milk Fridge baseline changed.'; end if;
  select value into v_entry from jsonb_array_elements(v_pack->'standards') value where value->>'key'='workbar-milk-fridge-target';
  v_child_key:=public.routine_content_pack_deterministic_uuid(v_actor.organization_id::text||':'||input_idempotency_key::text||':phase10ab:milk');
  perform public.create_routine_standard_revision('de6530b6-b5f3-44d5-b7e7-f1bfea37430d',
    v_entry->'currentRevision'->'value',null,v_entry->'currentRevision'->>'reason',v_child_key,3);

  update public.routine_standards standard
  set label='Workbar-assigned Coffee Canisters target',revision=3,updated_by_auth_user_id=v_actor.id
  where standard.organization_id=v_actor.organization_id
    and standard.id='badc7c4d-8162-4d48-a4be-31e9ef65d36f' and standard.revision=2;
  if found is false then raise exception using errcode='40001',message='Coffee Canisters baseline changed.'; end if;

  update public.routine_standards standard
  set description=null,revision=3,updated_by_auth_user_id=v_actor.id
  where standard.organization_id=v_actor.organization_id
    and standard.id='34f83f63-279c-4294-b381-1417ce446692' and standard.revision=2;
  if found is false then raise exception using errcode='40001',message='Serviceware standard baseline changed.'; end if;

  select value into v_entry from jsonb_array_elements(v_pack->'standards') value where value->>'key'='fridge-closing-rules';
  v_child_key:=public.routine_content_pack_deterministic_uuid(v_actor.organization_id::text||':'||input_idempotency_key::text||':phase10ab:fridge');
  perform public.create_routine_standard_revision('722ab761-19f0-4a36-ac2b-09c0f844c4f4',
    v_entry->'currentRevision'->'value',null,v_entry->'currentRevision'->>'reason',v_child_key,2);
  select value into v_entry from jsonb_array_elements(v_pack->'standards') value where value->>'key'='cornerbar-operating-standard';
  v_child_key:=public.routine_content_pack_deterministic_uuid(v_actor.organization_id::text||':'||input_idempotency_key::text||':phase10ab:cornerbar');
  perform public.create_routine_standard_revision('693d07e5-dcd2-4c70-bbc5-54d13b6e83ed',
    v_entry->'currentRevision'->'value',null,v_entry->'currentRevision'->>'reason',v_child_key,2);

  v_analysis:=public.routine_mesh_content_pack_analysis(v_actor.organization_id);
  if v_analysis->'conflicts'<>v_expected_conflicts
     or v_analysis->'resourcesToCreate'<>v_expected_creates
     or v_analysis->'unresolvedRequirements'<>'[]'::jsonb
     or v_analysis->'packMetadata'->>'packHash'<>'710c9412eabc8f2e9c5a6488499ac4654cd7c94b62138eaed9563ab5f0203c9c' then
    raise exception using errcode='22023',message='Post-alignment provider analysis is not the exact expected draft-only conflict.',
      detail=jsonb_build_object('conflicts',v_analysis->'conflicts','resourcesToCreate',v_analysis->'resourcesToCreate')::text;
  end if;

  perform public.discard_routine_template_draft('73896e75-1509-4215-ac4a-a36b033e6d18',v_preserve_reason,18);
  perform public.discard_routine_template_draft('072fee93-eda7-406c-87b3-d5186cd26944',v_preserve_reason,25);
  if public.routine_template_version_content_hash('73896e75-1509-4215-ac4a-a36b033e6d18')<>'a3d2038b7bc0d3b3e75baee5ce63a1c0ffeea8c4b13331c88ea474e10a4f2e4a'
     or public.routine_template_version_content_hash('072fee93-eda7-406c-87b3-d5186cd26944')<>'04124b4ab3ddc94e384012e85201cf271efd335187e75f3dd1475fb81aa50d98' then
    raise exception using errcode='P0001',message='Preserved draft content changed during lifecycle transition.';
  end if;

  v_child_key:=public.routine_content_pack_deterministic_uuid(v_actor.organization_id::text||':'||input_idempotency_key::text||':phase10ab:opening-empty-draft');
  v_opening_create:=public.create_routine_template_draft('20377d92-bf85-4fb6-a4c9-5db847fd5f57',null,v_child_key);
  v_child_key:=public.routine_content_pack_deterministic_uuid(v_actor.organization_id::text||':'||input_idempotency_key::text||':phase10ab:closing-empty-draft');
  v_closing_create:=public.create_routine_template_draft('ede9b1ca-44b6-489e-97ea-3abab57ab6a1',null,v_child_key);
  v_opening_new:=(v_opening_create->'draft'->>'id')::uuid;
  v_closing_new:=(v_closing_create->'draft'->>'id')::uuid;
  if v_opening_create->'draft'->>'state'<>'draft' or v_closing_create->'draft'->>'state'<>'draft'
     or v_opening_create->'draft'->>'based_on_version_id' is not null or v_closing_create->'draft'->>'based_on_version_id' is not null
     or exists(select 1 from public.routine_template_sections where organization_id=v_actor.organization_id and version_id in(v_opening_new,v_closing_new))
     or exists(select 1 from public.routine_template_tasks where organization_id=v_actor.organization_id and version_id in(v_opening_new,v_closing_new))
     or exists(select 1 from public.routine_template_task_items where organization_id=v_actor.organization_id and version_id in(v_opening_new,v_closing_new))
     or exists(select 1 from public.routine_template_versions version where version.organization_id=v_actor.organization_id and version.state='published') then
    raise exception using errcode='P0001',message='Fresh empty draft precondition failed.';
  end if;

  v_install_preview:=public.routine_mesh_content_pack_analysis(v_actor.organization_id);
  if not (v_install_preview->>'valid')::boolean
     or v_install_preview->'conflicts'<>'[]'::jsonb
     or v_install_preview->'unresolvedRequirements'<>'[]'::jsonb
     or v_install_preview->'resourcesToCreate'<>v_expected_creates
     or v_install_preview->'packMetadata'->>'packVersion'<>'1.5R'
     or v_install_preview->'packMetadata'->>'packHash'<>'710c9412eabc8f2e9c5a6488499ac4654cd7c94b62138eaed9563ab5f0203c9c' then
    raise exception using errcode='22023',message='Exact 1.5R install preview is not valid.';
  end if;
  v_child_key:=public.routine_content_pack_deterministic_uuid(v_actor.organization_id::text||':'||input_idempotency_key::text||':phase10ab:installer');
  v_install_result:=public.install_mesh_routine_content_pack_v1(
    v_install_preview->>'organizationStateHash',v_note,v_child_key);

  if v_install_result->>'packHash'<>'710c9412eabc8f2e9c5a6488499ac4654cd7c94b62138eaed9563ab5f0203c9c'
     or v_install_result->>'openingTemplateId'<>'20377d92-bf85-4fb6-a4c9-5db847fd5f57'
     or v_install_result->>'closingTemplateId'<>'ede9b1ca-44b6-489e-97ea-3abab57ab6a1'
     or (v_install_result->>'published')::boolean or (v_install_result->>'runsCreated')::boolean
     or v_install_result->'installedResourceSummary'->>'openingSections'<>'3'
     or v_install_result->'installedResourceSummary'->>'openingTasks'<>'37'
     or v_install_result->'installedResourceSummary'->>'closingSections'<>'2'
     or v_install_result->'installedResourceSummary'->>'closingTasks'<>'46'
     or v_install_result->'installedResourceSummary'->>'unresolvedRequirements'<>'0' then
    raise exception using errcode='P0001',message='Exact 1.5R installer readback failed.';
  end if;

  v_final:=public.preview_mesh_routine_content_1_5r_activation_recovery();
  if not (v_final->>'valid')::boolean or not (v_final->>'operationAlreadyComplete')::boolean
     or v_final->'settings'->>'mode'<>'shadow' or v_final->'settings'->>'stage'<>'staff_preview'
     or (v_final->'settings'->>'sharedDeviceEnabled')::boolean
     or v_final->'counts'->>'publications'<>'0' or v_final->'counts'->>'pilotMemberships'<>'0'
     or v_final->'counts'->>'e2eAttestations'<>'0' or v_final->'counts'->>'activeRoutineWork'<>'0'
     or v_final->'counts'->>'activeStockCounts'<>'0' then
    raise exception using errcode='P0001',message='Activation recovery final safety readback failed.';
  end if;

  v_final:=v_final||jsonb_build_object(
    'idempotentReplay',false,'installResult',v_install_result,
    'preservedDrafts',jsonb_build_object(
      'opening',jsonb_build_object('id','73896e75-1509-4215-ac4a-a36b033e6d18','contentHash','a3d2038b7bc0d3b3e75baee5ce63a1c0ffeea8c4b13331c88ea474e10a4f2e4a'),
      'closing',jsonb_build_object('id','072fee93-eda7-406c-87b3-d5186cd26944','contentHash','04124b4ab3ddc94e384012e85201cf271efd335187e75f3dd1475fb81aa50d98')),
    'newDrafts',jsonb_build_object(
      'opening',jsonb_build_object('id',v_install_result->>'openingDraftVersionId','contentHash',v_install_result->'installedResourceSummary'->>'openingDraftContentHash'),
      'closing',jsonb_build_object('id',v_install_result->>'closingDraftVersionId','contentHash',v_install_result->'installedResourceSummary'->>'closingDraftContentHash')),
    'resourceEvidence',(select coalesce(jsonb_agg(jsonb_build_object(
      'key',before_entry->>'key','id',before_entry->>'id','beforeHash',before_entry->>'beforeHash',
      'afterHash',after_entry->>'beforeHash','targetHash',before_entry->>'targetHash'
    ) order by before_entry->>'key'),'[]'::jsonb)
      from jsonb_array_elements(v_preview->'resourceDifferences') before_entry
      join jsonb_array_elements(v_final->'resourceDifferences') after_entry on after_entry->>'key'=before_entry->>'key')
  );
  v_operation_id:=gen_random_uuid();
  v_final:=v_final||jsonb_build_object('operationId',v_operation_id);
  perform set_config('mesh.routine_ui_internal','operation',true);
  insert into public.routine_ui_operations(
    id,organization_id,actor_auth_user_id,actor_source,operation_type,idempotency_key,
    request_hash,resource_type,resource_id,response_payload
  ) values (
    v_operation_id,v_actor.organization_id,v_actor.id,'personal_auth',
    'activate_mesh_content_1_5r_recovery',input_idempotency_key,v_request_hash,
    'content_pack_recovery',(v_install_result->>'installationId')::uuid,v_final
  );
  return v_final;
end;
$$;

revoke all on function public.preview_mesh_routine_content_1_5r_activation_recovery()
  from public,anon,authenticated;
revoke all on function public.apply_mesh_routine_content_1_5r_activation_recovery(text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.preview_mesh_routine_content_1_5r_activation_recovery()
  to authenticated;
grant execute on function public.apply_mesh_routine_content_1_5r_activation_recovery(text,text,uuid)
  to authenticated;

commit;
