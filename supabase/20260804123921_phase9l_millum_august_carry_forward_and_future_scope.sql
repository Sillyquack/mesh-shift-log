-- Phase 9L: one audited August carry-forward export and complete future count scope.
-- Apply after Phase 9K. Approved count sessions and lines remain immutable.

create table inventory_private.inventory_millum_export_session_values (
  session_id uuid not null references public.inventory_count_sessions(id),
  profile_id uuid not null references public.inventory_millum_export_profiles(id),
  row_key text not null,
  final_value numeric not null,
  source_label text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  primary key (session_id, profile_id, row_key),
  foreign key (profile_id, row_key)
    references public.inventory_millum_export_rows(profile_id, row_key),
  constraint inventory_millum_export_session_values_nonnegative
    check (final_value >= 0 and final_value::text not in ('NaN', 'Infinity', '-Infinity')),
  constraint inventory_millum_export_session_values_source_required
    check (nullif(trim(source_label), '') is not null),
  constraint inventory_millum_export_session_values_reason_required
    check (nullif(trim(reason), '') is not null)
);

revoke all on table inventory_private.inventory_millum_export_session_values
  from public, anon, authenticated;

-- Preserve the already deployed multi-session builder behind a private name.
alter function public.get_inventory_millum_export(uuid)
  set schema inventory_private;
alter function inventory_private.get_inventory_millum_export(uuid)
  rename to get_inventory_millum_export_v2_base;
revoke all on function inventory_private.get_inventory_millum_export_v2_base(uuid)
  from public, anon, authenticated;

