-- Phase 10C: Routine Reference Images and Placeholders.
--
-- Apply after phase10a_routine_engine_foundation.sql and
-- phase10b_routine_templates.sql. This migration is additive. It creates a
-- dedicated private Routine Engine bucket and never reads from or mutates
-- Inventory, Event Operations, Auth configuration, or legacy routine data.

do $phase10c_bucket$
declare
  v_bucket storage.buckets%rowtype;
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception using
      errcode = '55000',
      message = 'Supabase Storage tables are required before Phase 10C can be applied.';
  end if;

  select bucket.* into v_bucket
  from storage.buckets bucket
  where bucket.id = 'routine-reference-images';

  if v_bucket.id is null then
    insert into storage.buckets (
      id, name, public, file_size_limit, allowed_mime_types
    ) values (
      'routine-reference-images',
      'routine-reference-images',
      false,
      5242880,
      array['image/jpeg', 'image/png', 'image/webp']::text[]
    );
  elsif v_bucket.name is distinct from 'routine-reference-images'
     or v_bucket.public is distinct from false
     or v_bucket.file_size_limit is distinct from 5242880
     or v_bucket.allowed_mime_types is null
     or not (
       v_bucket.allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']::text[]
       and v_bucket.allowed_mime_types <@ array['image/jpeg', 'image/png', 'image/webp']::text[]
     ) then
    raise exception using
      errcode = '55000',
      message = 'Existing routine-reference-images bucket configuration is incompatible with Phase 10C.';
  end if;
end;
$phase10c_bucket$;

create or replace function public.routine_reference_safe_filename(
  input_file_name text,
  input_mime_type text
)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_extension text;
  v_base text;
begin
  v_extension := case input_mime_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    else null
  end;
  if v_extension is null then
    raise exception using errcode = '22023', message = 'Routine reference image type must be JPEG, PNG, or WebP.';
  end if;
  v_base := lower(trim(coalesce(input_file_name, '')));
  v_base := regexp_replace(v_base, '\.(jpe?g|png|webp)$', '', 'i');
  v_base := regexp_replace(v_base, '[^a-z0-9_-]+', '-', 'g');
  v_base := trim(both '-' from v_base);
  v_base := left(coalesce(nullif(v_base, ''), 'reference-image'), 80);
  return v_base || '.' || v_extension;
end;
$$;

create or replace function public.routine_reference_image_path_valid(
  input_organization_id uuid,
  input_reference_id uuid,
  input_version_id uuid,
  input_path text,
  input_mime_type text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select input_organization_id is not null
    and input_reference_id is not null
    and input_version_id is not null
    and input_path is not null
    and array_length(string_to_array(input_path, '/'), 1) = 4
    and split_part(input_path, '/', 1) = input_organization_id::text
    and split_part(input_path, '/', 2) = input_reference_id::text
    and split_part(input_path, '/', 3) = input_version_id::text
    and split_part(input_path, '/', 4) ~ '^[a-z0-9][a-z0-9_-]{0,79}\.(jpg|png|webp)$'
    and position('..' in input_path) = 0
    and case input_mime_type
      when 'image/jpeg' then split_part(input_path, '/', 4) ~ '\.jpg$'
      when 'image/png' then split_part(input_path, '/', 4) ~ '\.png$'
      when 'image/webp' then split_part(input_path, '/', 4) ~ '\.webp$'
      else false
    end;
$$;

create table if not exists public.routine_reference_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  reference_key text not null,
  label text not null,
  description text,
  placeholder_text text not null default 'Referansebilde kommer',
  current_version_id uuid,
  active boolean not null default true,
  creation_idempotency_key uuid not null,
  creation_request_hash text not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid not null references auth.users(id),
  constraint routine_reference_images_org_key_unique unique (organization_id, reference_key),
  constraint routine_reference_images_org_creation_idempotency_unique unique (organization_id, creation_idempotency_key),
  constraint routine_reference_images_id_org_unique unique (id, organization_id),
  constraint routine_reference_images_key_check check (
    reference_key = trim(reference_key)
    and reference_key ~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'
    and char_length(reference_key) between 1 and 80
  ),
  constraint routine_reference_images_label_check check (
    label = trim(label) and char_length(label) between 1 and 200
  ),
  constraint routine_reference_images_description_check check (
    description is null or (description = trim(description) and char_length(description) <= 4000)
  ),
  constraint routine_reference_images_placeholder_check check (
    placeholder_text = trim(placeholder_text) and char_length(placeholder_text) between 1 and 1000
  ),
  constraint routine_reference_images_request_hash_check check (creation_request_hash ~ '^[0-9a-f]{64}$'),
  constraint routine_reference_images_revision_check check (revision > 0)
);

create table if not exists public.routine_reference_image_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  reference_id uuid not null,
  version_number bigint not null,
  state text not null,
  object_path text,
  mime_type text,
  byte_size bigint,
  original_file_name text,
  caption text,
  alt_text text,
  upload_idempotency_key uuid,
  upload_request_hash text,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  finalized_at timestamptz,
  finalized_by_auth_user_id uuid references auth.users(id),
  orphaned_at timestamptz,
  orphaned_by_auth_user_id uuid references auth.users(id),
  orphan_reason text,
  constraint routine_reference_image_versions_reference_same_org_fkey
    foreign key (reference_id, organization_id)
    references public.routine_reference_images(id, organization_id),
  constraint routine_reference_image_versions_number_unique unique (reference_id, version_number),
  constraint routine_reference_image_versions_org_upload_idempotency_unique unique (organization_id, upload_idempotency_key),
  constraint routine_reference_image_versions_id_org_reference_unique unique (id, organization_id, reference_id),
  constraint routine_reference_image_versions_number_check check (version_number > 0),
  constraint routine_reference_image_versions_state_check check (
    state in ('pending_upload', 'active_image', 'placeholder', 'orphaned')
  ),
  constraint routine_reference_image_versions_mime_check check (
    mime_type is null or mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  constraint routine_reference_image_versions_size_check check (
    byte_size is null or byte_size between 1 and 5242880
  ),
  constraint routine_reference_image_versions_filename_check check (
    original_file_name is null
    or (original_file_name = trim(original_file_name) and char_length(original_file_name) between 1 and 255)
  ),
  constraint routine_reference_image_versions_caption_check check (
    caption is null or (caption = trim(caption) and char_length(caption) <= 500)
  ),
  constraint routine_reference_image_versions_alt_check check (
    alt_text is null or (alt_text = trim(alt_text) and char_length(alt_text) between 1 and 500)
  ),
  constraint routine_reference_image_versions_upload_hash_check check (
    upload_request_hash is null or upload_request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint routine_reference_image_versions_revision_check check (revision > 0),
  constraint routine_reference_image_versions_orphan_reason_check check (
    orphan_reason is null or (orphan_reason = trim(orphan_reason) and char_length(orphan_reason) between 1 and 2000)
  ),
  constraint routine_reference_image_versions_path_check check (
    object_path is null
    or public.routine_reference_image_path_valid(
      organization_id, reference_id, id, object_path, mime_type
    )
  ),
  constraint routine_reference_image_versions_state_consistency_check check (
    (
      state = 'pending_upload'
      and object_path is not null and mime_type is not null and byte_size is not null
      and original_file_name is not null and alt_text is not null
      and upload_idempotency_key is not null and upload_request_hash is not null
      and finalized_at is null and finalized_by_auth_user_id is null
      and orphaned_at is null and orphaned_by_auth_user_id is null and orphan_reason is null
    )
    or (
      state = 'active_image'
      and object_path is not null and mime_type is not null and byte_size is not null
      and original_file_name is not null and alt_text is not null
      and finalized_at is not null and finalized_by_auth_user_id is not null
      and orphaned_at is null and orphaned_by_auth_user_id is null and orphan_reason is null
    )
    or (
      state = 'placeholder'
      and object_path is null and mime_type is null and byte_size is null
      and original_file_name is null and caption is null and alt_text is null
      and upload_idempotency_key is null and upload_request_hash is null
      and finalized_at is null and finalized_by_auth_user_id is null
      and orphaned_at is null and orphaned_by_auth_user_id is null and orphan_reason is null
    )
    or (
      state = 'orphaned'
      and object_path is not null and mime_type is not null and byte_size is not null
      and original_file_name is not null and upload_idempotency_key is not null
      and upload_request_hash is not null
      and finalized_at is null and finalized_by_auth_user_id is null
      and orphaned_at is not null and orphaned_by_auth_user_id is not null
      and orphan_reason is not null
    )
  )
);

do $phase10c_reference_pointer$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'routine_reference_images_current_version_same_reference_fkey'
      and conrelid = 'public.routine_reference_images'::regclass
  ) then
    alter table public.routine_reference_images
      add constraint routine_reference_images_current_version_same_reference_fkey
      foreign key (current_version_id, organization_id, id)
      references public.routine_reference_image_versions(id, organization_id, reference_id);
  end if;
end;
$phase10c_reference_pointer$;

do $phase10c_task_item_identity$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'routine_template_task_items_id_org_version_task_unique'
      and conrelid = 'public.routine_template_task_items'::regclass
  ) then
    alter table public.routine_template_task_items
      add constraint routine_template_task_items_id_org_version_task_unique
      unique (id, organization_id, version_id, task_id);
  end if;
end;
$phase10c_task_item_identity$;

