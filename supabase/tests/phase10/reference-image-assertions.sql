-- Executable Phase 10C assertions. Every PASS is backed by live PostgreSQL.

create schema if not exists phase10c_test;
revoke all on schema phase10c_test from public;
grant usage on schema phase10c_test to authenticated, anon;

create table phase10c_test.state (
  key text primary key,
  value text not null
);
grant select, insert, update on phase10c_test.state to authenticated;

create or replace function phase10c_test.assert_true(condition boolean, label text)
returns void
language plpgsql
as $$
begin
  if condition is not true then raise exception 'FAIL %', label; end if;
  raise notice 'PASS %', label;
end;
$$;

create or replace function phase10c_test.expect_error(statement text, pattern text, label text)
returns void
language plpgsql
as $$
declare
  v_error text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error ~* pattern then raise notice 'PASS %', label; return; end if;
    raise exception 'FAIL % (unexpected error: %)', label, v_error;
  end;
  raise exception 'FAIL % (statement unexpectedly succeeded)', label;
end;
$$;

grant execute on function phase10c_test.assert_true(boolean, text) to authenticated, anon;
grant execute on function phase10c_test.expect_error(text, text, text) to authenticated, anon;

select phase10c_test.assert_true(
  (select count(*) = 5 from information_schema.tables
   where table_schema = 'public' and table_name in (
     'routine_reference_images', 'routine_reference_image_versions',
     'routine_template_task_reference_images',
     'routine_reference_image_cleanup_queue', 'routine_reference_operations'
   )),
  '001 schema creates all five Phase 10C tables'
);
select phase10c_test.assert_true(
  (select not public from storage.buckets where id = 'routine-reference-images'),
  '002 routine reference bucket is private'
);
select phase10c_test.assert_true(
  (select file_size_limit = 5242880 from storage.buckets where id = 'routine-reference-images'),
  '003 routine reference bucket enforces the 5 MB limit'
);
select phase10c_test.assert_true(
  (select allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[]
          and allowed_mime_types <@ array['image/jpeg','image/png','image/webp']::text[]
   from storage.buckets where id = 'routine-reference-images'),
  '004 routine reference bucket allows exactly JPEG PNG and WebP'
);
select phase10c_test.assert_true(
  (select count(*) = 5 from information_schema.columns
   where table_schema = 'public' and column_name = 'organization_id'
     and is_nullable = 'NO' and table_name in (
       'routine_reference_images', 'routine_reference_image_versions',
       'routine_template_task_reference_images',
       'routine_reference_image_cleanup_queue', 'routine_reference_operations'
     )),
  '005 every Phase 10C table has a non-null organization boundary'
);
select phase10c_test.assert_true(
  (select count(*) = 5 from pg_catalog.pg_class relation
   join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'public' and relation.relrowsecurity
     and relation.relname in (
       'routine_reference_images', 'routine_reference_image_versions',
       'routine_template_task_reference_images',
       'routine_reference_image_cleanup_queue', 'routine_reference_operations'
     )),
  '006 RLS is enabled on every Phase 10C table'
);
select phase10c_test.assert_true(
  (select count(*) >= 8 from pg_catalog.pg_constraint constraint_definition
   where constraint_definition.contype = 'f'
     and constraint_definition.conrelid in (
       'public.routine_reference_images'::regclass,
       'public.routine_reference_image_versions'::regclass,
       'public.routine_template_task_reference_images'::regclass,
       'public.routine_reference_image_cleanup_queue'::regclass
     ) and cardinality(constraint_definition.conkey) >= 2),
  '007 composite foreign keys protect tenant boundaries'
);
select phase10c_test.assert_true(
  exists (select 1 from pg_catalog.pg_constraint
          where conname = 'routine_reference_images_current_version_same_reference_fkey'),
  '008 current version pointer is constrained to the same reference and organization'
);
select phase10c_test.assert_true(
  exists (select 1 from pg_catalog.pg_constraint
          where conname = 'routine_reference_images_org_key_unique'),
  '009 logical reference keys are tenant scoped and unique'
);
select phase10c_test.assert_true(
  exists (select 1 from pg_catalog.pg_constraint
          where conname = 'routine_reference_image_versions_number_unique'),
  '010 image version numbers are unique per logical reference'
);
select phase10c_test.assert_true(
  (select pg_get_constraintdef(oid) like '%pending_upload%active_image%placeholder%orphaned%'
   from pg_catalog.pg_constraint
   where conname = 'routine_reference_image_versions_state_check'),
  '011 image version state enum is closed and explicit'
);
select phase10c_test.assert_true(
  (select count(*) = 4 from pg_catalog.pg_constraint
   where conrelid = 'public.routine_template_task_reference_images'::regclass
     and contype = 'f' and cardinality(conkey) >= 2),
  '012 draft links have same-tenant version task item and reference foreign keys'
);
select phase10c_test.assert_true(
  (select count(*) = 2 from pg_catalog.pg_constraint
   where conrelid = 'public.routine_reference_image_cleanup_queue'::regclass
     and contype = 'f' and cardinality(conkey) >= 2),
  '013 cleanup queue has same-tenant reference and version foreign keys'
);
select phase10c_test.assert_true(
  exists (select 1 from pg_catalog.pg_constraint
          where conname = 'routine_reference_operations_idempotency_unique'),
  '014 operations are uniquely idempotent per organization actor and type'
);
select phase10c_test.assert_true(
  (select count(*) >= 9 from pg_catalog.pg_indexes
   where schemaname = 'public'
     and (indexname like 'routine_reference_%' or indexname like 'routine_template_task_reference_images_%')),
  '015 foreign key RLS and lifecycle access paths are indexed'
);

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);

select phase10c_test.assert_true(
  (select current_version.state = 'placeholder'
          and reference.current_version_id = current_version.id
          and current_version.version_number = 1
   from public.routine_reference_images reference
   join public.routine_reference_image_versions current_version
     on current_version.id = reference.current_version_id
   where reference.reference_key = 'opening-main-floor'),
  '016 logical reference creation atomically installs an initial placeholder'
);
select phase10c_test.assert_true(
  (select placeholder_text = 'Referansebilde kommer'
   from public.routine_reference_images where reference_key = 'closing-main-floor'),
  '017 omitted placeholder text uses the Norwegian default'
);
select phase10c_test.assert_true(
  (public.create_routine_reference(
    'opening-main-floor', 'Opening main floor setup',
    'Visual setup guidance for the main floor.',
    'Ingen referanse er lastet opp ennå.',
    '41000000-0000-4000-8000-000000000001'
  )->>'idempotentReplay')::boolean,
  '018 exact create replay returns the original logical reference'
);
select phase10c_test.expect_error($sql$
  select public.create_routine_reference(
    'opening-main-floor', 'Changed label', null, null,
    '41000000-0000-4000-8000-000000000001'
  )
$sql$, 'different request', '019 changed create request cannot reuse the idempotency key');

select public.update_routine_reference_metadata(
  reference.id, 'Opening main floor reference', 'Updated fixture description',
  'Bildet kommer senere.', reference.revision,
  '42000000-0000-4000-8000-000000000001'
)
from public.routine_reference_images reference where reference.reference_key = 'opening-main-floor';
select phase10c_test.assert_true(
  (select label = 'Opening main floor reference' and description = 'Updated fixture description'
          and placeholder_text = 'Bildet kommer senere.'
   from public.routine_reference_images where reference_key = 'opening-main-floor'),
  '020 metadata update normalizes and persists bounded logical fields'
);
select phase10c_test.expect_error(format($sql$
  select public.update_routine_reference_metadata(%L, 'Stale', null, 'Stale', 1,
    '42000000-0000-4000-8000-000000000002')
$sql$, (select id from public.routine_reference_images where reference_key = 'opening-main-floor')),
  'stale', '021 stale metadata updates are rejected atomically');

select public.set_routine_reference_active(
  reference.id, false, reference.revision,
  '42000000-0000-4000-8000-000000000003'
)
from public.routine_reference_images reference where reference.reference_key = 'closing-main-floor';
select phase10c_test.assert_true(
  (select not active from public.routine_reference_images where reference_key = 'closing-main-floor'),
  '022 manager can deactivate a same-organization logical reference'
);
select phase10c_test.expect_error(format($sql$
  select public.set_routine_reference_active(%L, true, 1,
    '42000000-0000-4000-8000-000000000004')
$sql$, (select id from public.routine_reference_images where reference_key = 'closing-main-floor')),
  'stale', '023 stale active-state writes are rejected');

