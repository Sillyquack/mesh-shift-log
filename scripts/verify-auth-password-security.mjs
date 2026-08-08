import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  AUTH_PASSWORD_MIN_LENGTH,
  PASSWORD_RECOVERY_NEUTRAL_SUCCESS,
  applicationBaseUrl,
  inspectAuthCallback,
  normalizeAuthEmail,
  performPasswordUpdate,
  validateNewPassword,
} from '../src/data/authPasswordSecurity.js';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const authClient = readFileSync(new URL('../src/lib/supabaseAuthClient.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const appFunction = app.slice(app.indexOf('function App()'));

const login = app.slice(app.indexOf('function Login('), app.indexOf('function PasswordUpdateForm('));
const passwordForm = app.slice(app.indexOf('function PasswordUpdateForm('), app.indexOf('function TopBar('));
const recoveryEffect = app.slice(
  app.indexOf('const subscription = onAuthStateChange'),
  app.indexOf('useEffect(() => saveStorage(LOG_KEY'),
);
const sessionRestore = app.slice(
  app.indexOf('async function restoreSupabaseUser()'),
  app.indexOf('useEffect(() => {\n    function updateOnlineStatus'),
);
const pilotNotice = app.slice(app.indexOf('function PilotNotice('), app.indexOf('function AlertCard('));

function cssRules(source) {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1].split(',').map((selector) => selector.trim()),
    declarations: match[2],
  }));
}

function ruleWithExactSelectors(rules, expectedSelectors) {
  return rules.find((rule) =>
    rule.selectors.length === expectedSelectors.length &&
    expectedSelectors.every((selector) => rule.selectors.includes(selector))
  );
}

function explicitMinHeightPx(rule) {
  const match = rule?.declarations.match(/(?:^|;)\s*min-height:\s*(\d+)px\s*(?:;|$)/);
  return match ? Number(match[1]) : null;
}

test('login exposes a focused Forgot password flow without changing email normalization', () => {
  assert.match(login, /Forgot password\?/);
  assert.match(login, /mode === "password_recovery"/);
  assert.match(login, /normalizeAuthEmail\(email\)/);
  assert.equal(normalizeAuthEmail('  Bobby@Example.com  '), 'Bobby@Example.com');
});