create table if not exists public.routine_template_task_reference_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  version_id uuid not null,
  task_id uuid not null,
  task_item_id uuid,
  reference_id uuid not null,
  button_label text not null default 'Vis hvordan det skal se ut',
  context_note text,
  sort_order integer not null,
  active boolean not null default true,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by_auth_user_id uuid not null references auth.users(id),
  constraint routine_template_task_reference_images_version_same_org_fkey
    foreign key (version_id, organization_id)
    references public.routine_template_versions(id, organization_id),
  constraint routine_template_task_reference_images_task_same_version_fkey
    foreign key (task_id, organization_id, version_id)
    references public.routine_template_tasks(id, organization_id, version_id),
  constraint routine_template_task_reference_images_item_same_task_fkey
    foreign key (task_item_id, organization_id, version_id, task_id)
    references public.routine_template_task_items(id, organization_id, version_id, task_id),
  constraint routine_template_task_reference_images_reference_same_org_fkey
    foreign key (reference_id, organization_id)
    references public.routine_reference_images(id, organization_id),
  constraint routine_template_task_reference_images_identity_unique unique (id, organization_id, version_id),
  constraint routine_template_task_reference_images_sort_unique
    unique (version_id, task_id, sort_order) deferrable initially immediate,
  constraint routine_template_task_reference_images_button_check check (
    button_label = trim(button_label) and char_length(button_label) between 1 and 120
  ),
  constraint routine_template_task_reference_images_context_check check (
    context_note is null or (context_note = trim(context_note) and char_length(context_note) <= 1000)
  ),
  constraint routine_template_task_reference_images_sort_check check (sort_order between 0 and 100000),
  constraint routine_template_task_reference_images_revision_check check (revision > 0)
);

create unique index if not exists routine_template_task_reference_images_logical_idx
  on public.routine_template_task_reference_images (
    version_id, task_id,
    coalesce(task_item_id, '00000000-0000-0000-0000-000000000000'::uuid),
    reference_id
  );

create table if not exists public.routine_reference_image_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  reference_id uuid,
  version_id uuid,
  object_path text not null,
  cleanup_reason text not null,
  queued_at timestamptz not null default now(),
  queued_by_auth_user_id uuid not null references auth.users(id),
  completed_at timestamptz,
  completed_by_auth_user_id uuid references auth.users(id),
  constraint routine_reference_image_cleanup_reference_same_org_fkey
    foreign key (reference_id, organization_id)
    references public.routine_reference_images(id, organization_id),
  constraint routine_reference_image_cleanup_version_same_reference_fkey
    foreign key (version_id, organization_id, reference_id)
    references public.routine_reference_image_versions(id, organization_id, reference_id),
  constraint routine_reference_image_cleanup_path_check check (
    object_path = trim(object_path) and char_length(object_path) between 1 and 1000
  ),
  constraint routine_reference_image_cleanup_reason_check check (
    cleanup_reason = trim(cleanup_reason) and char_length(cleanup_reason) between 1 and 2000
  ),
  constraint routine_reference_image_cleanup_completion_check check (
    (completed_at is null and completed_by_auth_user_id is null)
    or (completed_at is not null and completed_by_auth_user_id is not null)
  ),
  constraint routine_reference_image_cleanup_reference_pair_check check (
    (reference_id is null and version_id is null)
    or (reference_id is not null and version_id is not null)
  )
);

create unique index if not exists routine_reference_image_cleanup_pending_idx
  on public.routine_reference_image_cleanup_queue (organization_id, object_path)
  where completed_at is null;

create table if not exists public.routine_reference_operations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  actor_auth_user_id uuid not null references auth.users(id),
  operation_type text not null,
  idempotency_key uuid not null,
  request_hash text not null,
  resource_type text not null,
  resource_id uuid,
  response_payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint routine_reference_operations_idempotency_unique
    unique (organization_id, actor_auth_user_id, operation_type, idempotency_key),
  constraint routine_reference_operations_type_check check (
    operation_type in (
      'create_reference', 'update_metadata', 'set_active', 'prepare_upload',
      'finalize_upload', 'cancel_upload', 'set_placeholder', 'replace_task_links'
    )
  ),
  constraint routine_reference_operations_request_hash_check check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint routine_reference_operations_resource_type_check check (
    resource_type in ('reference', 'reference_version', 'template_version')
  ),
  constraint routine_reference_operations_response_check check (jsonb_typeof(response_payload) = 'object')
);

create index if not exists routine_reference_images_org_active_idx
  on public.routine_reference_images (organization_id, active, reference_key);
create index if not exists routine_reference_images_current_idx
  on public.routine_reference_images (current_version_id, organization_id, id);
create index if not exists routine_reference_image_versions_org_state_idx
  on public.routine_reference_image_versions (organization_id, state, reference_id, version_number);
create index if not exists routine_reference_image_versions_object_path_idx
  on public.routine_reference_image_versions (organization_id, object_path)
  where object_path is not null;
create index if not exists routine_template_task_reference_images_org_version_idx
  on public.routine_template_task_reference_images (organization_id, version_id, active, task_id, sort_order);
create index if not exists routine_template_task_reference_images_reference_idx
  on public.routine_template_task_reference_images (reference_id, organization_id, version_id);
create index if not exists routine_reference_image_cleanup_org_pending_idx
  on public.routine_reference_image_cleanup_queue (organization_id, queued_at)
  where completed_at is null;
create index if not exists routine_reference_operations_org_resource_idx
  on public.routine_reference_operations (organization_id, resource_type, resource_id, created_at);

create or replace function public.routine_reference_request_hash(input_request jsonb)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select encode(
    extensions.digest(convert_to(coalesce(input_request, '{}'::jsonb)::text, 'UTF8'), 'sha256'),
    'hex'
  );
$$;

create or replace function public.routine_reference_operation_replay(
  input_organization_id uuid,
  input_actor_auth_user_id uuid,
  input_operation_type text,
  input_idempotency_key uuid,
  input_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_operation public.routine_reference_operations%rowtype;
begin
  if input_idempotency_key is null then
    raise exception using errcode = '22023', message = 'A routine reference operation idempotency key is required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'routine-reference-operation:' || input_organization_id::text || ':'
      || input_actor_auth_user_id::text || ':' || input_operation_type || ':'
      || input_idempotency_key::text,
    0
  ));
  select operation.* into v_operation
  from public.routine_reference_operations operation
  where operation.organization_id = input_organization_id
    and operation.actor_auth_user_id = input_actor_auth_user_id
    and operation.operation_type = input_operation_type
    and operation.idempotency_key = input_idempotency_key;
  if v_operation.id is null then return null; end if;
  if v_operation.request_hash is distinct from input_request_hash then
    raise exception using
      errcode = 'P0001',
      message = 'This routine reference idempotency key was already used with a different request.';
  end if;
  return v_operation.response_payload || jsonb_build_object('idempotentReplay', true);
end;
$$;

