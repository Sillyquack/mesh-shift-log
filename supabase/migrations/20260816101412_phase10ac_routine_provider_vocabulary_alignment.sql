-- Phase 10AC: align the two Routine vocabularies required by the exact 1.5R provider.
--
-- This terminal migration changes exactly public.routine_locations_type_check
-- and public.routine_standards_source_kind_check, then keeps the existing manager
-- mutation RPCs narrower than the provider/system-only source. It creates no
-- resources, installs no content, and changes no operational state.

begin;

do $phase10ac_provider_vocabulary_alignment$
declare
  v_location_constraint_count integer;
  v_location_definition text;
  v_location_validated boolean;
  v_location_state text;
  v_standard_constraint_count integer;
  v_standard_definition text;
  v_standard_validated boolean;
  v_standard_state text;
  v_location_baseline constant text := 'CHECK (location_type = ANY (ARRAY[''zone''::text, ''room''::text, ''station''::text, ''storage''::text, ''fridge''::text, ''toilet''::text, ''door''::text, ''equipment''::text, ''collection_point''::text, ''other''::text]))';
  v_location_target constant text := 'CHECK (location_type = ANY (ARRAY[''zone''::text, ''room''::text, ''station''::text, ''storage''::text, ''storage_zone''::text, ''shelf''::text, ''fridge''::text, ''toilet''::text, ''door''::text, ''equipment''::text, ''collection_point''::text, ''other''::text]))';
  v_standard_baseline constant text := 'CHECK (source_kind = ANY (ARRAY[''manual''::text, ''inventory_readonly''::text, ''asset_registry_readonly''::text, ''location_set''::text]))';
  v_standard_target constant text := 'CHECK (source_kind = ANY (ARRAY[''manual''::text, ''inventory_readonly''::text, ''asset_registry_readonly''::text, ''location_set''::text, ''location_standards''::text]))';
