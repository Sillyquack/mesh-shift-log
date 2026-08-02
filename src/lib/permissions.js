function roleOf(user) {
  return String(user?.role || '').toLowerCase();
}

function organizationOf(user) {
  return String(user?.organizationId || user?.organization_id || '');
}

function profileOrganizationOf(user) {
  return String(user?.profile?.organization_id || '');
}

export function isSharedDeviceUser(user) {
  return Boolean(
    user?.isSharedDevice ||
      user?.is_shared_device ||
      user?.profile?.is_shared_device,
  );
}

export function isManager(user) {
  return !isSharedDeviceUser(user) && (Boolean(user?.isManager) || roleOf(user) === 'manager');
}

export function canAccessManagerDashboard(user) {
  return isManager(user);
}

export function canAcknowledgeAlerts(user) {
  return isManager(user);
}

export function canResolveAlerts(user) {
  return isManager(user);
}

export function canRetryEmailNotification(user) {
  return isManager(user);
}

export function canViewBackendStatus(user) {
  return isManager(user);
}

export function canViewAuthProfiles(user) {
  return isManager(user);
}

export function canUseEventFloorDashboard(user) {
  return !isSharedDeviceUser(user) && roleOf(user) === 'event_floor_manager';
}

export function canGenerateEventCode(user) {
  return !isSharedDeviceUser(user) && (isManager(user) || roleOf(user) === 'event_floor_manager');
}

export function canCreateAlerts(user) {
  return Boolean(user);
}

export function canUseInventory(user) {
  const authUserId = String(user?.authUserId || '');
  const profileId = String(user?.profile?.id || '');
  const organizationId = organizationOf(user);
  const profileOrganizationId = profileOrganizationOf(user);
  return Boolean(
    user &&
      user.loginSource === 'supabase_auth' &&
      user.authSessionVerified === true &&
      authUserId &&
      profileId &&
      authUserId === profileId &&
      roleOf(user) === 'manager' &&
      roleOf(user.profile) === 'manager' &&
      user.active === true &&
      user.profileActive === true &&
      user.profile?.active === true &&
      !isSharedDeviceUser(user) &&
      organizationId &&
      profileOrganizationId &&
      organizationId === profileOrganizationId,
  );
}

export function canCoordinateInventory(user) {
  return canUseInventory(user);
}

export function canManageInventory(user) {
  return canUseInventory(user);
}