create or replace function public.routine_record_reference_operation(
  input_organization_id uuid,
  input_actor_auth_user_id uuid,
  input_operation_type text,
  input_idempotency_key uuid,
  input_request_hash text,
  input_resource_type text,
  input_resource_id uuid,
  input_response_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.routine_reference_operations (
    organization_id, actor_auth_user_id, operation_type, idempotency_key,
    request_hash, resource_type, resource_id, response_payload
  ) values (
    input_organization_id, input_actor_auth_user_id, input_operation_type,
    input_idempotency_key, input_request_hash, input_resource_type,
    input_resource_id, input_response_payload
  );
end;
$$;

create or replace function public.routine_reference_image_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'Routine reference images cannot be deleted.';
  end if;
  if current_setting('app.routine_reference_mutation', true) is distinct from 'authorized' then
    raise exception using errcode = 'P0001', message = 'Routine reference image changes require an authorized manager RPC.';
  end if;
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.reference_key is distinct from old.reference_key
     or new.creation_idempotency_key is distinct from old.creation_idempotency_key
     or new.creation_request_hash is distinct from old.creation_request_hash
     or new.created_at is distinct from old.created_at
     or new.created_by_auth_user_id is distinct from old.created_by_auth_user_id then
    raise exception using errcode = 'P0001', message = 'Routine reference image identity and creation audit are immutable.';
  end if;
  if new.revision <> old.revision + 1 then
    raise exception using errcode = 'P0001', message = 'Routine reference image changes must advance the revision exactly once.';
  end if;
  if new.current_version_id is not null and not exists (
    select 1 from public.routine_reference_image_versions version
    where version.id = new.current_version_id
      and version.organization_id = new.organization_id
      and version.reference_id = new.id
      and version.state in ('active_image', 'placeholder')
  ) then
    raise exception using errcode = 'P0001', message = 'Current routine reference version must be an active image or placeholder for this reference.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.routine_reference_image_version_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'Routine reference image versions are immutable and cannot be deleted.';
  end if;
  if old.state in ('active_image', 'placeholder', 'orphaned') then
    raise exception using errcode = 'P0001', message = 'Final routine reference image versions are immutable.';
  end if;
  if current_setting('app.routine_reference_version_transition', true) is distinct from 'authorized'
     or old.state <> 'pending_upload'
     or new.state not in ('active_image', 'orphaned') then
    raise exception using errcode = 'P0001', message = 'Pending routine reference version transitions require an authorized manager RPC.';
  end if;
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.reference_id is distinct from old.reference_id
     or new.version_number is distinct from old.version_number
     or new.object_path is distinct from old.object_path
     or new.mime_type is distinct from old.mime_type
     or new.byte_size is distinct from old.byte_size
     or new.original_file_name is distinct from old.original_file_name
     or new.caption is distinct from old.caption
     or new.alt_text is distinct from old.alt_text
     or new.upload_idempotency_key is distinct from old.upload_idempotency_key
     or new.upload_request_hash is distinct from old.upload_request_hash
     or new.created_at is distinct from old.created_at
     or new.created_by_auth_user_id is distinct from old.created_by_auth_user_id
     or new.revision <> old.revision + 1 then
    raise exception using errcode = 'P0001', message = 'Routine reference image version content and identity are immutable.';
  end if;
  return new;
end;
$$;

create or replace function public.routine_reference_link_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_version_id uuid := case when tg_op = 'DELETE' then old.version_id else new.version_id end;
  v_organization_id uuid := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
  v_state text;
begin
  if current_setting('app.routine_reference_link_mutation', true) is distinct from 'authorized' then
    raise exception using errcode = 'P0001', message = 'Routine reference links can change only through the draft replacement RPC.';
  end if;
  select version.state into v_state
  from public.routine_template_versions version
  where version.id = v_version_id and version.organization_id = v_organization_id
  for key share;
  if v_state is distinct from 'draft' then
    raise exception using errcode = 'P0001', message = 'Published and discarded routine reference links are immutable.';
  end if;
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.version_id is distinct from old.version_id
    or new.created_at is distinct from old.created_at
    or new.created_by_auth_user_id is distinct from old.created_by_auth_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'Routine reference link identity and creation audit are immutable.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.routine_reference_cleanup_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'Routine reference cleanup history cannot be deleted.';
  end if;
  if current_setting('app.routine_reference_cleanup_mutation', true) is distinct from 'authorized' then
    raise exception using errcode = 'P0001', message = 'Routine reference cleanup changes require an authorized manager RPC.';
  end if;
  if tg_op = 'INSERT' then
    if new.reference_id is null or new.version_id is null or not exists (
      select 1 from public.routine_reference_image_versions version
      where version.id = new.version_id
        and version.organization_id = new.organization_id
        and version.reference_id = new.reference_id
        and version.state = 'orphaned'
        and version.object_path = new.object_path
        and not exists (
          select 1 from public.routine_reference_images reference
          where reference.id = version.reference_id
            and reference.organization_id = version.organization_id
            and reference.current_version_id = version.id
        )
    ) then
      raise exception using errcode = 'P0001', message = 'Cleanup can queue only a non-current orphaned routine reference object.';
    end if;
  else
    if new.id is distinct from old.id
       or new.organization_id is distinct from old.organization_id
       or new.reference_id is distinct from old.reference_id
       or new.version_id is distinct from old.version_id
       or new.object_path is distinct from old.object_path
       or new.cleanup_reason is distinct from old.cleanup_reason
       or new.queued_at is distinct from old.queued_at
       or new.queued_by_auth_user_id is distinct from old.queued_by_auth_user_id
       or old.completed_at is not null
       or new.completed_at is null
       or new.completed_by_auth_user_id is null then
      raise exception using errcode = 'P0001', message = 'Routine reference cleanup rows are immutable except for acknowledgement.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.routine_reference_operation_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = 'P0001', message = 'Routine reference operations are immutable.';
end;
$$;

drop trigger if exists routine_reference_images_guard on public.routine_reference_images;
create trigger routine_reference_images_guard
before update or delete on public.routine_reference_images
for each row execute function public.routine_reference_image_guard();

drop trigger if exists routine_reference_image_versions_guard on public.routine_reference_image_versions;
create trigger routine_reference_image_versions_guard
before update or delete on public.routine_reference_image_versions
for each row execute function public.routine_reference_image_version_guard();

drop trigger if exists routine_template_task_reference_images_guard on public.routine_template_task_reference_images;
create trigger routine_template_task_reference_images_guard
before insert or update or delete on public.routine_template_task_reference_images
for each row execute function public.routine_reference_link_guard();

drop trigger if exists routine_reference_image_cleanup_guard on public.routine_reference_image_cleanup_queue;
create trigger routine_reference_image_cleanup_guard
before insert or update or delete on public.routine_reference_image_cleanup_queue
for each row execute function public.routine_reference_cleanup_guard();

drop trigger if exists routine_reference_operations_guard on public.routine_reference_operations;
create trigger routine_reference_operations_guard
before update or delete on public.routine_reference_operations
for each row execute function public.routine_reference_operation_guard();

create or replace function public.create_routine_reference(
  input_reference_key text,
  input_label text,
  input_description text,
  input_placeholder_text text,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_reference public.routine_reference_images%rowtype;
  v_version public.routine_reference_image_versions%rowtype;
  v_key text := lower(trim(coalesce(input_reference_key, '')));
  v_label text := trim(coalesce(input_label, ''));
  v_description text := nullif(trim(coalesce(input_description, '')), '');
  v_placeholder text := coalesce(
    nullif(trim(coalesce(input_placeholder_text, '')), ''),
    'Referansebilde kommer'
  );
  v_request_hash text;
  v_replay jsonb;
  v_response jsonb;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then
    raise exception using errcode = '42501', message = 'Manager reference-image permission is required.';
  end if;
  if v_key !~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$' or char_length(v_key) > 80 then
    raise exception using errcode = '22023', message = 'Routine reference key syntax is invalid.';
  end if;
  if v_label = '' or char_length(v_label) > 200 then
    raise exception using errcode = '22023', message = 'Routine reference label is required and cannot exceed 200 characters.';
  end if;
  if char_length(v_placeholder) > 1000 then
    raise exception using errcode = '22023', message = 'Routine reference placeholder cannot exceed 1000 characters.';
  end if;
  v_request_hash := public.routine_reference_request_hash(jsonb_build_object(
    'referenceKey', v_key, 'label', v_label, 'description', v_description,
    'placeholderText', v_placeholder
  ));
  v_replay := public.routine_reference_operation_replay(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'create_reference',
    input_idempotency_key, v_request_hash
  );
  if v_replay is not null then return v_replay; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'routine-reference-create:' || v_actor.organization_id::text || ':' || v_key, 0
  ));
  select reference.* into v_reference
  from public.routine_reference_images reference
  where reference.organization_id = v_actor.organization_id
    and reference.creation_idempotency_key = input_idempotency_key;
  if v_reference.id is not null then
    if v_reference.creation_request_hash is distinct from v_request_hash then
      raise exception using errcode = 'P0001', message = 'This routine reference creation key was already used with a different request.';
    end if;
    select version.* into v_version
    from public.routine_reference_image_versions version
    where version.id = v_reference.current_version_id;
    v_response := jsonb_build_object(
      'reference', to_jsonb(v_reference), 'currentVersion', to_jsonb(v_version),
      'idempotentReplay', true
    );
    perform public.routine_record_reference_operation(
      v_actor.organization_id, v_actor.actor_auth_user_id, 'create_reference',
      input_idempotency_key, v_request_hash, 'reference', v_reference.id,
      v_response - 'idempotentReplay'
    );
    return v_response;
  end if;
  if exists (
    select 1 from public.routine_reference_images reference
    where reference.organization_id = v_actor.organization_id
      and reference.reference_key = v_key
  ) then
    raise exception using errcode = '23505', message = 'A routine reference image with this key already exists.';
  end if;

  insert into public.routine_reference_images (
    organization_id, reference_key, label, description, placeholder_text,
    creation_idempotency_key, creation_request_hash,
    created_by_auth_user_id, updated_by_auth_user_id
  ) values (
    v_actor.organization_id, v_key, v_label, v_description, v_placeholder,
    input_idempotency_key, v_request_hash,
    v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
  ) returning * into v_reference;

  insert into public.routine_reference_image_versions (
    organization_id, reference_id, version_number, state,
    created_by_auth_user_id
  ) values (
    v_actor.organization_id, v_reference.id, 1, 'placeholder',
    v_actor.actor_auth_user_id
  ) returning * into v_version;

  perform set_config('app.routine_reference_mutation', 'authorized', true);
  update public.routine_reference_images reference
  set current_version_id = v_version.id,
      revision = reference.revision + 1,
      updated_by_auth_user_id = v_actor.actor_auth_user_id
  where reference.id = v_reference.id
  returning * into v_reference;

  v_response := jsonb_build_object(
    'reference', to_jsonb(v_reference), 'currentVersion', to_jsonb(v_version),
    'idempotentReplay', false
  );
  perform public.routine_record_reference_operation(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'create_reference',
    input_idempotency_key, v_request_hash, 'reference', v_reference.id,
    v_response
  );
  return v_response;
end;
$$;