begin
  select count(*), min(pg_get_constraintdef(constraint_row.oid, true)), bool_and(constraint_row.convalidated)
    into v_location_constraint_count, v_location_definition, v_location_validated
  from pg_catalog.pg_constraint constraint_row
  join pg_catalog.pg_class relation_row on relation_row.oid = constraint_row.conrelid
  join pg_catalog.pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
  where namespace_row.nspname = 'public'
    and relation_row.relname = 'routine_locations'
    and constraint_row.conname = 'routine_locations_type_check'
    and constraint_row.contype = 'c';

  select count(*), min(pg_get_constraintdef(constraint_row.oid, true)), bool_and(constraint_row.convalidated)
    into v_standard_constraint_count, v_standard_definition, v_standard_validated
  from pg_catalog.pg_constraint constraint_row
  join pg_catalog.pg_class relation_row on relation_row.oid = constraint_row.conrelid
  join pg_catalog.pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
  where namespace_row.nspname = 'public'
    and relation_row.relname = 'routine_standards'
    and constraint_row.conname = 'routine_standards_source_kind_check'
    and constraint_row.contype = 'c';

  if v_location_constraint_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'Phase 10AC requires exactly public.routine_locations_type_check.',
      detail = format('Found %s matching check constraints.', v_location_constraint_count);
  end if;
  if v_standard_constraint_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'Phase 10AC requires exactly public.routine_standards_source_kind_check.',
      detail = format('Found %s matching check constraints.', v_standard_constraint_count);
  end if;

  if v_location_definition = v_location_baseline and v_location_validated then
    v_location_state := 'BASELINE';
  elsif v_location_definition = v_location_target and v_location_validated then
    v_location_state := 'TARGET';
  else
    raise exception using
      errcode = 'P0001',
      message = 'Phase 10AC rejected THIRD_STATE routine_locations_type_check.',
      detail = format('validated=%s definition=%s', v_location_validated, v_location_definition);
  end if;

  if v_standard_definition = v_standard_baseline and v_standard_validated then
    v_standard_state := 'BASELINE';
  elsif v_standard_definition = v_standard_target and v_standard_validated then
    v_standard_state := 'TARGET';
  else
    raise exception using
      errcode = 'P0001',
      message = 'Phase 10AC rejected THIRD_STATE routine_standards_source_kind_check.',
      detail = format('validated=%s definition=%s', v_standard_validated, v_standard_definition);
  end if;

  if exists (
    select 1
    from public.routine_locations location
    where location.location_type is null
       or location.location_type <> all (array[
         'zone','room','station','storage','storage_zone','shelf','fridge','toilet',
         'door','equipment','collection_point','other'
       ]::text[])
  ) then
    raise exception using
      errcode = '23514',
      message = 'Phase 10AC found a Routine location outside the exact target vocabulary.';
  end if;

  if exists (
    select 1
    from public.routine_standards standard
    where standard.source_kind is null
       or standard.source_kind <> all (array[
         'manual','inventory_readonly','asset_registry_readonly','location_set','location_standards'
       ]::text[])
  ) then
    raise exception using
      errcode = '23514',
      message = 'Phase 10AC found a Routine standard outside the exact target source vocabulary.';
  end if;

  if v_location_state = 'BASELINE' then
    alter table public.routine_locations
      drop constraint routine_locations_type_check;
    alter table public.routine_locations
      add constraint routine_locations_type_check check (location_type in (
        'zone','room','station','storage','storage_zone','shelf','fridge','toilet',
        'door','equipment','collection_point','other'
      )) not valid;
    alter table public.routine_locations
      validate constraint routine_locations_type_check;
  end if;

  -- Phase 10AC first constraint replacement complete.

  if v_standard_state = 'BASELINE' then
    alter table public.routine_standards
      drop constraint routine_standards_source_kind_check;
    alter table public.routine_standards
      add constraint routine_standards_source_kind_check check (source_kind in (
        'manual','inventory_readonly','asset_registry_readonly','location_set','location_standards'
      )) not valid;
    alter table public.routine_standards
      validate constraint routine_standards_source_kind_check;
  end if;

  -- Phase 10AC second constraint replacement complete.

  select pg_get_constraintdef(constraint_row.oid, true), constraint_row.convalidated
    into v_location_definition, v_location_validated
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.routine_locations'::regclass
    and constraint_row.conname = 'routine_locations_type_check'
    and constraint_row.contype = 'c';

  select pg_get_constraintdef(constraint_row.oid, true), constraint_row.convalidated
    into v_standard_definition, v_standard_validated
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.routine_standards'::regclass
    and constraint_row.conname = 'routine_standards_source_kind_check'
    and constraint_row.contype = 'c';

  if v_location_definition is distinct from v_location_target
     or not coalesce(v_location_validated, false) then
    raise exception using
      errcode = 'P0001',
      message = 'Phase 10AC location target constraint readback failed.',
      detail = format('validated=%s definition=%s', v_location_validated, v_location_definition);
  end if;
  if v_standard_definition is distinct from v_standard_target
     or not coalesce(v_standard_validated, false) then
    raise exception using
      errcode = 'P0001',
      message = 'Phase 10AC standard-source target constraint readback failed.',
      detail = format('validated=%s definition=%s', v_standard_validated, v_standard_definition);
  end if;
end;
$phase10ac_provider_vocabulary_alignment$;

-- The provider/system-only source is accepted by the installer without becoming
-- an ordinary manager-authored logical standard or immutable value stream.
create or replace function public.create_routine_standard(
  input_standard_key text,
  input_label text,
  input_description text,
  input_value_type text,
  input_unit text,
  input_source_kind text,
  input_active boolean default true
)
returns public.routine_standards
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_standard public.routine_standards%rowtype;
begin
  if not public.routine_current_user_can_manage_templates() then
    raise exception using errcode = 'P0001', message = 'Manager access is required to create routine standards.';
  end if;
  if input_source_kind = 'location_standards' then
    raise exception using
      errcode = '22023',
      message = 'Location standards are provider/system managed and cannot be created through the manager standard contract.';
  end if;
  select * into v_actor from public.routine_resolve_actor();
  insert into public.routine_standards (
    organization_id, standard_key, label, description, value_type, unit,
    source_kind, active, created_by_auth_user_id, updated_by_auth_user_id
  ) values (
    v_actor.organization_id, pg_catalog.btrim(input_standard_key), pg_catalog.btrim(input_label),
    input_description, input_value_type, input_unit, input_source_kind, input_active,
    v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
  ) returning * into v_standard;
  return v_standard;
