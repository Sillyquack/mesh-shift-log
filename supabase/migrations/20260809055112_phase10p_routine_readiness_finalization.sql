begin;

-- Phase 10P is a forward-only read-model correction. It changes no Routine
-- content, release state, mode, memberships, or operational rows.
create or replace function public.routine_compute_pilot_readiness(input_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare
  v_settings public.routine_organization_settings%rowtype;
  v_categories jsonb; v_blockers jsonb:='[]'::jsonb; v_warnings jsonb:='[]'::jsonb;
  v_opening integer; v_closing integer; v_inactive_opening integer; v_inactive_closing integer;
  v_validation_blockers integer; v_door_count integer; v_set_count integer; v_standard_count integer;
  v_standard_evidence jsonb;
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

  with required(standard_key,sort_order) as (values
    ('workbar-coffee-canister-assigned-target',1),
    ('coffee-cups-full-target',2),
    ('coffee-cups-service-ready-target',3),
    ('wine-glasses-full-target',4),
    ('wine-glasses-service-ready-target',5)
  ), resolved as (
    select required.standard_key,required.sort_order,standard.id standard_id,standard.revision standard_revision,
      revision.id revision_id,revision.revision_number,revision.content_hash
    from required
    left join public.routine_standards standard
      on standard.organization_id=input_organization_id and standard.standard_key=required.standard_key and standard.active
    left join public.routine_standard_revisions revision
      on revision.id=standard.current_revision_id and revision.standard_id=standard.id
      and revision.organization_id=standard.organization_id
      and not exists (
        select 1 from public.routine_standard_revisions newer
        where newer.organization_id=revision.organization_id and newer.standard_id=revision.standard_id
          and newer.revision_number>revision.revision_number)
  )
  select count(*) filter(where revision_id is not null),
    coalesce(jsonb_agg(jsonb_build_object(
      'standardKey',standard_key,'standardId',standard_id,'standardRevision',standard_revision,
      'currentRevisionId',revision_id,'revisionNumber',revision_number,'contentHash',content_hash
    ) order by sort_order) filter(where revision_id is not null),'[]'::jsonb)
  into v_standard_count,v_standard_evidence
  from resolved;

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
    'standards',public.routine_phase10k4_category(v_standard_count=5,
      (case when not exists(select 1 from jsonb_array_elements(v_standard_evidence) item where item->>'standardKey'='workbar-coffee-canister-assigned-target') then jsonb_build_array('Workbar Coffee Canisters target is missing or stale.') else '[]'::jsonb end)
      ||(case when not exists(select 1 from jsonb_array_elements(v_standard_evidence) item where item->>'standardKey'='coffee-cups-full-target') then jsonb_build_array('Coffee-cup full target is missing or stale.') else '[]'::jsonb end)
      ||(case when not exists(select 1 from jsonb_array_elements(v_standard_evidence) item where item->>'standardKey'='coffee-cups-service-ready-target') then jsonb_build_array('Coffee-cup service-ready target is missing or stale.') else '[]'::jsonb end)
      ||(case when not exists(select 1 from jsonb_array_elements(v_standard_evidence) item where item->>'standardKey'='wine-glasses-full-target') then jsonb_build_array('Wine-glass full target is missing or stale.') else '[]'::jsonb end)
      ||(case when not exists(select 1 from jsonb_array_elements(v_standard_evidence) item where item->>'standardKey'='wine-glasses-service-ready-target') then jsonb_build_array('Wine-glass service-ready target is missing or stale.') else '[]'::jsonb end),
      '[]'::jsonb,jsonb_build_object('requiredTargetCount',5,'resolvedTargetCount',v_standard_count,'resolvedTargets',v_standard_evidence)),
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

revoke all on function public.routine_compute_pilot_readiness(uuid) from public,anon,authenticated;

commit;