create or replace function public.update_routine_reference_metadata(
  input_reference_id uuid,
  input_label text,
  input_description text,
  input_placeholder_text text,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_reference public.routine_reference_images%rowtype;
  v_label text := trim(coalesce(input_label, ''));
  v_description text := nullif(trim(coalesce(input_description, '')), '');
  v_placeholder text := trim(coalesce(input_placeholder_text, ''));
  v_request_hash text;
  v_replay jsonb;
  v_response jsonb;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager reference-image permission is required.'; end if;
  if v_label = '' or char_length(v_label) > 200 then raise exception using errcode = '22023', message = 'Routine reference label is invalid.'; end if;
  if v_placeholder = '' or char_length(v_placeholder) > 1000 then raise exception using errcode = '22023', message = 'Routine reference placeholder is invalid.'; end if;
  v_request_hash := public.routine_reference_request_hash(jsonb_build_object(
    'referenceId', input_reference_id, 'label', v_label, 'description', v_description,
    'placeholderText', v_placeholder, 'expectedRevision', input_expected_revision
  ));
  v_replay := public.routine_reference_operation_replay(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'update_metadata',
    input_idempotency_key, v_request_hash
  );
  if v_replay is not null then return v_replay; end if;
  select reference.* into v_reference
  from public.routine_reference_images reference
  where reference.id = input_reference_id and reference.organization_id = v_actor.organization_id
  for update;
  if v_reference.id is null then raise exception using errcode = 'P0001', message = 'Routine reference image was not found in this organization.'; end if;
  if input_expected_revision is distinct from v_reference.revision then raise exception using errcode = '40001', message = 'Stale routine reference image. Refresh before saving.'; end if;
  perform set_config('app.routine_reference_mutation', 'authorized', true);
  update public.routine_reference_images reference
  set label = v_label, description = v_description, placeholder_text = v_placeholder,
      revision = reference.revision + 1,
      updated_by_auth_user_id = v_actor.actor_auth_user_id
  where reference.id = v_reference.id
  returning * into v_reference;
  v_response := jsonb_build_object('reference', to_jsonb(v_reference), 'idempotentReplay', false);
  perform public.routine_record_reference_operation(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'update_metadata',
    input_idempotency_key, v_request_hash, 'reference', v_reference.id, v_response
  );
  return v_response;
end;
$$;

create or replace function public.set_routine_reference_active(
  input_reference_id uuid,
  input_active boolean,
  input_expected_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_reference public.routine_reference_images%rowtype;
  v_request_hash text;
  v_replay jsonb;
  v_response jsonb;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager reference-image permission is required.'; end if;
  if input_active is null then raise exception using errcode = '22023', message = 'Routine reference active state is required.'; end if;
  v_request_hash := public.routine_reference_request_hash(jsonb_build_object(
    'referenceId', input_reference_id, 'active', input_active,
    'expectedRevision', input_expected_revision
  ));
  v_replay := public.routine_reference_operation_replay(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'set_active',
    input_idempotency_key, v_request_hash
  );
  if v_replay is not null then return v_replay; end if;
  select reference.* into v_reference
  from public.routine_reference_images reference
  where reference.id = input_reference_id and reference.organization_id = v_actor.organization_id
  for update;
  if v_reference.id is null then raise exception using errcode = 'P0001', message = 'Routine reference image was not found in this organization.'; end if;
  if input_expected_revision is distinct from v_reference.revision then raise exception using errcode = '40001', message = 'Stale routine reference image. Refresh before saving.'; end if;
  perform set_config('app.routine_reference_mutation', 'authorized', true);
  update public.routine_reference_images reference
  set active = input_active, revision = reference.revision + 1,
      updated_by_auth_user_id = v_actor.actor_auth_user_id
  where reference.id = v_reference.id
  returning * into v_reference;
  v_response := jsonb_build_object('reference', to_jsonb(v_reference), 'idempotentReplay', false);
  perform public.routine_record_reference_operation(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'set_active',
    input_idempotency_key, v_request_hash, 'reference', v_reference.id, v_response
  );
  return v_response;
end;
$$;

create or replace function public.prepare_routine_reference_upload(
  input_reference_id uuid,
  input_file_name text,
  input_mime_type text,
  input_byte_size bigint,
  input_caption text,
  input_alt_text text,
  input_expected_reference_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_reference public.routine_reference_images%rowtype;
  v_version public.routine_reference_image_versions%rowtype;
  v_version_id uuid := gen_random_uuid();
  v_file_name text := trim(coalesce(input_file_name, ''));
  v_safe_file_name text;
  v_caption text := nullif(trim(coalesce(input_caption, '')), '');
  v_alt_text text := trim(coalesce(input_alt_text, ''));
  v_request_hash text;
  v_replay jsonb;
  v_response jsonb;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager reference-image permission is required.'; end if;
  if v_file_name = '' or char_length(v_file_name) > 255 then raise exception using errcode = '22023', message = 'Routine reference image file name is invalid.'; end if;
  if input_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then raise exception using errcode = '22023', message = 'Routine reference image type must be JPEG, PNG, or WebP.'; end if;
  if input_byte_size is null or input_byte_size <= 0 or input_byte_size > 5242880 then raise exception using errcode = '22023', message = 'Routine reference image must be no larger than 5 MB.'; end if;
  if v_alt_text = '' or char_length(v_alt_text) > 500 then raise exception using errcode = '22023', message = 'Routine reference image alt text is required and cannot exceed 500 characters.'; end if;
  if v_caption is not null and char_length(v_caption) > 500 then raise exception using errcode = '22023', message = 'Routine reference image caption cannot exceed 500 characters.'; end if;
  v_safe_file_name := public.routine_reference_safe_filename(v_file_name, input_mime_type);
  v_request_hash := public.routine_reference_request_hash(jsonb_build_object(
    'referenceId', input_reference_id, 'fileName', v_file_name,
    'mimeType', input_mime_type, 'byteSize', input_byte_size,
    'caption', v_caption, 'altText', v_alt_text,
    'expectedReferenceRevision', input_expected_reference_revision
  ));
  v_replay := public.routine_reference_operation_replay(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'prepare_upload',
    input_idempotency_key, v_request_hash
  );
  if v_replay is not null then return v_replay; end if;
  select reference.* into v_reference
  from public.routine_reference_images reference
  where reference.id = input_reference_id and reference.organization_id = v_actor.organization_id
  for update;
  if v_reference.id is null then raise exception using errcode = 'P0001', message = 'Routine reference image was not found in this organization.'; end if;
  if input_expected_reference_revision is distinct from v_reference.revision then raise exception using errcode = '40001', message = 'Stale routine reference image. Refresh before preparing an upload.'; end if;
  insert into public.routine_reference_image_versions (
    id, organization_id, reference_id, version_number, state, object_path,
    mime_type, byte_size, original_file_name, caption, alt_text,
    upload_idempotency_key, upload_request_hash, created_by_auth_user_id
  ) values (
    v_version_id, v_actor.organization_id, v_reference.id,
    coalesce((select max(version.version_number) + 1 from public.routine_reference_image_versions version where version.reference_id = v_reference.id), 1),
    'pending_upload',
    v_actor.organization_id::text || '/' || v_reference.id::text || '/'
      || v_version_id::text || '/' || v_safe_file_name,
    input_mime_type, input_byte_size, v_file_name, v_caption, v_alt_text,
    input_idempotency_key, v_request_hash, v_actor.actor_auth_user_id
  ) returning * into v_version;
  perform set_config('app.routine_reference_mutation', 'authorized', true);
  update public.routine_reference_images reference
  set revision = reference.revision + 1,
      updated_by_auth_user_id = v_actor.actor_auth_user_id
  where reference.id = v_reference.id
  returning * into v_reference;
  v_response := jsonb_build_object(
    'bucket', 'routine-reference-images', 'objectPath', v_version.object_path,
    'versionId', v_version.id, 'referenceId', v_reference.id,
    'mimeType', v_version.mime_type, 'byteSize', v_version.byte_size,
    'referenceRevision', v_reference.revision, 'versionRevision', v_version.revision,
    'idempotentReplay', false
  );
  perform public.routine_record_reference_operation(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'prepare_upload',
    input_idempotency_key, v_request_hash, 'reference_version', v_version.id, v_response
  );
  return v_response;
end;
$$;

create or replace function public.finalize_routine_reference_upload(
  input_image_version_id uuid,
  input_expected_reference_revision bigint,
  input_expected_image_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_reference public.routine_reference_images%rowtype;
  v_version public.routine_reference_image_versions%rowtype;
  v_object record;
  v_request_hash text;
  v_replay jsonb;
  v_response jsonb;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager reference-image permission is required.'; end if;
  v_request_hash := public.routine_reference_request_hash(jsonb_build_object(
    'imageVersionId', input_image_version_id,
    'expectedReferenceRevision', input_expected_reference_revision,
    'expectedImageRevision', input_expected_image_revision
  ));
  v_replay := public.routine_reference_operation_replay(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'finalize_upload',
    input_idempotency_key, v_request_hash
  );
  if v_replay is not null then return v_replay; end if;

  select reference.* into v_reference
  from public.routine_reference_images reference
  join public.routine_reference_image_versions version
    on version.reference_id = reference.id
   and version.organization_id = reference.organization_id
  where version.id = input_image_version_id
    and reference.organization_id = v_actor.organization_id
  for update;
  if v_reference.id is null then raise exception using errcode = 'P0001', message = 'Routine reference image was not found in this organization.'; end if;
  if input_expected_reference_revision is distinct from v_reference.revision then raise exception using errcode = '40001', message = 'Stale routine reference image. Refresh before finalizing the upload.'; end if;
  select version.* into v_version
  from public.routine_reference_image_versions version
  where version.id = input_image_version_id
    and version.reference_id = v_reference.id
    and version.organization_id = v_actor.organization_id
  for update;
  if v_version.id is null or v_version.state <> 'pending_upload' then
    raise exception using errcode = 'P0001', message = 'Pending routine reference upload was not found.';
  end if;
  if input_expected_image_revision is distinct from v_version.revision then
    raise exception using errcode = '40001', message = 'Stale routine reference image version. Refresh before finalizing the upload.';
  end if;
  select object.metadata into v_object
  from storage.objects object
  where object.bucket_id = 'routine-reference-images'
    and object.name = v_version.object_path;
  if v_object.metadata is null then
    raise exception using errcode = 'P0001', message = 'The exact prepared Storage object was not found.';
  end if;
  begin
    if (v_object.metadata->>'size')::bigint is distinct from v_version.byte_size
       or lower(coalesce(v_object.metadata->>'mimetype', v_object.metadata->>'mimeType', '')) is distinct from v_version.mime_type then
      raise exception using errcode = 'P0001', message = 'The uploaded Storage object size or MIME type differs from the prepared upload.';
    end if;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'The uploaded Storage object metadata is invalid.';
  end;

  perform set_config('app.routine_reference_version_transition', 'authorized', true);
  update public.routine_reference_image_versions version
  set state = 'active_image', revision = version.revision + 1,
      finalized_at = now(), finalized_by_auth_user_id = v_actor.actor_auth_user_id
  where version.id = v_version.id
  returning * into v_version;
  perform set_config('app.routine_reference_mutation', 'authorized', true);
  update public.routine_reference_images reference
  set current_version_id = v_version.id,
      revision = reference.revision + 1,
      updated_by_auth_user_id = v_actor.actor_auth_user_id
  where reference.id = v_reference.id
  returning * into v_reference;
  v_response := jsonb_build_object(
    'reference', to_jsonb(v_reference), 'currentVersion', to_jsonb(v_version),
    'idempotentReplay', false
  );
  perform public.routine_record_reference_operation(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'finalize_upload',
    input_idempotency_key, v_request_hash, 'reference_version', v_version.id, v_response
  );
  return v_response;
end;
$$;

create or replace function public.cancel_routine_reference_upload(
  input_image_version_id uuid,
  input_reason text,
  input_expected_image_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_reference public.routine_reference_images%rowtype;
  v_version public.routine_reference_image_versions%rowtype;
  v_queue public.routine_reference_image_cleanup_queue%rowtype;
  v_reason text := nullif(trim(coalesce(input_reason, '')), '');
  v_request_hash text;
  v_replay jsonb;
  v_response jsonb;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager reference-image permission is required.'; end if;
  if v_reason is null or char_length(v_reason) > 2000 then raise exception using errcode = '22023', message = 'A cancellation reason is required and cannot exceed 2000 characters.'; end if;
  v_request_hash := public.routine_reference_request_hash(jsonb_build_object(
    'imageVersionId', input_image_version_id, 'reason', v_reason,
    'expectedImageRevision', input_expected_image_revision
  ));
  v_replay := public.routine_reference_operation_replay(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'cancel_upload',
    input_idempotency_key, v_request_hash
  );
  if v_replay is not null then return v_replay; end if;
  select reference.* into v_reference
  from public.routine_reference_images reference
  join public.routine_reference_image_versions version
    on version.reference_id = reference.id
   and version.organization_id = reference.organization_id
  where version.id = input_image_version_id
    and reference.organization_id = v_actor.organization_id
  for update;
  if v_reference.id is null then raise exception using errcode = 'P0001', message = 'Routine reference image was not found in this organization.'; end if;
  select version.* into v_version
  from public.routine_reference_image_versions version
  where version.id = input_image_version_id
    and version.reference_id = v_reference.id
    and version.organization_id = v_actor.organization_id
  for update;
  if v_version.id is null or v_version.state <> 'pending_upload' then
    raise exception using errcode = 'P0001', message = 'Pending routine reference upload was not found.';
  end if;
  if input_expected_image_revision is distinct from v_version.revision then
    raise exception using errcode = '40001', message = 'Stale routine reference image version. Refresh before cancelling the upload.';
  end if;
  perform set_config('app.routine_reference_version_transition', 'authorized', true);
  update public.routine_reference_image_versions version
  set state = 'orphaned', revision = version.revision + 1,
      orphaned_at = now(), orphaned_by_auth_user_id = v_actor.actor_auth_user_id,
      orphan_reason = v_reason
  where version.id = v_version.id
  returning * into v_version;
  perform set_config('app.routine_reference_cleanup_mutation', 'authorized', true);
  insert into public.routine_reference_image_cleanup_queue (
    organization_id, reference_id, version_id, object_path,
    cleanup_reason, queued_by_auth_user_id
  ) values (
    v_actor.organization_id, v_reference.id, v_version.id, v_version.object_path,
    v_reason, v_actor.actor_auth_user_id
  ) on conflict (organization_id, object_path) where completed_at is null do nothing
  returning * into v_queue;
  if v_queue.id is null then
    select queue.* into v_queue
    from public.routine_reference_image_cleanup_queue queue
    where queue.organization_id = v_actor.organization_id
      and queue.object_path = v_version.object_path
      and queue.completed_at is null;
  end if;
  perform set_config('app.routine_reference_mutation', 'authorized', true);
  update public.routine_reference_images reference
  set revision = reference.revision + 1,
      updated_by_auth_user_id = v_actor.actor_auth_user_id
  where reference.id = v_reference.id
  returning * into v_reference;
  v_response := jsonb_build_object(
    'reference', to_jsonb(v_reference), 'orphanedVersion', to_jsonb(v_version),
    'cleanup', to_jsonb(v_queue), 'idempotentReplay', false
  );
  perform public.routine_record_reference_operation(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'cancel_upload',
    input_idempotency_key, v_request_hash, 'reference_version', v_version.id, v_response
  );
  return v_response;
end;
$$;

create or replace function public.set_routine_reference_placeholder(
  input_reference_id uuid,
  input_placeholder_text text,
  input_expected_reference_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_reference public.routine_reference_images%rowtype;
  v_version public.routine_reference_image_versions%rowtype;
  v_placeholder text := trim(coalesce(input_placeholder_text, ''));
  v_request_hash text;
  v_replay jsonb;
  v_response jsonb;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager reference-image permission is required.'; end if;
  if v_placeholder = '' or char_length(v_placeholder) > 1000 then
    raise exception using errcode = '22023', message = 'Routine reference placeholder is required and cannot exceed 1000 characters.';
  end if;
  v_request_hash := public.routine_reference_request_hash(jsonb_build_object(
    'referenceId', input_reference_id, 'placeholderText', v_placeholder,
    'expectedReferenceRevision', input_expected_reference_revision
  ));
  v_replay := public.routine_reference_operation_replay(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'set_placeholder',
    input_idempotency_key, v_request_hash
  );
  if v_replay is not null then return v_replay; end if;
  select reference.* into v_reference
  from public.routine_reference_images reference
  where reference.id = input_reference_id and reference.organization_id = v_actor.organization_id
  for update;
  if v_reference.id is null then raise exception using errcode = 'P0001', message = 'Routine reference image was not found in this organization.'; end if;
  if input_expected_reference_revision is distinct from v_reference.revision then raise exception using errcode = '40001', message = 'Stale routine reference image. Refresh before selecting a placeholder.'; end if;
  insert into public.routine_reference_image_versions (
    organization_id, reference_id, version_number, state, created_by_auth_user_id
  ) values (
    v_actor.organization_id, v_reference.id,
    coalesce((select max(version.version_number) + 1 from public.routine_reference_image_versions version where version.reference_id = v_reference.id), 1),
    'placeholder', v_actor.actor_auth_user_id
  ) returning * into v_version;
  perform set_config('app.routine_reference_mutation', 'authorized', true);
  update public.routine_reference_images reference
  set current_version_id = v_version.id,
      placeholder_text = v_placeholder,
      revision = reference.revision + 1,
      updated_by_auth_user_id = v_actor.actor_auth_user_id
  where reference.id = v_reference.id
  returning * into v_reference;
  v_response := jsonb_build_object(
    'reference', to_jsonb(v_reference), 'currentVersion', to_jsonb(v_version),
    'idempotentReplay', false
  );
  perform public.routine_record_reference_operation(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'set_placeholder',
    input_idempotency_key, v_request_hash, 'reference_version', v_version.id, v_response
  );
  return v_response;
end;
$$;

create or replace function public.replace_routine_draft_task_reference_images(
  input_task_id uuid,
  input_references jsonb,
  input_expected_version_revision bigint,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_version public.routine_template_versions%rowtype;
  v_task public.routine_template_tasks%rowtype;
  v_link jsonb;
  v_links_canonical jsonb;
  v_request_hash text;
  v_replay jsonb;
  v_response jsonb;
  v_count integer := 0;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager reference-image permission is required.'; end if;
  if input_references is null or jsonb_typeof(input_references) <> 'array' or jsonb_array_length(input_references) > 1000 then
    raise exception using errcode = '22023', message = 'Routine reference links must be a JSON array with at most 1000 entries.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(input_references) link
    where jsonb_typeof(link) <> 'object'
      or nullif(link->>'referenceId', '') is null
      or nullif(trim(coalesce(link->>'buttonLabel', 'Vis hvordan det skal se ut')), '') is null
  ) then
    raise exception using errcode = '22023', message = 'Every routine reference link requires a reference and button label.';
  end if;
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'taskItemId', nullif(link->>'taskItemId', '')::uuid,
      'referenceId', (link->>'referenceId')::uuid,
      'buttonLabel', trim(coalesce(nullif(link->>'buttonLabel', ''), 'Vis hvordan det skal se ut')),
      'contextNote', nullif(trim(coalesce(link->>'contextNote', '')), ''),
      'sortOrder', coalesce((link->>'sortOrder')::integer, ordinality::integer - 1),
      'active', coalesce((link->>'active')::boolean, true)
    ) order by coalesce((link->>'sortOrder')::integer, ordinality::integer - 1),
               (link->>'referenceId')::uuid), '[]'::jsonb)
    into v_links_canonical
    from jsonb_array_elements(input_references) with ordinality item(link, ordinality);
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'A routine reference link contains an invalid identifier, order, or active value.';
  end;
  if exists (
    select 1
    from jsonb_array_elements(v_links_canonical) link
    where (link->>'sortOrder')::integer < 0
      or char_length(link->>'buttonLabel') > 120
      or char_length(coalesce(link->>'contextNote', '')) > 1000
  ) then
    raise exception using errcode = '22023', message = 'A routine reference link exceeds its label, context, or order bounds.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_links_canonical) link
    group by link->>'sortOrder' having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(v_links_canonical) link
    group by coalesce(link->>'taskItemId', ''), link->>'referenceId'
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'Routine reference links cannot contain duplicate logical links or task sort positions.';
  end if;
  v_request_hash := public.routine_reference_request_hash(jsonb_build_object(
    'taskId', input_task_id, 'references', v_links_canonical,
    'expectedVersionRevision', input_expected_version_revision
  ));
  v_replay := public.routine_reference_operation_replay(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'replace_task_links',
    input_idempotency_key, v_request_hash
  );
  if v_replay is not null then return v_replay; end if;
  select task.* into v_task
  from public.routine_template_tasks task
  where task.id = input_task_id and task.organization_id = v_actor.organization_id;
  if v_task.id is null then raise exception using errcode = 'P0001', message = 'Routine template task was not found in this organization.'; end if;
  select version.* into v_version
  from public.routine_template_versions version
  where version.id = v_task.version_id and version.organization_id = v_actor.organization_id
  for update;
  if v_version.id is null or v_version.state <> 'draft' then raise exception using errcode = 'P0001', message = 'Editable routine template draft was not found.'; end if;
  if input_expected_version_revision is distinct from v_version.revision then raise exception using errcode = '40001', message = 'Stale routine template version. Refresh before replacing reference links.'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_links_canonical) link
    left join public.routine_reference_images reference
      on reference.id = (link->>'referenceId')::uuid
     and reference.organization_id = v_actor.organization_id
    left join public.routine_template_task_items item
     on nullif(link->>'taskItemId', '') is not null
     and item.id = nullif(link->>'taskItemId', '')::uuid
     and item.task_id = v_task.id
     and item.version_id = v_version.id
     and item.organization_id = v_actor.organization_id
    where reference.id is null
      or (nullif(link->>'taskItemId', '') is not null and item.id is null)
  ) then
    raise exception using errcode = 'P0001', message = 'Every routine reference link must use a same-organization task, optional task item, and reference.';
  end if;
  perform set_config('app.routine_reference_link_mutation', 'authorized', true);
  delete from public.routine_template_task_reference_images link
  where link.version_id = v_version.id and link.task_id = v_task.id
    and link.organization_id = v_actor.organization_id;
  for v_link in select value from jsonb_array_elements(v_links_canonical)
  loop
    insert into public.routine_template_task_reference_images (
      organization_id, version_id, task_id, task_item_id, reference_id,
      button_label, context_note, sort_order, active,
      created_by_auth_user_id, updated_by_auth_user_id
    ) values (
      v_actor.organization_id, v_version.id, v_task.id,
      nullif(v_link->>'taskItemId', '')::uuid, (v_link->>'referenceId')::uuid,
      v_link->>'buttonLabel', nullif(v_link->>'contextNote', ''),
      (v_link->>'sortOrder')::integer, (v_link->>'active')::boolean,
      v_actor.actor_auth_user_id, v_actor.actor_auth_user_id
    );
    v_count := v_count + 1;
  end loop;
  update public.routine_template_versions version
  set revision = version.revision + 1, updated_at = now(),
      updated_by_auth_user_id = v_actor.actor_auth_user_id
  where version.id = v_version.id
  returning * into v_version;
  v_response := jsonb_build_object(
    'versionId', v_version.id, 'taskId', v_task.id, 'revision', v_version.revision,
    'linkCount', v_count, 'references', v_links_canonical,
    'idempotentReplay', false
  );
  perform public.routine_record_reference_operation(
    v_actor.organization_id, v_actor.actor_auth_user_id, 'replace_task_links',
    input_idempotency_key, v_request_hash, 'template_version', v_version.id, v_response
  );
  return v_response;
end;
$$;

create or replace function public.list_routine_reference_cleanup_paths()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_rows jsonb;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager reference-image permission is required.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', queue.id, 'referenceId', queue.reference_id,
    'versionId', queue.version_id, 'objectPath', queue.object_path,
    'reason', queue.cleanup_reason, 'queuedAt', queue.queued_at
  ) order by queue.queued_at, queue.id), '[]'::jsonb)
  into v_rows
  from public.routine_reference_image_cleanup_queue queue
  where queue.organization_id = v_actor.organization_id
    and queue.completed_at is null;
  return v_rows;