insert into phase10c_test.state (key, value)
select 'first_prepare', public.prepare_routine_reference_upload(
  reference.id, '  Main Floor Photo.JPEG  ', 'image/jpeg', 12,
  'Ready setup', 'Main floor ready for opening', reference.revision,
  '43000000-0000-4000-8000-000000000001'
)::text
from public.routine_reference_images reference where reference.reference_key = 'upload-probe';
select phase10c_test.assert_true(
  ((select value::jsonb->>'versionId' from phase10c_test.state where key = 'first_prepare') is not null)
  and (select count(*) = 1 from public.routine_reference_image_versions
       where state = 'pending_upload' and reference_id =
         (select id from public.routine_reference_images where reference_key = 'upload-probe')),
  '024 prepare creates one immutable pending upload plan'
);
select phase10c_test.assert_true(
  (select array_length(string_to_array(value::jsonb->>'objectPath', '/'), 1) = 4
   from phase10c_test.state where key = 'first_prepare'),
  '025 server-approved object path has exactly four segments'
);
select phase10c_test.assert_true(
  (select split_part(value::jsonb->>'objectPath', '/', 4) = 'main-floor-photo.jpg'
   from phase10c_test.state where key = 'first_prepare'),
  '026 server normalizes the safe filename and MIME extension'
);
select phase10c_test.assert_true(
  (select version.mime_type = 'image/jpeg' and version.byte_size = 12
          and version.original_file_name = 'Main Floor Photo.JPEG'
          and version.alt_text = 'Main floor ready for opening'
   from public.routine_reference_image_versions version
   where version.id = (select (value::jsonb->>'versionId')::uuid
                       from phase10c_test.state where key = 'first_prepare')),
  '027 prepared version stores exact planned metadata and required alt text'
);
select phase10c_test.assert_true(
  (public.prepare_routine_reference_upload(
    (select id from public.routine_reference_images where reference_key = 'upload-probe'),
    '  Main Floor Photo.JPEG  ', 'image/jpeg', 12, 'Ready setup',
    'Main floor ready for opening',
    (select (value::jsonb->>'referenceRevision')::bigint from phase10c_test.state where key = 'first_prepare') - 1,
    '43000000-0000-4000-8000-000000000001'
  )->>'idempotentReplay')::boolean,
  '028 exact prepare replay returns the same server path despite the old expected revision'
);

select set_config('app.routine_reference_mutation', 'authorized', false);
select phase10c_test.expect_error(format($sql$
  update public.routine_reference_images
  set current_version_id = %L, revision = revision + 1
  where reference_key = 'upload-probe'
$sql$, (select (value::jsonb->>'versionId')::uuid from phase10c_test.state where key = 'first_prepare')),
  'active image or placeholder', '029 current pointer cannot select a pending upload');
select set_config('app.routine_reference_mutation', '', false);

select phase10c_test.expect_error(format($sql$
  select public.finalize_routine_reference_upload(%L, %s, %s,
    '43000000-0000-4000-8000-000000000002')
$sql$,
  (select (value::jsonb->>'versionId')::uuid from phase10c_test.state where key = 'first_prepare'),
  (select (value::jsonb->>'referenceRevision')::bigint from phase10c_test.state where key = 'first_prepare'),
  (select (value::jsonb->>'versionRevision')::bigint from phase10c_test.state where key = 'first_prepare')),
  'exact prepared Storage object was not found',
  '030 finalize refuses a missing Storage object and preserves the old pointer');

set role authenticated;
insert into storage.objects (bucket_id, name, metadata)
select 'routine-reference-images', value::jsonb->>'objectPath',
  jsonb_build_object('size', 12, 'mimetype', 'image/jpeg')
from phase10c_test.state where key = 'first_prepare';
reset role;
select phase10c_test.assert_true(
  exists (select 1 from storage.objects object
          where object.bucket_id = 'routine-reference-images'
            and object.name = (select value::jsonb->>'objectPath' from phase10c_test.state where key = 'first_prepare')),
  '031 manager Storage INSERT accepts the exact pending server-approved path'
);

insert into phase10c_test.state (key, value)
select 'first_finalize', public.finalize_routine_reference_upload(
  (select (value::jsonb->>'versionId')::uuid from phase10c_test.state where key = 'first_prepare'),
  (select (value::jsonb->>'referenceRevision')::bigint from phase10c_test.state where key = 'first_prepare'),
  (select (value::jsonb->>'versionRevision')::bigint from phase10c_test.state where key = 'first_prepare'),
  '43000000-0000-4000-8000-000000000003'
)::text
from public.routine_reference_images reference where reference.reference_key = 'upload-probe';
select phase10c_test.assert_true(
  (select current_version.state = 'active_image'
          and current_version.finalized_at is not null
          and current_version.finalized_by_auth_user_id = '11000000-0000-4000-8000-000000000001'
   from public.routine_reference_images reference
   join public.routine_reference_image_versions current_version on current_version.id = reference.current_version_id
   where reference.reference_key = 'upload-probe'),
  '032 finalize verifies metadata and advances the current pointer to active image'
);
select phase10c_test.assert_true(
  (select count(*) = 1 from public.routine_reference_image_versions version
   where version.reference_id = (select id from public.routine_reference_images where reference_key = 'upload-probe')
     and version.state = 'placeholder'),
  '033 finalizing an image preserves the original immutable placeholder version'
);
select phase10c_test.assert_true(
  (public.finalize_routine_reference_upload(
    (select (value::jsonb->>'versionId')::uuid from phase10c_test.state where key = 'first_prepare'),
    (select (value::jsonb->>'referenceRevision')::bigint from phase10c_test.state where key = 'first_prepare'),
    (select (value::jsonb->>'versionRevision')::bigint from phase10c_test.state where key = 'first_prepare'),
    '43000000-0000-4000-8000-000000000003'
  )->>'idempotentReplay')::boolean,
  '034 exact finalize replay converges on the original active version'
);
select phase10c_test.expect_error(format($sql$
  select public.finalize_routine_reference_upload(%L, %s, 999,
    '43000000-0000-4000-8000-000000000003')
$sql$,
  (select (value::jsonb->>'versionId')::uuid from phase10c_test.state where key = 'first_prepare'),
  (select (value::jsonb->>'referenceRevision')::bigint from phase10c_test.state where key = 'first_prepare')),
  'different request', '035 finalize idempotency rejects a changed request');

insert into phase10c_test.state (key, value)
select 'replacement_prepare', public.prepare_routine_reference_upload(
  reference.id, 'replacement.png', 'image/png', 8,
  null, 'Replacement setup image', reference.revision,
  '43000000-0000-4000-8000-000000000004'
)::text
from public.routine_reference_images reference where reference.reference_key = 'upload-probe';
select phase10c_test.assert_true(
  (select count(*) = 1 from public.routine_reference_image_versions version
   where version.id = (select (value::jsonb->>'versionId')::uuid
                       from phase10c_test.state where key = 'replacement_prepare')
     and version.state = 'pending_upload'),
  '036 replacement begins as a separate pending immutable version'
);
set role authenticated;
insert into storage.objects (bucket_id, name, metadata)
select 'routine-reference-images', value::jsonb->>'objectPath',
  jsonb_build_object('size', 8, 'mimetype', 'image/png')
from phase10c_test.state where key = 'replacement_prepare';
reset role;
select public.finalize_routine_reference_upload(
  (select (value::jsonb->>'versionId')::uuid from phase10c_test.state where key = 'replacement_prepare'),
  (select (value::jsonb->>'referenceRevision')::bigint from phase10c_test.state where key = 'replacement_prepare'),
  (select (value::jsonb->>'versionRevision')::bigint from phase10c_test.state where key = 'replacement_prepare'),
  '43000000-0000-4000-8000-000000000005'
);
select phase10c_test.assert_true(
  (select current_version.mime_type = 'image/png' and current_version.state = 'active_image'
   from public.routine_reference_images reference
   join public.routine_reference_image_versions current_version on current_version.id = reference.current_version_id
   where reference.reference_key = 'upload-probe'),
  '037 replacement finalize advances only the logical current pointer'
);
select phase10c_test.assert_true(
  (select count(*) = 2 from public.routine_reference_image_versions version
   where version.reference_id = (select id from public.routine_reference_images where reference_key = 'upload-probe')
     and version.state = 'active_image'),
  '038 prior active images remain immutable permanent history after replacement'
);

select public.set_routine_reference_placeholder(
  reference.id, 'Bildet kommer senere.', reference.revision,
  '43000000-0000-4000-8000-000000000006'
)
from public.routine_reference_images reference where reference.reference_key = 'upload-probe';
select phase10c_test.assert_true(
  (select current_version.state = 'placeholder'
   from public.routine_reference_images reference
   join public.routine_reference_image_versions current_version on current_version.id = reference.current_version_id
   where reference.reference_key = 'upload-probe'),
  '039 selecting no image creates a new immutable placeholder version'
);
select phase10c_test.assert_true(
  (select count(*) = 2 from public.routine_reference_image_versions version
   where version.reference_id = (select id from public.routine_reference_images where reference_key = 'upload-probe')
     and version.state = 'active_image'),
  '040 placeholder selection never rewrites or deletes earlier active images'
);