test('recovery redirect uses the environment-aware application base URL', () => {
  assert.equal(
    applicationBaseUrl(
      { href: 'https://sillyquack.github.io/mesh-shift-log/#type=recovery' },
      './',
    ),
    'https://sillyquack.github.io/mesh-shift-log/',
  );
  assert.equal(
    applicationBaseUrl({ href: 'http://localhost:5173/?code=secret' }, './'),
    'http://localhost:5173/',
  );
  assert.match(authClient, /resetPasswordForEmail\(email, \{[\s\S]*?redirectTo/);
  assert.match(app, /applicationBaseUrl\(window\.location, import\.meta\.env\.BASE_URL\)/);
});

test('recovery request success copy is neutral and duplicate submissions are disabled', () => {
  assert.match(PASSWORD_RECOVERY_NEUTRAL_SUCCESS, /^If an account uses that email address/);
  assert.doesNotMatch(PASSWORD_RECOVERY_NEUTRAL_SUCCESS, /account exists|account does not exist|not found/i);
  assert.match(login, /disabled=\{isSubmitting \|\| \(mode === "password_recovery"/);
  assert.match(login, /submissionPendingRef\.current/);
  assert.match(appFunction, /A reset email could not be requested right now/);
});

test('implicit and PKCE callback formats wait for the authoritative recovery event', () => {
  assert.equal(
    inspectAuthCallback({ href: 'https://example.test/#type=recovery' }).status,
    'checking',
  );
  assert.deepEqual(
    inspectAuthCallback({ href: 'https://example.test/?code=one-time-code' }),
    { status: 'checking', source: 'pkce_callback' },
  );
  assert.match(recoveryEffect, /event === "PASSWORD_RECOVERY"/);
  assert.match(recoveryEffect, /setPasswordRecovery\(\{ status: "ready", source: "PASSWORD_RECOVERY" \}\)/);
  assert.match(authClient, /retainedPasswordRecoveryUserId/);
  assert.doesNotMatch(authClient, /latestPasswordRecoverySession/);
});

test('invalid, expired, and already-used callback errors are handled without exposing URL details', () => {
  const result = inspectAuthCallback({
    href: 'https://example.test/#error=access_denied&error_code=otp_expired&error_description=sensitive-detail',
  });
  assert.equal(result.status, 'invalid');
  assert.match(result.message, /invalid, expired, or has already been used/);
  assert.doesNotMatch(JSON.stringify(result), /sensitive-detail|otp_expired/);
});

test('mismatch and passwords below the application minimum are rejected locally', () => {
  assert.equal(AUTH_PASSWORD_MIN_LENGTH, 8);
  assert.equal(validateNewPassword('short', 'short').ok, false);
  assert.match(validateNewPassword('abcdefgh', 'abcdefgi').message, /do not match/);
});

test('valid matching passwords invoke the Supabase update adapter exactly once', async () => {
  const calls = [];
  const result = await performPasswordUpdate({
    newPassword: 'correct-horse-battery-staple',
    confirmation: 'correct-horse-battery-staple',
    updatePassword: async (password) => calls.push(password),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['correct-horse-battery-staple']);

  await performPasswordUpdate({
    newPassword: 'mismatch-one',
    confirmation: 'mismatch-two',
    updatePassword: async (password) => calls.push(password),
  });
  assert.equal(calls.length, 1);
  assert.match(authClient, /updateUser\(\{ password \}\)/);
  assert.match(passwordForm, /if \(submissionPendingRef\.current\) return/);
});

test('recovery blocks ordinary app routing and returns to a signed-out clean URL after success', () => {
  assert.ok(
    appFunction.indexOf('if (passwordRecoveryState.status !== "idle")') <
      appFunction.indexOf('if (!user) {\n    return (\n      <>\n        <Login'),
  );
  assert.match(sessionRestore, /passwordRecoveryStateRef\.current\.status !== "idle"/);
  assert.match(app, /scrubAuthCallbackUrl\(\);[\s\S]*?signOutPasswordRecoverySession\(\)/);
  assert.match(authClient, /signOut\(\{ scope: 'local' \}\)/);
  assert.match(app, /Password updated — log in with your new password\./);
});

test('authenticated password change is role-independent and retains normal auth/profile routing', () => {
  assert.match(app, /user\.loginSource === "supabase_auth"[\s\S]*?setShowAccountSecurity\(true\)/);
  assert.doesNotMatch(passwordForm, /isManager|canAccessManager|role\s*===/);
  assert.match(app, /signInWithEmailPassword\(email, password\)/);
  assert.match(app, /appUserFromProfile\([\s\S]*?profileResult\.profile/);
  assert.match(app, /fetchCurrentUserProfile\(session\)/);
});

test('password values stay in ephemeral form state and are never logged or written to app storage', () => {
  assert.doesNotMatch(passwordForm, /localStorage|saveStorage|console\./);
  assert.doesNotMatch(recoveryEffect, /console\.|access_token|refresh_token/);
  assert.doesNotMatch(authClient, /console\.|service_role|auth\.admin/);
});

test('password UI remains horizontally safe on mobile widths', () => {
  assert.match(styles, /\.password-field-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto;/);
  assert.match(styles, /\.account-security-modal\s*\{[\s\S]*?overflow-x:\s*hidden;/);
  for (const width of [375, 390, 430]) assert.ok(width - 20 > 300);
});

test('legacy login and pilot touch targets enforce an explicit 48px minimum', () => {
  const rules = cssRules(styles);
  const loginTabsRule = ruleWithExactSelectors(rules, ['.login-mode-tabs button']);
  const sharedActionRule = ruleWithExactSelectors(rules, [
    '.primary-button',
    '.ghost-button',
    '.file-button',
    '.date-chips button',
  ]);

  assert.equal(explicitMinHeightPx(loginTabsRule), 48);
  assert.equal(explicitMinHeightPx(sharedActionRule), 48);

  const relevantOverrides = rules.filter((rule) =>
    explicitMinHeightPx(rule) !== null &&
    rule.selectors.some((selector) =>
      selector.includes('.login-mode-tabs') ||
      selector === '.primary-button' ||
      (/\.(?:login-shell|login-panel|login-form|pilot-modal|modal-backdrop)/.test(selector) &&
        selector.includes('.primary-button'))
    )
  );
  assert.ok(relevantOverrides.length >= 2);
  for (const rule of relevantOverrides) {
    assert.ok(
      explicitMinHeightPx(rule) >= 48,
      `${rule.selectors.join(', ')} lowers a login or pilot touch target below 48px`,
    );
  }

  const loginTabs = login.slice(login.indexOf('<div className="login-mode-tabs"'), login.indexOf('</div>', login.indexOf('<div className="login-mode-tabs"')));
  assert.match(loginTabs, /<button[\s\S]*?Staff code login[\s\S]*?<button[\s\S]*?Email login/);
  assert.match(login, /<button\s+type="submit"\s+className="primary-button"[\s\S]*?: "Log in"/);
  assert.match(pilotNotice, /<button\s+type="button"\s+className="primary-button"[\s\S]*?I understand/);
});

console.log('Supabase Auth password security verification passed.');
