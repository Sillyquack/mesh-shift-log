import {
  canCoordinateInventory,
  canManageInventory,
  canUseInventory,
  isInventoryCounter,
} from '../lib/permissions.js';

function assertion(name, passed) {
  return { name, passed: Boolean(passed) };
}

export function authenticatedInventoryManager(overrides = {}) {
  const profileOverrides = overrides.profile || {};
  const { profile: _profile, ...userOverrides } = overrides;
  return {
    id: 'auth-manager-1',
    authUserId: 'manager-1',
    backendUserId: 'manager-1',
    loginSource: 'supabase_auth',
    authSessionVerified: true,
    role: 'manager',
    isManager: true,
    active: true,
    profileActive: true,
    organizationId: 'org-1',
    organization_id: 'org-1',
    ...userOverrides,
    profile: {
      id: 'manager-1',
      organization_id: 'org-1',
      role: 'manager',
      active: true,
      is_shared_device: false,
      ...profileOverrides,
    },
  };
}

function roleFixture(role) {
  return authenticatedInventoryManager({
    role,
    isManager: false,
    profile: { role },
  });
}

export function runInventoryPermissionVerification() {
  const manager = authenticatedInventoryManager();
  const counter = roleFixture('counter');
  const staffCodeManager = {
    id: 'staff-code-manager',
    loginSource: 'staff_code',
    role: 'manager',
    isManager: true,
    active: true,
  };
  const sharedDeviceManager = authenticatedInventoryManager({
    isManager: false,
    isSharedDevice: true,
    is_shared_device: true,
    profile: { is_shared_device: true },
  });

  const checks = [
    assertion('SEC-P1: null user cannot use Stock Count', !canUseInventory(null)),
    assertion('SEC-P2: staff-code manager cannot use Stock Count', !canUseInventory(staffCodeManager)),
    assertion('SEC-P3: authenticated staff cannot use Stock Count', !canUseInventory(roleFixture('staff'))),
    assertion('SEC-P4: authenticated shift lead cannot use Stock Count', !canUseInventory(roleFixture('shift_lead'))),
    assertion('SEC-P5: event-floor manager cannot use Stock Count', !canUseInventory(roleFixture('event_floor_manager'))),
    assertion('SEC-P6: time2staff cannot use Stock Count', !canUseInventory(roleFixture('time2staff'))),
    assertion('SEC-P7: shared-device manager cannot use Stock Count', !canUseInventory(sharedDeviceManager)),
    assertion('SEC-P8: inactive manager cannot use Stock Count', !canUseInventory(authenticatedInventoryManager({ profileActive: false, profile: { active: false } }))),
    assertion('SEC-P9: unverified cached auth user cannot use Stock Count', !canUseInventory(authenticatedInventoryManager({ authSessionVerified: false }))),
    assertion('SEC-P10: mismatched auth/profile identity cannot use Stock Count', !canUseInventory(authenticatedInventoryManager({ backendUserId: 'manager-2', profile: { id: 'manager-2' } }))),
    assertion('SEC-P11: mismatched profile organization cannot use Stock Count', !canUseInventory(authenticatedInventoryManager({ profile: { organization_id: 'org-2' } }))),
    assertion('SEC-P12: local manager role cannot override a non-manager profile', !canUseInventory(authenticatedInventoryManager({ profile: { role: 'staff' } }))),
    assertion('SEC-P13: verified active Supabase manager can use Stock Count', canUseInventory(manager)),
    assertion('SEC-P14: coordinate and manage permissions use the same strict manager rule', canCoordinateInventory(manager) && canManageInventory(manager) && !canCoordinateInventory(roleFixture('event_floor_manager')) && !canManageInventory(roleFixture('staff'))),
    assertion('SEC-P15: verified counter reaches only the counter Stock Count surface', canUseInventory(counter) && isInventoryCounter(counter) && !canCoordinateInventory(counter) && !canManageInventory(counter)),
    assertion('SEC-P16: cached or mismatched counter identity cannot reach Stock Count', !canUseInventory(authenticatedInventoryManager({ role: 'counter', isManager: false, authSessionVerified: false, profile: { role: 'counter' } })) && !isInventoryCounter(authenticatedInventoryManager({ role: 'counter', isManager: false, profile: { role: 'staff' } }))),
  ];

  return { passed: checks.every((check) => check.passed), checks };
}