insert into phase10c_test.state (key, value)
select 'cancel_prepare', public.prepare_routine_reference_upload(
  reference.id, 'cancelled.webp', 'image/webp', 12,
  'Cancelled probe', 'Cancelled setup image', reference.revision,
  '43000000-0000-4000-8000-000000000007'
)::text
from public.routine_reference_images reference where reference.reference_key = 'upload-probe';
set role authenticated;
insert into storage.objects (bucket_id, name, metadata)
select 'routine-reference-images', value::jsonb->>'objectPath',
  jsonb_build_object('size', 12, 'mimetype', 'image/webp')
from phase10c_test.state where key = 'cancel_prepare';
reset role;
select public.cancel_routine_reference_upload(
  (select (value::jsonb->>'versionId')::uuid from phase10c_test.state where key = 'cancel_prepare'),
  'User cancelled the prepared upload.',
  (select (value::jsonb->>'versionRevision')::bigint from phase10c_test.state where key = 'cancel_prepare'),
  '43000000-0000-4000-8000-000000000008'
);
select phase10c_test.assert_true(
  (select state = 'orphaned' and orphaned_at is not null and orphan_reason = 'User cancelled the prepared upload.'
   from public.routine_reference_image_versions
   where id = (select (value::jsonb->>'versionId')::uuid from phase10c_test.state where key = 'cancel_prepare')),
  '041 cancellation transitions only pending upload to orphaned with audit'
);
select phase10c_test.assert_true(
  (select count(*) = 1 from public.routine_reference_image_cleanup_queue queue
   where queue.version_id = (select (value::jsonb->>'versionId')::uuid
                             from phase10c_test.state where key = 'cancel_prepare')
     and queue.completed_at is null),
  '042 cancellation queues exactly the orphaned object for cleanup'
);

select phase10c_test.expect_error(format('update public.routine_reference_image_versions set caption = ''changed'' where id = %L',
  (select (value::jsonb->>'versionId')::uuid from phase10c_test.state where key = 'first_prepare')),
  'immutable', '043 finalized active image versions reject UPDATE');
select phase10c_test.expect_error(format('delete from public.routine_reference_image_versions where id = %L',
  (select (value::jsonb->>'versionId')::uuid from phase10c_test.state where key = 'first_prepare')),
  'immutable|cannot be deleted', '044 finalized active image versions reject DELETE');
select phase10c_test.expect_error(format('update public.routine_reference_image_versions set revision = revision + 1 where id = %L',
  (select current_version_id from public.routine_reference_images where reference_key = 'upload-probe')),
  'immutable', '045 placeholder versions reject UPDATE');
select phase10c_test.expect_error(format('update public.routine_reference_image_versions set orphan_reason = ''changed'' where id = %L',
  (select (value::jsonb->>'versionId')::uuid from phase10c_test.state where key = 'cancel_prepare')),
  'immutable', '046 orphaned versions reject UPDATE');
select phase10c_test.expect_error(format('delete from public.routine_reference_images where id = %L',
  (select id from public.routine_reference_images where reference_key = 'upload-probe')),
  'cannot be deleted', '047 logical references reject direct DELETE');
select phase10c_test.expect_error('update public.routine_reference_operations set response_payload = ''{}''::jsonb',
  'immutable', '048 operation rows reject UPDATE');
select phase10c_test.expect_error('delete from public.routine_reference_operations',
  'immutable', '049 operation rows reject DELETE');
select phase10c_test.expect_error(format($sql$
  insert into public.routine_template_task_reference_images (
    organization_id, version_id, task_id, reference_id, sort_order,
    created_by_auth_user_id, updated_by_auth_user_id
  ) values ('a1000000-0000-4000-8000-000000000001', %L, %L, %L, 99,
    '11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001')
$sql$,
  (select version.id from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'opening' and version.state = 'draft'),
  (select task.id from public.routine_template_tasks task join public.routine_template_versions version on version.id = task.version_id join public.routine_templates template on template.id = version.template_id where template.routine_key = 'opening' and version.state = 'draft'),
  (select id from public.routine_reference_images where reference_key = 'upload-probe')),
  'draft replacement RPC', '050 direct draft link INSERT is rejected by the guard');
select phase10c_test.expect_error(format($sql$
  insert into public.routine_reference_image_cleanup_queue (
    organization_id, reference_id, version_id, object_path, cleanup_reason, queued_by_auth_user_id
  ) values ('a1000000-0000-4000-8000-000000000001', %L, %L, 'invalid/path', 'direct',
    '11000000-0000-4000-8000-000000000001')
$sql$,
  (select id from public.routine_reference_images where reference_key = 'upload-probe'),
  (select current_version_id from public.routine_reference_images where reference_key = 'upload-probe')),
  'authorized manager RPC', '051 direct cleanup queue INSERT is rejected');
select phase10c_test.assert_true(
  not exists (select 1 from public.routine_reference_image_cleanup_queue queue
              join public.routine_reference_image_versions version on version.id = queue.version_id
              where version.state <> 'orphaned'),
  '052 cleanup queue contains only orphaned non-final objects'
);

-- Draft links, semantic hashing, validation, publishing, and immutable copies.
insert into phase10c_test.state (key, value)
select 'opening_hash_initial', public.routine_template_version_content_hash(version.id)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
where template.routine_key = 'opening' and version.state = 'draft';
select phase10c_test.assert_true(
  (select count(*) = 1 and bool_and(link.button_label = 'Se korrekt oppsett'
                                    and link.context_note = 'Bruk bildet som visuell støtte.')
   from public.routine_template_task_reference_images link
   join public.routine_template_versions version on version.id = link.version_id
   join public.routine_templates template on template.id = version.template_id
   where template.routine_key = 'opening' and version.state = 'draft'),
  '053 fixture installs one complete manager-authored draft reference link'
);

insert into phase10c_test.state (key, value)
select 'link_replace', public.replace_routine_draft_task_reference_images(
  task.id,
  jsonb_build_array(
    jsonb_build_object(
      'referenceId', opening_reference.id, 'buttonLabel', 'Se riktig oppsett',
      'contextNote', 'Før åpning.', 'sortOrder', 0, 'active', true
    ),
    jsonb_build_object(
      'referenceId', upload_reference.id, 'buttonLabel', 'Se alternativt oppsett',
      'contextNote', 'Ved behov.', 'sortOrder', 1, 'active', true
    )
  ),
  version.revision,
  '45000000-0000-4000-8000-000000000001'
)::text
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_tasks task on task.version_id = version.id and task.task_key = 'O01'
join public.routine_reference_images opening_reference on opening_reference.reference_key = 'opening-main-floor'
join public.routine_reference_images upload_reference on upload_reference.reference_key = 'upload-probe'
where template.routine_key = 'opening' and version.state = 'draft';
select phase10c_test.assert_true(
  (select count(*) = 2 from public.routine_template_task_reference_images link
   join public.routine_template_versions version on version.id = link.version_id
   join public.routine_templates template on template.id = version.template_id
   where template.routine_key = 'opening' and version.state = 'draft'),
  '054 manager atomically replaces the complete desired reference list for one draft task'
);
select phase10c_test.assert_true(
  (select (value::jsonb->>'linkCount')::integer = 2
          and (value::jsonb->>'revision')::bigint > 1
   from phase10c_test.state where key = 'link_replace'),
  '055 successful draft-link replacement increments the parent version revision'
);
select phase10c_test.assert_true(
  (public.replace_routine_draft_task_reference_images(
    (select task.id from public.routine_template_tasks task
     join public.routine_template_versions version on version.id = task.version_id
     join public.routine_templates template on template.id = version.template_id
     where template.routine_key = 'opening' and version.state = 'draft' and task.task_key = 'O01'),
    jsonb_build_array(
      jsonb_build_object(
        'referenceId', (select id from public.routine_reference_images where reference_key = 'opening-main-floor'),
        'buttonLabel', 'Se riktig oppsett', 'contextNote', 'Før åpning.', 'sortOrder', 0, 'active', true
      ),
      jsonb_build_object(
        'referenceId', (select id from public.routine_reference_images where reference_key = 'upload-probe'),
        'buttonLabel', 'Se alternativt oppsett', 'contextNote', 'Ved behov.', 'sortOrder', 1, 'active', true
      )
    ),
    (select (value::jsonb->>'revision')::bigint - 1 from phase10c_test.state where key = 'link_replace'),
    '45000000-0000-4000-8000-000000000001'
  )->>'idempotentReplay')::boolean,
  '056 exact draft-link replacement replay returns its original result'
);
select phase10c_test.expect_error(format($sql$
  select public.replace_routine_draft_task_reference_images(%L,
    jsonb_build_array(jsonb_build_object('referenceId', %L, 'buttonLabel', 'Changed', 'sortOrder', 0)),
    %s, '45000000-0000-4000-8000-000000000001')
$sql$,
  (select task.id from public.routine_template_tasks task join public.routine_template_versions version on version.id = task.version_id join public.routine_templates template on template.id = version.template_id where template.routine_key = 'opening' and version.state = 'draft' and task.task_key = 'O01'),
  (select id from public.routine_reference_images where reference_key = 'opening-main-floor'),
  (select (value::jsonb->>'revision')::bigint - 1 from phase10c_test.state where key = 'link_replace')),
  'different request', '057 link idempotency rejects a changed request'
);
select phase10c_test.expect_error(format($sql$
  select public.replace_routine_draft_task_reference_images(%L, '[]'::jsonb, 1,
    '45000000-0000-4000-8000-000000000002')
$sql$, (select task.id from public.routine_template_tasks task join public.routine_template_versions version on version.id = task.version_id join public.routine_templates template on template.id = version.template_id where template.routine_key = 'opening' and version.state = 'draft' and task.task_key = 'O01')),
  'stale', '058 stale draft-link replacement is rejected'
);
select phase10c_test.expect_error(format($sql$
  select public.replace_routine_draft_task_reference_images(%L,
    jsonb_build_array(
      jsonb_build_object('referenceId', %L, 'sortOrder', 0),
      jsonb_build_object('referenceId', %L, 'sortOrder', 0)
    ), %s, '45000000-0000-4000-8000-000000000003')
$sql$,
  (select task.id from public.routine_template_tasks task join public.routine_template_versions version on version.id = task.version_id join public.routine_templates template on template.id = version.template_id where template.routine_key = 'opening' and version.state = 'draft' and task.task_key = 'O01'),
  (select id from public.routine_reference_images where reference_key = 'opening-main-floor'),
  (select id from public.routine_reference_images where reference_key = 'upload-probe'),
  (select version.revision from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'opening' and version.state = 'draft')),
  'duplicate', '059 duplicate task sort positions are rejected before replacement'
);
select phase10c_test.expect_error(format($sql$
  select public.replace_routine_draft_task_reference_images(%L,
    jsonb_build_array(
      jsonb_build_object('referenceId', %L, 'sortOrder', 0),
      jsonb_build_object('referenceId', %L, 'sortOrder', 1)
    ), %s, '45000000-0000-4000-8000-000000000004')
$sql$,
  (select task.id from public.routine_template_tasks task join public.routine_template_versions version on version.id = task.version_id join public.routine_templates template on template.id = version.template_id where template.routine_key = 'opening' and version.state = 'draft' and task.task_key = 'O01'),
  (select id from public.routine_reference_images where reference_key = 'opening-main-floor'),
  (select id from public.routine_reference_images where reference_key = 'opening-main-floor'),
  (select version.revision from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'opening' and version.state = 'draft')),
  'duplicate', '060 duplicate logical task reference links are rejected'
);

