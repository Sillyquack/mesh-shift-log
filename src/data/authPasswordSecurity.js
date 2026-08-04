export const AUTH_PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RECOVERY_NEUTRAL_SUCCESS =
  'If an account uses that email address, a password reset link will be sent. Check your inbox and spam folder.';

export function normalizeAuthEmail(value) {
  return String(value || '').trim();
}

export function applicationBaseUrl(locationLike, baseUrl = './') {
  const href = String(locationLike?.href || 'http://localhost/');
  const url = new URL(baseUrl || './', href);
  url.search = '';
  url.hash = '';
  return url.href;
}

function callbackParameters(url) {
  const query = new URLSearchParams(url.search || '');
  const hashValue = String(url.hash || '').replace(/^#/, '');
  const hash = hashValue.includes('=')
    ? new URLSearchParams(hashValue)
    : new URLSearchParams();
  return { query, hash };
}

function firstParameter(query, hash, name) {
  return query.get(name) || hash.get(name) || '';
}

export function inspectAuthCallback(locationLike) {
  const href = String(locationLike?.href || 'http://localhost/');
  const url = new URL(href);
  const { query, hash } = callbackParameters(url);
  const errorCode = firstParameter(query, hash, 'error_code');
  const authError = firstParameter(query, hash, 'error');

  if (errorCode || authError) {
    return {
      status: 'invalid',
      message: 'This password reset link is invalid, expired, or has already been used.',
    };
  }

  if (firstParameter(query, hash, 'type') === 'recovery') {
    return { status: 'checking', source: 'recovery_callback' };
  }

  // Supabase Auth PKCE callbacks carry a one-time code in the query string.
  // PASSWORD_RECOVERY remains the authoritative signal for deciding the route.
  if (query.has('code')) {
    return { status: 'checking', source: 'pkce_callback' };
  }

  return { status: 'idle', source: 'none' };
}

export function validateNewPassword(newPassword, confirmation) {
  if (!newPassword || !confirmation) {
    return { ok: false, message: 'Enter the new password twice.' };
  }
  if (newPassword.length < AUTH_PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      message: `Use at least ${AUTH_PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  if (newPassword !== confirmation) {
    return { ok: false, message: 'The passwords do not match.' };
  }
  return { ok: true, message: '' };
}

export function passwordUpdateErrorMessage(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  if (code.includes('weak_password') || message.includes('weak password')) {
    return 'The password does not meet the configured security requirements.';
  }
  if (
    code.includes('reauthentication') ||
    message.includes('reauthentication') ||
    message.includes('recently signed in')
  ) {
    return 'Your session is too old to change the password. Sign in again or request a new reset link.';
  }
  return 'The password could not be changed. Try again with a valid session.';
}

export async function performPasswordUpdate({
  newPassword,
  confirmation,
  updatePassword,
}) {
  const validation = validateNewPassword(newPassword, confirmation);
  if (!validation.ok) return validation;

  try {
    await updatePassword(newPassword);
    return { ok: true, message: '' };
  } catch (error) {
    return { ok: false, message: passwordUpdateErrorMessage(error) };
  }
}
