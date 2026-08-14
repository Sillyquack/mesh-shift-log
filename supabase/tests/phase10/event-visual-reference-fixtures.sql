-- Disposable Phase 10W fixtures. Phase 10A, 10A1, 10B, and 10C are installed first.
begin;

insert into auth.users (id) values
  ('33000000-0000-4000-8000-000000000001'),
  ('33000000-0000-4000-8000-000000000002'),
  ('33000000-0000-4000-8000-000000000003'),
  ('33000000-0000-4000-8000-000000000004');

insert into public.user_profiles (
  id, organization_id, display_name, role, active, is_shared_device, shared_device_label
) values
  ('33000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Event Floor A', 'event_floor_manager', true, false, null),
  ('33000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'Event Floor B', 'event_floor_manager', true, false, null),
  ('33000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'Inactive Event Floor', 'event_floor_manager', false, false, null),
  ('33000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', 'Shared Event Floor', 'event_floor_manager', true, true, 'Shared event fixture');

insert into public.routine_reference_images (
  id, organization_id, reference_key, label, description, placeholder_text,
  current_version_id, active, creation_idempotency_key, creation_request_hash,
  revision, created_by_auth_user_id, updated_by_auth_user_id
) values
  (
    'e1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'atrium-cafe', 'Atrium café', 'Current café layout.', 'Reference image coming soon',
    null, true, 'e3000000-0000-4000-8000-000000000001', repeat('a', 64),
    1, '11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001'
  ),
  (
    'e1000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    'atrium-water', 'Atrium water', 'Water station placeholder.', 'Reference image coming soon',
    null, true, 'e3000000-0000-4000-8000-000000000002', repeat('b', 64),
    1, '11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001'
  ),
  (
    'e1000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000001',
    'private-manager-only', 'Manager-only image', 'Not an Event Mode key.', 'Reference image coming soon',
    null, true, 'e3000000-0000-4000-8000-000000000003', repeat('c', 64),
    1, '11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001'
  ),
  (
    'e1000000-0000-4000-8000-000000000004',
    'b2000000-0000-4000-8000-000000000001',
    'atrium-cafe', 'Other organization café', 'Cross-organization image.', 'Reference image coming soon',
    null, true, 'e3000000-0000-4000-8000-000000000004', repeat('d', 64),
    1, '22000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001'
  );

insert into public.routine_reference_image_versions (
  id, organization_id, reference_id, version_number, state, object_path,
  mime_type, byte_size, original_file_name, caption, alt_text,
  upload_idempotency_key, upload_request_hash, revision,
  created_by_auth_user_id, finalized_at, finalized_by_auth_user_id
) values
  (
    'e2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001', 1, 'active_image',
    'a1000000-0000-4000-8000-000000000001/e1000000-0000-4000-8000-000000000001/e2000000-0000-4000-8000-000000000001/atrium-cafe-old.jpg',
    'image/jpeg', 1200, 'atrium-cafe-old.jpg', 'Old layout', 'Old café layout',
    'e4000000-0000-4000-8000-000000000001', repeat('1', 64), 1,
    '11000000-0000-4000-8000-000000000001', now(), '11000000-0000-4000-8000-000000000001'
  ),
  (
    'e2000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001', 2, 'active_image',
    'a1000000-0000-4000-8000-000000000001/e1000000-0000-4000-8000-000000000001/e2000000-0000-4000-8000-000000000002/atrium-cafe.jpg',
    'image/jpeg', 1300, 'atrium-cafe.jpg', 'Current layout', 'Current café layout',
    'e4000000-0000-4000-8000-000000000002', repeat('2', 64), 1,
    '11000000-0000-4000-8000-000000000001', now(), '11000000-0000-4000-8000-000000000001'
  ),
  (
    'e2000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000002', 1, 'placeholder',
    null, null, null, null, null, null, null, null, 1,
    '11000000-0000-4000-8000-000000000001', null, null
  ),
  (
    'e2000000-0000-4000-8000-000000000004',
    'a1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000003', 1, 'active_image',
    'a1000000-0000-4000-8000-000000000001/e1000000-0000-4000-8000-000000000003/e2000000-0000-4000-8000-000000000004/private-manager-only.jpg',
    'image/jpeg', 1400, 'private-manager-only.jpg', null, 'Manager-only image',
    'e4000000-0000-4000-8000-000000000004', repeat('4', 64), 1,
    '11000000-0000-4000-8000-000000000001', now(), '11000000-0000-4000-8000-000000000001'
  ),
  (
    'e2000000-0000-4000-8000-000000000005',
    'b2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000004', 1, 'active_image',
    'b2000000-0000-4000-8000-000000000001/e1000000-0000-4000-8000-000000000004/e2000000-0000-4000-8000-000000000005/atrium-cafe.jpg',
    'image/jpeg', 1500, 'atrium-cafe.jpg', null, 'Other organization café layout',
    'e4000000-0000-4000-8000-000000000005', repeat('5', 64), 1,
    '22000000-0000-4000-8000-000000000001', now(), '22000000-0000-4000-8000-000000000001'
  );

select set_config('app.routine_reference_mutation', 'authorized', true);
update public.routine_reference_images
set current_version_id = case id
      when 'e1000000-0000-4000-8000-000000000001' then 'e2000000-0000-4000-8000-000000000002'::uuid
      when 'e1000000-0000-4000-8000-000000000002' then 'e2000000-0000-4000-8000-000000000003'::uuid
      when 'e1000000-0000-4000-8000-000000000003' then 'e2000000-0000-4000-8000-000000000004'::uuid
      when 'e1000000-0000-4000-8000-000000000004' then 'e2000000-0000-4000-8000-000000000005'::uuid
    end,
    revision = revision + 1,
    updated_by_auth_user_id = case
      when organization_id = 'a1000000-0000-4000-8000-000000000001'
        then '11000000-0000-4000-8000-000000000001'::uuid
      else '22000000-0000-4000-8000-000000000001'::uuid
    end;

insert into storage.objects (bucket_id, name, owner_id) values
  ('routine-reference-images', 'a1000000-0000-4000-8000-000000000001/e1000000-0000-4000-8000-000000000001/e2000000-0000-4000-8000-000000000001/atrium-cafe-old.jpg', '11000000-0000-4000-8000-000000000001'),
  ('routine-reference-images', 'a1000000-0000-4000-8000-000000000001/e1000000-0000-4000-8000-000000000001/e2000000-0000-4000-8000-000000000002/atrium-cafe.jpg', '11000000-0000-4000-8000-000000000001'),
  ('routine-reference-images', 'a1000000-0000-4000-8000-000000000001/e1000000-0000-4000-8000-000000000003/e2000000-0000-4000-8000-000000000004/private-manager-only.jpg', '11000000-0000-4000-8000-000000000001'),
  ('routine-reference-images', 'b2000000-0000-4000-8000-000000000001/e1000000-0000-4000-8000-000000000004/e2000000-0000-4000-8000-000000000005/atrium-cafe.jpg', '22000000-0000-4000-8000-000000000001');

commit;