select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000001', false);
select public.create_routine_reference(
  'foreign-reference', 'Foreign reference', null, null,
  '45000000-0000-4000-8000-000000000005'
);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
select phase10c_test.expect_error(format($sql$
  select public.replace_routine_draft_task_reference_images(%L,
    jsonb_build_array(jsonb_build_object('referenceId', %L, 'sortOrder', 0)),
    %s, '45000000-0000-4000-8000-000000000006')
$sql$,
  (select task.id from public.routine_template_tasks task join public.routine_template_versions version on version.id = task.version_id join public.routine_templates template on template.id = version.template_id where template.routine_key = 'opening' and version.state = 'draft' and task.task_key = 'O01'),
  (select id from public.routine_reference_images where reference_key = 'foreign-reference'),
  (select version.revision from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'opening' and version.state = 'draft')),
  'same-organization', '061 foreign-organization logical references are rejected by the manager RPC'
);
select phase10c_test.expect_error(format($sql$
  select public.replace_routine_draft_task_reference_images(%L,
    jsonb_build_array(jsonb_build_object('referenceId', %L, 'taskItemId', %L, 'sortOrder', 0)),
    %s, '45000000-0000-4000-8000-000000000007')
$sql$,
  (select task.id from public.routine_template_tasks task join public.routine_template_versions version on version.id = task.version_id join public.routine_templates template on template.id = version.template_id where template.routine_key = 'closing' and version.state = 'draft' and task.task_key = 'C01'),
  (select id from public.routine_reference_images where reference_key = 'upload-probe'),
  (select item.id from public.routine_template_task_items item join public.routine_template_tasks task on task.id = item.task_id where task.task_key = 'O01'),
  (select version.revision from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'closing' and version.state = 'draft')),
  'optional task item', '062 a task item from another task cannot receive the link'
);
select phase10c_test.expect_error(format($sql$
  select public.replace_routine_draft_task_reference_images(%L, '[{"buttonLabel":"Missing reference"}]'::jsonb,
    %s, '45000000-0000-4000-8000-000000000008')
$sql$,
  (select task.id from public.routine_template_tasks task join public.routine_template_versions version on version.id = task.version_id join public.routine_templates template on template.id = version.template_id where template.routine_key = 'opening' and version.state = 'draft' and task.task_key = 'O01'),
  (select version.revision from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id where template.routine_key = 'opening' and version.state = 'draft')),
  'requires a reference', '063 incomplete reference-link input is rejected'
);
select phase10c_test.assert_true(
  (select (value::jsonb->'references'->0->>'sortOrder')::integer = 0
          and (value::jsonb->'references'->1->>'sortOrder')::integer = 1
   from phase10c_test.state where key = 'link_replace'),
  '064 replacement response preserves deterministic reference order'
);
select phase10c_test.assert_true(
  (select version.revision = (select (value::jsonb->>'revision')::bigint from phase10c_test.state where key = 'link_replace')
   from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id
   where template.routine_key = 'opening' and version.state = 'draft'),
  '065 failed and replayed replacements never advance the version revision'
);
select phase10c_test.assert_true(
  (select canonical->'referenceImages' @> '[{"taskKey":"O01","referenceKey":"opening-main-floor","buttonLabel":"Se riktig oppsett","contextNote":"Før åpning.","sortOrder":0,"active":true}]'::jsonb
   from (select public.routine_template_version_canonical_json(version.id) canonical
         from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id
         where template.routine_key = 'opening' and version.state = 'draft') value),
  '066 canonical template JSON includes every semantic task-reference field'
);
select phase10c_test.assert_true(
  (select canonical::text not like '%current_version_id%'
          and canonical::text not like '%object_path%'
          and canonical::text not like '%alt_text%'
          and canonical::text not like '%caption%'
   from (select public.routine_template_version_canonical_json(version.id) canonical
         from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id
         where template.routine_key = 'opening' and version.state = 'draft') value),
  '067 canonical content excludes mutable image selection and upload metadata'
);
select phase10c_test.assert_true(
  (select value <> (select public.routine_template_version_content_hash(version.id)
                    from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id
                    where template.routine_key = 'opening' and version.state = 'draft')
   from phase10c_test.state where key = 'opening_hash_initial'),
  '068 adding a logical reference link changes template content identity'
);

