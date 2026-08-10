begin;

create or replace function public.routine_run_operation_replay(
  input_organization_id uuid,
  input_actor_auth_user_id uuid,
  input_operation_type text,
  input_idempotency_key uuid,
  input_request_hash text
)
returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  v_operation public.routine_run_operations%rowtype;
  v_actor record;
  v_locked_actor record;
begin
  select * into v_locked_actor from public.routine_resolve_effective_actor();

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.jsonb_build_array(
      'mesh:routine:run-operation-idempotency:v1',
      input_organization_id,
      input_actor_auth_user_id,
      v_locked_actor.actor_source,
      coalesce(v_locked_actor.effective_operator_id::text, 'personal-auth-sentinel'),
      input_operation_type,
      input_idempotency_key
    )::text,
    101001
  ));

  select * into v_actor from public.routine_resolve_effective_actor();
  if v_actor.actor_source is distinct from v_locked_actor.actor_source
     or v_actor.effective_operator_id is distinct from v_locked_actor.effective_operator_id
     or v_actor.operator_session_id is distinct from v_locked_actor.operator_session_id then
    raise exception using errcode = '42501',
      message = 'Routine actor identity changed while waiting for the idempotency lock.';
  end if;

  select operation.* into v_operation
  from public.routine_run_operations operation
  where operation.organization_id = input_organization_id
    and operation.actor_auth_user_id = input_actor_auth_user_id
    and operation.operation_type = input_operation_type
    and operation.idempotency_key = input_idempotency_key
    and operation.actor_source = v_actor.actor_source
    and operation.effective_operator_id is not distinct from v_actor.effective_operator_id;

  if v_operation.id is null then return null; end if;
  if v_operation.request_hash is distinct from input_request_hash then
    raise exception using errcode = 'P0001',
      message = 'Idempotency key was already used with another routine request.';
  end if;
  return v_operation.response_payload || pg_catalog.jsonb_build_object('idempotentReplay', true);
end;
$$;

create or replace function public.routine_record_run_operation(
  input_organization_id uuid,
  input_actor_auth_user_id uuid,
  input_operation_type text,
  input_idempotency_key uuid,
  input_request_hash text,
  input_resource_type text,
  input_resource_id uuid,
  input_response_payload jsonb
)
returns void
language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  v_operation public.routine_run_operations%rowtype;
  v_actor record;
  v_locked_actor record;
begin
  select * into v_locked_actor from public.routine_resolve_effective_actor();

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.jsonb_build_array(
      'mesh:routine:run-operation-idempotency:v1',
      input_organization_id,
      input_actor_auth_user_id,
      v_locked_actor.actor_source,
      coalesce(v_locked_actor.effective_operator_id::text, 'personal-auth-sentinel'),
      input_operation_type,
      input_idempotency_key
    )::text,
    101001
  ));

  select * into v_actor from public.routine_resolve_effective_actor();
  if v_actor.actor_source is distinct from v_locked_actor.actor_source
     or v_actor.effective_operator_id is distinct from v_locked_actor.effective_operator_id
     or v_actor.operator_session_id is distinct from v_locked_actor.operator_session_id then
    raise exception using errcode = '42501',
      message = 'Routine actor identity changed while waiting for the idempotency lock.';
  end if;

  perform set_config('mesh.routine_run_internal', 'operation', true);
  insert into public.routine_run_operations (
    organization_id,
    actor_auth_user_id,
    effective_operator_id,
    operator_session_id,
    actor_source,
    operation_type,
    idempotency_key,
    request_hash,
    resource_type,
    resource_id,
    response_payload
  ) values (
    input_organization_id,
    input_actor_auth_user_id,
    v_actor.effective_operator_id,
    v_actor.operator_session_id,
    v_actor.actor_source,
    input_operation_type,
    input_idempotency_key,
    input_request_hash,
    input_resource_type,
    input_resource_id,
    input_response_payload
  )
  on conflict do nothing
  returning * into v_operation;

  if v_operation.id is not null then return; end if;

  select operation.* into v_operation
  from public.routine_run_operations operation
  where operation.organization_id = input_organization_id
    and operation.actor_auth_user_id = input_actor_auth_user_id
    and operation.operation_type = input_operation_type
    and operation.idempotency_key = input_idempotency_key
    and operation.actor_source = v_actor.actor_source
    and operation.effective_operator_id is not distinct from v_actor.effective_operator_id;

  if v_operation.id is null then
    raise exception using errcode = 'P0001',
      message = 'Routine operation idempotency ledger conflict.';
  end if;
  if v_operation.request_hash is distinct from input_request_hash then
    raise exception using errcode = 'P0001',
      message = 'Idempotency key was already used with another routine request.';
  end if;
  if v_operation.resource_type is distinct from input_resource_type
     or v_operation.resource_id is distinct from input_resource_id then
    raise exception using errcode = 'P0001',
      message = 'Routine operation idempotency resource conflict.';
  end if;