create or replace function public.get_inventory_millum_export(input_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session public.inventory_count_sessions%rowtype;
  v_profile public.inventory_millum_export_profiles%rowtype;
  v_snapshot public.inventory_millum_export_snapshots%rowtype;
  v_override inventory_private.inventory_millum_export_session_values%rowtype;
  v_payload jsonb;
  v_row jsonb;
  v_group_index integer;
  v_row_index integer;
  v_diagnostics jsonb;
  v_source_digest text;
begin
  -- The private base performs the manager, shared-device, organization and
  -- approved-session checks before returning any mapping or converted value.
  v_payload := inventory_private.get_inventory_millum_export_v2_base(input_session_id);
  if nullif(v_payload->>'snapshotId', '') is not null then return v_payload; end if;

  select * into v_actor from public.inventory_resolve_actor(null);
  select session.* into v_session
  from public.inventory_count_sessions session
  where session.id = input_session_id
    and session.organization_id = v_actor.organization_id
    and session.status = 'approved';
  if v_session.id is null then raise exception 'Approved Stock Count not found for this organization.'; end if;

  select profile.* into v_profile
  from public.inventory_millum_export_profiles profile
  where profile.organization_id = v_actor.organization_id
    and profile.profile_key = v_payload->>'profileKey'
    and profile.profile_version = (v_payload->>'profileVersion')::integer;
  if v_profile.id is null then raise exception 'Millum export profile not found for the approved count.'; end if;

  for v_override in
    select value.*
    from inventory_private.inventory_millum_export_session_values value
    where value.session_id = v_session.id and value.profile_id = v_profile.id
    order by value.row_key
  loop
    for v_group_index in 0..jsonb_array_length(v_payload->'groups') - 1 loop
      for v_row_index in 0..jsonb_array_length(v_payload->'groups'->v_group_index->'rows') - 1 loop
        v_row := v_payload->'groups'->v_group_index->'rows'->v_row_index;
        if v_row->>'rowKey' = v_override.row_key and v_row->>'state' = 'missing' then
          v_row := jsonb_set(v_row, '{state}', '"ready"'::jsonb, true);
          v_row := jsonb_set(v_row, '{finalValueNumeric}', to_jsonb(v_override.final_value), true);
          v_row := jsonb_set(
            v_row,
            '{finalValue}',
            to_jsonb(inventory_private.inventory_millum_format_value(v_override.final_value)),
            true
          );
          v_payload := jsonb_set(
            v_payload,
            array['groups', v_group_index::text, 'rows', v_row_index::text],
            v_row,
            true
          );
        end if;
      end loop;
    end loop;
  end loop;

  select coalesce(jsonb_agg(diagnostic order by ordinal), '[]'::jsonb)
  into v_diagnostics
  from jsonb_array_elements(coalesce(v_payload->'diagnostics', '[]'::jsonb))
    with ordinality as item(diagnostic, ordinal)
  where not (
    diagnostic->>'code' = 'missing_quantity'
    and exists (
      select 1
      from inventory_private.inventory_millum_export_session_values value
      where value.session_id = v_session.id
        and value.profile_id = v_profile.id
        and value.row_key = diagnostic->>'rowKey'
    )
  );

  v_payload := jsonb_set(v_payload, '{diagnostics}', v_diagnostics, true);
  v_payload := jsonb_set(
    v_payload,
    '{ready}',
    to_jsonb(jsonb_array_length(v_diagnostics) = 0),
    true
  );

  if jsonb_array_length(v_diagnostics) > 0 then return v_payload; end if;

  select md5(jsonb_build_object(
    'basePayload', v_payload - 'snapshotId',
    'sessionValues', coalesce((
      select jsonb_agg(to_jsonb(value) order by value.row_key)
      from inventory_private.inventory_millum_export_session_values value
      where value.session_id = v_session.id and value.profile_id = v_profile.id
    ), '[]'::jsonb)
  )::text) into v_source_digest;

  insert into public.inventory_millum_export_snapshots (
    organization_id, session_id, profile_id, profile_version,
    source_digest, payload, created_by_auth_user_id
  ) values (
    v_actor.organization_id, v_session.id, v_profile.id, v_profile.profile_version,
    v_source_digest, v_payload, v_actor.actor_auth_user_id
  ) on conflict (session_id, profile_id) do nothing;

  select snapshot.* into v_snapshot
  from public.inventory_millum_export_snapshots snapshot
  where snapshot.session_id = v_session.id and snapshot.profile_id = v_profile.id;
  return jsonb_set(v_snapshot.payload, '{snapshotId}', to_jsonb(v_snapshot.id), true);
end;
$$;

revoke all on function public.get_inventory_millum_export(uuid)
  from public, anon, authenticated;
grant execute on function public.get_inventory_millum_export(uuid) to authenticated;

-- These values apply only to the approved 2026-08-04 shelf/storage session.
-- They are explicit carry-forwards from the prior physical count, except the
-- AASS Pils value which is 5.0 - (19 * 0.4 / 30), rounded for Millum entry.
do $$
begin
  if (select count(*)
      from public.inventory_count_sessions session
      join public.inventory_millum_export_profiles profile
        on profile.organization_id = session.organization_id
       and profile.profile_key = 'my-work-bar-jul'
       and profile.profile_version = 2
      where session.title = 'August stock count - Bar Shelves and Main Storage - 2026-08-04'
        and session.count_date = date '2026-08-04'
        and session.status = 'approved') <> 1 then
    raise exception 'Phase 9L requires exactly one approved August shelf/storage source session.';
  end if;
end;
$$;

insert into inventory_private.inventory_millum_export_session_values (
  session_id, profile_id, row_key, final_value, source_label, reason
)
select session.id, profile.id, source.row_key, source.final_value,
  'Youngs_stocktaking_Millum_tydelig.xlsx', source.reason
from public.inventory_count_sessions session
join public.inventory_millum_export_profiles profile
  on profile.organization_id = session.organization_id
 and profile.profile_key = 'my-work-bar-jul'
 and profile.profile_version = 2
cross join (values
  ('sodas-01-5744222-1', 0::numeric, 'Unchanged from prior physical count; explicit zero.'),
  ('sodas-04-6681001-1', 144::numeric, 'Unchanged from prior physical count.'),
  ('sodas-19-6017933-1', 1::numeric, 'Unchanged from prior physical count.'),
  ('beer-02-6152995-1', 0::numeric, 'Unchanged from prior physical count; explicit zero.'),
  ('beer-03-6152979-1', 0.3::numeric, 'Unchanged from prior physical count.'),
  ('beer-04-4019089-1', 4.75::numeric, 'Prior 5.0 keg equivalents less 19 sales of 0.4 L from a 30 L keg.'),
  ('cocktail-ingredients-01-2446276-1', 9::numeric, 'Unchanged from prior physical count.'),
  ('cocktail-ingredients-02-4043579-1', 0::numeric, 'Unchanged from prior physical count; explicit zero.'),
  ('cocktail-ingredients-03-4043495-1', 0::numeric, 'Unchanged from prior physical count; explicit zero.'),
  ('cocktail-ingredients-04-4043535-1', 2::numeric, 'Unchanged from prior physical count.')
) source(row_key, final_value, reason)
where session.title = 'August stock count - Bar Shelves and Main Storage - 2026-08-04'
  and session.count_date = date '2026-08-04'
  and session.status = 'approved';

-- Future monthly counts must collect these values physically instead of using
-- the one-session carry-forward above. Existing approved snapshots are untouched.
update public.inventory_products product
set count_mode = 'keg_fraction', container_capacity_liters = null,
    unit_label = 'keg', updated_at = now()
where product.millum_item_ref in ('6152995', '6152979', '4019089')
  and (product.count_mode, product.container_capacity_liters, product.unit_label)
      is distinct from ('keg_fraction', null::numeric, 'keg');

insert into public.inventory_location_products (
  organization_id, location_id, product_id, par_quantity, count_order,
  active, notes, stock_policy, contributes_to_storage_target
)
select location.organization_id, location.id, product.id, 0, source.count_order,
  true, 'Required physical line for complete Millum monthly export.',
  'physical_count_only', false
from public.inventory_locations location
join public.inventory_products product on product.organization_id = location.organization_id
join (values
  ('5744222', 30), ('6681001', 31), ('6017933', 32),
  ('6152995', 33), ('6152979', 34), ('4019089', 35),
  ('2446276', 301), ('4043579', 302), ('4043495', 303), ('4043535', 304)
) source(millum_item_ref, count_order) on source.millum_item_ref = product.millum_item_ref
where upper(trim(location.code)) = 'MAIN_STORAGE'
on conflict (location_id, product_id) do update
set active = true,
    par_quantity = 0,
    count_order = excluded.count_order,
    notes = excluded.notes,
    stock_policy = 'physical_count_only',
    contributes_to_storage_target = false,
    updated_at = now();

do $$
begin
  if (select count(*) from inventory_private.inventory_millum_export_session_values) <> 10 then
    raise exception 'Phase 9L requires exactly ten audited August session values.';
  end if;
  if (select count(*)
      from public.inventory_location_products standard
      join public.inventory_locations location on location.id = standard.location_id
      join public.inventory_products product on product.id = standard.product_id
      where upper(trim(location.code)) = 'MAIN_STORAGE'
        and standard.active
        and product.millum_item_ref in (
          '5744222','6681001','6017933','6152995','6152979',
          '4019089','2446276','4043579','4043495','4043535'
        )) <> 10 then
    raise exception 'Phase 9L failed to install ten future Main Storage count lines.';
  end if;
end;
$$;
