import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

export const isSupabaseAuthConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabaseAuthClient = isSupabaseAuthConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  : null;

function authNotConfiguredError() {
  return new Error('Supabase Auth is not configured.');
}

function profileResult(status, message, details = {}) {
  return {
    ok: status === 'profile_loaded',
    status,
    message,
    errorCode: status,
    ...details,
  };
}

export async function getCurrentSession() {
  if (!supabaseAuthClient) return null;
  const { data, error } = await supabaseAuthClient.auth.getSession();
  if (error) throw error;
  return data.session || null;
}

export async function signInWithEmailPassword(email, password) {
  if (!supabaseAuthClient) throw authNotConfiguredError();
  const { data, error } = await supabaseAuthClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOutSupabase() {
  if (!supabaseAuthClient) return;
  await supabaseAuthClient.auth.signOut();
}

export async function getCurrentUser() {
  if (!supabaseAuthClient) return null;
  const { data, error } = await supabaseAuthClient.auth.getUser();
  if (error) throw error;
  return data.user || null;
}

export function onAuthStateChange(callback) {
  if (!supabaseAuthClient) {
    return { unsubscribe: () => {} };
  }
  const { data } = supabaseAuthClient.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return data.subscription;
}

export async function fetchCurrentUserProfile(session = null) {
  if (!supabaseAuthClient) {
    return profileResult('auth_session_missing', 'Supabase Auth is not configured.');
  }

  try {
    const activeSession = session || await getCurrentSession();
    if (!activeSession?.user?.id) {
      return profileResult('auth_session_missing', 'No active Supabase Auth session.');
    }

    const { data, error } = await supabaseAuthClient
      .from('user_profiles')
      .select('*')
      .eq('id', activeSession.user.id)
      .maybeSingle();

    if (error) {
      return profileResult('profile_fetch_failed', 'Login succeeded, but profile could not be loaded.', {
        session: activeSession,
        user: activeSession.user,
        error,
        errorMessage: error.message,
      });
    }

    if (!data) {
      return profileResult('profile_missing', 'No Mesh Shift Log profile exists for this user.', {
        session: activeSession,
        user: activeSession.user,
      });
    }

    if (data.active === false) {
      return profileResult('profile_inactive', 'This user is inactive. Contact manager.', {
        session: activeSession,
        user: activeSession.user,
        profile: data,
      });
    }

    return profileResult('profile_loaded', 'Profile loaded.', {
      session: activeSession,
      user: activeSession.user,
      profile: data,
    });
  } catch (error) {
    return profileResult('profile_fetch_failed', 'Login succeeded, but profile could not be loaded.', {
      error,
      errorMessage: error.message,
    });
  }
}

export async function fetchUserProfiles() {
  if (!supabaseAuthClient) {
    return {
      ok: false,
      status: 'auth_not_configured',
      message: 'Supabase Auth is not configured.',
      profiles: [],
    };
  }

  try {
    const { data, error } = await supabaseAuthClient
      .from('user_profiles')
      .select('id, organization_id, display_name, role, active, staff_code_alias, is_shared_device, shared_device_label, created_at, updated_at')
      .order('display_name', { ascending: true });

    if (error) {
      return {
        ok: false,
        status: 'profile_list_failed',
        message: 'Could not load backend user profiles.',
        profiles: [],
        error,
        errorMessage: error.message,
      };
    }

    return {
      ok: true,
      status: 'profiles_loaded',
      message: `Loaded ${data?.length || 0} backend profiles.`,
      profiles: data || [],
    };
  } catch (error) {
    return {
      ok: false,
      status: 'profile_list_failed',
      message: 'Could not load backend user profiles.',
      profiles: [],
      error,
      errorMessage: error.message,
    };
  }
}
