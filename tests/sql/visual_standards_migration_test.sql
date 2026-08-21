do $$
begin
  if (
    select public
    from storage.buckets
    where id = 'visual-standards'
  ) is distinct from false then
    raise exception 'The visual-standards bucket must be private.';
  end if;

  if (
    select file_size_limit
    from storage.buckets
    where id = 'visual-standards'
  ) <> 15728640 then
    raise exception 'The visual-standards bucket must retain the 15 MB limit.';
  end if;

  if (
    select allowed_mime_types
    from storage.buckets
    where id = 'visual-standards'
  ) <> array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'] then
    raise exception 'The visual-standards bucket MIME allowlist changed unexpectedly.';
  end if;
end;
$$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

do $$
begin
  if (select count(*) from public.visual_standards) <> 10 then
    raise exception 'Expected ten seeded canonical standards for manager.';
  end if;

  begin
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'visual-standards',
      'arbitrary-manager-folder/100-invalid.jpg',
      '00000000-0000-0000-0000-000000000001',
      '{"mimetype":"image/jpeg","size":100}'::jsonb
    );
    raise exception 'Manager upload outside the canonical namespace unexpectedly succeeded.';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'visual-standards',
  'workbar-bar-milk-fridge-standard/100-first.jpg',
  '00000000-0000-0000-0000-000000000001',
  '{"mimetype":"image/jpeg","size":2048}'::jsonb
);

select public.publish_visual_standard(
  'workbar-bar-milk-fridge-standard',
  'workbar-bar-milk-fridge-standard/100-first.jpg',
  'image/jpeg',
  2048,
  'First publication'
);

do $$
declare
  v_standard public.visual_standards;
begin
  select * into v_standard
  from public.visual_standards
  where canonical_key = 'workbar-bar-milk-fridge-standard';

  if v_standard.active_version <> 1
     or v_standard.active_asset_path <> 'workbar-bar-milk-fridge-standard/100-first.jpg'
     or v_standard.status <> 'published'
     or v_standard.updated_by_name <> 'Test Manager' then
    raise exception 'First publication was not activated correctly.';
  end if;

  if (select count(*) from public.visual_standard_versions where visual_standard_id = v_standard.id) <> 1 then
    raise exception 'Expected one history row after first publication.';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.publish_visual_standard(
      'workbar-bar-milk-fridge-standard',
      'workbar-bar-milk-fridge-standard/missing.jpg',
      'image/jpeg',
      2048,
      'Must fail'
    );
    raise exception 'Missing asset publication unexpectedly succeeded.';
  exception
    when others then
      if sqlerrm = 'Missing asset publication unexpectedly succeeded.' then
        raise;
      end if;
  end;

  if (
    select active_asset_path
    from public.visual_standards
    where canonical_key = 'workbar-bar-milk-fridge-standard'
  ) <> 'workbar-bar-milk-fridge-standard/100-first.jpg' then
    raise exception 'Failed publication changed the active standard.';
  end if;
end;
$$;

reset role;
insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'visual-standards',
  'workbar-bar-milk-fridge-standard/nested/manager-input.jpg',
  '00000000-0000-0000-0000-000000000001',
  '{"mimetype":"image/jpeg","size":512}'::jsonb
);
set role authenticated;

do $$
begin
  begin
    perform public.publish_visual_standard(
      'workbar-bar-milk-fridge-standard',
      'workbar-bar-milk-fridge-standard/nested/manager-input.jpg',
      'image/jpeg',
      512,
      'Invalid namespace'
    );
    raise exception 'Nested arbitrary asset path publication unexpectedly succeeded.';
  exception
    when raise_exception then
      if sqlerrm = 'Nested arbitrary asset path publication unexpectedly succeeded.' then
        raise;
      end if;
  end;
end;
$$;

insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'visual-standards',
  'workbar-bar-milk-fridge-standard/200-second.png',
  '00000000-0000-0000-0000-000000000001',
  '{"mimetype":"image/png","size":4096}'::jsonb
);

select public.publish_visual_standard(
  'workbar-bar-milk-fridge-standard',
  'workbar-bar-milk-fridge-standard/200-second.png',
  'image/png',
  4096,
  'Second publication'
);

select public.restore_visual_standard_version(
  'workbar-bar-milk-fridge-standard',
  (
    select id
    from public.visual_standard_versions
    where canonical_key = 'workbar-bar-milk-fridge-standard'
      and version = 1
  ),
  'Restore test'
);

do $$
declare
  v_deleted integer;
  v_standard public.visual_standards;