insert into phase10c_test.state (key, value)
select 'hash_before_reorder', public.routine_template_version_content_hash(version.id)
from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id
where template.routine_key = 'opening' and version.state = 'draft';
select public.replace_routine_draft_task_reference_images(
  task.id,
  jsonb_build_array(
    jsonb_build_object('referenceId', opening_reference.id, 'buttonLabel', 'Se riktig oppsett', 'contextNote', 'Før åpning.', 'sortOrder', 1, 'active', true),
    jsonb_build_object('referenceId', upload_reference.id, 'buttonLabel', 'Se alternativt oppsett', 'contextNote', 'Ved behov.', 'sortOrder', 0, 'active', true)
  ), version.revision, '45000000-0000-4000-8000-000000000009'
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
join public.routine_template_tasks task on task.version_id = version.id and task.task_key = 'O01'
join public.routine_reference_images opening_reference on opening_reference.reference_key = 'opening-main-floor'
join public.routine_reference_images upload_reference on upload_reference.reference_key = 'upload-probe'
where template.routine_key = 'opening' and version.state = 'draft';
select phase10c_test.assert_true(
  (select value <> (select public.routine_template_version_content_hash(version.id)
                    from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id
                    where template.routine_key = 'opening' and version.state = 'draft')
   from phase10c_test.state where key = 'hash_before_reorder'),
  '069 reordering logical reference links changes template content identity'
);

insert into phase10c_test.state (key, value)
select 'hash_before_image_change', public.routine_template_version_content_hash(version.id)
from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id
where template.routine_key = 'opening' and version.state = 'draft';
insert into phase10c_test.state (key, value)
select 'semantic_prepare', public.prepare_routine_reference_upload(
  reference.id, 'semantic.jpg', 'image/jpeg', 4, null,
  'Current semantic image', reference.revision,
  '45000000-0000-4000-8000-000000000010'
)::text
from public.routine_reference_images reference where reference.reference_key = 'upload-probe';
set role authenticated;
insert into storage.objects (bucket_id, name, metadata)
select 'routine-reference-images', value::jsonb->>'objectPath', '{"size":4,"mimetype":"image/jpeg"}'::jsonb
from phase10c_test.state where key = 'semantic_prepare';
reset role;
select public.finalize_routine_reference_upload(
  (select (value::jsonb->>'versionId')::uuid from phase10c_test.state where key = 'semantic_prepare'),
  (select (value::jsonb->>'referenceRevision')::bigint from phase10c_test.state where key = 'semantic_prepare'),
  (select (value::jsonb->>'versionRevision')::bigint from phase10c_test.state where key = 'semantic_prepare'),
  '45000000-0000-4000-8000-000000000011'
);
select phase10c_test.assert_true(
  (select value = (select public.routine_template_version_content_hash(version.id)
                   from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id
                   where template.routine_key = 'opening' and version.state = 'draft')
   from phase10c_test.state where key = 'hash_before_image_change'),
  '070 replacing the actual image on one logical reference does not change template content identity'
);
select phase10c_test.assert_true(
  (select current_version.state = 'active_image' and current_version.alt_text = 'Current semantic image'
   from public.routine_reference_images reference
   join public.routine_reference_image_versions current_version on current_version.id = reference.current_version_id
   where reference.reference_key = 'upload-probe'),
  '071 actual image replacement leaves a valid current immutable version'
);
select phase10c_test.assert_true(
  (select validation->'warnings' @> '["A linked active routine reference image has no caption; publication is still allowed."]'::jsonb
   from (select public.validate_routine_template_version(version.id, array(
           select batch.id from public.routine_template_versions batch join public.routine_templates batch_template on batch_template.id = batch.template_id
           where batch.state = 'draft' and batch_template.routine_key in ('opening','closing') order by batch_template.routine_key
         )) validation
         from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id
         where template.routine_key = 'opening' and version.state = 'draft') value),
  '072 missing caption is a publication warning rather than a blocker'
);
select phase10c_test.assert_true(
  (select (validation->'counts'->>'referenceImages')::integer = 2
   from (select public.validate_routine_template_version(version.id, array(
           select batch.id from public.routine_template_versions batch join public.routine_templates batch_template on batch_template.id = batch.template_id
           where batch.state = 'draft' and batch_template.routine_key in ('opening','closing') order by batch_template.routine_key
         )) validation
         from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id
         where template.routine_key = 'opening' and version.state = 'draft') value),
  '073 validation reports the exact reference-link count'
);
select phase10c_test.assert_true(
  (select validation->'warnings' @> '["A linked routine reference currently uses its placeholder; publication is still allowed."]'::jsonb
   from (select public.validate_routine_template_version(version.id, array(
           select batch.id from public.routine_template_versions batch join public.routine_templates batch_template on batch_template.id = batch.template_id
           where batch.state = 'draft' and batch_template.routine_key in ('opening','closing') order by batch_template.routine_key
         )) validation
         from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id
         where template.routine_key = 'opening' and version.state = 'draft') value),
  '074 a current placeholder is explicitly reported as a warning'
);
select phase10c_test.assert_true(
  (select not (validation->'blockers' @> '["Every linked routine reference must have a valid current active image or placeholder."]'::jsonb)
   from (select public.validate_routine_template_version(version.id, array(
           select batch.id from public.routine_template_versions batch join public.routine_templates batch_template on batch_template.id = batch.template_id
           where batch.state = 'draft' and batch_template.routine_key in ('opening','closing') order by batch_template.routine_key
         )) validation
         from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id
         where template.routine_key = 'opening' and version.state = 'draft') value),
  '075 a valid placeholder is never a publication blocker'
);
select public.set_routine_reference_active(
  reference.id, false, reference.revision,
  '45000000-0000-4000-8000-000000000012'
)
from public.routine_reference_images reference where reference.reference_key = 'opening-main-floor';
select phase10c_test.assert_true(
  (select validation->'blockers' @> '["Every active routine reference link must use a same-organization active logical reference."]'::jsonb
   from (select public.validate_routine_template_version(version.id, array(
           select batch.id from public.routine_template_versions batch join public.routine_templates batch_template on batch_template.id = batch.template_id
           where batch.state = 'draft' and batch_template.routine_key in ('opening','closing') order by batch_template.routine_key
         )) validation
         from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id
         where template.routine_key = 'opening' and version.state = 'draft') value),
  '076 inactive logical references block publication'
);
select public.set_routine_reference_active(
  reference.id, true, reference.revision,
  '45000000-0000-4000-8000-000000000013'
)
from public.routine_reference_images reference where reference.reference_key = 'opening-main-floor';
select phase10c_test.assert_true(
  (select (validation->>'valid')::boolean
   from (select public.validate_routine_template_version(version.id, array(
           select batch.id from public.routine_template_versions batch join public.routine_templates batch_template on batch_template.id = batch.template_id
           where batch.state = 'draft' and batch_template.routine_key in ('opening','closing') order by batch_template.routine_key
         )) validation
         from public.routine_template_versions version join public.routine_templates template on template.id = version.template_id
         where template.routine_key = 'opening' and version.state = 'draft') value),
  '077 a valid logical reference set remains publishable with warnings'
);

select public.publish_routine_template_versions(
  array_agg(version.id order by template.routine_key),
  jsonb_object_agg(version.id::text, to_jsonb(version.revision)),
  'Phase 10C linked publication',
  '45000000-0000-4000-8000-000000000014'
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
where template.routine_key in ('opening', 'closing') and version.state = 'draft';
select phase10c_test.assert_true(
  (select count(*) = 2 from public.routine_template_versions version
   join public.routine_templates template on template.id = version.template_id
   where template.routine_key in ('opening', 'closing') and version.state = 'published'),
  '078 Opening and Closing still publish atomically with logical reference links'
);
select phase10c_test.assert_true(
  (select count(*) = 2 from public.routine_template_task_reference_images link
   join public.routine_template_versions version on version.id = link.version_id
   join public.routine_templates template on template.id = version.template_id
   where template.routine_key = 'opening' and version.state = 'published'),
  '079 published content retains both semantic image links'
);
select set_config('app.routine_reference_link_mutation', 'authorized', false);
select phase10c_test.expect_error(format('update public.routine_template_task_reference_images set button_label = ''Changed'' where id = %L',
  (select link.id from public.routine_template_task_reference_images link join public.routine_template_versions version on version.id = link.version_id where version.state = 'published' limit 1)),
  'immutable', '080 published task-reference links reject UPDATE'
);
select phase10c_test.expect_error(format('delete from public.routine_template_task_reference_images where id = %L',
  (select link.id from public.routine_template_task_reference_images link join public.routine_template_versions version on version.id = link.version_id where version.state = 'published' limit 1)),
  'immutable', '081 published task-reference links reject DELETE'
);
select set_config('app.routine_reference_link_mutation', '', false);
select public.create_routine_template_draft(
  template.id, template.current_published_version_id,
  '45000000-0000-4000-8000-000000000015'
)
from public.routine_templates template where template.routine_key = 'opening';
select phase10c_test.assert_true(
  (select count(*) = 2 and count(distinct reference.reference_key) = 2
   from public.routine_template_task_reference_images link
   join public.routine_template_versions version on version.id = link.version_id
   join public.routine_templates template on template.id = version.template_id
   join public.routine_reference_images reference on reference.id = link.reference_id
   where template.routine_key = 'opening' and version.state = 'draft'),
  '082 draft copy preserves logical links by stable task and reference keys with new child UUIDs'
);
select phase10c_test.assert_true(
  (select count(*) = 1 from public.routine_template_versions version
   join public.routine_templates template on template.id = version.template_id
   where template.routine_key = 'opening' and version.state = 'draft'),
  '083 Phase 10B one-active-draft invariant remains intact after linked copy'
);
select phase10c_test.assert_true(
  (select count(*) = 1 and bool_and(content_hash = public.routine_template_version_content_hash(version.id))
   from public.routine_template_versions version
   join public.routine_templates template on template.id = version.template_id
   where template.routine_key = 'opening' and version.state = 'published'),
  '084 published SHA-256 hash matches the Phase 10C canonical linked content'
);

-- Storage authorization and exact cleanup lifecycle.
select phase10c_test.assert_true(
  (select count(*) = 3 and bool_and(cmd in ('SELECT','INSERT','DELETE'))
   from pg_catalog.pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'routine_reference_images_%')
  and not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'routine_reference_images_%' and cmd = 'UPDATE'
  ),
  '085 exactly three bucket-scoped policies exist and no Storage UPDATE policy exists'
);

insert into phase10c_test.state (key, value)
select 'policy_prepare', public.prepare_routine_reference_upload(
  reference.id, 'policy-probe.png', 'image/png', 8,
  'Policy probe', 'Storage policy probe', reference.revision,
  '46000000-0000-4000-8000-000000000001'
)::text
from public.routine_reference_images reference where reference.reference_key = 'opening-main-floor';
set role authenticated;
select phase10c_test.expect_error($sql$
  insert into storage.objects (bucket_id, name, metadata)
  values ('routine-reference-images', 'arbitrary/path.png', '{"size":8,"mimetype":"image/png"}'::jsonb)
$sql$, 'row-level security|policy', '086 manager cannot upload to an arbitrary object path');
insert into storage.objects (bucket_id, name, metadata)
select 'routine-reference-images', value::jsonb->>'objectPath', '{"size":8,"mimetype":"image/png"}'::jsonb
from phase10c_test.state where key = 'policy_prepare';
select phase10c_test.assert_true(
  exists (select 1 from storage.objects object
          where object.name = (select value::jsonb->>'objectPath' from phase10c_test.state where key = 'policy_prepare')),
  '087 manager can upload the exact pending server-approved object path'
);
update storage.objects
set metadata = '{"size":999,"mimetype":"image/png"}'::jsonb
where name = (select value::jsonb->>'objectPath' from phase10c_test.state where key = 'policy_prepare');
select phase10c_test.assert_true(
  (select metadata->>'size' = '8' from storage.objects object
   where object.name = (select value::jsonb->>'objectPath' from phase10c_test.state where key = 'policy_prepare')),
  '088 absent UPDATE policy prevents overwrite of an uploaded pending object'
);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', false);
select phase10c_test.expect_error(format($sql$
  insert into storage.objects (bucket_id, name, metadata)
  values ('routine-reference-images', %L || '-staff', '{"size":8,"mimetype":"image/png"}'::jsonb)
$sql$, (select value::jsonb->>'objectPath' from phase10c_test.state where key = 'policy_prepare')),
  'row-level security|policy', '089 staff cannot upload even when imitating a prepared manager path');
reset role;
select phase10c_test.assert_true(
  not has_table_privilege('anon', 'storage.objects', 'INSERT'),
  '090 anon has no Storage upload privilege'
);

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set role authenticated;
select phase10c_test.assert_true(
  (select count(*) >= 1 from storage.objects object
   join public.routine_reference_image_versions version on version.object_path = object.name
   where object.bucket_id = 'routine-reference-images' and version.state = 'active_image'),
  '091 manager can read own-organization finalized images'
);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', false);
select phase10c_test.assert_true(
  (select count(*) = 1 from storage.objects object
   where object.name = (select object_path from public.routine_reference_image_versions version
                        join public.routine_reference_images reference on reference.current_version_id = version.id
                        where reference.reference_key = 'upload-probe')),
  '092 staff can read the current active image linked from current published content'
);
select phase10c_test.assert_true(
  (select count(*) = 0 from storage.objects object
   where object.name = (select value::jsonb->>'objectPath' from phase10c_test.state where key = 'policy_prepare')),
  '093 staff cannot read a non-current pending upload object'
);
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000001', false);
select phase10c_test.assert_true(
  (select count(*) = 0 from storage.objects object
   where object.name = (select object_path from public.routine_reference_image_versions version
                        where version.upload_idempotency_key = '45000000-0000-4000-8000-000000000010')),
  '094 cross-organization Storage read is blocked'
);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', false);
delete from storage.objects
where name = (select object_path from public.routine_reference_image_versions version
              where version.upload_idempotency_key = '45000000-0000-4000-8000-000000000010');
select phase10c_test.assert_true(
  exists (select 1 from storage.objects object
          where object.name = (select object_path from public.routine_reference_image_versions version
                               where version.upload_idempotency_key = '45000000-0000-4000-8000-000000000010')),
  '095 staff cannot delete a current finalized image'
);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
delete from storage.objects
where name = (select object_path from public.routine_reference_image_versions version
              where version.upload_idempotency_key = '45000000-0000-4000-8000-000000000010');
select phase10c_test.assert_true(
  exists (select 1 from storage.objects object
          where object.name = (select object_path from public.routine_reference_image_versions version
                               where version.upload_idempotency_key = '45000000-0000-4000-8000-000000000010')),
  '096 manager cannot delete a finalized or historical image'
);
reset role;
select phase10c_test.assert_true(
  (select jsonb_array_length(public.list_routine_reference_cleanup_paths()) = 1),
  '097 manager lists only own pending cleanup paths'
);
select phase10c_test.expect_error(format($sql$
  select public.acknowledge_routine_reference_cleanup(%L)
$sql$, (select object_path from public.routine_reference_image_cleanup_queue where completed_at is null)),
  'still exists', '098 cleanup acknowledgement is rejected while the Storage object exists'
);
set role authenticated;
delete from storage.objects
where name = (select object_path from public.routine_reference_image_cleanup_queue where completed_at is null);
reset role;
select phase10c_test.assert_true(
  not exists (select 1 from storage.objects object
              where object.name = (select object_path from public.routine_reference_image_cleanup_queue where completed_at is null)),
  '099 manager can delete exactly a queued non-current orphan object'
);
select public.acknowledge_routine_reference_cleanup(
  (select object_path from public.routine_reference_image_cleanup_queue where completed_at is null)
);
select phase10c_test.assert_true(
  (select count(*) = 1 and bool_and(completed_at is not null and completed_by_auth_user_id is not null)
   from public.routine_reference_image_cleanup_queue),
  '100 cleanup acknowledgement records immutable completion audit only after deletion'
);
select phase10c_test.assert_true(
  exists (select 1 from storage.objects object
          where object.name = (select object_path from public.routine_reference_image_versions version
                               where version.upload_idempotency_key = '45000000-0000-4000-8000-000000000010')),
  '101 cleanup never removes any finalized active image object'
);

-- Path, server-side metadata, and bounded upload validation.
select phase10c_test.assert_true(
  public.routine_reference_image_path_valid(
    'a1000000-0000-4000-8000-000000000001',
    'aaaaaaaa-0000-4000-8000-000000000001',
    'bbbbbbbb-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001/aaaaaaaa-0000-4000-8000-000000000001/bbbbbbbb-0000-4000-8000-000000000001/photo.jpg',
    'image/jpeg'
  ),
  '102 exact four-segment JPEG path is accepted'
);
select phase10c_test.assert_true(
  public.routine_reference_image_path_valid(
    'a1000000-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001/aaaaaaaa-0000-4000-8000-000000000001/bbbbbbbb-0000-4000-8000-000000000001/photo.png','image/png'
  ),
  '103 exact PNG extension and MIME pair is accepted'
);
select phase10c_test.assert_true(
  public.routine_reference_image_path_valid(
    'a1000000-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001/aaaaaaaa-0000-4000-8000-000000000001/bbbbbbbb-0000-4000-8000-000000000001/photo.webp','image/webp'
  ),
  '104 exact WebP extension and MIME pair is accepted'
);
select phase10c_test.assert_true(
  not public.routine_reference_image_path_valid(
    'a1000000-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001/aaaaaaaa-0000-4000-8000-000000000001/bbbbbbbb-0000-4000-8000-000000000001/photo.jpg','image/jpeg'
  ),
  '105 wrong organization path segment is rejected'
);
select phase10c_test.assert_true(
  not public.routine_reference_image_path_valid(
    'a1000000-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/bbbbbbbb-0000-4000-8000-000000000001/photo.jpg','image/jpeg'
  ),
  '106 wrong logical-reference path segment is rejected'
);
select phase10c_test.assert_true(
  not public.routine_reference_image_path_valid(
    'a1000000-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001/aaaaaaaa-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/photo.jpg','image/jpeg'
  ),
  '107 wrong image-version path segment is rejected'
);
select phase10c_test.assert_true(
  not public.routine_reference_image_path_valid(
    'a1000000-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001/aaaaaaaa-0000-4000-8000-000000000001/bbbbbbbb-0000-4000-8000-000000000001/extra/photo.jpg','image/jpeg'
  ),
  '108 extra path segment is rejected'
);
select phase10c_test.assert_true(
  not public.routine_reference_image_path_valid(
    'a1000000-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001/aaaaaaaa-0000-4000-8000-000000000001/bbbbbbbb-0000-4000-8000-000000000001/..jpg','image/jpeg'
  ),
  '109 path traversal marker is rejected'
);
select phase10c_test.assert_true(
  not public.routine_reference_image_path_valid(
    'a1000000-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001/aaaaaaaa-0000-4000-8000-000000000001/bbbbbbbb-0000-4000-8000-000000000001/bad name.jpg','image/jpeg'
  ),
  '110 unsafe filename characters are rejected by the authoritative path validator'
);
select phase10c_test.assert_true(
  not public.routine_reference_image_path_valid(
    'a1000000-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001/aaaaaaaa-0000-4000-8000-000000000001/bbbbbbbb-0000-4000-8000-000000000001/photo.png','image/jpeg'
  ),
  '111 extension must match the declared MIME type'
);
select phase10c_test.assert_true(
  public.routine_reference_safe_filename('  Utrygt navn (1).JPEG  ', 'image/jpeg') = 'utrygt-navn-1.jpg',
  '112 server filename normalization removes unsafe syntax and canonicalizes extension'
);
select phase10c_test.expect_error(format($sql$
  select public.prepare_routine_reference_upload(%L, 'large.jpg', 'image/jpeg', 5242881, null, 'Large image', %s,
    '46000000-0000-4000-8000-000000000002')
$sql$, (select id from public.routine_reference_images where reference_key = 'opening-main-floor'),
  (select revision from public.routine_reference_images where reference_key = 'opening-main-floor')),
  '5 MB', '113 server rejects an upload larger than 5 MB'
);
select phase10c_test.expect_error(format($sql$
  select public.prepare_routine_reference_upload(%L, 'image.gif', 'image/gif', 10, null, 'GIF image', %s,
    '46000000-0000-4000-8000-000000000003')
$sql$, (select id from public.routine_reference_images where reference_key = 'opening-main-floor'),
  (select revision from public.routine_reference_images where reference_key = 'opening-main-floor')),
  'JPEG, PNG, or WebP', '114 server rejects an unknown MIME type'
);
select phase10c_test.expect_error(format($sql$
  select public.prepare_routine_reference_upload(%L, 'image.jpg', 'image/jpeg', 10, null, '   ', %s,
    '46000000-0000-4000-8000-000000000004')
$sql$, (select id from public.routine_reference_images where reference_key = 'opening-main-floor'),
  (select revision from public.routine_reference_images where reference_key = 'opening-main-floor')),
  'alt text is required', '115 actual images require non-empty alt text'
);

select public.create_routine_reference(
  'mismatch-probe', 'Mismatch probe', null, null,
  '46000000-0000-4000-8000-000000000005'
);
insert into phase10c_test.state (key, value)
select 'mismatch_prepare', public.prepare_routine_reference_upload(
  reference.id, 'mismatch.jpg', 'image/jpeg', 4, null, 'Mismatch image', reference.revision,
  '46000000-0000-4000-8000-000000000006'
)::text
from public.routine_reference_images reference where reference.reference_key = 'mismatch-probe';
insert into storage.objects (bucket_id, name, metadata)
select 'routine-reference-images', value::jsonb->>'objectPath', '{"size":5,"mimetype":"image/jpeg"}'::jsonb
from phase10c_test.state where key = 'mismatch_prepare';
select phase10c_test.expect_error(format($sql$
  select public.finalize_routine_reference_upload(%L, %s, %s,
    '46000000-0000-4000-8000-000000000007')
$sql$,
  (select (value::jsonb->>'versionId')::uuid from phase10c_test.state where key = 'mismatch_prepare'),
  (select (value::jsonb->>'referenceRevision')::bigint from phase10c_test.state where key = 'mismatch_prepare'),
  (select (value::jsonb->>'versionRevision')::bigint from phase10c_test.state where key = 'mismatch_prepare')),
  'size or MIME type differs', '116 finalize rejects actual Storage size mismatch'
);
update storage.objects set metadata = '{"size":4,"mimetype":"image/png"}'::jsonb
where name = (select value::jsonb->>'objectPath' from phase10c_test.state where key = 'mismatch_prepare');
select phase10c_test.expect_error(format($sql$
  select public.finalize_routine_reference_upload(%L, %s, %s,
    '46000000-0000-4000-8000-000000000008')
$sql$,
  (select (value::jsonb->>'versionId')::uuid from phase10c_test.state where key = 'mismatch_prepare'),
  (select (value::jsonb->>'referenceRevision')::bigint from phase10c_test.state where key = 'mismatch_prepare'),
  (select (value::jsonb->>'versionRevision')::bigint from phase10c_test.state where key = 'mismatch_prepare')),
  'size or MIME type differs', '117 finalize rejects actual Storage MIME mismatch'
);

-- RLS, grants, and protected-domain regression boundaries.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set role authenticated;
select phase10c_test.assert_true(
  (select count(*) >= 4 from public.routine_reference_images)
  and (select count(*) >= 10 from public.routine_reference_image_versions)
  and (select count(*) >= 4 from public.routine_reference_operations),
  '118 manager reads own-organization references versions and operation history'
);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', false);
select phase10c_test.assert_true(
  (select count(*) = 2 from public.routine_reference_images)
  and (select count(*) = 2 from public.routine_template_task_reference_images),
  '119 staff reads only active references and links in current published content'
);
select phase10c_test.assert_true(
  (select count(*) = 2 from public.routine_reference_image_versions)
  and not exists (select 1 from public.routine_reference_image_versions where state in ('pending_upload','orphaned')),
  '120 staff reads only current active-image or placeholder versions'
);
select phase10c_test.assert_true(
  (select count(*) = 0 from public.routine_reference_operations)
  and (select count(*) = 0 from public.routine_reference_image_cleanup_queue),
  '121 staff cannot read operations or cleanup history'
);
select phase10c_test.assert_true(
  not exists (
    select 1 from public.routine_template_task_reference_images link
    join public.routine_template_versions version on version.id = link.version_id
    where version.state = 'draft'
  ),
  '122 staff cannot read draft-only task-reference links'
);
select phase10c_test.expect_error($sql$
  select public.replace_routine_draft_task_reference_images(
    'aaaaaaaa-0000-4000-8000-000000000001', '[]'::jsonb, 1,
    '47000000-0000-4000-8000-000000000001'
  )
$sql$,
  'manager.*required', '123 staff cannot replace draft reference links'
);
reset role;
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000001', false);
select phase10c_test.expect_error(format($sql$
  select public.update_routine_reference_metadata(%L, 'Cross org', null, 'Cross org', 1,
    '47000000-0000-4000-8000-000000000002')
$sql$, (select id from public.routine_reference_images where reference_key = 'opening-main-floor')),
  'not found', '124 cross-organization manager RPC access is blocked'
);
set role authenticated;
select phase10c_test.assert_true(
  (select count(*) = 1 from public.routine_reference_images)
  and not exists (select 1 from public.routine_reference_images where organization_id = 'a1000000-0000-4000-8000-000000000001'),
  '125 cross-organization SELECT is blocked by exact tenant RLS'
);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000004', false);
select phase10c_test.assert_true((select count(*) = 0 from public.routine_reference_images), '126 inactive users are blocked');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000005', false);
select phase10c_test.assert_true((select count(*) = 0 from public.routine_reference_images), '127 organization-less users are blocked');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000006', false);
select phase10c_test.assert_true((select count(*) = 0 from public.routine_reference_images), '128 Inventory counters receive no automatic Routine Engine access');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000007', false);
select phase10c_test.assert_true((select count(*) = 0 from public.routine_reference_images), '129 shared-device profiles are blocked without a future operator session');
reset role;
select phase10c_test.assert_true(
  not has_table_privilege('anon', 'public.routine_reference_images', 'SELECT')
  and not has_function_privilege('anon', 'public.create_routine_reference(text,text,text,text,uuid)', 'EXECUTE'),
  '130 anon has no Phase 10C table or manager-RPC access'
);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
set role authenticated;
select phase10c_test.expect_error($sql$
  insert into public.routine_reference_images (
    organization_id, reference_key, label, placeholder_text,
    creation_idempotency_key, creation_request_hash,
    created_by_auth_user_id, updated_by_auth_user_id
  ) values (
    'a1000000-0000-4000-8000-000000000001', 'direct-write', 'Direct write', 'No image',
    gen_random_uuid(), repeat('a', 64),
    '11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001'
  )
$sql$, 'permission denied', '131 authenticated clients have no direct Phase 10C table DML');
reset role;
select phase10c_test.assert_true(
  not exists (
    select 1 from information_schema.role_table_grants privilege
    where privilege.grantee = 'authenticated' and privilege.table_schema = 'public'
      and privilege.table_name in (
        'routine_reference_images','routine_reference_image_versions',
        'routine_template_task_reference_images','routine_reference_image_cleanup_queue',
        'routine_reference_operations'
      ) and privilege.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
  ),
  '132 authenticated has SELECT-only grants on every Phase 10C data table'
);
select phase10c_test.assert_true(
  (select count(*) = 5 and bool_and(policy.roles = '{authenticated}'::name[])
   from pg_catalog.pg_policies policy
   where policy.schemaname = 'public' and policy.tablename in (
     'routine_reference_images','routine_reference_image_versions',
     'routine_template_task_reference_images','routine_reference_image_cleanup_queue',
     'routine_reference_operations'
   ))
  and not exists (
    select 1 from pg_catalog.pg_policies policy
    where policy.schemaname in ('public','storage')
      and policy.policyname like 'routine_reference%'
      and (coalesce(policy.qual, '') ~* '^\s*true\s*$' or coalesce(policy.with_check, '') ~* '^\s*true\s*$')
  ),
  '133 every Phase 10C policy targets authenticated without broad predicates'
);
select phase10c_test.assert_true(
  not exists (
    select 1 from pg_catalog.pg_proc function_definition
    join pg_catalog.pg_namespace namespace on namespace.oid = function_definition.pronamespace
    where namespace.nspname = 'public'
      and (function_definition.proname like 'routine_reference%'
           or function_definition.proname in (
             'create_routine_reference','update_routine_reference_metadata',
             'set_routine_reference_active','prepare_routine_reference_upload',
             'finalize_routine_reference_upload','cancel_routine_reference_upload',
             'set_routine_reference_placeholder','replace_routine_draft_task_reference_images'
           ))
      and function_definition.prosecdef
      and not ('search_path=pg_catalog' = any(coalesce(function_definition.proconfig, '{}'::text[])))
  ),
  '134 every security-definer Phase 10C function fixes search_path to pg_catalog'
);
select phase10c_test.assert_true(
  (select count(*) = 6 from information_schema.tables where table_schema = 'public' and table_name in (
    'routine_organization_settings','routine_locations','routine_location_sets',
    'routine_location_set_members','routine_standards','routine_standard_revisions'
  )),
  '135 all six Phase 10A foundation tables remain available'
);
select phase10c_test.assert_true(
  (select count(*) = 8 from information_schema.tables where table_schema = 'public' and table_name in (
    'routine_templates','routine_template_versions','routine_template_sections','routine_template_tasks',
    'routine_template_task_items','routine_template_task_dependencies','routine_template_task_relations',
    'routine_template_publication_batches'
  )),
  '136 all eight Phase 10B template tables remain available'
);
select phase10c_test.assert_true(
  not exists (
    select 1 from pg_catalog.pg_constraint constraint_definition
    join pg_catalog.pg_class source on source.oid = constraint_definition.conrelid
    join pg_catalog.pg_class target on target.oid = constraint_definition.confrelid
    where source.relname in (
      'routine_reference_images','routine_reference_image_versions',
      'routine_template_task_reference_images','routine_reference_image_cleanup_queue',
      'routine_reference_operations'
    ) and (target.relname like 'inventory_%' or target.relname like 'event_%'
           or target.relname in ('shift_sessions','task_completions','handover_notes'))
  ),
  '137 Phase 10C has no foreign-key dependency on Inventory Event Operations or legacy routines'
);
select phase10c_test.assert_true((select count(*) = 8 from auth.users), '138 Auth fixture identities remain unchanged');
select phase10c_test.assert_true(
  (select count(distinct task_key) = 2 from public.routine_template_tasks where task_key in ('O01','C01'))
  and not exists (select 1 from public.routine_template_tasks where task_key ~ '^(O|C|DS)[0-9]{2}$' and task_key not in ('O01','C01')),
  '139 Phase 10C seeds no Mesh O C or DS routine content beyond disposable template fixtures'
);
select phase10c_test.assert_true(
  not exists (
    select 1 from public.routine_reference_image_cleanup_queue queue
    join public.routine_reference_image_versions version on version.id = queue.version_id
    where version.state = 'active_image'
  )
  and (select count(*) >= 1 from public.routine_template_publication_batches),
  '140 finalized images never enter cleanup and Phase 10B publication audit remains intact'
);

select phase10c_test.expect_error(format('delete from public.routine_reference_image_versions where id = %L',
  (select current_version_id from public.routine_reference_images where reference_key = 'opening-main-floor')),
  'immutable|cannot be deleted', '141 placeholder image versions reject DELETE'
);
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000001', false);
select public.create_routine_reference(
  'opening-main-floor', 'Organization B opening reference', null, null,
  '48000000-0000-4000-8000-000000000001'
);
select phase10c_test.assert_true(
  (select count(*) = 2 from public.routine_reference_images where reference_key = 'opening-main-floor'),
  '142 the same logical reference key is allowed in a different organization'
);
select phase10c_test.expect_error($sql$
  select public.create_routine_reference(
    'opening-main-floor', 'Duplicate in organization B', null, null,
    '48000000-0000-4000-8000-000000000002'
  )
$sql$, 'already exists|duplicate', '143 duplicate logical reference key is rejected inside one organization');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', false);
select phase10c_test.expect_error(format($sql$
  insert into public.routine_reference_image_versions (
    organization_id, reference_id, version_number, state, created_by_auth_user_id
  ) values ('a1000000-0000-4000-8000-000000000001', %L, 1, 'placeholder',
    '11000000-0000-4000-8000-000000000001')
$sql$, (select id from public.routine_reference_images where organization_id = 'a1000000-0000-4000-8000-000000000001' and reference_key = 'opening-main-floor')),
  'duplicate|unique', '144 duplicate version number is rejected per logical reference'
);
select phase10c_test.expect_error(format($sql$
  insert into public.routine_reference_image_versions (
    organization_id, reference_id, version_number, state, created_by_auth_user_id
  ) values ('a1000000-0000-4000-8000-000000000001', %L, 999, 'deleted',
    '11000000-0000-4000-8000-000000000001')
$sql$, (select id from public.routine_reference_images where organization_id = 'a1000000-0000-4000-8000-000000000001' and reference_key = 'opening-main-floor')),
  'state|check', '145 invalid image-version state is rejected'
);
select phase10c_test.expect_error(format($sql$
  insert into public.routine_reference_image_versions (
    id, organization_id, reference_id, version_number, state, object_path,
    mime_type, byte_size, original_file_name, created_by_auth_user_id
  ) values (
    'dddddddd-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', %L,
    998, 'placeholder', %L, 'image/jpeg', 1, 'bad.jpg',
    '11000000-0000-4000-8000-000000000001'
  )
$sql$,
  (select id from public.routine_reference_images where organization_id = 'a1000000-0000-4000-8000-000000000001' and reference_key = 'opening-main-floor'),
  (select organization_id::text || '/' || id::text || '/dddddddd-0000-4000-8000-000000000001/bad.jpg'
   from public.routine_reference_images where organization_id = 'a1000000-0000-4000-8000-000000000001' and reference_key = 'opening-main-floor')),
  'consistency|check', '146 placeholder version cannot carry object metadata'
);
select phase10c_test.expect_error(format($sql$
  insert into public.routine_reference_image_versions (
    id, organization_id, reference_id, version_number, state, object_path,
    mime_type, byte_size, original_file_name, alt_text, created_by_auth_user_id
  ) values (
    'dddddddd-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', %L,
    997, 'active_image', %L, 'image/jpeg', 1, 'bad.jpg', 'Missing finalize audit',
    '11000000-0000-4000-8000-000000000001'
  )
$sql$,
  (select id from public.routine_reference_images where organization_id = 'a1000000-0000-4000-8000-000000000001' and reference_key = 'opening-main-floor'),
  (select organization_id::text || '/' || id::text || '/dddddddd-0000-4000-8000-000000000002/bad.jpg'
   from public.routine_reference_images where organization_id = 'a1000000-0000-4000-8000-000000000001' and reference_key = 'opening-main-floor')),
  'consistency|check', '147 active image cannot exist without finalized audit metadata'
);
select public.discard_routine_template_draft(
  version.id, 'Phase 10C discarded-link immutability probe', version.revision
)
from public.routine_template_versions version
join public.routine_templates template on template.id = version.template_id
where template.routine_key = 'opening' and version.state = 'draft';
select set_config('app.routine_reference_link_mutation', 'authorized', false);
select phase10c_test.expect_error(format('update public.routine_template_task_reference_images set button_label = ''Changed'' where id = %L',
  (select link.id from public.routine_template_task_reference_images link join public.routine_template_versions version on version.id = link.version_id where version.state = 'discarded' limit 1)),
  'immutable', '148 discarded task-reference links reject UPDATE'
);
select phase10c_test.expect_error(format('delete from public.routine_template_task_reference_images where id = %L',
  (select link.id from public.routine_template_task_reference_images link join public.routine_template_versions version on version.id = link.version_id where version.state = 'discarded' limit 1)),
  'immutable', '149 discarded task-reference links reject DELETE'
);
select set_config('app.routine_reference_link_mutation', '', false);
select set_config('app.routine_reference_mutation', 'authorized', false);
select phase10c_test.expect_error(format($sql$
  update public.routine_reference_images
  set current_version_id = %L, revision = revision + 1
  where organization_id = 'a1000000-0000-4000-8000-000000000001' and reference_key = 'opening-main-floor'
$sql$, (select current_version_id from public.routine_reference_images where organization_id = 'a1000000-0000-4000-8000-000000000001' and reference_key = 'closing-main-floor')),
  'for this reference|foreign key', '150 current pointer cannot cross logical-reference identity'
);
select set_config('app.routine_reference_mutation', '', false);
select set_config('app.routine_reference_cleanup_mutation', 'authorized', false);
select phase10c_test.expect_error(format($sql$
  insert into public.routine_reference_image_cleanup_queue (
    organization_id, reference_id, version_id, object_path, cleanup_reason, queued_by_auth_user_id
  ) values ('a1000000-0000-4000-8000-000000000001', %L, %L, %L, 'Invalid active candidate',
    '11000000-0000-4000-8000-000000000001')
$sql$,
  (select reference_id from public.routine_reference_image_versions where upload_idempotency_key = '45000000-0000-4000-8000-000000000010'),
  (select id from public.routine_reference_image_versions where upload_idempotency_key = '45000000-0000-4000-8000-000000000010'),
  (select object_path from public.routine_reference_image_versions where upload_idempotency_key = '45000000-0000-4000-8000-000000000010')),
  'only a non-current orphaned', '151 finalized active images cannot be enqueued even through the internal transition gate'
);
select set_config('app.routine_reference_cleanup_mutation', '', false);

drop function phase10c_test.expect_error(text, text, text);
drop function phase10c_test.assert_true(boolean, text);
