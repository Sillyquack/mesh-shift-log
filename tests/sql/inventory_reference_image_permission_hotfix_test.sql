begin;

insert into auth.users (id)
values
  ('20000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002');

insert into public.organizations (id, name, slug)
values (
  '10000000-0000-4000-8000-000000000001',
  'Inventory image hotfix test',
  'inventory-image-hotfix-test'
);

insert into public.user_profiles (id, organization_id, display_name, role)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Test Manager',
    'manager'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'Test Staff',
    'staff'
  );

insert into public.inventory_locations (
  id,
  organization_id,
  name,
  active,
  countable
)
values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Inventory image hotfix location',
  true,
  true
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'inventory-location-reference-images',
  'inventory-location-reference-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do nothing;

do $$
declare
  v_definition text;
begin
  if not has_function_privilege(
    'authenticated',
    'public.inventory_reference_image_path_valid(uuid,uuid,text)',
    'execute'
  ) then
    raise exception 'Authenticated users cannot execute the reference-image path validator.';
  end if;

  if has_function_privilege(
    'anon',
    'public.inventory_reference_image_path_valid(uuid,uuid,text)',
    'execute'
  ) then
    raise exception 'Anonymous users unexpectedly retain validator execute permission.';
  end if;

  select pg_get_functiondef(procedure.oid)
  into v_definition
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'inventory_reference_image_path_valid'
    and procedure.pronargs = 3;

  if not exists (
    select 1
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    join pg_language language on language.oid = procedure.prolang
    where namespace.nspname = 'public'
      and procedure.proname = 'inventory_reference_image_path_valid'
      and procedure.pronargs = 3
      and language.lanname = 'sql'
      and not procedure.prosecdef
      and procedure.provolatile = 'i'
  ) then
    raise exception 'The validator must remain an immutable SQL SECURITY INVOKER function.';
  end if;

  if v_definition ~* '\m(insert|update|delete|merge|perform|execute|from)\M' then
    raise exception 'The validator unexpectedly reads data or performs writes.';
  end if;

  if (
    select count(*)
    from pg_policy policy
    join pg_class relation on relation.oid = policy.polrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'storage'
      and relation.relname = 'objects'
      and policy.polname in (
        'inventory_reference_images_insert',
        'inventory_reference_images_delete'
      )
      and policy.polroles = array['authenticated'::regrole::oid]
      and (
        coalesce(pg_get_expr(policy.polqual, policy.polrelid), '')
        || coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '')
      ) like '%inventory_reference_image_path_valid%'
  ) <> 2 then
    raise exception 'Expected exactly two authenticated Storage policies to invoke the validator.';
  end if;

  if exists (
    select 1
    from pg_policy policy
    join pg_class relation on relation.oid = policy.polrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'storage'
      and relation.relname = 'objects'
      and policy.polname in (
        'inventory_reference_images_insert',
        'inventory_reference_images_delete'
      )
      and replace(
        coalesce(pg_get_expr(policy.polqual, policy.polrelid), '')
        || coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), ''),
        '"',
        ''
      ) like '%split_part(location.name,%'
  ) then
    raise exception 'A Storage policy still binds the object path to inventory_locations.name.';
  end if;
end;
$$;

set request.jwt.claim.sub = '20000000-0000-4000-8000-000000000001';
set role authenticated;

do $$
begin
  if not public.inventory_reference_image_path_valid(
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001.jpg'
  ) then
    raise exception 'The manager Storage object path did not pass the validator.';
  end if;
end;
$$;

insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'inventory-location-reference-images',
  '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001.jpg',
  '20000000-0000-4000-8000-000000000001',
  '{"mimetype":"image/jpeg","size":100}'::jsonb
);

reset role;
set request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
set role authenticated;

do $$
begin
  if not public.inventory_reference_image_path_valid(
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000002.jpg'
  ) then
    raise exception 'Authenticated staff cannot execute the pure validator.';
  end if;

  begin
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'inventory-location-reference-images',
      '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000002.jpg',
      '20000000-0000-4000-8000-000000000002',
      '{"mimetype":"image/jpeg","size":100}'::jsonb
    );
    raise exception 'Ordinary staff Storage upload unexpectedly succeeded.';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set role anon;

do $$
begin
  begin
    perform public.inventory_reference_image_path_valid(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000003.jpg'
    );
    raise exception 'Anonymous validator execution unexpectedly succeeded.';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
begin
  if has_table_privilege('anon', 'public.visual_standard_versions', 'select') then
    raise exception 'Anonymous Visual Standards history access was widened.';
  end if;

  if has_table_privilege('authenticated', 'public.visual_standards', 'insert')
     or has_table_privilege('authenticated', 'public.visual_standards', 'update')
     or has_table_privilege('authenticated', 'public.visual_standards', 'delete')
     or has_table_privilege('authenticated', 'public.visual_standard_versions', 'insert')
     or has_table_privilege('authenticated', 'public.visual_standard_versions', 'update')
     or has_table_privilege('authenticated', 'public.visual_standard_versions', 'delete') then
    raise exception 'Authenticated Visual Standards table write privileges were widened.';
  end if;

  if (
    select count(*)
    from pg_policy policy
    join pg_class relation on relation.oid = policy.polrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and (
        (relation.relname = 'visual_standards'
          and policy.polname in (
            'visual_standards_read_published_anon',
            'visual_standards_read_active_staff_or_manager'
          ))
        or (relation.relname = 'visual_standard_versions'
          and policy.polname = 'visual_standard_versions_read_manager')
      )
  ) <> 3 then
    raise exception 'Visual Standards read/history policies changed unexpectedly.';
  end if;
end;
$$;

rollback;

select 'inventory reference-image validator permission hotfix tests passed' as result;
