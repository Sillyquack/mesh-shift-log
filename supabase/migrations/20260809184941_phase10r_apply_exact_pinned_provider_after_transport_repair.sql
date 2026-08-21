begin;

create extension if not exists http with schema extensions;

do $phase10r_exact$
declare
  source_status integer;
  source_sql text;
  source_sha256 text;
  source_bytes integer;
  create_pos integer;
  end_marker_pos integer;
  revoke_pos integer;
  commit_pos integer;
  create_statement text;
  revoke_statement text;
  body_delimiter constant text := '$routine_mesh_content_pack_v1$';
  as_marker constant text := 'as $routine_mesh_content_pack_v1$';
  body_start integer;
  body_end_offset integer;
  expected_body text;
  actual_body text;
  provider jsonb;
begin
  select response.status, response.content
  into source_status, source_sql
  from extensions.http_get(
    'https://raw.githubusercontent.com/Sillyquack/mesh-shift-log/e3209d4d63587f4b7c83ea0159046427d4fa2d26/supabase/phase10r_mesh_routine_content_pack_1_3r.sql'
  ) as response;

  if source_status is distinct from 200 or source_sql is null then
    raise exception 'Pinned Phase 10R source fetch failed with HTTP status %.', source_status;
  end if;

  source_bytes := octet_length(convert_to(source_sql, 'UTF8'));
  source_sha256 := encode(extensions.digest(convert_to(source_sql, 'UTF8'), 'sha256'), 'hex');

  if source_bytes <> 447397 then
    raise exception 'Pinned Phase 10R byte count mismatch: expected 447397, got %.', source_bytes;
  end if;

  if source_sha256 <> 'f62d9464d70eaca7e1e0e9e2f937e3294cf6faafbd0f702a59fab5558f260822' then
    raise exception 'Pinned Phase 10R SHA-256 mismatch: got %.', source_sha256;
  end if;

  if left(source_sql, 6) <> 'begin;' or right(source_sql, 8) <> E'commit;\n' then
    raise exception 'Pinned Phase 10R transaction boundary contract mismatch.';
  end if;

  create_pos := position('create or replace function public.routine_mesh_content_pack_v1()' in source_sql);
  end_marker_pos := position('-- END GENERATED MESH CONTENT PACK PAYLOAD' in source_sql);
  revoke_pos := position('revoke all on function public.routine_mesh_content_pack_v1() from public, anon, authenticated;' in source_sql);
  commit_pos := position(E'\n\ncommit;' in source_sql);

  if create_pos = 0 or end_marker_pos <= create_pos or revoke_pos <= end_marker_pos or commit_pos <= revoke_pos then
    raise exception 'Could not isolate the exact Phase 10R provider and ACL statements.';
  end if;

  create_statement := substring(source_sql from create_pos for end_marker_pos - create_pos);
  revoke_statement := substring(source_sql from revoke_pos for commit_pos - revoke_pos);

  execute create_statement;
  execute revoke_statement;

  body_start := position(as_marker in create_statement) + length(as_marker);
  if body_start <= length(as_marker) then
    raise exception 'Could not locate the provider body opening delimiter.';
  end if;

  body_end_offset := position(body_delimiter in substring(create_statement from body_start));
  if body_end_offset = 0 then
    raise exception 'Could not locate the provider body closing delimiter.';
  end if;

  expected_body := substring(create_statement from body_start for body_end_offset - 1);

  select p.prosrc
  into actual_body
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'routine_mesh_content_pack_v1'
    and p.pronargs = 0;

  if actual_body is distinct from expected_body then
    raise exception 'Installed provider body is not byte-identical to the pinned Phase 10R function body.';
  end if;

  provider := public.routine_mesh_content_pack_v1();

  if provider->>'packVersion' <> '1.3R'
     or provider->>'packHash' <> 'b416001c2885bbf54bdb029b8e7164cbb903a76b8344396a4e9fcffa26107fe1'
     or jsonb_array_length(provider->'locations') <> 44
     or jsonb_array_length(provider->'locationSets') <> 12
     or jsonb_array_length(provider->'standards') <> 14
     or jsonb_array_length(provider->'references') <> 40
     or jsonb_array_length(provider#>'{opening,tasks}') <> 37
     or jsonb_array_length(provider#>'{closing,tasks}') <> 46
     or jsonb_array_length(provider->'doubleShiftSteps') <> 4
     or jsonb_array_length(provider->'unresolvedRequirements') <> 0 then
    raise exception 'Installed Phase 10R provider failed its canonical identity or shape checks.';
  end if;

  if has_function_privilege('public', 'public.routine_mesh_content_pack_v1()', 'execute')
     or has_function_privilege('anon', 'public.routine_mesh_content_pack_v1()', 'execute')
     or has_function_privilege('authenticated', 'public.routine_mesh_content_pack_v1()', 'execute') then
    raise exception 'Installed Phase 10R provider has unexpected client EXECUTE privilege.';
  end if;
end
$phase10r_exact$;

drop extension http;

commit;