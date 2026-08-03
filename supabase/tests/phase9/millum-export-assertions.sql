-- Executable Phase 9I manager-only Millum export assertions.

create schema phase9i_test;
revoke all on schema phase9i_test from public;
grant usage on schema phase9i_test to authenticated;

create function phase9i_test.assert_true(condition boolean, label text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'FAIL %', label; end if;
  raise notice 'PASS %', label;
end;
$$;

create function phase9i_test.assert_sqlstate(statement text, expected_state text, label text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_state then raise notice 'PASS %', label; return; end if;
    raise exception 'FAIL % (expected SQLSTATE %, received %: %)', label, expected_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL % (statement unexpectedly succeeded)', label;
end;
$$;

revoke all on function phase9i_test.assert_true(boolean, text) from public;
revoke all on function phase9i_test.assert_sqlstate(text, text, text) from public;
grant execute on function phase9i_test.assert_true(boolean, text) to authenticated;
grant execute on function phase9i_test.assert_sqlstate(text, text, text) to authenticated;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
set role authenticated;
create temp table phase9_millum_results as
select 'anchor'::text as fixture, public.get_inventory_millum_export('9a100000-0000-4000-8000-000000000001') as payload
union all
select 'partial', public.get_inventory_millum_export('9a100000-0000-4000-8000-000000000002')
union all
select 'missing', public.get_inventory_millum_export('9a100000-0000-4000-8000-000000000003')
union all
select 'extra', public.get_inventory_millum_export('9a100000-0000-4000-8000-000000000004');
reset role;

create temp table phase9_millum_anchor_rows as
select group_row.ordinality as group_order, group_row.value->>'name' as group_name,
       item_row.ordinality as enabled_order, item_row.value as row
from phase9_millum_results result,
     lateral jsonb_array_elements(result.payload->'groups') with ordinality group_row(value, ordinality),
     lateral jsonb_array_elements(group_row.value->'rows') with ordinality item_row(value, ordinality)
where result.fixture = 'anchor';

select phase9i_test.assert_true(
  (select count(*) = 3 from pg_catalog.pg_class relation join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'public' and relation.relname in ('inventory_millum_export_profiles','inventory_millum_export_rows','inventory_millum_export_snapshots')
     and relation.relrowsecurity and not relation.relforcerowsecurity),
  'DB-9I-1: all public Millum export tables use the established owner-RPC RLS boundary'
);

select phase9i_test.assert_true(
  not has_table_privilege('authenticated', 'public.inventory_millum_export_profiles', 'SELECT')
  and not has_table_privilege('authenticated', 'public.inventory_millum_export_rows', 'SELECT')
  and not has_table_privilege('authenticated', 'public.inventory_millum_export_snapshots', 'SELECT'),
  'DB-9I-2: authenticated users have no direct read grants on profile, mapping, or snapshot tables'
);

select phase9i_test.assert_true(
  not has_schema_privilege('authenticated', 'inventory_private', 'USAGE')
  and not has_schema_privilege('anon', 'inventory_private', 'USAGE'),
  'DB-9I-3: protected transformation configuration schema is not exposed to API roles'
);

select phase9i_test.assert_true(
  (select function.prosecdef and function.proconfig @> array['search_path=pg_catalog']
   from pg_catalog.pg_proc function join pg_catalog.pg_namespace namespace on namespace.oid = function.pronamespace
   where namespace.nspname = 'public' and function.proname = 'get_inventory_millum_export'),
  'DB-9I-4: manager export RPC is SECURITY DEFINER with a fixed safe search path'
);

select phase9i_test.assert_true(
  has_function_privilege('authenticated', 'public.get_inventory_millum_export(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_inventory_millum_export(uuid)', 'EXECUTE'),
  'DB-9I-5: only authenticated API users may reach the internally authorized export RPC'
);

select phase9i_test.assert_true(
  (select count(*) = 1 and min(status) = 'published' and min(manifest_row_count) = 97
   from public.inventory_millum_export_profiles
   where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and profile_version = 1),
  'DB-9I-6: organization A has one published immutable profile v1 with 97 declared rows'
);

select phase9i_test.assert_true(
  (select count(*) = 97 from public.inventory_millum_export_rows row join public.inventory_millum_export_profiles profile on profile.id = row.profile_id
   where profile.organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and profile.profile_version = 1),
  'DB-9I-7: the occurrence-specific manifest persists all 97 displayed rows'
);

select phase9i_test.assert_true(
  (select count(*) = 89 from public.inventory_millum_export_rows row join public.inventory_millum_export_profiles profile on profile.id = row.profile_id
   where profile.organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and profile.profile_version = 1 and row.enabled),
  'DB-9I-8: profile v1 enables exactly 89 non-duplicated Millum entry rows'
);

select phase9i_test.assert_true(
  (select count(*) = 8 from public.inventory_millum_export_rows row join public.inventory_millum_export_profiles profile on profile.id = row.profile_id
   where profile.organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and not row.enabled and row.mapped_product_id is null),
  'DB-9I-9: all eight disabled duplicate or cross-group positions remain preserved and unmapped'
);

select phase9i_test.assert_true(
  (select array_agg(group_name order by group_order) = array['HARD ALCOHOL','COFFEE','SNACKS','SODAS','WINE','BEER','COCKTAIL INGREDIENTS']
   from (select distinct group_name, group_order from public.inventory_millum_export_rows) groups),
  'DB-9I-10: the persisted profile preserves the seven authoritative group positions'
);

select phase9i_test.assert_true(
  (select count(*) = 7 from public.inventory_millum_export_rows row
   where row.group_name = 'HARD ALCOHOL' and row.row_order in (2,5,12,17,19,23,33)
     and not row.enabled and row.occurrence = 2),
  'DB-9I-11: every adjacent HARD ALCOHOL duplicate keeps first enabled and second disabled'
);

select phase9i_test.assert_true(
  (select count(*) = 1 from public.inventory_millum_export_rows row
   where row.item_number = '4054613' and row.enabled and row.group_name = 'BEER' and row.row_order = 9 and row.occurrence = 2)
  and (select count(*) = 1 from public.inventory_millum_export_rows row
   where row.item_number = '4054613' and not row.enabled and row.group_name = 'HARD ALCOHOL' and row.row_order = 14 and row.mapped_product_id is null),
  'DB-9I-12: 4054613 is active only in BEER row 9 and preserved disabled in HARD ALCOHOL row 14'
);

select phase9i_test.assert_true(
  not exists (select mapped_product_id from public.inventory_millum_export_rows where enabled and mapped_product_id is not null group by mapped_product_id having count(*) > 1),
  'DB-9I-13: no stable Mesh product maps to two active Millum rows'
);

select phase9i_test.assert_true(
  not exists (
    select 1 from public.inventory_millum_export_rows row join public.inventory_products product on product.id = row.mapped_product_id
    where row.enabled and product.millum_item_ref is distinct from row.item_number
  ),
  'DB-9I-14: enabled mappings are proven by stable authoritative item identity rather than product name'
);

select phase9i_test.assert_true(
  (select count(*) = 3 from inventory_private.inventory_millum_export_transforms),
  'DB-9I-15: exactly three protected transformation records belong to profile v1'
);

select phase9i_test.assert_true(
  inventory_private.inventory_millum_apply_transform(24, 'divide_round_2', 6) = 4
  and inventory_private.inventory_millum_apply_transform(160, 'divide_round_2', 60) = 2.67
  and inventory_private.inventory_millum_apply_transform(232, 'divide_round_2', 60) = 3.87,
  'DB-9I-16: authoritative wine anchors produce 4, 2.67, and 3.87 with exact numeric arithmetic'
);

select phase9i_test.assert_true(
  inventory_private.inventory_millum_apply_transform(15, 'divide_round_2', 6) = 2.5
  and inventory_private.inventory_millum_apply_transform(150, 'divide_round_2', 60) = 2.5,
  'DB-9I-17: whole and one-decimal results retain exact numeric values without unnecessary scale'
);

select phase9i_test.assert_true(
  inventory_private.inventory_millum_apply_transform(0, 'divide_round_2', 6) = 0
  and inventory_private.inventory_millum_format_value(0) = '0'
  and inventory_private.inventory_millum_format_value(2.50) = '2,5',
  'DB-9I-18: zero is legitimate and decimal-comma formatting strips trailing zeros'
);

select phase9i_test.assert_true(
  inventory_private.inventory_millum_apply_transform(0.75, 'divide_round_2', 6) = 0.13
  and inventory_private.inventory_millum_apply_transform(1.23, 'divide_round_2', 6) = 0.21,
  'DB-9I-19: positive partial quantities and third-decimal ties use deterministic half-up rounding'
);

select phase9i_test.assert_true(
  inventory_private.inventory_millum_apply_transform(null, 'divide_round_2', 6) is null,
  'DB-9I-20: null never becomes a numeric zero through the protected transformation'
);

select phase9i_test.assert_sqlstate(
  $$select inventory_private.inventory_millum_apply_transform(-1, 'divide_round_2', 6)$$,
  'P0001',
  'DB-9I-21: negative transformation input is rejected'
);

select phase9i_test.assert_true(
  (select (payload->>'ready')::boolean from phase9_millum_results where fixture = 'anchor'),
  'DB-9I-22: an approved complete immutable count produces a ready manager export'
);

select phase9i_test.assert_true(
  (select count(*) = 89 from phase9_millum_anchor_rows),
  'DB-9I-23: the clean manager response contains exactly the 89 enabled rows'
);

select phase9i_test.assert_true(
  (select array_agg(group_name order by group_order) = array['HARD ALCOHOL','COFFEE','SNACKS','SODAS','WINE','BEER','COCKTAIL INGREDIENTS']
   from (select distinct group_name, group_order from phase9_millum_anchor_rows) groups),
  'DB-9I-24: sanitized manager output preserves exact authoritative group order'
);

select phase9i_test.assert_true(
  (select row->>'finalValue' = '4' and (row->>'finalValueNumeric')::numeric = 4 from phase9_millum_anchor_rows where row->>'itemNumber' = '4000232')
  and (select row->>'finalValue' = '2,67' from phase9_millum_anchor_rows where row->>'itemNumber' = '4057913')
  and (select row->>'finalValue' = '3,87' from phase9_millum_anchor_rows where row->>'itemNumber' = '4004935'),
  'DB-9I-25: manager JSON exposes only the final formatted authoritative wine values'
);

select phase9i_test.assert_true(
  (select row->>'finalValue' = '2,5' from phase9_millum_results result,
    lateral jsonb_array_elements(result.payload->'groups') group_row,
    lateral jsonb_array_elements(group_row->'rows') row where result.fixture = 'partial' and row->>'itemNumber' = '4000232')
  and (select row->>'finalValue' = '2,5' from phase9_millum_results result,
    lateral jsonb_array_elements(result.payload->'groups') group_row,
    lateral jsonb_array_elements(group_row->'rows') row where result.fixture = 'partial' and row->>'itemNumber' = '4057913'),
  'DB-9I-26: approved partial fixture displays 15/6 and 150/60 as 2,5'
);

select phase9i_test.assert_true(
  (select row->>'finalValue' = '0' from phase9_millum_anchor_rows where row->>'itemNumber' = '131125')
  and (select row->>'finalValue' = '2,5' from phase9_millum_anchor_rows where row->>'itemNumber' = '4054613'),
  'DB-9I-27: legitimate zero and deterministic keg fractions survive the clean export'
);

select phase9i_test.assert_true(
  not exists (select 1 from phase9_millum_anchor_rows where row->>'itemNumber' = '4054613' and group_name <> 'BEER')
  and not exists (select 1 from phase9_millum_anchor_rows where row->>'itemNumber' in ('410829','2573491','585901','2295772','564757','584888','4530804') group by row->>'itemNumber' having count(*) > 1),
  'DB-9I-28: disabled duplicate and HARD 4054613 positions never receive copied clean values'
);

select phase9i_test.assert_true(
  (select payload::text !~* 'divisor|divide_round|canonical_quantity|counted_quantity|counted_whole|counted_open|source_digest|formula|factor'
   from phase9_millum_results where fixture = 'anchor'),
  'DB-9I-29: manager payload omits transformation configuration and canonical source comparisons'
);

select phase9i_test.assert_true(
  (select bool_and((select array_agg(key order by key) from jsonb_object_keys(row) key)
    = array['finalValue','finalValueNumeric','itemNumber','productName','rowKey','rowOrder','state'])
   from phase9_millum_anchor_rows),
  'DB-9I-30: every clean row is sanitized to identity, state, and final value only'
);

select phase9i_test.assert_true(
  (select payload::text !~* 'Fixture note|restock|shortage|par_quantity|counted_by|location_name'
   from phase9_millum_results where fixture = 'anchor'),
  'DB-9I-31: notes, locations, counter identity, par and shortage details do not clutter or change export data'
);

select phase9i_test.assert_true(
  not (select (payload->>'ready')::boolean from phase9_millum_results where fixture = 'missing')
  and (select count(*) > 0 from phase9_millum_results result,
       lateral jsonb_array_elements(result.payload->'diagnostics') diagnostic
       where result.fixture = 'missing' and diagnostic->>'code' = 'missing_quantity' and diagnostic->>'itemNumber' = '9082515'),
  'DB-9I-32: a missing approved source quantity blocks clean export with a visible diagnostic'
);

select phase9i_test.assert_true(
  (select row->>'state' = 'missing' and not (row ? 'finalValue') from phase9_millum_results result,
   lateral jsonb_array_elements(result.payload->'groups') group_row,
   lateral jsonb_array_elements(group_row->'rows') row
   where result.fixture = 'missing' and row->>'itemNumber' = '9082515'),
  'DB-9I-33: missing data remains visibly missing and is never serialized as zero'
);

select phase9i_test.assert_true(
  not (select (payload->>'ready')::boolean from phase9_millum_results where fixture = 'extra')
  and (select count(*) = 1 from phase9_millum_results result,
       lateral jsonb_array_elements(result.payload->'diagnostics') diagnostic
       where result.fixture = 'extra' and diagnostic->>'code' = 'counted_product_not_in_profile' and diagnostic->>'itemNumber' = '1216399'),
  'DB-9I-34: a counted Mesh product absent from July blocks export without an invented row'
);

select phase9i_test.assert_true(
  (select jsonb_array_length(payload->'mappingDiagnostics') = 8 from phase9_millum_results where fixture = 'anchor'),
  'DB-9I-35: manager-only mapping diagnostics retain all eight disabled manifest decisions separately'
);

select phase9i_test.assert_true(
  (select count(*) = 10 from public.inventory_products product
   where product.organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
     and product.millum_item_ref = any(array['1216399','2295798','3221686','3957701','4033936','4744330','5104641','5201827','6193338','6752463'])),
  'DB-9I-36: all ten Mesh products absent from July remain retained in the ordinary catalogue'
);

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
select phase9i_test.assert_sqlstate(
  $$select public.get_inventory_millum_export('a4000000-0000-4000-8000-000000000001')$$,
  'P0001',
  'DB-9I-37: an in-progress Stock Count cannot be exported'
);
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000001', false);
select phase9i_test.assert_sqlstate(
  $$select public.get_inventory_millum_export('9c100000-0000-4000-8000-000000000001')$$,
  'P0001',
  'DB-9I-38: a draft Stock Count cannot be exported'
);
select phase9i_test.assert_sqlstate(
  $$select public.get_inventory_millum_export('9a100000-0000-4000-8000-000000000001')$$,
  'P0001',
  'DB-9I-39: managers cannot retrieve another organization approved export'
);
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', false);
select phase9i_test.assert_sqlstate(
  $$select public.get_inventory_millum_export('9a100000-0000-4000-8000-000000000001')$$,
  'P0001',
  'DB-9I-40: counters cannot retrieve manager mapping diagnostics or converted output'
);
select phase9i_test.assert_sqlstate(
  $$select count(*) from public.inventory_millum_export_rows$$,
  '42501',
  'DB-9I-41: counters cannot bypass the RPC to read profile mappings directly'
);
select phase9i_test.assert_sqlstate(
  $$select inventory_private.inventory_millum_apply_transform(24, 'divide_round_2', 6)$$,
  '42501',
  'DB-9I-42: counters cannot execute or inspect protected transformations'
);
reset role;

select phase9i_test.assert_true(
  (select count(*) = 4 from public.inventory_millum_export_snapshots
   where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')
  and (select count(*) = count(distinct session_id) from public.inventory_millum_export_snapshots
       where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  'DB-9I-43: each approved session and profile association creates at most one immutable snapshot'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
set role authenticated;
select phase9i_test.assert_true(
  public.get_inventory_millum_export('9a100000-0000-4000-8000-000000000001')
    = (select payload from phase9_millum_results where fixture = 'anchor'),
  'DB-9I-44: reopening the same historical profile snapshot returns byte-logically identical JSON'
);
reset role;

select phase9i_test.assert_true(
  (select snapshot.source_digest = source.current_digest
   from public.inventory_millum_export_snapshots snapshot
   cross join lateral (
     select md5(coalesce(jsonb_agg(to_jsonb(line) order by line.id)::text, '[]')) as current_digest
     from public.inventory_count_lines line where line.session_id = snapshot.session_id
   ) source
   where snapshot.session_id = '9a100000-0000-4000-8000-000000000001'),
  'DB-9I-45: export view and snapshot generation leave approved source lines byte-logically unchanged'
);

select phase9i_test.assert_true(
  (select counted_quantity = 18 and counted_whole_units = 23 and counted_open_volume_liters = 0.75
   from public.inventory_count_lines line join public.inventory_products product on product.id = line.product_id
   where line.session_id = '9a100000-0000-4000-8000-000000000001' and product.millum_item_ref = '4000232'),
  'DB-9I-46: the immutable structured Abbazia physical source remains 23 bottles plus 0.75 L'
);

select phase9i_test.assert_sqlstate(
  $$update public.inventory_millum_export_profiles set title = title where profile_version = 1$$,
  'P0001',
  'DB-9I-47: published export profile configuration cannot be edited'
);

select phase9i_test.assert_sqlstate(
  $$delete from public.inventory_millum_export_snapshots where session_id = '9a100000-0000-4000-8000-000000000001'$$,
  'P0001',
  'DB-9I-48: generated historical export snapshots cannot be changed or deleted'
);

drop schema phase9i_test cascade;
