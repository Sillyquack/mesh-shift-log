import { createClient } from 'npm:@supabase/supabase-js@2.108.2';
import { createVisualStandardImageHandler } from './handler.js';

function publicKeysFromEnvironment() {
  const keys = new Set<string>();
  const add = (value: string | undefined) => {
    if (value?.trim()) keys.add(value.trim());
  };
  add(Deno.env.get('SUPABASE_ANON_KEY'));
  add(Deno.env.get('SUPABASE_PUBLISHABLE_KEY'));
  const namedKeys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (namedKeys) {
    try {
      Object.values(JSON.parse(namedKeys)).forEach((value) => add(String(value)));
    } catch {
      // A malformed optional named-key map is ignored; the standard keys remain available.
    }
  }
  return [...keys];
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const acceptedPublicKeys = publicKeysFromEnvironment();
const primaryPublicKey = acceptedPublicKeys[0] || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  || Deno.env.get('SUPABASE_SECRET_KEY')
  || '';

const adminClient = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;

const handler = createVisualStandardImageHandler({
  adminClient,
  acceptedPublicKeys,
  userClientForRequest(request: Request) {
    const authHeader = request.headers.get('authorization') || '';
    if (!supabaseUrl || !primaryPublicKey || !authHeader) return null;
    return createClient(supabaseUrl, primaryPublicKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });
  },
});

Deno.serve(handler);
