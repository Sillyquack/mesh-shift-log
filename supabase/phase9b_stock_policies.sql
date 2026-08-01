-- Phase 9B: policy-aware stock control for service, operating, event, and dormant stock.
-- Apply after phase9a_inventory_stocktaking.sql and phase9a4_inventory_location_template.sql.

alter table public.inventory_location_products
  add column if not exists stock_policy text not null default 'exact_par',
  add column if not exists target_mode text,
  add column if not exists reserve_multiplier numeric,
  add column if not exists case_size numeric,
  add column if not exists target_cases integer,
  add column if not exists target_loose_quantity numeric,
  add column if not exists physical_recount_interval_days integer;

alter table public.inventory_location_products
  drop constraint if exists inventory_location_products_stock_policy_check,
  drop constraint if exists inventory_location_products_target_mode_check,
  drop constraint if exists inventory_location_products_reserve_multiplier_check,
  drop constraint if exists inventory_location_products_case_size_check,
  drop constraint if exists inventory_location_products_target_cases_check,
  drop constraint if exists inventory_location_products_target_loose_check,
  drop constraint if exists inventory_location_products_recount_interval_check,
  drop constraint if exists inventory_location_products_policy_configuration_check;

alter table public.inventory_location_products
  add constraint inventory_location_products_stock_policy_check check (
    stock_policy in ('exact_par', 'operating_reserve', 'protected_event_reserve', 'verify_unchanged')
  ),
  add constraint inventory_location_products_target_mode_check check (
    target_mode is null or target_mode in ('fixed_quantity', 'derived_multiplier')
  ),
  add constraint inventory_location_products_reserve_multiplier_check check (
    reserve_multiplier is null or reserve_multiplier > 0
  ),
  add constraint inventory_location_products_case_size_check check (
    case_size is null or case_size > 0
  ),
  add constraint inventory_location_products_target_cases_check check (
    target_cases is null or target_cases >= 0
  ),
  add constraint inventory_location_products_target_loose_check check (
    target_loose_quantity is null or target_loose_quantity >= 0
  ),
  add constraint inventory_location_products_recount_interval_check check (
    physical_recount_interval_days is null or physical_recount_interval_days > 0
  ),
  add constraint inventory_location_products_policy_configuration_check check (
    (stock_policy = 'exact_par')
    or (
      stock_policy = 'operating_reserve'
      and target_mode in ('fixed_quantity', 'derived_multiplier')
      and (target_mode = 'fixed_quantity' or reserve_multiplier > 0)
    )
    or (
      stock_policy = 'protected_event_reserve'
      and case_size > 0
      and target_cases >= 0
      and target_loose_quantity >= 0
    )
    or (
      stock_policy = 'verify_unchanged'
      and physical_recount_interval_days > 0
    )
  );

create or replace function public.inventory_normalize_stock_policy_configuration()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.stock_policy := lower(trim(coalesce(new.stock_policy, 'exact_par')));
  if new.stock_policy = 'operating_reserve' then
    new.target_mode := lower(trim(coalesce(new.target_mode, 'fixed_quantity')));
    if new.target_mode = 'fixed_quantity' then
      new.reserve_multiplier := null;
    end if;
    new.case_size := null;
    new.target_cases := null;
    new.target_loose_quantity := null;
    new.physical_recount_interval_days := null;
  elsif new.stock_policy = 'protected_event_reserve' then
    new.target_mode := null;
    new.reserve_multiplier := null;
    new.target_loose_quantity := coalesce(new.target_loose_quantity, 0);
    new.physical_recount_interval_days := null;
    if new.case_size is not null and new.target_cases is not null then
      new.par_quantity := new.case_size * new.target_cases + new.target_loose_quantity;
    end if;
  elsif new.stock_policy = 'verify_unchanged' then
    new.target_mode := null;
    new.reserve_multiplier := null;
    new.case_size := null;
    new.target_cases := null;
    new.target_loose_quantity := null;
    new.physical_recount_interval_days := coalesce(new.physical_recount_interval_days, 90);
  else
    new.stock_policy := 'exact_par';
    new.target_mode := null;
    new.reserve_multiplier := null;
    new.case_size := null;
    new.target_cases := null;
    new.target_loose_quantity := null;
    new.physical_recount_interval_days := null;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_location_products_normalize_policy on public.inventory_location_products;
create trigger inventory_location_products_normalize_policy
before insert or update on public.inventory_location_products
for each row execute function public.inventory_normalize_stock_policy_configuration();

-- Existing standards retain both par and minimum values and become exact-par standards.
update public.inventory_location_products
set stock_policy = 'exact_par'
where stock_policy is null;

alter table public.inventory_count_lines
  add column if not exists stock_policy_snapshot text not null default 'exact_par',
  add column if not exists target_mode_snapshot text,
  add column if not exists effective_target_quantity_snapshot numeric,
  add column if not exists service_target_basis_snapshot numeric,
  add column if not exists reserve_multiplier_snapshot numeric,
  add column if not exists case_size_snapshot numeric,
  add column if not exists target_cases_snapshot integer,
  add column if not exists target_loose_quantity_snapshot numeric,
  add column if not exists physical_recount_interval_days_snapshot integer,
  add column if not exists count_full_cases integer,
  add column if not exists count_loose_quantity numeric,
  add column if not exists previous_verified_count_line_id uuid,
  add column if not exists previous_physical_count_quantity_snapshot numeric,
  add column if not exists previous_physical_counted_at_snapshot timestamptz;

alter table public.inventory_count_lines
  drop constraint if exists inventory_count_lines_method_check,
  drop constraint if exists inventory_count_lines_method_quantity_consistency,
  drop constraint if exists inventory_count_lines_stock_policy_check,
  drop constraint if exists inventory_count_lines_target_mode_snapshot_check,
  drop constraint if exists inventory_count_lines_policy_numbers_check,
  drop constraint if exists inventory_count_lines_case_count_check,
  drop constraint if exists inventory_count_lines_previous_verified_fk;

alter table public.inventory_count_lines
  add constraint inventory_count_lines_method_check check (
    count_method in ('uncounted', 'manual', 'use_par', 'imported', 'adjusted', 'confirmed_unchanged')
  ),
  add constraint inventory_count_lines_method_quantity_consistency check (
    (count_method = 'uncounted' and count_status in ('not_counted', 'skipped') and counted_quantity is null)
    or (count_method = 'use_par' and count_status = 'counted' and counted_quantity = par_quantity_snapshot)
    or (count_method in ('manual', 'imported', 'adjusted', 'confirmed_unchanged') and count_status in ('counted', 'needs_review') and counted_quantity is not null)
  ),
  add constraint inventory_count_lines_stock_policy_check check (
    stock_policy_snapshot in ('exact_par', 'operating_reserve', 'protected_event_reserve', 'verify_unchanged')
  ),
  add constraint inventory_count_lines_target_mode_snapshot_check check (
    target_mode_snapshot is null or target_mode_snapshot in ('fixed_quantity', 'derived_multiplier')
  ),
  add constraint inventory_count_lines_policy_numbers_check check (
    (effective_target_quantity_snapshot is null or effective_target_quantity_snapshot >= 0)
    and (service_target_basis_snapshot is null or service_target_basis_snapshot >= 0)
    and (reserve_multiplier_snapshot is null or reserve_multiplier_snapshot > 0)
    and (case_size_snapshot is null or case_size_snapshot > 0)
    and (target_cases_snapshot is null or target_cases_snapshot >= 0)
    and (target_loose_quantity_snapshot is null or target_loose_quantity_snapshot >= 0)
    and (physical_recount_interval_days_snapshot is null or physical_recount_interval_days_snapshot > 0)
    and (previous_physical_count_quantity_snapshot is null or previous_physical_count_quantity_snapshot >= 0)
  ),
  add constraint inventory_count_lines_case_count_check check (
    (count_full_cases is null or count_full_cases >= 0)
    and (count_loose_quantity is null or count_loose_quantity >= 0)
  ),
  add constraint inventory_count_lines_previous_verified_fk foreign key (previous_verified_count_line_id)
    references public.inventory_count_lines(id);

