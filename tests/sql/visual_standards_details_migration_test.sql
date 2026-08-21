do $$
begin
  if (
    select count(*)
    from public.visual_standards
    where is_visible
      and area = 'Self-Service Station'
  ) <> 9 then
    raise exception 'Expected exactly nine visible Self-Service standards.';
  end if;

  if (
    select count(*)
    from public.visual_standards
    where is_visible
  ) <> 11 then
    raise exception 'Expected eleven visible standards including the two Workbar standards.';
  end if;

  if (
    select count(*)
    from public.visual_standards
    where canonical_key in (
      'self-service-coffee-service-standard',
      'self-service-takeaway-coffee-standard',
      'self-service-glassware-serviceware-standard',
      'self-service-food-display-standard'
    )
      and not is_visible
  ) <> 4 then
    raise exception 'Legacy Self-Service rows were not retained and hidden.';
  end if;

  if (select count(*) from public.visual_standard_aliases) <> 4 then
    raise exception 'Expected four explicit legacy aliases.';
  end if;

  if (
    select count(*)
    from public.visual_standard_detail_slots
    where canonical_key = 'self-service-backstock-standard'
      and detail_key in ('cabinet-1', 'cabinet-2', 'cabinet-3')
      and status = 'awaiting_asset'
  ) <> 3 then
    raise exception 'Backstock cabinet detail slots were not prepared.';
  end if;
end;
$$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'visual-standards',
  'self-service-backstock-standard/details/cabinet-1/100-cabinet.jpg',
  '00000000-0000-0000-0000-000000000001',
  '{"mimetype":"image/jpeg","size":2048}'::jsonb
);

select public.publish_visual_standard_detail(
  'self-service-backstock-standard',
  'cabinet-1',
  'Cabinet 1',
  1,
  'self-service-backstock-standard/details/cabinet-1/100-cabinet.jpg',
  'image/jpeg',
  2048,
  'Cabinet detail publication'
);

do $$
declare
  v_active_path text;
begin
  select active_asset_path
  into v_active_path
  from public.visual_standard_detail_slots
  where canonical_key = 'self-service-backstock-standard'
    and detail_key = 'cabinet-1';

  if v_active_path <> 'self-service-backstock-standard/details/cabinet-1/100-cabinet.jpg' then
    raise exception 'Detail publication did not activate the uploaded detail.';
  end if;

  if not exists (
    select 1
    from public.visual_standard_versions
    where canonical_key = 'self-service-backstock-standard'
      and asset_role = 'detail'
      and detail_key = 'cabinet-1'
      and detail_label = 'Cabinet 1'
      and detail_order = 1
  ) then
    raise exception 'Detail publication history is incomplete.';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.publish_visual_standard_detail(
      'self-service-backstock-standard',
      'cabinet-1',
      'Cabinet 1',
      1,
      'self-service-backstock-standard/details/cabinet-1/missing.jpg',
      'image/jpeg',
      2048,
      'Must fail'
    );
    raise exception 'Missing detail asset publication unexpectedly succeeded.';
  exception
    when others then
      if sqlerrm = 'Missing detail asset publication unexpectedly succeeded.' then
        raise;
      end if;
  end;

  if (
    select active_asset_path
    from public.visual_standard_detail_slots
    where canonical_key = 'self-service-backstock-standard'
      and detail_key = 'cabinet-1'
  ) <> 'self-service-backstock-standard/details/cabinet-1/100-cabinet.jpg' then
    raise exception 'Failed detail publication changed the prior active detail.';
  end if;
end;
$$;

insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'visual-standards',
  'self-service-backstock-standard/200-primary.jpg',
  '00000000-0000-0000-0000-000000000001',
  '{"mimetype":"image/jpeg","size":4096}'::jsonb
);

select public.publish_visual_standard(
  'self-service-backstock-standard',
  'self-service-backstock-standard/200-primary.jpg',
  'image/jpeg',
  4096,
  'Primary still works'
);

