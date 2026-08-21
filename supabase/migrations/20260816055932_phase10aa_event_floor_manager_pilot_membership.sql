-- Phase 10AA: terminal Event Floor Manager pilot-membership eligibility correction.
-- This forward migration replaces only the manager-authorized desired-state membership RPC.

begin;

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
        and profile.role in('shift_lead','staff','event_floor_manager');
      if v_profile.id is null or (v_access='coordinator' and v_profile.role<>'shift_lead') then
        raise exception using errcode='42501',message='Pilot profile is inactive, cross-organization, shared-device, manager, counter, unsupported, or over-privileged.';
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

revoke all on function public.replace_routine_pilot_memberships(jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.replace_routine_pilot_memberships(jsonb,bigint,uuid) to authenticated;

commit;
