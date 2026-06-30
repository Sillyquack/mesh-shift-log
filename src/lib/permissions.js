function roleOf(user) {
  return String(user?.role || '').toLowerCase();
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

export function canCreateAlerts(user) {
  return Boolean(user);
}