do $$
begin
  if (
    select active_asset_path
    from public.visual_standards
    where canonical_key = 'self-service-backstock-standard'
  ) <> 'self-service-backstock-standard/200-primary.jpg' then
    raise exception 'Existing single-image primary publication stopped working.';
  end if;

  if (
    select asset_role
    from public.visual_standard_versions
    where canonical_key = 'self-service-backstock-standard'
      and asset_path = 'self-service-backstock-standard/200-primary.jpg'
  ) <> 'primary' then
    raise exception 'Primary publication history was not retained as primary.';
  end if;
end;
$$;

select public.restore_visual_standard_detail_version(
  'self-service-backstock-standard',
  'cabinet-1',
  (
    select id
    from public.visual_standard_versions
    where canonical_key = 'self-service-backstock-standard'
      and asset_role = 'detail'
      and detail_key = 'cabinet-1'
    order by version
    limit 1
  ),
  'Detail restore test'
);

do $$
begin
  if not exists (
    select 1
    from public.visual_standard_versions version
    join public.visual_standard_detail_slots detail
      on detail.active_version_id = version.id
    where detail.canonical_key = 'self-service-backstock-standard'
      and detail.detail_key = 'cabinet-1'
      and version.asset_role = 'detail'
      and version.restored_from_version_id is not null
  ) then
    raise exception 'Detail restore did not create an audited active version.';
  end if;
end;
$$;

reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set role authenticated;

do $$
begin
  if (
    select count(*)
    from public.visual_standards
    where canonical_key = 'self-service-backstock-standard'
  ) <> 1 then
    raise exception 'Staff cannot read the published primary standard.';
  end if;

  if (
    select count(*)
    from public.visual_standard_detail_slots
    where canonical_key = 'self-service-backstock-standard'
  ) <> 1 then
    raise exception 'Staff should see only the one published cabinet detail.';
  end if;

  if (select count(*) from public.visual_standard_versions) <> 0 then
    raise exception 'Staff can retrieve history-only detail assets.';
  end if;

  if (select count(*) from storage.objects where bucket_id = 'visual-standards') <> 0 then
    raise exception 'Staff can directly retrieve private current or historical detail objects.';
  end if;

  begin
    perform public.publish_visual_standard_detail(
      'self-service-backstock-standard',
      'cabinet-2',
      'Cabinet 2',
      2,
      'self-service-backstock-standard/details/cabinet-2/300-staff.jpg',
      'image/jpeg',
      100,
      null
    );
    raise exception 'Staff detail publication unexpectedly succeeded.';
  exception
    when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm = 'Staff detail publication unexpectedly succeeded.' then
        raise;
      end if;
  end;
end;
$$;

reset role;
set role anon;

do $$
begin
  if (
    select count(*)
    from public.visual_standard_detail_slots
    where canonical_key = 'self-service-backstock-standard'
  ) <> 1 then
    raise exception 'Anonymous staff-code clients should see the active detail only.';
  end if;

  if (select count(*) from public.visual_standard_aliases) <> 4 then
    raise exception 'Anonymous guide clients cannot resolve the alias registry.';
  end if;
end;
$$;

reset role;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.publish_visual_standard_detail(text,text,text,integer,text,text,bigint,text)',
    'execute'
  ) then
    raise exception 'Anonymous clients retain detail publish execute permission.';
  end if;

  if has_function_privilege(
    'anon',
    'public.restore_visual_standard_detail_version(text,text,uuid,text)',
    'execute'
  ) then
    raise exception 'Anonymous clients retain detail restore execute permission.';
  end if;

  if (
    select count(*)
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'publish_visual_standard',
        'restore_visual_standard_version',
        'publish_visual_standard_detail',
        'restore_visual_standard_detail_version'
      )
      and procedure.prosecdef
      and exists (
        select 1
        from unnest(procedure.proconfig) setting
        where setting like 'search_path=%'
      )
  ) <> 4 then
    raise exception 'Visual Standard SECURITY DEFINER functions need explicit search_path settings.';
  end if;
end;
$$;

select 'visual standards taxonomy/detail migration tests passed' as result;