end;
$$;

create or replace function public.routine_bundle_operation_replay(
  input_organization_id uuid,
  input_actor_auth_user_id uuid,
  input_operation_type text,
  input_idempotency_key uuid,
  input_request_hash text
)
returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  v_operation public.routine_bundle_operations%rowtype;
begin
  if input_idempotency_key is null then
    raise exception using errcode = '22023', message = 'An idempotency key is required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.jsonb_build_array(
      'mesh:routine:bundle-operation-idempotency:v1',
      input_organization_id,
      input_actor_auth_user_id,
      input_operation_type,
      input_idempotency_key
    )::text,
    101002
  ));

  select operation.* into v_operation
  from public.routine_bundle_operations operation
  where operation.organization_id = input_organization_id
    and operation.actor_auth_user_id = input_actor_auth_user_id
    and operation.operation_type = input_operation_type
    and operation.idempotency_key = input_idempotency_key;

  if v_operation.id is null then return null; end if;
  if v_operation.request_hash is distinct from input_request_hash then
    raise exception using errcode = 'P0001',
      message = 'This idempotency key was already used with a different request.';
  end if;
  return pg_catalog.jsonb_set(v_operation.response_payload, '{idempotentReplay}', 'true'::jsonb, true);
end;
$$;

create or replace function public.routine_record_bundle_operation(
  input_organization_id uuid,
  input_actor_auth_user_id uuid,
  input_operation_type text,
  input_idempotency_key uuid,
  input_request_hash text,
  input_resource_type text,
  input_resource_id uuid,
  input_response_payload jsonb
)
returns uuid
language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  v_operation public.routine_bundle_operations%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.jsonb_build_array(
      'mesh:routine:bundle-operation-idempotency:v1',
      input_organization_id,
      input_actor_auth_user_id,
      input_operation_type,
      input_idempotency_key
    )::text,
    101002
  ));

  insert into public.routine_bundle_operations (
    organization_id,
    actor_auth_user_id,
    operation_type,
    idempotency_key,
    request_hash,
    resource_type,
    resource_id,
    response_payload
  ) values (
    input_organization_id,
    input_actor_auth_user_id,
    input_operation_type,
    input_idempotency_key,
    input_request_hash,
    input_resource_type,
    input_resource_id,
    input_response_payload
  )
  on conflict do nothing
  returning * into v_operation;

  if v_operation.id is null then
    select operation.* into v_operation
    from public.routine_bundle_operations operation
    where operation.organization_id = input_organization_id
      and operation.actor_auth_user_id = input_actor_auth_user_id
      and operation.operation_type = input_operation_type
      and operation.idempotency_key = input_idempotency_key;

    if v_operation.id is null then
      raise exception using errcode = 'P0001',
        message = 'Routine bundle operation idempotency ledger conflict.';
    end if;
    if v_operation.request_hash is distinct from input_request_hash then
      raise exception using errcode = 'P0001',
        message = 'This idempotency key was already used with a different request.';
    end if;
    if v_operation.resource_type is distinct from input_resource_type
       or v_operation.resource_id is distinct from input_resource_id then
      raise exception using errcode = 'P0001',
        message = 'Routine bundle operation idempotency resource conflict.';
    end if;
  end if;

  return v_operation.id;
end;
$$;

commit;
