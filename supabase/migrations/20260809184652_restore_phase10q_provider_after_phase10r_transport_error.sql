begin;

do $restore_phase10q$
declare
  stored_sql text;
  create_pos integer;
  end_marker_pos integer;
  create_statement text;
begin
  select statements[1]
  into stored_sql
  from supabase_migrations.schema_migrations
  where name = 'phase10q_mesh_routine_content_pack_1_2r'
  order by version desc
  limit 1;

  if stored_sql is null then
    raise exception 'Authoritative Phase 10Q migration history entry is missing.';
  end if;

  if position('"packVersion":"1.2R"' in stored_sql) = 0
     or position('2dcfc69b822f973c23e54934b6799faa5b9400ae0529096f049067811a417f25' in stored_sql) = 0 then
    raise exception 'Stored Phase 10Q migration does not match the approved 1.2R provider identity.';
  end if;

  create_pos := position('create or replace function public.routine_mesh_content_pack_v1()' in stored_sql);
  end_marker_pos := position('-- END GENERATED MESH CONTENT PACK PAYLOAD' in stored_sql);

  if create_pos = 0 or end_marker_pos <= create_pos then
    raise exception 'Could not isolate the provider statement from stored Phase 10Q migration.';
  end if;

  create_statement := substring(stored_sql from create_pos for end_marker_pos - create_pos);
  execute create_statement;
  execute 'revoke all on function public.routine_mesh_content_pack_v1() from public, anon, authenticated';
end
$restore_phase10q$;

commit;