-- Phase 9I: immutable, manager-only Millum Stock Count export profile v1.
-- Apply after Phase 9H. This additive terminal migration is repeatable.

create schema if not exists inventory_private;
revoke all on schema inventory_private from public, anon, authenticated;

create table if not exists public.inventory_millum_export_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  profile_key text not null,
  profile_version integer not null,
  title text not null,
  source_document text not null,
  status text not null default 'draft',
  manifest_row_count integer not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  created_by_auth_user_id uuid references auth.users(id),
  constraint inventory_millum_export_profiles_key_required check (nullif(trim(profile_key), '') is not null),
  constraint inventory_millum_export_profiles_title_required check (nullif(trim(title), '') is not null),
  constraint inventory_millum_export_profiles_version_positive check (profile_version > 0),
  constraint inventory_millum_export_profiles_row_count_positive check (manifest_row_count > 0),
  constraint inventory_millum_export_profiles_status_check check (status in ('draft', 'published')),
  constraint inventory_millum_export_profiles_publish_check check (
    (status = 'draft' and published_at is null) or
    (status = 'published' and published_at is not null)
  ),
  constraint inventory_millum_export_profiles_unique unique (organization_id, profile_key, profile_version)
);

create table if not exists public.inventory_millum_export_rows (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.inventory_millum_export_profiles(id),
  organization_id uuid not null references public.organizations(id),
  row_key text not null,
  group_name text not null,
  group_order integer not null,
  row_order integer not null,
  item_number text not null,
  occurrence integer not null,
  official_name text not null,
  enabled boolean not null,
  mapped_product_id uuid references public.inventory_products(id),
  created_at timestamptz not null default now(),
  constraint inventory_millum_export_rows_key_required check (nullif(trim(row_key), '') is not null),
  constraint inventory_millum_export_rows_group_required check (nullif(trim(group_name), '') is not null),
  constraint inventory_millum_export_rows_item_required check (nullif(trim(item_number), '') is not null),
  constraint inventory_millum_export_rows_name_required check (nullif(trim(official_name), '') is not null),
  constraint inventory_millum_export_rows_order_positive check (group_order > 0 and row_order > 0 and occurrence > 0),
  constraint inventory_millum_export_rows_disabled_unmapped check (enabled or mapped_product_id is null),
  constraint inventory_millum_export_rows_key_unique unique (profile_id, row_key),
  constraint inventory_millum_export_rows_position_unique unique (profile_id, group_order, row_order)
);

create unique index if not exists inventory_millum_export_rows_active_product_unique
  on public.inventory_millum_export_rows (profile_id, mapped_product_id)
  where enabled and mapped_product_id is not null;
create index if not exists inventory_millum_export_rows_profile_order_idx
  on public.inventory_millum_export_rows (profile_id, group_order, row_order);
create index if not exists inventory_millum_export_rows_product_idx
  on public.inventory_millum_export_rows (organization_id, mapped_product_id)
  where mapped_product_id is not null;

create table if not exists inventory_private.inventory_millum_export_transforms (
  profile_id uuid not null references public.inventory_millum_export_profiles(id),
  row_key text not null,
  operation text not null,
  divisor numeric not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, row_key),
  constraint inventory_millum_export_transforms_operation_check check (operation = 'divide_round_2'),
  constraint inventory_millum_export_transforms_divisor_positive check (
    divisor > 0 and divisor::text not in ('NaN', 'Infinity', '-Infinity')
  ),
  constraint inventory_millum_export_transforms_row_fkey foreign key (profile_id, row_key)
    references public.inventory_millum_export_rows(profile_id, row_key)
);

create table if not exists public.inventory_millum_export_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  session_id uuid not null references public.inventory_count_sessions(id),
  profile_id uuid not null references public.inventory_millum_export_profiles(id),
  profile_version integer not null,
  source_digest text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  constraint inventory_millum_export_snapshots_version_positive check (profile_version > 0),
  constraint inventory_millum_export_snapshots_digest_required check (nullif(trim(source_digest), '') is not null),
  constraint inventory_millum_export_snapshots_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint inventory_millum_export_snapshots_unique unique (session_id, profile_id)
);

create index if not exists inventory_millum_export_snapshots_org_created_idx
  on public.inventory_millum_export_snapshots (organization_id, created_at desc);
