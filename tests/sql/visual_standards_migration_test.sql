set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

do $$
begin
  if (select count(*) from public.visual_standards) <> 10 then
    raise exception 'Expected ten seeded canonical standards for manager.';
  end if;
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
    raise exception 'Staff must not read Visual Standard history.';
  end if;

  begin
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'visual-standards',
      'self-service-station-overview-standard/staff-write.jpg',
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
end;
$$;

reset role;
set role anon;

do $$
begin
  if (select count(*) from public.visual_standards) <> 1 then
    raise exception 'Anonymous staff-code clients should read published standards only.';
  end if;

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

select 'visual standards migration tests passed' as result;