create or replace function public.inventory_stock_policy_target(input_standard_id uuid)
returns table (
  effective_target_quantity numeric,
  service_target_basis numeric
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_standard public.inventory_location_products%rowtype;
  v_service_target numeric := 0;
begin
  select standard.* into v_standard
  from public.inventory_location_products standard
  where standard.id = input_standard_id;
  if v_standard.id is null then
    raise exception 'Inventory standard was not found.';
  end if;

  if v_standard.stock_policy = 'exact_par' then
    return query select v_standard.par_quantity, null::numeric;
  elsif v_standard.stock_policy = 'operating_reserve' and v_standard.target_mode = 'fixed_quantity' then
    return query select v_standard.par_quantity, null::numeric;
  elsif v_standard.stock_policy = 'operating_reserve' and v_standard.target_mode = 'derived_multiplier' then
    with recursive service_locations(id) as (
      select child.id
      from public.inventory_locations root
      join public.inventory_locations child on child.parent_location_id = root.id
      where root.organization_id = v_standard.organization_id
        and root.active = true
        and upper(trim(root.code)) in ('WORKBAR', 'CORNERBAR')
        and child.organization_id = v_standard.organization_id
        and child.active = true
      union
      select child.id
      from public.inventory_locations child
      join service_locations parent on child.parent_location_id = parent.id
      where child.organization_id = v_standard.organization_id
        and child.active = true
    )
    select coalesce(sum(service_standard.par_quantity), 0)
    into v_service_target
    from public.inventory_location_products service_standard
    join public.inventory_products product
      on product.id = service_standard.product_id
     and product.organization_id = service_standard.organization_id
     and product.active = true
    where service_standard.organization_id = v_standard.organization_id
      and service_standard.product_id = v_standard.product_id
      and service_standard.active = true
      and service_standard.stock_policy = 'exact_par'
      and service_standard.location_id in (select id from service_locations);
    return query select v_service_target * v_standard.reserve_multiplier, v_service_target;
  elsif v_standard.stock_policy = 'protected_event_reserve' then
    return query select
      v_standard.case_size * v_standard.target_cases + coalesce(v_standard.target_loose_quantity, 0),
      null::numeric;
  else
    return query select null::numeric, null::numeric;
  end if;
end;
$$;

create or replace function public.inventory_count_line_client_record(input_line_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_line public.inventory_count_lines%rowtype;
begin
  select line.* into v_line
  from public.inventory_count_lines line
  where line.id = input_line_id
    and line.organization_id = public.current_user_organization_id()
    and public.inventory_session_is_visible(line.session_id);
  if v_line.id is null then
    raise exception 'Inventory count line was not found or is not available.';
  end if;
  return jsonb_build_object(
    'id', v_line.id,
    'location_id', v_line.location_id,
    'product_name_snapshot', v_line.product_name_snapshot,
    'location_name_snapshot', v_line.location_name_snapshot,
    'unit_label_snapshot', v_line.unit_label_snapshot,
    'category_snapshot', v_line.category_snapshot,
    'location_sort_order_snapshot', v_line.location_sort_order_snapshot,
    'count_order_snapshot', v_line.count_order_snapshot,
    'product_sort_order_snapshot', v_line.product_sort_order_snapshot,
    'par_quantity_snapshot', v_line.par_quantity_snapshot,
    'minimum_quantity_snapshot', v_line.minimum_quantity_snapshot,
    'stock_policy_snapshot', v_line.stock_policy_snapshot,
    'target_mode_snapshot', v_line.target_mode_snapshot,
    'effective_target_quantity_snapshot', v_line.effective_target_quantity_snapshot,
    'service_target_basis_snapshot', v_line.service_target_basis_snapshot,
    'reserve_multiplier_snapshot', v_line.reserve_multiplier_snapshot,
    'case_size_snapshot', v_line.case_size_snapshot,
    'target_cases_snapshot', v_line.target_cases_snapshot,
    'target_loose_quantity_snapshot', v_line.target_loose_quantity_snapshot,
    'physical_recount_interval_days_snapshot', v_line.physical_recount_interval_days_snapshot,
    'previous_physical_count_quantity_snapshot', v_line.previous_physical_count_quantity_snapshot,
    'previous_physical_counted_at_snapshot', v_line.previous_physical_counted_at_snapshot,
    'count_full_cases', v_line.count_full_cases,
    'count_loose_quantity', v_line.count_loose_quantity,
    'counted_quantity', v_line.counted_quantity,
    'count_method', v_line.count_method,
    'count_status', v_line.count_status,
    'variance_quantity', v_line.variance_quantity,
    'restock_quantity', v_line.restock_quantity,
    'note', v_line.note,
    'counted_at', v_line.counted_at,
    'counted_by_name', v_line.counted_by_name,
    'updated_at', v_line.updated_at
  );
end;
$$;

create or replace function public.create_inventory_count_session(
  input_title text,
  input_count_type text,
  input_count_date date default null,
  input_location_ids uuid[] default null,
  input_actor_name text default null,
  input_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session public.inventory_count_sessions%rowtype;
  v_line_count integer := 0;
  v_location_count integer := 0;
  v_title text := nullif(trim(coalesce(input_title, '')), '');
  v_type text := lower(trim(coalesce(input_count_type, '')));
begin
  if not public.current_user_can_coordinate_inventory() then
    raise exception 'Manager or Event Floor Manager access is required to start a stock count.';
  end if;
  select * into v_actor from public.inventory_resolve_actor(input_actor_name);
  if v_title is null then raise exception 'Count session title is required.'; end if;
  if v_type not in ('opening', 'closing', 'daily', 'weekly', 'monthly', 'ad_hoc', 'event', 'other') then
    raise exception 'Choose a valid stock count type.';
  end if;
  if input_location_ids is not null and cardinality(input_location_ids) = 0 then
    raise exception 'Choose at least one inventory location.';
  end if;
  if input_location_ids is not null and exists (
    select 1 from unnest(input_location_ids) selected(id)
    where not exists (
      select 1 from public.inventory_locations location
      where location.id = selected.id
        and location.organization_id = v_actor.organization_id
        and location.active = true
    )
  ) then
    raise exception 'One or more selected inventory locations are unavailable.';
  end if;

  insert into public.inventory_count_sessions (
    organization_id, title, count_type, status, count_date,
    started_by_auth_user_id, started_by_name, metadata
  ) values (
    v_actor.organization_id, v_title, v_type, 'in_progress',
    coalesce(input_count_date, (now() at time zone 'Europe/Oslo')::date),
    v_actor.actor_auth_user_id, v_actor.actor_name,
    jsonb_strip_nulls(jsonb_build_object('startNote', nullif(trim(coalesce(input_note, '')), '')))
  ) returning * into v_session;

  with recursive selected_locations as (
    select location.id
    from public.inventory_locations location
    where location.organization_id = v_actor.organization_id
      and location.active = true
      and (input_location_ids is null or location.id = any(input_location_ids))
    union
    select child.id
    from public.inventory_locations child
    join selected_locations parent on child.parent_location_id = parent.id
    where child.organization_id = v_actor.organization_id
      and child.active = true
  )
  insert into public.inventory_count_lines (
    organization_id, session_id, location_id, product_id,
    product_name_snapshot, location_name_snapshot, unit_label_snapshot,
    category_snapshot, location_sort_order_snapshot, count_order_snapshot,
    product_sort_order_snapshot, par_quantity_snapshot, minimum_quantity_snapshot,
    stock_policy_snapshot, target_mode_snapshot, effective_target_quantity_snapshot,
    service_target_basis_snapshot, reserve_multiplier_snapshot, case_size_snapshot,
    target_cases_snapshot, target_loose_quantity_snapshot,
    physical_recount_interval_days_snapshot, previous_verified_count_line_id,
    previous_physical_count_quantity_snapshot, previous_physical_counted_at_snapshot
  )
  select standard.organization_id, v_session.id, standard.location_id, standard.product_id,
    product.name, location.name, product.unit_label, product.category,
    location.sort_order, standard.count_order, product.sort_order,
    coalesce(target.effective_target_quantity, 0), standard.minimum_quantity,
    standard.stock_policy, standard.target_mode, target.effective_target_quantity,
    target.service_target_basis, standard.reserve_multiplier, standard.case_size,
    standard.target_cases, standard.target_loose_quantity,
    standard.physical_recount_interval_days, previous.id,
    previous.counted_quantity, previous.counted_at
  from public.inventory_location_products standard
  join public.inventory_products product
    on product.id = standard.product_id
   and product.organization_id = standard.organization_id
   and product.active = true
  join public.inventory_locations location
    on location.id = standard.location_id
   and location.organization_id = standard.organization_id
   and location.active = true
  cross join lateral public.inventory_stock_policy_target(standard.id) target
  left join lateral (
    select old_line.id, old_line.counted_quantity, old_line.counted_at
    from public.inventory_count_lines old_line
    join public.inventory_count_sessions old_session
      on old_session.id = old_line.session_id
     and old_session.organization_id = old_line.organization_id
     and old_session.status in ('completed', 'approved')
    where old_line.organization_id = standard.organization_id
      and old_line.location_id = standard.location_id
      and old_line.product_id = standard.product_id
      and old_line.count_method in ('manual', 'imported', 'adjusted')
      and old_line.count_status = 'counted'
      and old_line.counted_quantity is not null
      and old_line.counted_at is not null
    order by old_line.counted_at desc, old_line.id desc
    limit 1
  ) previous on standard.stock_policy = 'verify_unchanged'
  where standard.organization_id = v_actor.organization_id
    and standard.active = true
    and (input_location_ids is null or standard.location_id in (select id from selected_locations))
  order by location.sort_order, location.name, standard.count_order, product.sort_order, product.name;
  get diagnostics v_line_count = row_count;

  if v_line_count = 0 then
    raise exception 'No active inventory products are configured for the selected locations.';
  end if;
  select count(distinct line.location_id) into v_location_count
  from public.inventory_count_lines line where line.session_id = v_session.id;
  return jsonb_build_object(
    'session', public.get_inventory_count_session_record(v_session.id),
    'summary', jsonb_build_object('lineCount', v_line_count, 'locationCount', v_location_count)
  );
end;
$$;

create or replace function public.set_inventory_count_line_quantity(
  input_line_id uuid,
  input_counted_quantity numeric,
  input_note text default null,
  input_actor_name text default null,
  input_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session_id uuid;
  v_line public.inventory_count_lines%rowtype;
  v_session public.inventory_count_sessions%rowtype;
begin
  select * into v_actor from public.inventory_resolve_actor(input_actor_name);
  if input_counted_quantity is null then raise exception 'Enter a counted quantity or use Clear.'; end if;
  if input_counted_quantity < 0 then raise exception 'Counted quantity cannot be negative.'; end if;
  select line.session_id into v_session_id from public.inventory_count_lines line
  where line.id = input_line_id and line.organization_id = v_actor.organization_id;
  if v_session_id is null then raise exception 'Inventory count line was not found.'; end if;
  select session.* into v_session from public.inventory_count_sessions session
  where session.id = v_session_id and session.organization_id = v_actor.organization_id for update;
  if v_session.id is null then raise exception 'Inventory count session was not found.'; end if;
  if v_session.status not in ('draft', 'in_progress') then
    raise exception 'This stock count is read-only because it is %.', v_session.status;
  end if;
  select line.* into v_line from public.inventory_count_lines line
  where line.id = input_line_id and line.session_id = v_session.id
    and line.organization_id = v_actor.organization_id for update;
  if v_line.id is null then raise exception 'Inventory count line was not found.'; end if;
  if input_expected_updated_at is not null and v_line.updated_at is distinct from input_expected_updated_at then
    raise exception 'This count line changed on another device. Refresh before saving your value.';
  end if;
  update public.inventory_count_lines line
  set counted_quantity = input_counted_quantity,
      count_full_cases = null,
      count_loose_quantity = null,
      count_method = 'manual', count_status = 'counted',
      note = nullif(trim(coalesce(input_note, '')), ''), counted_at = now(),
      counted_by_auth_user_id = v_actor.actor_auth_user_id,
      counted_by_name = v_actor.actor_name
  where line.id = v_line.id returning * into v_line;
  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_line.location_id::text]
  where session.id = v_session.id;
  return public.inventory_count_line_client_record(v_line.id);
end;
$$;

create or replace function public.set_inventory_count_line_case_quantity(
  input_line_id uuid,
  input_full_cases integer,
  input_loose_quantity numeric default 0,
  input_note text default null,
  input_actor_name text default null,
  input_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session_id uuid;
  v_line public.inventory_count_lines%rowtype;
  v_session public.inventory_count_sessions%rowtype;
  v_total numeric;
begin
  select * into v_actor from public.inventory_resolve_actor(input_actor_name);
  if input_full_cases is null or input_full_cases < 0 then raise exception 'Full cases cannot be negative.'; end if;
  if input_loose_quantity is null or input_loose_quantity < 0 then raise exception 'Loose units cannot be negative.'; end if;
  select line.session_id into v_session_id from public.inventory_count_lines line
  where line.id = input_line_id and line.organization_id = v_actor.organization_id;
  if v_session_id is null then raise exception 'Inventory count line was not found.'; end if;
  select session.* into v_session from public.inventory_count_sessions session
  where session.id = v_session_id and session.organization_id = v_actor.organization_id for update;
  if v_session.id is null or v_session.status not in ('draft', 'in_progress') then
    raise exception 'This stock count is not available for case counting.';
  end if;
  select line.* into v_line from public.inventory_count_lines line
  where line.id = input_line_id and line.session_id = v_session.id
    and line.organization_id = v_actor.organization_id for update;
  if v_line.id is null then raise exception 'Inventory count line was not found.'; end if;
  if v_line.stock_policy_snapshot <> 'protected_event_reserve' or v_line.case_size_snapshot is null then
    raise exception 'Case counting is only available for configured protected event reserve stock.';
  end if;
  if input_expected_updated_at is not null and v_line.updated_at is distinct from input_expected_updated_at then
    raise exception 'This count line changed on another device. Refresh before saving the case count.';
  end if;
  v_total := input_full_cases * v_line.case_size_snapshot + input_loose_quantity;
  update public.inventory_count_lines line
  set counted_quantity = v_total,
      count_full_cases = input_full_cases,
      count_loose_quantity = input_loose_quantity,
      count_method = 'manual', count_status = 'counted',
      note = nullif(trim(coalesce(input_note, '')), ''), counted_at = now(),
      counted_by_auth_user_id = v_actor.actor_auth_user_id,
      counted_by_name = v_actor.actor_name
  where line.id = v_line.id returning * into v_line;
  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_line.location_id::text]
  where session.id = v_session.id;
  return public.inventory_count_line_client_record(v_line.id);
end;
$$;

create or replace function public.mark_inventory_count_line_use_par(
  input_line_id uuid,
  input_note text default null,
  input_actor_name text default null,
  input_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session_id uuid;
  v_line public.inventory_count_lines%rowtype;
  v_session public.inventory_count_sessions%rowtype;
begin
  select * into v_actor from public.inventory_resolve_actor(input_actor_name);
  select line.session_id into v_session_id from public.inventory_count_lines line
  where line.id = input_line_id and line.organization_id = v_actor.organization_id;
  if v_session_id is null then raise exception 'Inventory count line was not found.'; end if;
  select session.* into v_session from public.inventory_count_sessions session
  where session.id = v_session_id and session.organization_id = v_actor.organization_id for update;
  if v_session.id is null or v_session.status not in ('draft', 'in_progress') then
    raise exception 'This stock count is not available for changes.';
  end if;
  select line.* into v_line from public.inventory_count_lines line
  where line.id = input_line_id and line.session_id = v_session.id
    and line.organization_id = v_actor.organization_id for update;
  if v_line.id is null then raise exception 'Inventory count line was not found.'; end if;
  if v_line.stock_policy_snapshot <> 'exact_par' then
    raise exception 'Mark fully stocked is only available for exact-par service stock.';
  end if;
  if input_expected_updated_at is not null and v_line.updated_at is distinct from input_expected_updated_at then
    raise exception 'This count line changed on another device. Refresh before marking it fully stocked.';
  end if;
  if v_line.count_method = 'use_par' and v_line.count_status = 'counted'
     and v_line.counted_quantity = v_line.par_quantity_snapshot then
    return public.inventory_count_line_client_record(v_line.id);
  end if;
  update public.inventory_count_lines line
  set counted_quantity = line.par_quantity_snapshot,
      count_full_cases = null, count_loose_quantity = null,
      count_method = 'use_par', count_status = 'counted',
      note = nullif(trim(coalesce(input_note, '')), ''), counted_at = now(),
      counted_by_auth_user_id = v_actor.actor_auth_user_id,
      counted_by_name = v_actor.actor_name
  where line.id = v_line.id returning * into v_line;
  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_line.location_id::text]
  where session.id = v_session.id;
  return public.inventory_count_line_client_record(v_line.id);
end;
$$;

create or replace function public.clear_inventory_count_line(
  input_line_id uuid,
  input_actor_name text default null,
  input_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session_id uuid;
  v_line public.inventory_count_lines%rowtype;
  v_session public.inventory_count_sessions%rowtype;
begin
  select * into v_actor from public.inventory_resolve_actor(input_actor_name);
  select line.session_id into v_session_id from public.inventory_count_lines line
  where line.id = input_line_id and line.organization_id = v_actor.organization_id;
  if v_session_id is null then raise exception 'Inventory count line was not found.'; end if;
  select session.* into v_session from public.inventory_count_sessions session
  where session.id = v_session_id and session.organization_id = v_actor.organization_id for update;
  if v_session.id is null or v_session.status not in ('draft', 'in_progress') then
    raise exception 'This stock count is not available for changes.';
  end if;
  select line.* into v_line from public.inventory_count_lines line
  where line.id = input_line_id and line.session_id = v_session.id
    and line.organization_id = v_actor.organization_id for update;
  if v_line.id is null then raise exception 'Inventory count line was not found.'; end if;
  if input_expected_updated_at is not null and v_line.updated_at is distinct from input_expected_updated_at then
    raise exception 'This count line changed on another device. Refresh before clearing it.';
  end if;
  update public.inventory_count_lines line
  set counted_quantity = null, count_full_cases = null, count_loose_quantity = null,
      count_method = 'uncounted', count_status = 'not_counted', note = null,
      counted_at = null, counted_by_auth_user_id = null, counted_by_name = null
  where line.id = v_line.id returning * into v_line;
  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_line.location_id::text]
  where session.id = v_session.id;
  return public.inventory_count_line_client_record(v_line.id);
end;
$$;

create or replace function public.skip_inventory_count_line(
  input_line_id uuid,
  input_note text,
  input_actor_name text default null,
  input_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session_id uuid;
  v_line public.inventory_count_lines%rowtype;
  v_session public.inventory_count_sessions%rowtype;
  v_note text := nullif(trim(coalesce(input_note, '')), '');
begin
  if v_note is null then raise exception 'A note is required when a count line is skipped.'; end if;
  select * into v_actor from public.inventory_resolve_actor(input_actor_name);
  select line.session_id into v_session_id from public.inventory_count_lines line
  where line.id = input_line_id and line.organization_id = v_actor.organization_id;
  if v_session_id is null then raise exception 'Inventory count line was not found.'; end if;
  select session.* into v_session from public.inventory_count_sessions session
  where session.id = v_session_id and session.organization_id = v_actor.organization_id for update;
  if v_session.id is null or v_session.status not in ('draft', 'in_progress') then
    raise exception 'This stock count is not available for changes.';
  end if;
  select line.* into v_line from public.inventory_count_lines line
  where line.id = input_line_id and line.session_id = v_session.id
    and line.organization_id = v_actor.organization_id for update;
  if v_line.id is null then raise exception 'Inventory count line was not found.'; end if;
  if input_expected_updated_at is not null and v_line.updated_at is distinct from input_expected_updated_at then
    raise exception 'This count line changed on another device. Refresh before skipping it.';
  end if;
  update public.inventory_count_lines line
  set counted_quantity = null, count_full_cases = null, count_loose_quantity = null,
      count_method = 'uncounted', count_status = 'skipped', note = v_note,
      counted_at = now(), counted_by_auth_user_id = v_actor.actor_auth_user_id,
      counted_by_name = v_actor.actor_name
  where line.id = v_line.id returning * into v_line;
  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_line.location_id::text]
  where session.id = v_session.id;
  return public.inventory_count_line_client_record(v_line.id);
end;
$$;

create or replace function public.mark_inventory_location_use_par(
  input_session_id uuid,
  input_location_id uuid,
  input_replace_existing boolean default false,
  input_actor_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_session public.inventory_count_sessions%rowtype;
  v_updated integer := 0;
  v_preserved_manual integer := 0;
  v_already_standard integer := 0;
  v_skipped integer := 0;
begin
  select * into v_actor from public.inventory_resolve_actor(input_actor_name);
  if coalesce(input_replace_existing, false) and not public.current_user_can_manage_inventory_config() then
    raise exception 'Only a manager can replace existing counts with stocking standards.';
  end if;
  select session.* into v_session from public.inventory_count_sessions session
  where session.id = input_session_id and session.organization_id = v_actor.organization_id for update;
  if v_session.id is null or v_session.status not in ('draft', 'in_progress') then
    raise exception 'This stock count is not available for changes.';
  end if;
  if not exists (select 1 from public.inventory_count_lines where session_id = v_session.id and location_id = input_location_id) then
    raise exception 'This location is not part of the stock count.';
  end if;
  perform line.id from public.inventory_count_lines line
  where line.session_id = v_session.id and line.location_id = input_location_id
  order by line.id for update;
  select count(*) filter (where count_method = 'manual' and count_status in ('counted', 'needs_review')),
         count(*) filter (where count_method = 'use_par' and count_status = 'counted'),
         count(*) filter (where count_status = 'skipped')
  into v_preserved_manual, v_already_standard, v_skipped
  from public.inventory_count_lines
  where session_id = v_session.id and location_id = input_location_id;
  update public.inventory_count_lines line
  set counted_quantity = line.par_quantity_snapshot,
      count_full_cases = null, count_loose_quantity = null,
      count_method = 'use_par', count_status = 'counted', counted_at = now(),
      counted_by_auth_user_id = v_actor.actor_auth_user_id,
      counted_by_name = v_actor.actor_name,
      note = case when coalesce(input_replace_existing, false) then 'Replaced with stocking standard by manager.' else line.note end
  where line.session_id = v_session.id
    and line.location_id = input_location_id
    and line.stock_policy_snapshot = 'exact_par'
    and (
      (coalesce(input_replace_existing, false) and line.count_status <> 'skipped' and (
        line.counted_quantity is distinct from line.par_quantity_snapshot
        or line.count_method <> 'use_par' or line.count_status <> 'counted'
        or line.note is distinct from 'Replaced with stocking standard by manager.'
      ))
      or (not coalesce(input_replace_existing, false) and line.count_status = 'not_counted')
    );
  get diagnostics v_updated = row_count;
  if v_updated > 0 then
    update public.inventory_count_sessions session
    set metadata = session.metadata #- array['locationCompletions', input_location_id::text]
    where session.id = v_session.id;
  end if;
  return jsonb_build_object(
    'updated', v_updated,
    'preservedManual', case when input_replace_existing then 0 else v_preserved_manual end,
    'alreadyStandard', v_already_standard,
    'skipped', v_skipped
  );
end;
$$;

create or replace function public.confirm_inventory_count_line_unchanged(
  input_line_id uuid,
  input_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := public.current_user_organization_id();
  v_actor record;
  v_session_id uuid;
  v_session public.inventory_count_sessions%rowtype;
  v_line public.inventory_count_lines%rowtype;
  v_previous_session_id uuid;
  v_previous_session public.inventory_count_sessions%rowtype;
  v_previous public.inventory_count_lines%rowtype;
begin
  if auth.uid() is null or v_org is null or not public.current_user_can_manage_inventory_config() then
    raise exception 'Only an active manager can confirm dormant stock unchanged.';
  end if;
  if public.current_user_is_shared_device() then
    raise exception 'Shared-device accounts cannot confirm dormant stock unchanged.';
  end if;
  select * into v_actor from public.inventory_resolve_actor(null);
  select line.session_id into v_session_id from public.inventory_count_lines line
  where line.id = input_line_id and line.organization_id = v_org;
  if v_session_id is null then raise exception 'Inventory count line was not found.'; end if;
  select session.* into v_session from public.inventory_count_sessions session
  where session.id = v_session_id and session.organization_id = v_org for update;
  if v_session.id is null or v_session.status not in ('draft', 'in_progress') then
    raise exception 'This stock count is not available for unchanged confirmation.';
  end if;
  select line.* into v_line from public.inventory_count_lines line
  where line.id = input_line_id and line.session_id = v_session.id
    and line.organization_id = v_org for update;
  if v_line.id is null or v_line.stock_policy_snapshot <> 'verify_unchanged' then
    raise exception 'Unchanged confirmation is only available for dormant-stock lines.';
  end if;
  if v_line.count_method = 'confirmed_unchanged' and v_line.count_status = 'counted' then
    return public.inventory_count_line_client_record(v_line.id);
  end if;
  if v_line.count_method <> 'uncounted'
     or v_line.count_status <> 'not_counted'
     or v_line.counted_quantity is not null then
    raise exception 'A current count already exists for this line. Clear it before confirming the previous physical quantity as unchanged.';
  end if;
  if input_expected_updated_at is not null and v_line.updated_at is distinct from input_expected_updated_at then
    raise exception 'This count line changed on another device. Refresh before confirming unchanged.';
  end if;
  if v_line.previous_verified_count_line_id is null
     or v_line.previous_physical_counted_at_snapshot is null
     or v_line.previous_physical_count_quantity_snapshot is null then
    raise exception 'A previous finalized physical count is required before unchanged confirmation.';
  end if;
  select previous.session_id into v_previous_session_id
  from public.inventory_count_lines previous
  where previous.id = v_line.previous_verified_count_line_id
    and previous.organization_id = v_org;
  if v_previous_session_id is null then
    raise exception 'The previous physical count is no longer eligible for unchanged confirmation.';
  end if;
  select previous_session.* into v_previous_session
  from public.inventory_count_sessions previous_session
  where previous_session.id = v_previous_session_id
    and previous_session.organization_id = v_org
    and previous_session.status in ('completed', 'approved')
  for share;
  if v_previous_session.id is null then
    raise exception 'The previous physical count is no longer in a finalized session.';
  end if;
  select previous.* into v_previous
  from public.inventory_count_lines previous
  where previous.id = v_line.previous_verified_count_line_id
    and previous.organization_id = v_org
    and previous.session_id = v_previous_session.id
    and previous.location_id = v_line.location_id
    and previous.product_id = v_line.product_id
    and previous.count_method in ('manual', 'imported', 'adjusted')
    and previous.count_status = 'counted'
  for share;
  if v_previous.id is null then
    raise exception 'The previous physical count is no longer eligible for unchanged confirmation.';
  end if;
  if v_previous.counted_quantity is distinct from v_line.previous_physical_count_quantity_snapshot
     or v_previous.counted_at is distinct from v_line.previous_physical_counted_at_snapshot then
    raise exception 'The previous physical count changed after this session started. Enter a physical count for this line or start a new count session.';
  end if;
  if v_line.previous_physical_counted_at_snapshot
     < now() - make_interval(days => v_line.physical_recount_interval_days_snapshot) then
    raise exception 'Physical recount required because the previous physical count is outside the configured interval.';
  end if;
  update public.inventory_count_lines line
  set counted_quantity = v_line.previous_physical_count_quantity_snapshot,
      count_full_cases = null, count_loose_quantity = null,
      count_method = 'confirmed_unchanged', count_status = 'counted',
      note = 'Manager attestation: no known movement since the previous physical count. Shopbox movement validation is not connected.',
      counted_at = now(), counted_by_auth_user_id = v_actor.actor_auth_user_id,
      counted_by_name = v_actor.actor_name
  where line.id = v_line.id returning * into v_line;
  update public.inventory_count_sessions session
  set metadata = session.metadata #- array['locationCompletions', v_line.location_id::text]
  where session.id = v_session.id;
  return public.inventory_count_line_client_record(v_line.id);
end;
$$;

create or replace function public.copy_inventory_location_standards(
  input_source_location_id uuid,
  input_destination_location_id uuid,
  input_overwrite_existing boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := public.current_user_organization_id();
  v_source_count integer := 0;
  v_added integer := 0;
  v_preserved integer := 0;
  v_updated integer := 0;
begin
  if not public.current_user_can_manage_inventory_config() or v_org is null then
    raise exception 'Manager inventory configuration access required.';
  end if;
  if input_source_location_id = input_destination_location_id then
    raise exception 'Choose two different inventory locations.';
  end if;
  if not exists (
    select 1 from public.inventory_locations
    where id = input_source_location_id and organization_id = v_org
  ) or not exists (
    select 1 from public.inventory_locations
    where id = input_destination_location_id and organization_id = v_org
  ) then
    raise exception 'Source and destination locations must belong to the current organization.';
  end if;

  select count(*) into v_source_count
  from public.inventory_location_products
  where organization_id = v_org
    and location_id = input_source_location_id
    and active = true;

  select count(*) into v_preserved
  from public.inventory_location_products source
  join public.inventory_location_products destination
    on destination.organization_id = source.organization_id
   and destination.location_id = input_destination_location_id
   and destination.product_id = source.product_id
  where source.organization_id = v_org
    and source.location_id = input_source_location_id
    and source.active = true;

  if input_overwrite_existing then
    update public.inventory_location_products destination
    set par_quantity = source.par_quantity,
        minimum_quantity = source.minimum_quantity,
        default_restock_quantity = source.default_restock_quantity,
        count_order = source.count_order,
        active = true,
        notes = source.notes,
        stock_policy = source.stock_policy,
        target_mode = source.target_mode,
        reserve_multiplier = source.reserve_multiplier,
        case_size = source.case_size,
        target_cases = source.target_cases,
        target_loose_quantity = source.target_loose_quantity,
        physical_recount_interval_days = source.physical_recount_interval_days,
        updated_by_auth_user_id = auth.uid()
    from public.inventory_location_products source
    where source.organization_id = v_org
      and source.location_id = input_source_location_id
      and source.active = true
      and destination.organization_id = v_org
      and destination.location_id = input_destination_location_id
      and destination.product_id = source.product_id;
    get diagnostics v_updated = row_count;
  end if;

  insert into public.inventory_location_products (
    organization_id, location_id, product_id, par_quantity, minimum_quantity,
    default_restock_quantity, count_order, active, notes, metadata,
    stock_policy, target_mode, reserve_multiplier, case_size, target_cases,
    target_loose_quantity, physical_recount_interval_days,
    created_by_auth_user_id, updated_by_auth_user_id
  )
  select v_org, input_destination_location_id, source.product_id, source.par_quantity,
    source.minimum_quantity, source.default_restock_quantity, source.count_order,
    true, source.notes, source.metadata, source.stock_policy, source.target_mode,
    source.reserve_multiplier, source.case_size, source.target_cases,
    source.target_loose_quantity, source.physical_recount_interval_days,
    auth.uid(), auth.uid()
  from public.inventory_location_products source
  where source.organization_id = v_org
    and source.location_id = input_source_location_id
    and source.active = true
    and not exists (
      select 1 from public.inventory_location_products destination
      where destination.organization_id = v_org
        and destination.location_id = input_destination_location_id
        and destination.product_id = source.product_id
    );
  get diagnostics v_added = row_count;

  return jsonb_build_object(
    'sourceCount', v_source_count,
    'added', v_added,
    'preserved', case when input_overwrite_existing then 0 else v_preserved end,
    'updated', v_updated
  );
end;
$$;

create or replace function public.bulk_upsert_inventory_location_standards(
  input_location_id uuid,
  input_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := public.current_user_organization_id();
  v_row jsonb;
  v_product_id uuid;
  v_assigned boolean;
  v_policy text;
  v_target_mode text;
  v_par numeric;
  v_multiplier numeric;
  v_case_size numeric;
  v_target_cases integer;
  v_target_loose numeric;
  v_recount_days integer;
  v_order integer;
  v_existing public.inventory_location_products%rowtype;
  v_seen uuid[] := array[]::uuid[];
  v_created integer := 0;
  v_updated integer := 0;
  v_archived integer := 0;
  v_preserved integer := 0;
begin
  if auth.uid() is null then raise exception 'Authenticated manager access is required.'; end if;
  if v_org is null or not public.current_user_can_manage_inventory_config() then
    raise exception 'Active manager inventory configuration access is required.';
  end if;
  if public.current_user_is_shared_device() then
    raise exception 'Shared-device accounts cannot configure inventory standards.';
  end if;
  if not exists (
    select 1 from public.inventory_locations location
    where location.id = input_location_id
      and location.organization_id = v_org and location.active = true
  ) then
    raise exception 'Active inventory location was not found in this organization.';
  end if;
  if input_rows is null or jsonb_typeof(input_rows) <> 'array' then
    raise exception 'Inventory standard rows must be an array.';
  end if;

  for v_row in select value from jsonb_array_elements(input_rows)
  loop
    begin
      v_product_id := nullif(trim(coalesce(v_row->>'productId', '')), '')::uuid;
      v_assigned := coalesce((v_row->>'assigned')::boolean, true);
    exception when invalid_text_representation then
      raise exception 'A standard row contains an invalid product or assigned value.';
    end;
    if v_product_id is null then raise exception 'Every standard row requires a product.'; end if;
    if v_product_id = any(v_seen) then raise exception 'A product appears more than once in the standards update.'; end if;
    v_seen := array_append(v_seen, v_product_id);
    if not exists (
      select 1 from public.inventory_products product
      where product.id = v_product_id and product.organization_id = v_org
    ) then
      raise exception 'Inventory product was not found in this organization.';
    end if;
    v_existing := null;
    select standard.* into v_existing
    from public.inventory_location_products standard
    where standard.organization_id = v_org
      and standard.location_id = input_location_id
      and standard.product_id = v_product_id
    for update;

    if not v_assigned then
      if v_existing.id is not null and v_existing.active then
        update public.inventory_location_products standard
        set active = false, updated_by_auth_user_id = auth.uid()
        where standard.id = v_existing.id and standard.organization_id = v_org;
        v_archived := v_archived + 1;
      else
        v_preserved := v_preserved + 1;
      end if;
      continue;
    end if;

    v_policy := lower(trim(coalesce(nullif(v_row->>'stockPolicy', ''), v_existing.stock_policy, 'exact_par')));
    if v_policy not in ('exact_par', 'operating_reserve', 'protected_event_reserve', 'verify_unchanged') then
      raise exception 'Choose a valid stock policy.';
    end if;
    begin
      v_order := coalesce(nullif(trim(coalesce(v_row->>'countOrder', '')), '')::integer, coalesce(v_existing.count_order, 0));
      v_par := coalesce(nullif(trim(coalesce(v_row->>'parQuantity', '')), '')::numeric, v_existing.par_quantity, 0);
      v_target_mode := null;
      v_multiplier := null;
      v_case_size := null;
      v_target_cases := null;
      v_target_loose := null;
      v_recount_days := null;
      if v_policy = 'exact_par' then
        if nullif(trim(coalesce(v_row->>'parQuantity', '')), '') is null and v_existing.id is null then
          raise exception 'Target quantity is required for exact-par stock.';
        end if;
      elsif v_policy = 'operating_reserve' then
        v_target_mode := lower(trim(coalesce(nullif(v_row->>'targetMode', ''), v_existing.target_mode, 'fixed_quantity')));
        if v_target_mode not in ('fixed_quantity', 'derived_multiplier') then raise exception 'Choose a valid operating reserve target mode.'; end if;
        if v_target_mode = 'derived_multiplier' then
          v_multiplier := coalesce(nullif(trim(coalesce(v_row->>'reserveMultiplier', '')), '')::numeric, v_existing.reserve_multiplier);
          if v_multiplier is null or v_multiplier <= 0 then raise exception 'Reserve multiplier must be greater than zero.'; end if;
        elsif nullif(trim(coalesce(v_row->>'parQuantity', '')), '') is null and v_existing.id is null then
          raise exception 'Target quantity is required for fixed operating reserve.';
        end if;
      elsif v_policy = 'protected_event_reserve' then
        v_case_size := coalesce(nullif(trim(coalesce(v_row->>'caseSize', '')), '')::numeric, v_existing.case_size);
        v_target_cases := coalesce(nullif(trim(coalesce(v_row->>'targetCases', '')), '')::integer, v_existing.target_cases);
        v_target_loose := coalesce(nullif(trim(coalesce(v_row->>'targetLooseQuantity', '')), '')::numeric, v_existing.target_loose_quantity, 0);
        if v_case_size is null or v_case_size <= 0 then raise exception 'Case size must be greater than zero.'; end if;
        if v_target_cases is null or v_target_cases < 0 then raise exception 'Target cases cannot be negative.'; end if;
        if v_target_loose < 0 then raise exception 'Loose target cannot be negative.'; end if;
        v_par := v_case_size * v_target_cases + v_target_loose;
      else
        v_recount_days := coalesce(nullif(trim(coalesce(v_row->>'physicalRecountIntervalDays', '')), '')::integer, v_existing.physical_recount_interval_days, 90);
        if v_recount_days <= 0 then raise exception 'Physical recount interval must be greater than zero.'; end if;
      end if;
    exception when invalid_text_representation then
      raise exception 'A standard row contains an invalid policy quantity or count order.';
    end;
    if v_par < 0 or v_order < 0 then raise exception 'Target quantity and count order cannot be negative.'; end if;

    if v_existing.id is null then
      insert into public.inventory_location_products (
        organization_id, location_id, product_id, par_quantity, count_order, active,
        stock_policy, target_mode, reserve_multiplier, case_size, target_cases,
        target_loose_quantity, physical_recount_interval_days,
        created_by_auth_user_id, updated_by_auth_user_id
      ) values (
        v_org, input_location_id, v_product_id, v_par, v_order, true,
        v_policy, v_target_mode, v_multiplier, v_case_size, v_target_cases,
        v_target_loose, v_recount_days, auth.uid(), auth.uid()
      );
      v_created := v_created + 1;
    elsif v_existing.par_quantity is distinct from v_par
       or v_existing.count_order is distinct from v_order
       or v_existing.stock_policy is distinct from v_policy
       or v_existing.target_mode is distinct from v_target_mode
       or v_existing.reserve_multiplier is distinct from v_multiplier
       or v_existing.case_size is distinct from v_case_size
       or v_existing.target_cases is distinct from v_target_cases
       or v_existing.target_loose_quantity is distinct from v_target_loose
       or v_existing.physical_recount_interval_days is distinct from v_recount_days
       or not v_existing.active then
      update public.inventory_location_products standard
      set par_quantity = v_par, count_order = v_order, active = true,
          stock_policy = v_policy, target_mode = v_target_mode,
          reserve_multiplier = v_multiplier, case_size = v_case_size,
          target_cases = v_target_cases, target_loose_quantity = v_target_loose,
          physical_recount_interval_days = v_recount_days,
          updated_by_auth_user_id = auth.uid()
      where standard.id = v_existing.id and standard.organization_id = v_org;
      v_updated := v_updated + 1;
    else
      v_preserved := v_preserved + 1;
    end if;
  end loop;
  return jsonb_build_object('created', v_created, 'updated', v_updated, 'archived', v_archived, 'preserved', v_preserved);
end;
$$;

-- Preserve the existing bottle-storage row and ID while making its operational purpose explicit.
update public.inventory_locations location
set name = 'Main beverage stock', location_type = 'storage', active = true, sort_order = 41
where upper(trim(location.code)) = 'BEVERAGE_STORAGE_BOTTLES';

with beverage_parents as (
  select location.id, location.organization_id
  from public.inventory_locations location
  where upper(trim(location.code)) = 'BEVERAGE_STORAGE'
), missing_locations(code, name, sort_order) as (
  values
    ('BEVERAGE_STORAGE_EVENT_RESERVE'::text, 'Event reserve'::text, 44),
    ('BEVERAGE_STORAGE_DORMANT_SPIRITS'::text, 'Dormant spirits'::text, 45)
)
insert into public.inventory_locations (
  organization_id, name, code, location_type, parent_location_id, zone, active, sort_order
)
select parent.organization_id, missing.name, missing.code, 'storage', parent.id, 'beverage_storage', true, missing.sort_order
from beverage_parents parent
cross join missing_locations missing
where not exists (
  select 1 from public.inventory_locations existing
  where existing.organization_id = parent.organization_id
    and lower(trim(existing.code)) = lower(missing.code)
);

update public.inventory_locations child
set name = template.name, location_type = 'storage', parent_location_id = parent.id,
    zone = 'beverage_storage', active = true, sort_order = template.sort_order
from public.inventory_locations parent,
  (values
    ('BEVERAGE_STORAGE_EVENT_RESERVE'::text, 'Event reserve'::text, 44),
    ('BEVERAGE_STORAGE_DORMANT_SPIRITS'::text, 'Dormant spirits'::text, 45)
  ) as template(code, name, sort_order)
where parent.organization_id = child.organization_id
  and upper(trim(parent.code)) = 'BEVERAGE_STORAGE'
  and upper(trim(child.code)) = template.code;

create or replace function public.setup_mesh_youngstorget_inventory_locations()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := public.current_user_organization_id();
  v_template record;
  v_existing public.inventory_locations%rowtype;
  v_parent_id uuid;
  v_created integer := 0;
  v_reused integer := 0;
  v_restored integer := 0;
  v_updated integer := 0;
  v_locations jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authenticated manager access is required.'; end if;
  if v_org is null or not public.current_user_can_manage_inventory_config() then
    raise exception 'Active manager inventory configuration access is required.';
  end if;
  if public.current_user_is_shared_device() then
    raise exception 'Shared-device accounts cannot set up inventory locations.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('inventory-template:' || v_org::text, 0));
  for v_template in
    select * from jsonb_to_recordset('[
      {"code":"WORKBAR","name":"Workbar","location_type":"bar","parent_code":null,"zone":"workbar","sort_order":10},
      {"code":"WORKBAR_FRIDGE_1","name":"Fridge 1","location_type":"fridge","parent_code":"WORKBAR","zone":"workbar","sort_order":11},
      {"code":"WORKBAR_FRIDGE_2","name":"Fridge 2","location_type":"fridge","parent_code":"WORKBAR","zone":"workbar","sort_order":12},
      {"code":"WORKBAR_FRIDGE_3","name":"Fridge 3","location_type":"fridge","parent_code":"WORKBAR","zone":"workbar","sort_order":13},
      {"code":"WORKBAR_COFFEE","name":"Coffee station","location_type":"area","parent_code":"WORKBAR","zone":"workbar","sort_order":14},
      {"code":"WORKBAR_SNACKS","name":"Snack shelf","location_type":"shelf","parent_code":"WORKBAR","zone":"workbar","sort_order":15},
      {"code":"WORKBAR_BACKBAR","name":"Backbar shelves","location_type":"shelf","parent_code":"WORKBAR","zone":"workbar","sort_order":16},
      {"code":"CORNERBAR","name":"Cornerbar","location_type":"bar","parent_code":null,"zone":"cornerbar","sort_order":20},
      {"code":"CORNERBAR_FRIDGE_1","name":"Fridge 1","location_type":"fridge","parent_code":"CORNERBAR","zone":"cornerbar","sort_order":21},
      {"code":"CORNERBAR_FRIDGE_2","name":"Fridge 2","location_type":"fridge","parent_code":"CORNERBAR","zone":"cornerbar","sort_order":22},
      {"code":"CORNERBAR_BACKBAR","name":"Backbar shelves","location_type":"shelf","parent_code":"CORNERBAR","zone":"cornerbar","sort_order":23},
      {"code":"DRY_STORAGE","name":"Dry Storage","location_type":"storage","parent_code":null,"zone":"storage","sort_order":30},
      {"code":"MAIN_STORAGE","name":"Main Storage","location_type":"storage","parent_code":null,"zone":"storage","sort_order":31},
      {"code":"BEVERAGE_STORAGE","name":"Beverage Storage","location_type":"area","parent_code":null,"zone":"beverage_storage","sort_order":40},
      {"code":"BEVERAGE_STORAGE_BOTTLES","name":"Main beverage stock","location_type":"storage","parent_code":"BEVERAGE_STORAGE","zone":"beverage_storage","sort_order":41},
      {"code":"BEVERAGE_STORAGE_KEGS","name":"Beer kegs","location_type":"storage","parent_code":"BEVERAGE_STORAGE","zone":"beverage_storage","sort_order":42},
      {"code":"BEVERAGE_STORAGE_COCKTAIL","name":"Cocktail ingredients","location_type":"storage","parent_code":"BEVERAGE_STORAGE","zone":"beverage_storage","sort_order":43},
      {"code":"BEVERAGE_STORAGE_EVENT_RESERVE","name":"Event reserve","location_type":"storage","parent_code":"BEVERAGE_STORAGE","zone":"beverage_storage","sort_order":44},
      {"code":"BEVERAGE_STORAGE_DORMANT_SPIRITS","name":"Dormant spirits","location_type":"storage","parent_code":"BEVERAGE_STORAGE","zone":"beverage_storage","sort_order":45}
    ]'::jsonb) as template(code text, name text, location_type text, parent_code text, zone text, sort_order integer)
    order by template.sort_order
  loop
    v_parent_id := null;
    if v_template.parent_code is not null then
      select location.id into v_parent_id from public.inventory_locations location
      where location.organization_id = v_org and lower(trim(location.code)) = lower(v_template.parent_code);
      if v_parent_id is null then raise exception 'Template parent location % is unavailable.', v_template.parent_code; end if;
    end if;
    v_existing := null;
    select location.* into v_existing from public.inventory_locations location
    where location.organization_id = v_org and lower(trim(location.code)) = lower(v_template.code) for update;
    if v_existing.id is null then
      insert into public.inventory_locations (
        organization_id, name, code, location_type, parent_location_id, zone,
        active, sort_order, created_by_auth_user_id, updated_by_auth_user_id
      ) values (
        v_org, v_template.name, v_template.code, v_template.location_type,
        v_parent_id, v_template.zone, true, v_template.sort_order, auth.uid(), auth.uid()
      );
      v_created := v_created + 1;
    else
      if not v_existing.active then v_restored := v_restored + 1; else v_reused := v_reused + 1; end if;
      if v_existing.name is distinct from v_template.name
         or v_existing.code is distinct from v_template.code
         or v_existing.location_type is distinct from v_template.location_type
         or v_existing.parent_location_id is distinct from v_parent_id
         or v_existing.zone is distinct from v_template.zone
         or v_existing.sort_order is distinct from v_template.sort_order
         or not v_existing.active then
        update public.inventory_locations location
        set name = v_template.name, code = v_template.code,
            location_type = v_template.location_type, parent_location_id = v_parent_id,
            zone = v_template.zone, sort_order = v_template.sort_order, active = true,
            updated_by_auth_user_id = auth.uid()
        where location.id = v_existing.id and location.organization_id = v_org;
        v_updated := v_updated + 1;
      end if;
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', location.id, 'name', location.name, 'code', location.code,
    'location_type', location.location_type, 'parent_location_id', location.parent_location_id,
    'zone', location.zone, 'active', location.active, 'sort_order', location.sort_order
  ) order by location.sort_order, location.name), '[]'::jsonb)
  into v_locations
  from public.inventory_locations location
  where location.organization_id = v_org and location.code = any(array[
    'WORKBAR', 'WORKBAR_FRIDGE_1', 'WORKBAR_FRIDGE_2', 'WORKBAR_FRIDGE_3',
    'WORKBAR_COFFEE', 'WORKBAR_SNACKS', 'WORKBAR_BACKBAR', 'CORNERBAR',
    'CORNERBAR_FRIDGE_1', 'CORNERBAR_FRIDGE_2', 'CORNERBAR_BACKBAR',
    'DRY_STORAGE', 'MAIN_STORAGE', 'BEVERAGE_STORAGE', 'BEVERAGE_STORAGE_BOTTLES',
    'BEVERAGE_STORAGE_KEGS', 'BEVERAGE_STORAGE_COCKTAIL',
    'BEVERAGE_STORAGE_EVENT_RESERVE', 'BEVERAGE_STORAGE_DORMANT_SPIRITS'
  ]::text[]);
  return jsonb_build_object('created', v_created, 'reused', v_reused, 'restored', v_restored, 'updated', v_updated, 'locations', v_locations);
end;
$$;

revoke all privileges on table public.inventory_location_products from authenticated;
grant select (
  id, organization_id, location_id, product_id, par_quantity, minimum_quantity,
  default_restock_quantity, count_order, active, notes, stock_policy,
  target_mode, reserve_multiplier, case_size, target_cases,
  target_loose_quantity, physical_recount_interval_days
) on table public.inventory_location_products to authenticated;

revoke all privileges on table public.inventory_count_lines from authenticated;
grant select (
  id, organization_id, session_id, location_id, product_name_snapshot, location_name_snapshot,
  unit_label_snapshot, category_snapshot, location_sort_order_snapshot,
  count_order_snapshot, product_sort_order_snapshot, par_quantity_snapshot,
  minimum_quantity_snapshot, stock_policy_snapshot, target_mode_snapshot,
  effective_target_quantity_snapshot, service_target_basis_snapshot,
  reserve_multiplier_snapshot, case_size_snapshot, target_cases_snapshot,
  target_loose_quantity_snapshot, physical_recount_interval_days_snapshot,
  previous_physical_count_quantity_snapshot, previous_physical_counted_at_snapshot,
  count_full_cases, count_loose_quantity, counted_quantity, count_method,
  count_status, variance_quantity, restock_quantity, note, counted_at,
  counted_by_name, updated_at
) on table public.inventory_count_lines to authenticated;

revoke all on function public.inventory_stock_policy_target(uuid) from public, anon, authenticated;
revoke all on function public.inventory_count_line_client_record(uuid) from public, anon, authenticated;
revoke all on function public.create_inventory_count_session(text, text, date, uuid[], text, text) from public, anon, authenticated;
revoke all on function public.set_inventory_count_line_quantity(uuid, numeric, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.set_inventory_count_line_case_quantity(uuid, integer, numeric, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.mark_inventory_count_line_use_par(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.clear_inventory_count_line(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.skip_inventory_count_line(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.mark_inventory_location_use_par(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.confirm_inventory_count_line_unchanged(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.copy_inventory_location_standards(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.bulk_upsert_inventory_location_standards(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.setup_mesh_youngstorget_inventory_locations() from public, anon, authenticated;

grant execute on function public.inventory_count_line_client_record(uuid) to authenticated;
grant execute on function public.create_inventory_count_session(text, text, date, uuid[], text, text) to authenticated;
grant execute on function public.set_inventory_count_line_quantity(uuid, numeric, text, text, timestamptz) to authenticated;
grant execute on function public.set_inventory_count_line_case_quantity(uuid, integer, numeric, text, text, timestamptz) to authenticated;
grant execute on function public.mark_inventory_count_line_use_par(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.clear_inventory_count_line(uuid, text, timestamptz) to authenticated;
grant execute on function public.skip_inventory_count_line(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.mark_inventory_location_use_par(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.confirm_inventory_count_line_unchanged(uuid, timestamptz) to authenticated;
grant execute on function public.copy_inventory_location_standards(uuid, uuid, boolean) to authenticated;
grant execute on function public.bulk_upsert_inventory_location_standards(uuid, jsonb) to authenticated;
grant execute on function public.setup_mesh_youngstorget_inventory_locations() to authenticated;

notify pgrst, 'reload schema';