create index if not exists inventory_millum_export_snapshots_profile_idx
  on public.inventory_millum_export_snapshots (profile_id);

alter table public.inventory_millum_export_profiles enable row level security;
alter table public.inventory_millum_export_rows enable row level security;
alter table public.inventory_millum_export_snapshots enable row level security;

revoke all on table public.inventory_millum_export_profiles from public, anon, authenticated;
revoke all on table public.inventory_millum_export_rows from public, anon, authenticated;
revoke all on table public.inventory_millum_export_snapshots from public, anon, authenticated;
revoke all on table inventory_private.inventory_millum_export_transforms from public, anon, authenticated;

create or replace function inventory_private.inventory_millum_profile_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.status = 'published' then
    raise exception 'Published Millum export profiles are immutable.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function inventory_private.inventory_millum_profile_child_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_profile_id uuid := coalesce(new.profile_id, old.profile_id);
begin
  if exists (
    select 1 from public.inventory_millum_export_profiles profile
    where profile.id = v_profile_id and profile.status = 'published'
  ) then
    raise exception 'Published Millum export profile configuration is immutable.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function inventory_private.inventory_millum_snapshot_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'Generated Millum export snapshots are immutable.';
end;
$$;

create or replace function inventory_private.inventory_millum_validate_row_organization()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_profile_organization_id uuid;
  v_product_organization_id uuid;
begin
  select profile.organization_id into v_profile_organization_id
  from public.inventory_millum_export_profiles profile where profile.id = new.profile_id;
  if v_profile_organization_id is null or v_profile_organization_id is distinct from new.organization_id then
    raise exception 'Millum export relationships must remain in one organization.';
  end if;
  if new.mapped_product_id is not null then
    select product.organization_id into v_product_organization_id
    from public.inventory_products product where product.id = new.mapped_product_id;
    if v_product_organization_id is null or v_product_organization_id is distinct from new.organization_id then
      raise exception 'Millum export relationships must remain in one organization.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function inventory_private.inventory_millum_validate_snapshot_organization()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_profile_organization_id uuid;
  v_session_organization_id uuid;
begin
  select profile.organization_id into v_profile_organization_id
  from public.inventory_millum_export_profiles profile where profile.id = new.profile_id;
  select session.organization_id into v_session_organization_id
  from public.inventory_count_sessions session where session.id = new.session_id;
  if v_profile_organization_id is null or v_session_organization_id is null
     or v_profile_organization_id is distinct from new.organization_id
     or v_session_organization_id is distinct from new.organization_id then
    raise exception 'Millum export relationships must remain in one organization.';
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_millum_profiles_immutable on public.inventory_millum_export_profiles;
create trigger inventory_millum_profiles_immutable
before update or delete on public.inventory_millum_export_profiles
for each row execute function inventory_private.inventory_millum_profile_immutable();

drop trigger if exists inventory_millum_rows_immutable on public.inventory_millum_export_rows;
create trigger inventory_millum_rows_immutable
before update or delete on public.inventory_millum_export_rows
for each row execute function inventory_private.inventory_millum_profile_child_immutable();

drop trigger if exists inventory_millum_transforms_immutable on inventory_private.inventory_millum_export_transforms;
create trigger inventory_millum_transforms_immutable
before update or delete on inventory_private.inventory_millum_export_transforms
for each row execute function inventory_private.inventory_millum_profile_child_immutable();

drop trigger if exists inventory_millum_snapshots_immutable on public.inventory_millum_export_snapshots;
create trigger inventory_millum_snapshots_immutable
before update or delete on public.inventory_millum_export_snapshots
for each row execute function inventory_private.inventory_millum_snapshot_immutable();

drop trigger if exists inventory_millum_rows_validate_organization on public.inventory_millum_export_rows;
create trigger inventory_millum_rows_validate_organization
before insert or update on public.inventory_millum_export_rows
for each row execute function inventory_private.inventory_millum_validate_row_organization();

drop trigger if exists inventory_millum_snapshots_validate_organization on public.inventory_millum_export_snapshots;
create trigger inventory_millum_snapshots_validate_organization
before insert or update on public.inventory_millum_export_snapshots
for each row execute function inventory_private.inventory_millum_validate_snapshot_organization();