end;
$$;

create or replace function public.create_routine_standard_revision(
  input_standard_id uuid,
  input_value_json jsonb,
  input_effective_from timestamptz,
  input_reason text,
  input_idempotency_key uuid,
  input_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_standard public.routine_standards%rowtype;
  v_revision public.routine_standard_revisions%rowtype;
  v_next_revision bigint;
begin
  if not public.routine_current_user_can_manage_templates() then
    raise exception using errcode = 'P0001', message = 'Manager access is required to create routine standard revisions.';
  end if;
  select * into v_actor from public.routine_resolve_actor();
  if input_idempotency_key is null then
    raise exception using errcode = '22023', message = 'A routine standard revision idempotency key is required.';
  end if;
  if input_value_json is null then
    raise exception using errcode = '23502', message = 'A routine standard revision value is required.';
  end if;

  select standard.* into v_standard
  from public.routine_standards standard
  where standard.id = input_standard_id
    and standard.organization_id = v_actor.organization_id
  for update;
  if v_standard.id is null then
    raise exception using errcode = 'P0001', message = 'Routine standard was not found in this organization.';
  end if;
  if v_standard.source_kind = 'location_standards' then
    raise exception using
      errcode = '22023',
      message = 'Location-standard values are resolved from authoritative inventory location standards and cannot be authored through the manager revision contract.';
  end if;

  select revision.* into v_revision
  from public.routine_standard_revisions revision
  where revision.standard_id = v_standard.id
    and revision.organization_id = v_actor.organization_id
    and revision.idempotency_key = input_idempotency_key;

  if v_revision.id is not null then
    if v_revision.value_json is distinct from input_value_json
       or v_revision.effective_from is distinct from input_effective_from
       or v_revision.reason is distinct from input_reason then
      raise exception using
        errcode = 'P0001',
        message = 'This routine standard idempotency key was already used with different content.';
    end if;
    return pg_catalog.jsonb_build_object(
      'standard', pg_catalog.to_jsonb(v_standard),
      'revision', pg_catalog.to_jsonb(v_revision),
      'idempotentReplay', true
    );
  end if;

  if input_expected_revision is distinct from v_standard.revision then
    raise exception using errcode = '40001', message = 'Stale routine standard revision.';
  end if;

  select coalesce(pg_catalog.max(revision.revision_number), 0) + 1
  into v_next_revision
  from public.routine_standard_revisions revision
  where revision.standard_id = v_standard.id;

  insert into public.routine_standard_revisions (
    organization_id, standard_id, revision_number, value_json, effective_from,
    reason, created_by_auth_user_id, idempotency_key, content_hash
  ) values (
    v_actor.organization_id, v_standard.id, v_next_revision, input_value_json,
    input_effective_from, input_reason, v_actor.actor_auth_user_id,
    input_idempotency_key, pg_catalog.md5('phase10a-trigger-replaces-this')
  ) returning * into v_revision;

  update public.routine_standards standard
  set current_revision_id = v_revision.id,
      revision = standard.revision + 1,
      updated_by_auth_user_id = v_actor.actor_auth_user_id
  where standard.id = v_standard.id
    and standard.organization_id = v_actor.organization_id
  returning * into v_standard;

  return pg_catalog.jsonb_build_object(
    'standard', pg_catalog.to_jsonb(v_standard),
    'revision', pg_catalog.to_jsonb(v_revision),
    'idempotentReplay', false
  );
end;
$$;

commit;
