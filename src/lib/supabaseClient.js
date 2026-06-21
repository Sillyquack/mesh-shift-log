const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const organizationId = import.meta.env.VITE_SUPABASE_ORGANIZATION_ID || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

async function request(path, options = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
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
  async selectAlerts() {
    const filters = organizationId ? `organization_id=eq.${organizationId}&` : '';
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
};