create or replace function inventory_private.inventory_millum_apply_transform(
  input_value numeric,
  input_operation text,
  input_divisor numeric
)
returns numeric
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
begin
  if input_value < 0 then raise exception 'Millum export quantities cannot be negative.'; end if;
  if input_operation <> 'divide_round_2' or input_divisor <= 0 then
    raise exception 'Invalid protected Millum transformation configuration.';
  end if;
  return round(input_value / input_divisor, 2);
end;
$$;

create or replace function inventory_private.inventory_millum_format_value(input_value numeric)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_value text;
begin
  if input_value = 0 then return '0'; end if;
  v_value := input_value::text;
  if position('.' in v_value) > 0 then
    v_value := trim(trailing '0' from v_value);
    v_value := trim(trailing '.' from v_value);
  end if;
  return replace(v_value, '.', ',');
end;
$$;

create or replace function inventory_private.inventory_install_millum_profile_v1(
  input_organization_id uuid,
  input_actor_auth_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_profile public.inventory_millum_export_profiles%rowtype;
  v_item record;
  v_product_id uuid;
  v_manifest jsonb := $manifest$
  [
    {"g":"HARD ALCOHOL","go":1,"ro":1,"ref":"410829","name":"ABSOLUT VODKA 40% 70CL","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":2,"ref":"410829","name":"ABSOLUT VODKA 40% 70CL","occ":2,"enabled":false},
    {"g":"HARD ALCOHOL","go":1,"ro":3,"ref":"4398384","name":"BAILEYS ORIGINAL 70CL","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":4,"ref":"2573491","name":"BUFFALO TRACE, 70 CL","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":5,"ref":"2573491","name":"BUFFALO TRACE, 70 CL","occ":2,"enabled":false},
    {"g":"HARD ALCOHOL","go":1,"ro":6,"ref":"1917681","name":"CAMPARI BITTER 70CL","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":7,"ref":"4010017","name":"Cuvee Anna VS","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":8,"ref":"6751127","name":"DIPLOMATICO MANTUANO","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":9,"ref":"9073145","name":"Fernet Branca 50cl","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":10,"ref":"4014146","name":"Galliano Espresso 50Cl","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":11,"ref":"585901","name":"GALLIANO VANILLA, 70 CL","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":12,"ref":"585901","name":"GALLIANO VANILLA, 70 CL","occ":2,"enabled":false},
    {"g":"HARD ALCOHOL","go":1,"ro":13,"ref":"3366702","name":"Giffard Blue Curacao Liqueur 50cl","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":14,"ref":"4054613","name":"Ginger Ninja Hot Chili 20L Keykeg","occ":1,"enabled":false},
    {"g":"HARD ALCOHOL","go":1,"ro":15,"ref":"4014977","name":"Glenmorangie Original","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":16,"ref":"2295772","name":"HAVANA CLUB 3 ANOS 37.5% 70CL","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":17,"ref":"2295772","name":"HAVANA CLUB 3 ANOS 37.5% 70CL","occ":2,"enabled":false},
    {"g":"HARD ALCOHOL","go":1,"ro":18,"ref":"564757","name":"HAVANA CLUB 7 ANOS 40% 70CL","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":19,"ref":"564757","name":"HAVANA CLUB 7 ANOS 40% 70CL","occ":2,"enabled":false},
    {"g":"HARD ALCOHOL","go":1,"ro":20,"ref":"1287473","name":"JAGERMEISTER, 100 CL","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":21,"ref":"5834718","name":"KAHLUA 70CL","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":22,"ref":"584888","name":"LIQUEUR COINTREAU, 70 CL","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":23,"ref":"584888","name":"LIQUEUR COINTREAU, 70 CL","occ":2,"enabled":false},
    {"g":"HARD ALCOHOL","go":1,"ro":24,"ref":"4911236","name":"MARTINI RISERVA RUBINO 18%","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":25,"ref":"4022359","name":"Mezcal Koch Espadin","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":26,"ref":"1364918","name":"NOILLY PRAT 18%, 100 CL","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":27,"ref":"8480010","name":"Nuet Dry Aquavit","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":28,"ref":"8480014","name":"Nuet Moments Toddy 50cl ENKELTFLASKER","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":29,"ref":"8480017","name":"Nuet Spritz 20L KeyKeg","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":30,"ref":"4345955","name":"OHD MARKA BITTER 35% 50CL","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":31,"ref":"4616173","name":"OHD VIDDA TØRR GIN 43% 70CL","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":32,"ref":"4530804","name":"PÈRE KERMANN'S ABSINTHE","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":33,"ref":"4530804","name":"PÈRE KERMANN'S ABSINTHE","occ":2,"enabled":false},
    {"g":"HARD ALCOHOL","go":1,"ro":34,"ref":"4552915","name":"ST. GERMAIN, 50 CL","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":35,"ref":"5128517","name":"TUBI 60","occ":1,"enabled":true},
    {"g":"HARD ALCOHOL","go":1,"ro":36,"ref":"9081401","name":"Veritas White Blended Rum","occ":1,"enabled":true},
    {"g":"COFFEE","go":2,"ro":1,"ref":"131125","name":"Bønner - Start Up Blend","occ":1,"enabled":true},
    {"g":"COFFEE","go":2,"ro":2,"ref":"131124","name":"Filter-malt Start Up Blend","occ":1,"enabled":true},
    {"g":"COFFEE","go":2,"ro":3,"ref":"8577032","name":"Magnat Kvadraturen Espresso","occ":1,"enabled":true},
    {"g":"SNACKS","go":3,"ro":1,"ref":"3195823","name":"BARMIX NØTTER 200G ELDORADO","occ":1,"enabled":true},
    {"g":"SNACKS","go":3,"ro":2,"ref":"5876099","name":"BE-KIND BAR CARAMEL ALMOND & SEA SALT 40G","occ":1,"enabled":true},
    {"g":"SNACKS","go":3,"ro":3,"ref":"5887468","name":"BE-KIND BAR PEANUT BUTTER DARK CHOC 40G","occ":1,"enabled":true},
    {"g":"SNACKS","go":3,"ro":4,"ref":"5350731","name":"FJELLSNACKS TØRKET REINKJØTT POSE 25G","occ":1,"enabled":true},
    {"g":"SNACKS","go":3,"ro":5,"ref":"6198758","name":"FROSTACHIPS GRILLA PAPRIKA 40G","occ":1,"enabled":true},
    {"g":"SNACKS","go":3,"ro":6,"ref":"6198360","name":"FROSTACHIPS HAVSNØ FLAKSALT 40G","occ":1,"enabled":true},
    {"g":"SNACKS","go":3,"ro":7,"ref":"6566665","name":"NØTTI FRUTTI 50G DLN","occ":1,"enabled":true},
    {"g":"SNACKS","go":3,"ro":8,"ref":"3196318","name":"PEANØTTER 275G ELDORADO","occ":1,"enabled":true},
    {"g":"SNACKS","go":3,"ro":9,"ref":"6566640","name":"SPESIAL NØTTER 50G DLN","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":1,"ref":"5744222","name":"AASS EPLEMOST 0,33L FL","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":2,"ref":"6752422","name":"APPELSINJUICE 250ML JUICERIET","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":3,"ref":"1831718","name":"COCIO CLASSIC SJOKOMELK 400ML","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":4,"ref":"6681001","name":"COCOMAX KOKOSVANN 1L","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":5,"ref":"5104666","name":"FARRIS NATURELL 0,375L FL PROFIL","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":6,"ref":"4013209","name":"Fentimans Soda Water 0% 24×20cl","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":7,"ref":"4013279","name":"Fever Tree Pink Grapefruit 24×20cl","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":8,"ref":"6388581","name":"FRUKTSMEKK EPLE 0,33L BX SAFTERIET","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":9,"ref":"6503346","name":"FRUKTSMEKK HYLLEBLOMST & SITRON 0,33L BX","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":10,"ref":"5804190","name":"FRUKTSMEKK RABARBRA & HYLLEBLOMST 0,33L","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":11,"ref":"5010715","name":"GINGER BEER MIXER 0,5L FL FEVER-TREE","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":12,"ref":"4014701","name":"Ginger Ninja Hot Chili Ginger Beer 12×33cl","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":13,"ref":"6757157","name":"ISKAFFE LATTE 250ML OSLO COLD BREW","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":14,"ref":"814467","name":"PEPSI MAX 0,3L FL PROFIL","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":15,"ref":"5906748","name":"SAN PELLEGRINO ARANCIATA 0,33L BX","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":16,"ref":"5907001","name":"SAN PELLEGRINO ARANCIATA ROSSA 0,33L","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":17,"ref":"5906961","name":"SAN PELLEGRINO LIMONATA 0,33L","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":18,"ref":"6631634","name":"SKOG 03 0,33L FL VILLBRYGG","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":19,"ref":"6017933","name":"SPARKLING TEA BLÅ ALKOHOLFRI MUSSERENDE","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":20,"ref":"5285960","name":"SURF KOMBUCHA LIME 0,33L FL","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":21,"ref":"5059183","name":"SURF KOMBUCHA TROPISK INGEFÆR","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":22,"ref":"5010707","name":"TONIC WATER PREMIUM 0,5L FL FEVER-TREE","occ":1,"enabled":true},
    {"g":"SODAS","go":4,"ro":23,"ref":"4030686","name":"Villbrygg Skog 03 75cl","occ":1,"enabled":true},
    {"g":"WINE","go":5,"ro":1,"ref":"9082081","name":"20.000 Leguas","occ":1,"enabled":true},
    {"g":"WINE","go":5,"ro":2,"ref":"4000232","name":"Abbazia Prosecco Extra Dry","occ":1,"enabled":true},
    {"g":"WINE","go":5,"ro":3,"ref":"4057913","name":"Ca'Di Rajo Pinot Grigio","occ":1,"enabled":true},
    {"g":"WINE","go":5,"ro":4,"ref":"4004935","name":"Ca'N Verdura Negre","occ":1,"enabled":true},
    {"g":"WINE","go":5,"ro":5,"ref":"9020587","name":"Casamatta Bianco","occ":1,"enabled":true},
    {"g":"WINE","go":5,"ro":6,"ref":"9031232","name":"Casamatta Rosso","occ":1,"enabled":true},
    {"g":"WINE","go":5,"ro":7,"ref":"9078232","name":"Castellroig Reserva Brut Nature","occ":1,"enabled":true},
    {"g":"WINE","go":5,"ro":8,"ref":"9082082","name":"Lanzando Pet-Nat White Wine","occ":1,"enabled":true},
    {"g":"WINE","go":5,"ro":9,"ref":"4026939","name":"Maschio Prosecco Ca'Bertaldo","occ":1,"enabled":true},
    {"g":"WINE","go":5,"ro":10,"ref":"9082515","name":"Nugues Beaujolais Lancie","occ":1,"enabled":true},
    {"g":"BEER","go":6,"ro":1,"ref":"6181002","name":"7FJELL GINGER NINJA NORDIC BERRIES 0,33L","occ":1,"enabled":true},
    {"g":"BEER","go":6,"ro":2,"ref":"6152995","name":"AASS IPA MANGO 20L STÅLFAT","occ":1,"enabled":true},
    {"g":"BEER","go":6,"ro":3,"ref":"6152979","name":"AASS LITE VIENNA LAGER 20L STÅLFAT","occ":1,"enabled":true},
    {"g":"BEER","go":6,"ro":4,"ref":"4019089","name":"AASS PILS 30L FAT","occ":1,"enabled":true},
    {"g":"BEER","go":6,"ro":5,"ref":"5932918","name":"AASS PILSNER 0,33L FL","occ":1,"enabled":true},
    {"g":"BEER","go":6,"ro":6,"ref":"5932900","name":"AASS UTEN 0,33L FL","occ":1,"enabled":true},
    {"g":"BEER","go":6,"ro":7,"ref":"5746938","name":"ATTÅT SIDER EPLE/JORDBÆR/RABARBRA 0,33L","occ":1,"enabled":true},
    {"g":"BEER","go":6,"ro":8,"ref":"6274237","name":"FRIPA 0,33L BX KLOKK & CO","occ":1,"enabled":true},
    {"g":"BEER","go":6,"ro":9,"ref":"4054613","name":"Ginger Ninja Hot Chili 20L Keykeg","occ":2,"enabled":true},
    {"g":"BEER","go":6,"ro":10,"ref":"9082254","name":"Noam Bavaria 24×34cl","occ":1,"enabled":true},
    {"g":"BEER","go":6,"ro":11,"ref":"707000631","name":"Norwegian Blonde 24×33cl","occ":1,"enabled":true},
    {"g":"BEER","go":6,"ro":12,"ref":"4966818","name":"OSLOVE PASSION BLONDE 0,33L FL OSLO","occ":1,"enabled":true},
    {"g":"COCKTAIL INGREDIENTS","go":7,"ro":1,"ref":"2446276","name":"FINEST CALL GRENADINE SIRUP 1L","occ":1,"enabled":true},
    {"g":"COCKTAIL INGREDIENTS","go":7,"ro":2,"ref":"4043579","name":"Monin Agave Syrup","occ":1,"enabled":true},
    {"g":"COCKTAIL INGREDIENTS","go":7,"ro":3,"ref":"4043495","name":"Monin Passionfruit Syrup 70cl","occ":1,"enabled":true},
    {"g":"COCKTAIL INGREDIENTS","go":7,"ro":4,"ref":"4043535","name":"Monin Violet Syrup","occ":1,"enabled":true}
  ]
  $manifest$::jsonb;
begin
  if input_organization_id is null then raise exception 'Organization is required for a Millum export profile.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('millum-profile-v1:' || input_organization_id::text, 0));

  select profile.* into v_profile
  from public.inventory_millum_export_profiles profile
  where profile.organization_id = input_organization_id
    and profile.profile_key = 'my-work-bar-jul'
    and profile.profile_version = 1;

  if v_profile.id is not null then
    if v_profile.status <> 'published'
       or v_profile.manifest_row_count <> 97
       or (select count(*) from public.inventory_millum_export_rows row where row.profile_id = v_profile.id) <> 97
       or (select count(*) from public.inventory_millum_export_rows row where row.profile_id = v_profile.id and row.enabled) <> 89
       or (select count(*) from inventory_private.inventory_millum_export_transforms transform where transform.profile_id = v_profile.id) <> 3 then
      raise exception 'Existing Millum export profile v1 is incomplete or inconsistent.';
    end if;
    return v_profile.id;
  end if;

  insert into public.inventory_millum_export_profiles (
    organization_id, profile_key, profile_version, title, source_document,
    status, manifest_row_count, created_by_auth_user_id
  ) values (
    input_organization_id, 'my-work-bar-jul', 1, 'MY WORK-BAR JUL',
    'MY Work-bar Jul_items.pdf · period 7/2026 · printed 03.08.2026',
    'draft', 97, input_actor_auth_user_id
  ) returning * into v_profile;

  for v_item in
    select * from jsonb_to_recordset(v_manifest) as item(
      g text, go integer, ro integer, ref text, name text, occ integer, enabled boolean
    ) order by go, ro
  loop
    v_product_id := null;
    if v_item.enabled then
      select product.id into v_product_id
      from public.inventory_products product
      where product.organization_id = input_organization_id
        and product.millum_item_ref = v_item.ref;
    end if;
    insert into public.inventory_millum_export_rows (
      profile_id, organization_id, row_key, group_name, group_order, row_order,
      item_number, occurrence, official_name, enabled, mapped_product_id
    ) values (
      v_profile.id, input_organization_id,
      lower(replace(v_item.g, ' ', '-')) || '-' || lpad(v_item.ro::text, 2, '0') || '-' || v_item.ref || '-' || v_item.occ,
      v_item.g, v_item.go, v_item.ro, v_item.ref, v_item.occ, v_item.name,
      v_item.enabled, v_product_id
    );
  end loop;

  insert into inventory_private.inventory_millum_export_transforms (profile_id, row_key, operation, divisor)
  select row.profile_id, row.row_key, 'divide_round_2', transform.divisor
  from public.inventory_millum_export_rows row
  join (values ('4000232'::text, 6::numeric), ('4057913', 60::numeric), ('4004935', 60::numeric)) transform(item_number, divisor)
    on transform.item_number = row.item_number
  where row.profile_id = v_profile.id and row.enabled;

  if (select count(*) from public.inventory_millum_export_rows row where row.profile_id = v_profile.id) <> 97
     or (select count(*) from public.inventory_millum_export_rows row where row.profile_id = v_profile.id and row.enabled) <> 89
     or (select count(*) from inventory_private.inventory_millum_export_transforms transform where transform.profile_id = v_profile.id) <> 3 then
    raise exception 'Millum export profile v1 failed manifest validation.';
  end if;

  update public.inventory_millum_export_profiles
  set status = 'published', published_at = now()
  where id = v_profile.id
  returning * into v_profile;
  return v_profile.id;
end;
$$;

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
  v_profile_id uuid;
  v_group record;
  v_row record;
  v_source record;
  v_extra record;
  v_transform record;
  v_groups jsonb := '[]'::jsonb;
  v_rows jsonb;
  v_diagnostics jsonb := '[]'::jsonb;
  v_mapping_diagnostics jsonb := '[]'::jsonb;
  v_final numeric;
  v_state text;
  v_payload jsonb;
  v_source_digest text;
begin
  if not public.current_user_can_manage_inventory_config() or public.current_user_is_shared_device() then
    raise exception 'Active non-shared manager access is required for Millum exports.';
  end if;
  select * into v_actor from public.inventory_resolve_actor(null);
  select session.* into v_session
  from public.inventory_count_sessions session
  where session.id = input_session_id and session.organization_id = v_actor.organization_id
  for share;
  if v_session.id is null then raise exception 'Approved Stock Count not found for this organization.'; end if;
  if v_session.status <> 'approved' then raise exception 'Only approved immutable Stock Counts can be exported to Millum.'; end if;

  v_profile_id := inventory_private.inventory_install_millum_profile_v1(v_actor.organization_id, v_actor.actor_auth_user_id);
  select profile.* into v_profile from public.inventory_millum_export_profiles profile where profile.id = v_profile_id;
  select snapshot.* into v_snapshot
  from public.inventory_millum_export_snapshots snapshot
  where snapshot.session_id = v_session.id and snapshot.profile_id = v_profile.id;
  if v_snapshot.id is not null then
    return jsonb_set(v_snapshot.payload, '{snapshotId}', to_jsonb(v_snapshot.id), true);
  end if;

  for v_row in
    select row.* from public.inventory_millum_export_rows row
    where row.profile_id = v_profile.id and (not row.enabled or row.mapped_product_id is null)
    order by row.group_order, row.row_order
  loop
    v_mapping_diagnostics := v_mapping_diagnostics || jsonb_build_array(jsonb_build_object(
      'rowKey', v_row.row_key, 'group', v_row.group_name, 'rowOrder', v_row.row_order,
      'itemNumber', v_row.item_number, 'officialName', v_row.official_name,
      'enabled', v_row.enabled, 'mapped', v_row.mapped_product_id is not null,
      'message', case when not v_row.enabled then 'Disabled in export profile v1' else 'No stable product mapping' end
    ));
  end loop;

  for v_group in
    select row.group_name, row.group_order
    from public.inventory_millum_export_rows row
    where row.profile_id = v_profile.id and row.enabled
    group by row.group_name, row.group_order order by row.group_order
  loop
    v_rows := '[]'::jsonb;
    for v_row in
      select row.* from public.inventory_millum_export_rows row
      where row.profile_id = v_profile.id and row.enabled and row.group_order = v_group.group_order
      order by row.row_order
    loop
      v_source := null;
      select
        count(*)::integer as line_count,
        count(*) filter (where source.canonical_quantity is null)::integer as missing_count,
        sum(source.canonical_quantity) as canonical_quantity
      into v_source
      from (
        select case
          when line.count_mode_snapshot = 'container_plus_volume' then
            case when line.counted_whole_units is null or line.counted_open_volume_liters is null
                   or line.container_capacity_liters_snapshot is null or line.container_capacity_liters_snapshot <= 0
              then null
              else line.counted_whole_units + line.counted_open_volume_liters / line.container_capacity_liters_snapshot
            end
          else line.counted_quantity
        end as canonical_quantity
        from public.inventory_count_lines line
        where line.session_id = v_session.id and line.product_id = v_row.mapped_product_id
      ) source;

      v_final := null;
      if v_row.mapped_product_id is null then
        v_state := 'unmapped';
        v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object(
          'code', 'unmapped_row', 'rowKey', v_row.row_key, 'itemNumber', v_row.item_number,
          'productName', v_row.official_name, 'message', 'Enabled Millum row has no stable product mapping.'
        ));
      elsif coalesce(v_source.line_count, 0) = 0 or coalesce(v_source.missing_count, 0) > 0 or v_source.canonical_quantity is null then
        v_state := 'missing';
        v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object(
          'code', 'missing_quantity', 'rowKey', v_row.row_key, 'itemNumber', v_row.item_number,
          'productName', v_row.official_name, 'message', 'Approved source count is missing a final physical quantity.'
        ));
      elsif v_source.canonical_quantity < 0 then
        v_state := 'invalid';
        v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object(
          'code', 'negative_quantity', 'rowKey', v_row.row_key, 'itemNumber', v_row.item_number,
          'productName', v_row.official_name, 'message', 'Approved source quantity is invalid.'
        ));
      else
        select transform.operation, transform.divisor into v_transform
        from inventory_private.inventory_millum_export_transforms transform
        where transform.profile_id = v_profile.id and transform.row_key = v_row.row_key;
        v_final := case when v_transform.operation is null then v_source.canonical_quantity
          else inventory_private.inventory_millum_apply_transform(v_source.canonical_quantity, v_transform.operation, v_transform.divisor) end;
        v_state := 'ready';
      end if;

      v_rows := v_rows || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'rowKey', v_row.row_key, 'rowOrder', v_row.row_order, 'itemNumber', v_row.item_number,
        'productName', v_row.official_name, 'state', v_state,
        'finalValueNumeric', v_final,
        'finalValue', case when v_final is null then null else inventory_private.inventory_millum_format_value(v_final) end
      )));
    end loop;
    v_groups := v_groups || jsonb_build_array(jsonb_build_object(
      'name', v_group.group_name, 'order', v_group.group_order, 'rows', v_rows
    ));
  end loop;

  for v_extra in
    select line.product_id, max(line.product_name_snapshot) as product_name,
           max(product.millum_item_ref) as millum_item_ref
    from public.inventory_count_lines line
    left join public.inventory_products product on product.id = line.product_id and product.organization_id = line.organization_id
    where line.session_id = v_session.id
      and (case when line.count_mode_snapshot = 'container_plus_volume'
        then line.counted_whole_units is not null and line.counted_open_volume_liters is not null
        else line.counted_quantity is not null end)
      and not exists (
        select 1 from public.inventory_millum_export_rows row
        where row.profile_id = v_profile.id and row.enabled and row.mapped_product_id = line.product_id
      )
    group by line.product_id
    order by max(line.product_name_snapshot), line.product_id
  loop
    v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object(
      'code', 'counted_product_not_in_profile', 'productId', v_extra.product_id,
      'itemNumber', v_extra.millum_item_ref, 'productName', v_extra.product_name,
      'message', 'A recorded Mesh product has no enabled row in Millum export profile v1.'
    ));
  end loop;

  select md5(coalesce(jsonb_agg(to_jsonb(line) order by line.id)::text, '[]'))
  into v_source_digest from public.inventory_count_lines line where line.session_id = v_session.id;

  v_payload := jsonb_build_object(
    'snapshotId', null,
    'organizationName', (select organization.name from public.organizations organization where organization.id = v_actor.organization_id),
    'sessionId', v_session.id,
    'sessionShortRef', upper(substr(replace(v_session.id::text, '-', ''), 1, 8)),
    'sessionTitle', v_session.title,
    'countDate', v_session.count_date,
    'approvedAt', v_session.approved_at,
    'profileKey', v_profile.profile_key,
    'profileVersion', v_profile.profile_version,
    'profileTitle', v_profile.title,
    'ready', jsonb_array_length(v_diagnostics) = 0,
    'groups', v_groups,
    'diagnostics', v_diagnostics,
    'mappingDiagnostics', v_mapping_diagnostics
  );

  insert into public.inventory_millum_export_snapshots (
    organization_id, session_id, profile_id, profile_version, source_digest, payload, created_by_auth_user_id
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

revoke all on function public.get_inventory_millum_export(uuid) from public, anon, authenticated;
grant execute on function public.get_inventory_millum_export(uuid) to authenticated;
revoke all on function inventory_private.inventory_install_millum_profile_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function inventory_private.inventory_millum_apply_transform(numeric, text, numeric) from public, anon, authenticated;
revoke all on function inventory_private.inventory_millum_format_value(numeric) from public, anon, authenticated;

do $$
declare
  v_organization record;
begin
  for v_organization in
    select distinct product.organization_id
    from public.inventory_products product
    where product.millum_item_ref is not null
  loop
    perform inventory_private.inventory_install_millum_profile_v1(v_organization.organization_id, null);
  end loop;
end;
$$;
