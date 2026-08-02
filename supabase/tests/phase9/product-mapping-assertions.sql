-- Executable Phase 9G-D authoritative product-mapping assertions.
create schema phase9gd_test;
revoke all on schema phase9gd_test from public;

create function phase9gd_test.assert_true(condition boolean, label text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'FAIL %', label; end if;
  raise notice 'PASS %', label;
end;
$$;

create table phase9gd_test.expected_products as
select * from jsonb_to_recordset($products$
[
  {"ref":"707000631","official_name":"Norwegian Blonde 24*33cl","display_name":"Norwegian Blonde","category":"Beer"},
  {"ref":"4966818","official_name":"OSLOVE PASSION BLONDE 0,33L FL OSLO (0.33 ltr)","display_name":"Oslove Passion Blonde","category":"Beer"},
  {"ref":"5932918","official_name":"AASS PILSNER 0,33L FL (0.33 ltr)","display_name":"Aass Pils","category":"Beer"},
  {"ref":"6181002","official_name":"7FJELL GINGER NINJA NORDIC BERRIES 0,33L (0.33 ltr)","display_name":"Ginger Ninja Nordic Berries","category":"Beer"},
  {"ref":"6631634","official_name":"SKOG 03 0,33L FL VILLBRYGG (0.33 ltr)","display_name":"Villbrygg Skog 03","category":"Sodas"},
  {"ref":"6388581","official_name":"FRUKTSMEKK EPLE 0,33L BX SAFTERIET (0.33 ltr)","display_name":"Fruktsmekk Eple","category":"Sodas"},
  {"ref":"5804190","official_name":"FRUKTSMEKK RABARBARA&HYLLEBLOMST 0,33L (0.33 ltr)","display_name":"Fruktsmekk Rabarbra & Hylleblomst","category":"Sodas"},
  {"ref":"6503346","official_name":"FRUKTSMEKK HYLLEBLOMST&SITRON 0,33L BX (0.33 ltr)","display_name":"Fruktsmekk Hylleblomst & Sitron","category":"Sodas"},
  {"ref":"814467","official_name":"PEPSI MAX 0,3L FL PROFIL (0.3 ltr)","display_name":"Pepsi Max","category":"Sodas"},
  {"ref":"5104666","official_name":"FARRIS NATURELL 0,375L FL PROFIL (0.375 ltr)","display_name":"Farris Naturell","category":"Sodas"},
  {"ref":"5010707","official_name":"TONIC WATER PREMIUM 0,5L FL FEVER-TREE (0.5 ltr)","display_name":"Fever-Tree Premium Indian Tonic Water","category":"Sodas"},
  {"ref":"5010715","official_name":"GINGER BEER MIXER 0,5L FL FEVER-TREE (0.5 ltr)","display_name":"Fever-Tree Ginger Beer","category":"Sodas"},
  {"ref":"6752422","official_name":"APPELSINJUICE 250ML JUICERIET (0.25 ltr)","display_name":"Appelsinjuice 250 ml","category":"Sodas"}
]
$products$::jsonb) as item(ref text, official_name text, display_name text, category text);

create table phase9gd_test.expected_defaults as
select * from jsonb_to_recordset($defaults$
[
  {"location_code":"CORNERBAR_RIGHT_FRIDGE","ref":"707000631","quantity":25,"count_order":1},
  {"location_code":"CORNERBAR_RIGHT_FRIDGE","ref":"4966818","quantity":20,"count_order":2},
  {"location_code":"CORNERBAR_RIGHT_FRIDGE","ref":"5932918","quantity":20,"count_order":4},
  {"location_code":"CORNERBAR_RIGHT_FRIDGE","ref":"6181002","quantity":10,"count_order":7},
  {"location_code":"CORNERBAR_RIGHT_FRIDGE","ref":"6631634","quantity":5,"count_order":8},
  {"location_code":"CORNERBAR_RIGHT_FRIDGE","ref":"6388581","quantity":4,"count_order":13},
  {"location_code":"CORNERBAR_RIGHT_FRIDGE","ref":"5804190","quantity":4,"count_order":14},
  {"location_code":"CORNERBAR_RIGHT_FRIDGE","ref":"6503346","quantity":4,"count_order":15},
  {"location_code":"CORNERBAR_RIGHT_FRIDGE","ref":"814467","quantity":6,"count_order":16},
  {"location_code":"CORNERBAR_RIGHT_FRIDGE","ref":"5104666","quantity":6,"count_order":17},
  {"location_code":"WORKBAR_BAR_RIGHT_FRIDGE","ref":"5010715","quantity":2,"count_order":3},
  {"location_code":"WORKBAR_BAR_RIGHT_FRIDGE","ref":"5010707","quantity":2,"count_order":4},
  {"location_code":"WORKBAR_BAR_RIGHT_FRIDGE","ref":"5104666","quantity":6,"count_order":8},
  {"location_code":"WORKBAR_NON_ALCO_FRIDGE","ref":"6388581","quantity":12,"count_order":3},
  {"location_code":"WORKBAR_NON_ALCO_FRIDGE","ref":"6752422","quantity":16,"count_order":5},
  {"location_code":"WORKBAR_NON_ALCO_FRIDGE","ref":"5104666","quantity":20,"count_order":7},
  {"location_code":"WORKBAR_NON_ALCO_FRIDGE","ref":"6631634","quantity":20,"count_order":15}
]
$defaults$::jsonb) as item(location_code text, ref text, quantity numeric, count_order integer);

create table phase9gd_test.expected_resolutions as
select * from jsonb_to_recordset($resolutions$
[
  {"location_code":"CORNERBAR_RIGHT_FRIDGE","requested_name":"Blonde","ref":"707000631"},
  {"location_code":"CORNERBAR_RIGHT_FRIDGE","requested_name":"Passion","ref":"4966818"},
  {"location_code":"CORNERBAR_RIGHT_FRIDGE","requested_name":"Pils","ref":"5932918"},
  {"location_code":"CORNERBAR_RIGHT_FRIDGE","requested_name":"Ginger Ninja","ref":"6181002"},
  {"location_code":"CORNERBAR_RIGHT_FRIDGE","requested_name":"Skog","ref":"6631634"},
  {"location_code":"CORNERBAR_RIGHT_FRIDGE","requested_name":"Eple","ref":"6388581"},
  {"location_code":"CORNERBAR_RIGHT_FRIDGE","requested_name":"Rabarbra","ref":"5804190"},
  {"location_code":"CORNERBAR_RIGHT_FRIDGE","requested_name":"Hylle","ref":"6503346"},
  {"location_code":"CORNERBAR_RIGHT_FRIDGE","requested_name":"Pepsi","ref":"814467"},
  {"location_code":"CORNERBAR_RIGHT_FRIDGE","requested_name":"Farris","ref":"5104666"},
  {"location_code":"WORKBAR_BAR_RIGHT_FRIDGE","requested_name":"Farris","ref":"5104666"},
  {"location_code":"WORKBAR_NON_ALCO_FRIDGE","requested_name":"Eple & Eple","ref":"6388581"},
  {"location_code":"WORKBAR_NON_ALCO_FRIDGE","requested_name":"Appelsinjuice","ref":"6752422"},
  {"location_code":"WORKBAR_NON_ALCO_FRIDGE","requested_name":"Farris","ref":"5104666"},
  {"location_code":"WORKBAR_NON_ALCO_FRIDGE","requested_name":"Skog","ref":"6631634"}
]
$resolutions$::jsonb) as item(location_code text, requested_name text, ref text);

select phase9gd_test.assert_true(
  (select count(*) = 13 and count(distinct product.id) = 13
   from phase9gd_test.expected_products expected
   join public.inventory_products product
     on product.organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    and product.millum_item_ref = expected.ref),
  'DB-9GD-1: all 13 authoritative Millum references resolve to distinct stable UUIDs'
);

select phase9gd_test.assert_true(
  not exists (
    select 1 from phase9gd_test.expected_products expected
    join public.inventory_products product
      on product.organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
     and product.millum_item_ref = expected.ref
    where product.name is distinct from expected.official_name
       or product.short_name is distinct from expected.display_name
       or product.category is distinct from expected.category
       or product.unit_label is distinct from 'unit'
  ),
  'DB-9GD-2: official names stay exact while operational names and inventory units are mapped separately'
);

select phase9gd_test.assert_true(
  (select count(*) = 17
   from phase9gd_test.expected_defaults expected
   join public.inventory_locations location
     on location.organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    and location.code = expected.location_code
   join public.inventory_products product
     on product.organization_id = location.organization_id
    and product.millum_item_ref = expected.ref
   join public.inventory_location_products standard
     on standard.location_id = location.id and standard.product_id = product.id
   where standard.active
     and standard.par_quantity = expected.quantity
     and standard.count_order = expected.count_order
     and standard.stock_policy = 'exact_par'),
  'DB-9GD-3: all 17 authoritative location standards persist with exact quantities and order'
);

select phase9gd_test.assert_true(
  (select bool_and(standard.par_quantity = trunc(standard.par_quantity) and product.unit_label = 'unit')
   from phase9gd_test.expected_defaults expected
   join public.inventory_locations location on location.code = expected.location_code
     and location.organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
   join public.inventory_products product on product.millum_item_ref = expected.ref
     and product.organization_id = location.organization_id
   join public.inventory_location_products standard
     on standard.location_id = location.id and standard.product_id = product.id),
  'DB-9GD-4: mapped quantities are individual refrigerator units rather than Millum packages'
);

select phase9gd_test.assert_true(
  (select count(*) = 2 and count(distinct standard.product_id) = 1
     and min(standard.par_quantity) = 4 and max(standard.par_quantity) = 12
   from public.inventory_location_products standard
   join public.inventory_locations location on location.id = standard.location_id
   join public.inventory_products product on product.id = standard.product_id
   where standard.active and product.millum_item_ref = '6388581'
     and location.code in ('CORNERBAR_RIGHT_FRIDGE', 'WORKBAR_NON_ALCO_FRIDGE')),
  'DB-9GD-5: Cornerbar Eple and Workbar Eple & Eple share the Fruktsmekk Eple UUID'
);

select phase9gd_test.assert_true(
  (select count(*) = 3 and count(distinct standard.product_id) = 1
   from public.inventory_location_products standard
   join public.inventory_locations location on location.id = standard.location_id
   join public.inventory_products product on product.id = standard.product_id
   where standard.active and product.millum_item_ref = '5104666'
     and location.code in ('CORNERBAR_RIGHT_FRIDGE', 'WORKBAR_BAR_RIGHT_FRIDGE', 'WORKBAR_NON_ALCO_FRIDGE'))
  and not exists (
    select 1 from public.inventory_location_products standard
    join public.inventory_products product on product.id = standard.product_id
    where standard.active and product.millum_item_ref = '5104641'
  ),
  'DB-9GD-6: all three Farris defaults use Naturell and exclude Lime'
);

select phase9gd_test.assert_true(
  (select count(*) = 2 from public.inventory_location_products standard
   join public.inventory_products product on product.id = standard.product_id
   where standard.active and product.millum_item_ref = '6631634')
  and not exists (
    select 1 from public.inventory_location_products standard
    join public.inventory_products product on product.id = standard.product_id
    where standard.active and product.millum_item_ref = '4030686'
  ),
  'DB-9GD-7: both Skog defaults use the 0.33 L product and exclude 0.75 L'
);

select phase9gd_test.assert_true(
  exists (select 1 from public.inventory_location_products standard
          join public.inventory_products product on product.id = standard.product_id
          where standard.active and product.millum_item_ref = '5932918')
  and not exists (select 1 from public.inventory_location_products standard
                  join public.inventory_products product on product.id = standard.product_id
                  where standard.active and product.millum_item_ref = '4019089'),
  'DB-9GD-8: Cornerbar Pils uses the Aass bottle identity and excludes the keg'
);

select phase9gd_test.assert_true(
  exists (select 1 from public.inventory_location_products standard
          join public.inventory_products product on product.id = standard.product_id
          where standard.active and product.millum_item_ref = '6181002')
  and not exists (select 1 from public.inventory_product_aliases where active and lower(trim(alias)) = 'ginger ninja'),
  'DB-9GD-9: Ginger Ninja uses Nordic Berries without a generic global alias'
);

select phase9gd_test.assert_true(
  (select count(distinct product.id) = 2
   from public.inventory_products product
   where product.organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
     and product.millum_item_ref in ('707000631', '4966818')),
  'DB-9GD-10: Norwegian Blonde and Oslove Passion Blonde remain separate identities'
);

select phase9gd_test.assert_true(
  (select count(distinct product.id) = 2
   from public.inventory_products product
   where product.organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
     and product.millum_item_ref in ('5804190', '6503346')),
  'DB-9GD-11: Rabarbra and Hylle remain separate stable products'
);

select phase9gd_test.assert_true(
  exists (select 1 from public.inventory_location_products standard
          join public.inventory_products product on product.id = standard.product_id
          where standard.active and product.millum_item_ref = '6752422')
  and not exists (select 1 from public.inventory_location_products standard
                  join public.inventory_products product on product.id = standard.product_id
                  where standard.active and product.millum_item_ref = '3221686'),
  'DB-9GD-12: Appelsinjuice uses Juiceriet 250 ml and excludes Eldorado 1.5 L'
);

select phase9gd_test.assert_true(
  (select count(*) = 2 and bool_and(standard.par_quantity = 2)
   from public.inventory_location_products standard
   join public.inventory_locations location on location.id = standard.location_id
   join public.inventory_products product on product.id = standard.product_id
   where standard.active and location.code = 'WORKBAR_BAR_RIGHT_FRIDGE'
     and product.millum_item_ref in ('5010707', '5010715')),
  'DB-9GD-13: Workbar Bar Right has Fever-Tree tonic two and Fever-Tree ginger beer two'
);

select phase9gd_test.assert_true(
  not exists (
    select 1 from public.inventory_location_products standard
    join public.inventory_products product on product.id = standard.product_id
    where standard.active and (product.name ilike '%Schweppes%' or product.short_name ilike '%Schweppes%')
  )
  and (select resolution_status = 'dismissed' and resolved_product_id is null
       from public.inventory_catalogue_unresolved_mappings mapping
       join public.inventory_locations location on location.id = mapping.location_id
       where location.code = 'WORKBAR_BAR_RIGHT_FRIDGE'
         and mapping.requested_name = 'Schweppes Indian Tonic'),
  'DB-9GD-14: Schweppes remains audit evidence but is absent from permanent defaults'
);

select phase9gd_test.assert_true(
  exists (select 1 from public.inventory_products where millum_item_ref = '5744222')
  and not exists (
    select 1 from public.inventory_location_products standard
    join public.inventory_products product on product.id = standard.product_id
    where standard.active and product.millum_item_ref = '5744222'
  ),
  'DB-9GD-15: discontinued Aass Eplemost identity remains while active defaults are absent'
);

select phase9gd_test.assert_true(
  not exists (
    select standard.location_id, standard.product_id
    from public.inventory_location_products standard
    where standard.active
    group by standard.location_id, standard.product_id
    having count(*) > 1
  ),
  'DB-9GD-16: no active location and product default is duplicated'
);

select phase9gd_test.assert_true(
  (select count(*) = 53
   from public.inventory_location_products standard
   join public.inventory_locations location on location.id = standard.location_id
   where standard.organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
     and standard.active
     and location.code in (
       'CORNERBAR_LEFT_FRIDGE', 'CORNERBAR_MIDDLE_FRIDGE', 'CORNERBAR_RIGHT_FRIDGE',
       'WORKBAR_BAR_LEFT_FRIDGE', 'WORKBAR_BAR_RIGHT_FRIDGE', 'WORKBAR_NON_ALCO_FRIDGE'
     )),
  'DB-9GD-17: terminal refrigerator template contains exactly 53 persisted defaults'
);

select phase9gd_test.assert_true(
  (select count(*) = 16
     and count(*) filter (where resolution_status = 'resolved') = 15
     and count(*) filter (where resolution_status = 'dismissed') = 1
     and count(*) filter (where resolution_status = 'unresolved') = 0
   from public.inventory_catalogue_unresolved_mappings
   where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  'DB-9GD-18: all 16 audit records reach the confirmed terminal resolution state'
);

select phase9gd_test.assert_true(
  (select count(*) = 15
   from phase9gd_test.expected_resolutions expected
   join public.inventory_locations location
     on location.organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    and location.code = expected.location_code
   join public.inventory_products product
     on product.organization_id = location.organization_id
    and product.millum_item_ref = expected.ref
   join public.inventory_catalogue_unresolved_mappings mapping
     on mapping.location_id = location.id
    and lower(trim(mapping.requested_name)) = lower(trim(expected.requested_name))
    and mapping.resolution_status = 'resolved'
    and mapping.resolved_product_id = product.id),
  'DB-9GD-19: all 15 resolved audit records point to the intended stable UUID'
);

select phase9gd_test.assert_true(
  (select count(*) = 6 and count(distinct code) = 6
   from public.inventory_locations
   where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
     and active and location_type = 'fridge'),
  'DB-9GD-20: all six operational refrigerators remain present and active'
);

select phase9gd_test.assert_true(
  (select count(*) = 99 from public.inventory_products
   where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and ownership_status = 'owned')
  and (select count(*) = 100 from public.inventory_product_catalogue_groups
       where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')
  and (select count(*) = 25 from public.inventory_product_aliases
       where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and active),
  'DB-9GD-21: catalogue identities, source memberships, and verified aliases are retained'
);

select phase9gd_test.assert_true(
  not exists (
    select 1 from public.inventory_location_products standard
    join public.inventory_locations location on location.id = standard.location_id
    join public.inventory_products product on product.id = standard.product_id
    where standard.active
      and location.organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and product.millum_item_ref in ('5104641', '4030686', '4019089', '3221686', '4014701', '4054613', '5744222')
  ),
  'DB-9GD-22: every explicitly rejected competing identity stays out of active defaults'
);

select phase9gd_test.assert_true(
  (select count(*) = 4
   from pg_catalog.pg_class relation
   join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'public'
     and relation.relname in (
       'inventory_product_catalogue_groups', 'inventory_product_aliases',
       'inventory_refrigerator_templates', 'inventory_catalogue_unresolved_mappings'
     )
     and relation.relrowsecurity)
  and not has_table_privilege('authenticated', 'public.inventory_catalogue_unresolved_mappings', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.inventory_location_products', 'INSERT'),
  'DB-9GD-23: mapping persistence does not broaden RLS or authenticated write grants'
);

drop schema phase9gd_test cascade;