end;
$$;

create or replace function public.acknowledge_routine_reference_cleanup(
  input_object_path text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_queue public.routine_reference_image_cleanup_queue%rowtype;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then raise exception using errcode = '42501', message = 'Manager reference-image permission is required.'; end if;
  select queue.* into v_queue
  from public.routine_reference_image_cleanup_queue queue
  where queue.object_path = trim(coalesce(input_object_path, ''))
    and queue.organization_id = v_actor.organization_id
    and queue.completed_at is null
  for update;
  if v_queue.id is null then raise exception using errcode = 'P0001', message = 'Routine reference cleanup row was not found in this organization.'; end if;
  if v_queue.completed_at is not null then return to_jsonb(v_queue); end if;
  if exists (
    select 1 from storage.objects object
    where object.bucket_id = 'routine-reference-images'
      and object.name = v_queue.object_path
  ) then
    raise exception using errcode = 'P0001', message = 'Routine reference cleanup cannot be acknowledged while the Storage object still exists.';
  end if;
  perform set_config('app.routine_reference_cleanup_mutation', 'authorized', true);
  update public.routine_reference_image_cleanup_queue queue
  set completed_at = now(), completed_by_auth_user_id = v_actor.actor_auth_user_id
  where queue.id = v_queue.id
  returning * into v_queue;
  return to_jsonb(v_queue);
end;
$$;

do $phase10c_preserve_canonical$
begin
  if to_regprocedure('public.routine_template_version_canonical_json_10b(uuid)') is null then
    alter function public.routine_template_version_canonical_json(uuid)
      rename to routine_template_version_canonical_json_10b;
  end if;
end;
$phase10c_preserve_canonical$;

create or replace function public.routine_template_version_canonical_json(input_version_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(public.routine_template_version_canonical_json_10b(input_version_id), '{}'::jsonb)
    || jsonb_build_object(
      'referenceImages', coalesce((
        select jsonb_agg(jsonb_build_object(
          'taskKey', task.task_key,
          'taskItemKey', item.item_key,
          'referenceKey', reference.reference_key,
          'buttonLabel', link.button_label,
          'contextNote', link.context_note,
          'sortOrder', link.sort_order,
          'active', link.active
        ) order by task.task_key, link.sort_order, reference.reference_key,
                   coalesce(item.item_key, ''), link.id)
        from public.routine_template_task_reference_images link
        join public.routine_template_tasks task
          on task.id = link.task_id
         and task.organization_id = link.organization_id
         and task.version_id = link.version_id
        left join public.routine_template_task_items item
          on item.id = link.task_item_id
         and item.organization_id = link.organization_id
         and item.version_id = link.version_id
         and item.task_id = link.task_id
        join public.routine_reference_images reference
          on reference.id = link.reference_id
         and reference.organization_id = link.organization_id
        where link.version_id = input_version_id
      ), '[]'::jsonb)
    );
$$;

create or replace function public.routine_template_version_content_hash(input_version_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select encode(
    extensions.digest(
      convert_to(public.routine_template_version_canonical_json(input_version_id)::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$$;

do $phase10c_preserve_validation$
begin
  if to_regprocedure('public.validate_routine_template_version_10b(uuid,uuid[])') is null then
    alter function public.validate_routine_template_version(uuid, uuid[])
      rename to validate_routine_template_version_10b;
  end if;
end;
$phase10c_preserve_validation$;

create or replace function public.validate_routine_template_version(
  input_version_id uuid,
  input_publication_version_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor record;
  v_version public.routine_template_versions%rowtype;
  v_result jsonb;
  v_blockers jsonb;
  v_warnings jsonb;
  v_reference_count bigint;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then
    raise exception using errcode = '42501', message = 'Manager template permission is required.';
  end if;
  select version.* into v_version
  from public.routine_template_versions version
  where version.id = input_version_id
    and version.organization_id = v_actor.organization_id;
  if v_version.id is null then
    raise exception using errcode = 'P0001', message = 'Routine template version was not found in this organization.';
  end if;
  v_result := public.validate_routine_template_version_10b(
    input_version_id, input_publication_version_ids
  );
  v_blockers := coalesce(v_result->'blockers', '[]'::jsonb);
  v_warnings := coalesce(v_result->'warnings', '[]'::jsonb);

  if exists (
    select 1
    from public.routine_template_task_reference_images link
    left join public.routine_template_tasks task
      on task.id = link.task_id
     and task.organization_id = link.organization_id
     and task.version_id = link.version_id
    left join public.routine_reference_images reference
      on reference.id = link.reference_id
     and reference.organization_id = link.organization_id
    where link.version_id = v_version.id
      and (
        link.organization_id is distinct from v_version.organization_id
        or task.id is null or reference.id is null or not reference.active
      )
  ) then
    v_blockers := v_blockers || jsonb_build_array(
      'Every active routine reference link must use a same-organization active logical reference.'
    );
  end if;
  if exists (
    select 1
    from public.routine_template_task_reference_images link
    join public.routine_reference_images reference
      on reference.id = link.reference_id and reference.organization_id = link.organization_id
    left join public.routine_reference_image_versions current_version
      on current_version.id = reference.current_version_id
     and current_version.organization_id = reference.organization_id
     and current_version.reference_id = reference.id
    where link.version_id = v_version.id and link.active
      and (
        reference.current_version_id is null
        or current_version.id is null
        or current_version.state not in ('active_image', 'placeholder')
      )
  ) then
    v_blockers := v_blockers || jsonb_build_array(
      'Every linked routine reference must have a valid current active image or placeholder.'
    );
  end if;
  if exists (
    select 1
    from public.routine_template_task_reference_images link
    join public.routine_reference_images reference
      on reference.id = link.reference_id and reference.organization_id = link.organization_id
    join public.routine_reference_image_versions current_version
      on current_version.id = reference.current_version_id
     and current_version.organization_id = reference.organization_id
     and current_version.reference_id = reference.id
    where link.version_id = v_version.id and link.active
      and current_version.state = 'active_image'
      and nullif(trim(coalesce(current_version.alt_text, '')), '') is null
  ) then
    v_blockers := v_blockers || jsonb_build_array(
      'Every linked active routine reference image requires alt text.'
    );
  end if;
  if exists (
    select 1
    from public.routine_template_task_reference_images link
    left join public.routine_template_task_items item
      on item.id = link.task_item_id
     and item.organization_id = link.organization_id
     and item.version_id = link.version_id
     and item.task_id = link.task_id
    where link.version_id = v_version.id
      and link.task_item_id is not null and item.id is null
  ) then
    v_blockers := v_blockers || jsonb_build_array(
      'Routine reference task-item links must belong to their parent task.'
    );
  end if;
  if exists (
    select 1 from public.routine_template_task_reference_images link
    where link.version_id = v_version.id
    group by link.task_id, link.sort_order having count(*) > 1
  ) or exists (
    select 1 from public.routine_template_task_reference_images link
    where link.version_id = v_version.id
    group by link.task_id, coalesce(link.task_item_id, '00000000-0000-0000-0000-000000000000'::uuid), link.reference_id
    having count(*) > 1
  ) then
    v_blockers := v_blockers || jsonb_build_array(
      'Routine reference links must have unique logical identities and deterministic task order.'
    );
  end if;
  if exists (
    select 1
    from public.routine_template_task_reference_images link
    join public.routine_reference_images reference
      on reference.id = link.reference_id and reference.organization_id = link.organization_id
    join public.routine_reference_image_versions current_version
      on current_version.id = reference.current_version_id
     and current_version.organization_id = reference.organization_id
     and current_version.reference_id = reference.id
    where link.version_id = v_version.id and link.active
      and current_version.state = 'placeholder'
  ) then
    v_warnings := v_warnings || jsonb_build_array(
      'A linked routine reference currently uses its placeholder; publication is still allowed.'
    );
  end if;
  if exists (
    select 1
    from public.routine_template_task_reference_images link
    join public.routine_reference_images reference
      on reference.id = link.reference_id and reference.organization_id = link.organization_id
    join public.routine_reference_image_versions current_version
      on current_version.id = reference.current_version_id
     and current_version.organization_id = reference.organization_id
     and current_version.reference_id = reference.id
    where link.version_id = v_version.id and link.active
      and current_version.state = 'active_image'
      and nullif(trim(coalesce(current_version.caption, '')), '') is null
  ) then
    v_warnings := v_warnings || jsonb_build_array(
      'A linked active routine reference image has no caption; publication is still allowed.'
    );
  end if;
  select count(*) into v_reference_count
  from public.routine_template_task_reference_images link
  where link.version_id = v_version.id;
  return v_result
    || jsonb_build_object(
      'valid', jsonb_array_length(v_blockers) = 0,
      'blockers', v_blockers,
      'warnings', v_warnings,
      'computed_content_hash', public.routine_template_version_content_hash(v_version.id),
      'counts', coalesce(v_result->'counts', '{}'::jsonb)
        || jsonb_build_object('referenceImages', v_reference_count)
    );
end;
$$;

do $phase10c_preserve_draft_copy$
begin
  if to_regprocedure('public.create_routine_template_draft_10b(uuid,uuid,uuid)') is null then
    alter function public.create_routine_template_draft(uuid, uuid, uuid)
      rename to create_routine_template_draft_10b;
  end if;
end;
$phase10c_preserve_draft_copy$;

create or replace function public.create_routine_template_draft(
  input_template_id uuid,
  input_based_on_version_id uuid,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
  v_draft_id uuid;
  v_actor record;
begin
  select * into v_actor from public.routine_resolve_actor();
  if v_actor.actor_role <> 'manager' then
    raise exception using errcode = '42501', message = 'Manager template permission is required.';
  end if;
  v_result := public.create_routine_template_draft_10b(
    input_template_id, input_based_on_version_id, input_idempotency_key
  );
  if coalesce((v_result->>'idempotentReplay')::boolean, false)
     or input_based_on_version_id is null then
    return v_result;
  end if;
  v_draft_id := (v_result->'draft'->>'id')::uuid;
  perform set_config('app.routine_reference_link_mutation', 'authorized', true);
  insert into public.routine_template_task_reference_images (
    organization_id, version_id, task_id, task_item_id, reference_id,
    button_label, context_note, sort_order, active,
    created_by_auth_user_id, updated_by_auth_user_id
  )
  select
    v_actor.organization_id,
    v_draft_id,
    draft_task.id,
    draft_item.id,
    source_link.reference_id,
    source_link.button_label,
    source_link.context_note,
    source_link.sort_order,
    source_link.active,
    v_actor.actor_auth_user_id,
    v_actor.actor_auth_user_id
  from public.routine_template_task_reference_images source_link
  join public.routine_template_tasks source_task
    on source_task.id = source_link.task_id
   and source_task.organization_id = source_link.organization_id
   and source_task.version_id = source_link.version_id
  join public.routine_template_tasks draft_task
    on draft_task.version_id = v_draft_id
   and draft_task.organization_id = source_link.organization_id
   and draft_task.task_key = source_task.task_key
  left join public.routine_template_task_items source_item
    on source_item.id = source_link.task_item_id
   and source_item.organization_id = source_link.organization_id
   and source_item.version_id = source_link.version_id
   and source_item.task_id = source_link.task_id
  left join public.routine_template_task_items draft_item
    on source_link.task_item_id is not null
   and draft_item.version_id = v_draft_id
   and draft_item.organization_id = source_link.organization_id
   and draft_item.task_id = draft_task.id
   and draft_item.item_key = source_item.item_key
  where source_link.version_id = input_based_on_version_id
  order by source_task.task_key, source_link.sort_order, source_link.id;
  return v_result;
end;
$$;

create or replace function public.routine_reference_is_published_linked(
  input_reference_id uuid,
  input_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.routine_reference_images reference
    join public.routine_reference_image_versions current_version
      on current_version.id = reference.current_version_id
     and current_version.organization_id = reference.organization_id
     and current_version.reference_id = reference.id
    join public.routine_template_task_reference_images link
      on link.reference_id = reference.id
     and link.organization_id = reference.organization_id
     and link.active
    join public.routine_template_versions template_version
      on template_version.id = link.version_id
     and template_version.organization_id = link.organization_id
     and template_version.state = 'published'
    join public.routine_templates template
      on template.id = template_version.template_id
     and template.organization_id = template_version.organization_id
     and template.active
     and template.current_published_version_id = template_version.id
    join public.routine_template_tasks task
      on task.id = link.task_id
     and task.version_id = link.version_id
     and task.organization_id = link.organization_id
     and task.active
    where reference.id = input_reference_id
      and reference.organization_id = input_organization_id
      and reference.active
      and current_version.state in ('active_image', 'placeholder')
  );
$$;

create or replace function public.routine_reference_storage_can_read(input_object_path text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.routine_reference_image_versions version
    join public.routine_reference_images reference
      on reference.id = version.reference_id
     and reference.organization_id = version.organization_id
    where version.organization_id = public.routine_current_user_organization_id()
      and version.object_path = input_object_path
      and (
        public.routine_current_user_can_manage_templates()
        or (
          public.routine_current_user_can_perform_tasks()
          and version.id = reference.current_version_id
          and version.state = 'active_image'
          and reference.active
          and public.routine_reference_is_published_linked(reference.id, reference.organization_id)
        )
      )
  );
$$;

create or replace function public.routine_reference_storage_can_upload(input_object_path text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select public.routine_current_user_can_manage_templates()
    and exists (
      select 1
      from public.routine_reference_image_versions version
      where version.organization_id = public.routine_current_user_organization_id()
        and version.state = 'pending_upload'
        and version.object_path = input_object_path
        and public.routine_reference_image_path_valid(
          version.organization_id, version.reference_id, version.id,
          version.object_path, version.mime_type
        )
    );
$$;

create or replace function public.routine_reference_storage_can_delete(input_object_path text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select public.routine_current_user_can_manage_templates()
    and exists (
      select 1
      from public.routine_reference_image_cleanup_queue queue
      join public.routine_reference_image_versions version
        on version.id = queue.version_id
       and version.organization_id = queue.organization_id
       and version.reference_id = queue.reference_id
       and version.state = 'orphaned'
       and version.object_path = queue.object_path
      join public.routine_reference_images reference
        on reference.id = version.reference_id
       and reference.organization_id = version.organization_id
       and reference.current_version_id is distinct from version.id
      where queue.organization_id = public.routine_current_user_organization_id()
        and queue.object_path = input_object_path
        and queue.completed_at is null
    );
$$;

alter table public.routine_reference_images enable row level security;
alter table public.routine_reference_image_versions enable row level security;
alter table public.routine_template_task_reference_images enable row level security;
alter table public.routine_reference_image_cleanup_queue enable row level security;
alter table public.routine_reference_operations enable row level security;

drop policy if exists routine_reference_images_read on public.routine_reference_images;
create policy routine_reference_images_read
on public.routine_reference_images for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and (
    (select public.routine_current_user_can_manage_templates())
    or (
      (select public.routine_current_user_can_perform_tasks())
      and active
      and public.routine_reference_is_published_linked(id, organization_id)
    )
  )
);

drop policy if exists routine_reference_image_versions_read on public.routine_reference_image_versions;
create policy routine_reference_image_versions_read
on public.routine_reference_image_versions for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and (
    (select public.routine_current_user_can_manage_templates())
    or (
      (select public.routine_current_user_can_perform_tasks())
      and state in ('active_image', 'placeholder')
      and exists (
        select 1 from public.routine_reference_images reference
        where reference.id = reference_id
          and reference.organization_id = routine_reference_image_versions.organization_id
          and reference.active
          and reference.current_version_id = routine_reference_image_versions.id
          and public.routine_reference_is_published_linked(reference.id, reference.organization_id)
      )
    )
  )
);

drop policy if exists routine_template_task_reference_images_read on public.routine_template_task_reference_images;
create policy routine_template_task_reference_images_read
on public.routine_template_task_reference_images for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and (
    (select public.routine_current_user_can_manage_templates())
    or (
      (select public.routine_current_user_can_perform_tasks())
      and active
      and public.routine_template_version_is_current_published(version_id, organization_id)
      and public.routine_reference_is_published_linked(reference_id, organization_id)
    )
  )
);

drop policy if exists routine_reference_image_cleanup_manager_read on public.routine_reference_image_cleanup_queue;
create policy routine_reference_image_cleanup_manager_read
on public.routine_reference_image_cleanup_queue for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and (select public.routine_current_user_can_manage_templates())
);

drop policy if exists routine_reference_operations_manager_read on public.routine_reference_operations;
create policy routine_reference_operations_manager_read
on public.routine_reference_operations for select to authenticated
using (
  organization_id = (select public.routine_current_user_organization_id())
  and (select public.routine_current_user_can_manage_templates())
);

revoke all privileges on table public.routine_reference_images from public, anon, authenticated;
revoke all privileges on table public.routine_reference_image_versions from public, anon, authenticated;
revoke all privileges on table public.routine_template_task_reference_images from public, anon, authenticated;
revoke all privileges on table public.routine_reference_image_cleanup_queue from public, anon, authenticated;
revoke all privileges on table public.routine_reference_operations from public, anon, authenticated;

grant select on table public.routine_reference_images to authenticated;
grant select on table public.routine_reference_image_versions to authenticated;
grant select on table public.routine_template_task_reference_images to authenticated;
grant select on table public.routine_reference_image_cleanup_queue to authenticated;
grant select on table public.routine_reference_operations to authenticated;

drop policy if exists routine_reference_images_insert on storage.objects;
drop policy if exists routine_reference_images_select on storage.objects;
drop policy if exists routine_reference_images_delete on storage.objects;
drop policy if exists routine_reference_images_update on storage.objects;

create policy routine_reference_images_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'routine-reference-images'
  and public.routine_reference_storage_can_upload(name)
);

create policy routine_reference_images_select
on storage.objects for select to authenticated
using (
  bucket_id = 'routine-reference-images'
  and public.routine_reference_storage_can_read(name)
);

create policy routine_reference_images_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'routine-reference-images'
  and public.routine_reference_storage_can_delete(name)
);

revoke all on function public.routine_reference_safe_filename(text, text) from public, anon, authenticated;
revoke all on function public.routine_reference_image_path_valid(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.routine_reference_request_hash(jsonb) from public, anon, authenticated;
revoke all on function public.routine_reference_operation_replay(uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.routine_record_reference_operation(uuid, uuid, text, uuid, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.routine_reference_image_guard() from public, anon, authenticated;
revoke all on function public.routine_reference_image_version_guard() from public, anon, authenticated;
revoke all on function public.routine_reference_link_guard() from public, anon, authenticated;
revoke all on function public.routine_reference_cleanup_guard() from public, anon, authenticated;
revoke all on function public.routine_reference_operation_guard() from public, anon, authenticated;
revoke all on function public.routine_template_version_canonical_json_10b(uuid) from public, anon, authenticated;
revoke all on function public.validate_routine_template_version_10b(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.create_routine_template_draft_10b(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.routine_template_version_canonical_json(uuid) from public, anon, authenticated;
revoke all on function public.routine_template_version_content_hash(uuid) from public, anon, authenticated;
revoke all on function public.validate_routine_template_version(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.create_routine_template_draft(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.routine_reference_is_published_linked(uuid, uuid) from public, anon, authenticated;
revoke all on function public.routine_reference_storage_can_read(text) from public, anon, authenticated;
revoke all on function public.routine_reference_storage_can_upload(text) from public, anon, authenticated;
revoke all on function public.routine_reference_storage_can_delete(text) from public, anon, authenticated;
revoke all on function public.create_routine_reference(text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.update_routine_reference_metadata(uuid, text, text, text, bigint, uuid) from public, anon, authenticated;
revoke all on function public.set_routine_reference_active(uuid, boolean, bigint, uuid) from public, anon, authenticated;
revoke all on function public.prepare_routine_reference_upload(uuid, text, text, bigint, text, text, bigint, uuid) from public, anon, authenticated;
revoke all on function public.finalize_routine_reference_upload(uuid, bigint, bigint, uuid) from public, anon, authenticated;
revoke all on function public.cancel_routine_reference_upload(uuid, text, bigint, uuid) from public, anon, authenticated;
revoke all on function public.set_routine_reference_placeholder(uuid, text, bigint, uuid) from public, anon, authenticated;
revoke all on function public.replace_routine_draft_task_reference_images(uuid, jsonb, bigint, uuid) from public, anon, authenticated;
revoke all on function public.list_routine_reference_cleanup_paths() from public, anon, authenticated;
revoke all on function public.acknowledge_routine_reference_cleanup(text) from public, anon, authenticated;

grant execute on function public.routine_template_version_content_hash(uuid) to authenticated;
grant execute on function public.validate_routine_template_version(uuid, uuid[]) to authenticated;
grant execute on function public.create_routine_template_draft(uuid, uuid, uuid) to authenticated;
grant execute on function public.routine_reference_is_published_linked(uuid, uuid) to authenticated;
grant execute on function public.routine_reference_storage_can_read(text) to authenticated;
grant execute on function public.routine_reference_storage_can_upload(text) to authenticated;
grant execute on function public.routine_reference_storage_can_delete(text) to authenticated;
grant execute on function public.create_routine_reference(text, text, text, text, uuid) to authenticated;
grant execute on function public.update_routine_reference_metadata(uuid, text, text, text, bigint, uuid) to authenticated;
grant execute on function public.set_routine_reference_active(uuid, boolean, bigint, uuid) to authenticated;
grant execute on function public.prepare_routine_reference_upload(uuid, text, text, bigint, text, text, bigint, uuid) to authenticated;
grant execute on function public.finalize_routine_reference_upload(uuid, bigint, bigint, uuid) to authenticated;
grant execute on function public.cancel_routine_reference_upload(uuid, text, bigint, uuid) to authenticated;
grant execute on function public.set_routine_reference_placeholder(uuid, text, bigint, uuid) to authenticated;
grant execute on function public.replace_routine_draft_task_reference_images(uuid, jsonb, bigint, uuid) to authenticated;
grant execute on function public.list_routine_reference_cleanup_paths() to authenticated;
grant execute on function public.acknowledge_routine_reference_cleanup(text) to authenticated;

notify pgrst, 'reload schema';