begin
  select * into v_standard
  from public.visual_standards
  where canonical_key = 'workbar-bar-milk-fridge-standard';

  if v_standard.active_version <> 3
     or v_standard.active_asset_path <> 'workbar-bar-milk-fridge-standard/100-first.jpg' then
    raise exception 'Restore did not create and activate monotonic version 3.';
  end if;

  if not exists (
    select 1
    from public.visual_standard_versions
    where id = v_standard.active_version_id
      and restored_from_version_id is not null
  ) then
    raise exception 'Restore history does not link to its source version.';
  end if;

  if (select count(*) from public.visual_standard_versions where canonical_key = v_standard.canonical_key) <> 3 then
    raise exception 'Manager history access did not return all three versions.';
  end if;

  delete from storage.objects
  where bucket_id = 'visual-standards'
    and name = 'workbar-bar-milk-fridge-standard/200-second.png';
  get diagnostics v_deleted = row_count;
  if v_deleted <> 0 then
    raise exception 'A retained historical asset was deleted.';
  end if;

  delete from storage.objects
  where bucket_id = 'visual-standards'
    and name = 'workbar-bar-milk-fridge-standard/nested/manager-input.jpg';
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    raise exception 'Manager orphan cleanup did not remove the unreferenced object.';
  end if;
end;
$$;

reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set role authenticated;

do $$
begin
  if (select count(*) from public.visual_standards) <> 1 then
    raise exception 'Staff should read only published active standards.';
  end if;
  if (select count(*) from public.visual_standard_versions) <> 0 then
    raise exception 'Staff must not read Visual Standard history metadata.';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'visual-standards') <> 0 then
    raise exception 'Staff must not list or directly read active or historical Storage objects.';
  end if;

  begin
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'visual-standards',
      'self-service-station-overview-standard/300-staff-write.jpg',
      '00000000-0000-0000-0000-000000000002',
      '{"mimetype":"image/jpeg","size":100}'::jsonb
    );
    raise exception 'Staff upload unexpectedly succeeded.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.publish_visual_standard(
      'workbar-bar-milk-fridge-standard',
      'workbar-bar-milk-fridge-standard/100-first.jpg',
      'image/jpeg',
      2048,
      null
    );
    raise exception 'Staff publication unexpectedly succeeded.';
  exception
    when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm = 'Staff publication unexpectedly succeeded.' then
        raise;
      end if;
  end;

  begin
    perform public.restore_visual_standard_version(
      'workbar-bar-milk-fridge-standard',
      gen_random_uuid(),
      null
    );
    raise exception 'Staff restore unexpectedly succeeded.';
  exception
    when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm = 'Staff restore unexpectedly succeeded.' then
        raise;
      end if;
  end;
end;
$$;

reset role;
set role anon;

do $$
begin
  if (select count(*) from public.visual_standards) <> 1 then
    raise exception 'Anonymous staff-code clients should read published active metadata only.';
  end if;

  begin
    perform (select count(*) from storage.objects where bucket_id = 'visual-standards');
    raise exception 'Anonymous direct Storage access unexpectedly succeeded.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.publish_visual_standard(
      'workbar-bar-milk-fridge-standard',
      'workbar-bar-milk-fridge-standard/100-first.jpg',
      'image/jpeg',
      2048,
      null
    );
    raise exception 'Anonymous publication unexpectedly succeeded.';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.publish_visual_standard(text,text,text,bigint,text)',
    'execute'
  ) then
    raise exception 'Anonymous clients retain publish execute permission.';
  end if;
  if has_function_privilege(
    'anon',
    'public.restore_visual_standard_version(text,uuid,text)',
    'execute'
  ) then
    raise exception 'Anonymous clients retain restore execute permission.';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.publish_visual_standard(text,text,text,bigint,text)',
    'execute'
  ) then
    raise exception 'Authenticated managers cannot execute publish.';
  end if;
  if (
    select count(*)
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'publish_visual_standard',
        'restore_visual_standard_version'
      )
      and procedure.prosecdef
      and exists (
        select 1
        from unnest(procedure.proconfig) setting
        where setting like 'search_path=%'
      )
  ) <> 2 then
    raise exception 'Visual Standard SECURITY DEFINER functions need explicit search_path settings.';
  end if;
  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'visual-standards'
      and name = 'workbar-bar-milk-fridge-standard/200-second.png'
  ) then
    raise exception 'The previously active historical asset was not retained.';
  end if;
end;
$$;

select 'visual standards private delivery migration tests passed' as result;
