import { getCurrentSession } from './supabaseAuthClient.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const organizationId = import.meta.env.VITE_SUPABASE_ORGANIZATION_ID || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export async function getSupabaseRequestAuthContext() {
  if (!isSupabaseConfigured) {
    return {
      mode: 'local_fallback',
      accessToken: '',
      authUserId: '',
      isAuthenticated: false,
    };
  }
  const session = await getCurrentSession().catch(() => null);
  if (session?.access_token && session?.user?.id) {
    return {
      mode: 'authenticated',
      accessToken: session.access_token,
      authUserId: session.user.id,
      isAuthenticated: true,
    };
  }
  return {
    mode: 'pilot_anon',
    accessToken: supabaseAnonKey,
    authUserId: '',
    isAuthenticated: false,
  };
}

async function request(path, options = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const authContext = await getSupabaseRequestAuthContext();
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    cache: options.cache || 'no-store',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${authContext.accessToken || supabaseAnonKey}`,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      ...options.headers,
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Supabase request failed with ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

export const supabase = {
  organizationId,
  getRequestAuthContext: getSupabaseRequestAuthContext,
  async selectAlerts() {
    const filters = organizationId ? `or=(organization_id.eq.${organizationId},organization_id.is.null)&` : '';
    return request(`alerts?${filters}select=*&order=created_at.desc`);
  },
  async insertAlert(row) {
    const payload = organizationId ? { ...row, organization_id: organizationId } : row;
    const rows = await request('alerts?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    });
    return rows?.[0] || null;
  },
  async updateAlert({ backendId, localId, changes }) {
    const organizationFilter = organizationId && !backendId ? `&organization_id=eq.${organizationId}` : '';
    const target = backendId ? `id=eq.${backendId}` : `local_id=eq.${encodeURIComponent(localId)}${organizationFilter}`;
    const rows = await request(`alerts?${target}&select=*`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(changes),
    });
    return rows?.[0] || null;
  },
  async sendAlertEmail(alert) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
    const authContext = await getSupabaseRequestAuthContext();
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/send-alert-email`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${authContext.accessToken || supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(alert),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `Email function failed with ${response.status}`);
    }
    return body;
  },
};
