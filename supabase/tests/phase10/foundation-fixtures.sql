-- Disposable Phase 10A + 10A1 fixtures. These identities and rows are test-only.
begin;

insert into auth.users (id) values
  ('11000000-0000-4000-8000-000000000001'),
  ('11000000-0000-4000-8000-000000000002'),
  ('11000000-0000-4000-8000-000000000003'),
  ('11000000-0000-4000-8000-000000000004'),
  ('11000000-0000-4000-8000-000000000005'),
  ('11000000-0000-4000-8000-000000000006'),
  ('11000000-0000-4000-8000-000000000007'),
  ('22000000-0000-4000-8000-000000000001');

insert into public.organizations (id, name, slug) values
  ('a1000000-0000-4000-8000-000000000001', 'Routine Test Organization A', 'routine-test-a'),
  ('b2000000-0000-4000-8000-000000000001', 'Routine Test Organization B', 'routine-test-b'),
  ('c3000000-0000-4000-8000-000000000001', 'Routine Constraint Probes', 'routine-test-probes');

insert into public.user_profiles (
  id, organization_id, display_name, role, active, is_shared_device, shared_device_label
) values
  ('11000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Routine A Manager', 'manager', true, false, null),
  ('11000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'Routine A Staff', 'staff', true, false, null),
  ('11000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'Routine A Shift Lead', 'shift_lead', true, false, null),
  ('11000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', 'Routine A Inactive Manager', 'manager', false, false, null),
  ('11000000-0000-4000-8000-000000000005', null, 'Routine Manager Without Organization', 'manager', true, false, null),
  ('11000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000001', 'Stock Count Counter', 'counter', true, false, null),
  ('11000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000001', 'Shared Routine Manager', 'manager', true, true, 'Shared device fixture'),
  ('22000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'Routine B Manager', 'manager', true, false, null);

commit;
