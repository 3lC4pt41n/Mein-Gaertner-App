import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';

function requireEnv(...keys: string[]) {
  for (const key of keys) {
    const value = Deno.env.get(key);
    if (value) return value;
  }

  throw new Error(`Missing required environment variable. Tried: ${keys.join(', ')}`);
}

// Secret-Key-Client für serverseitige Operationen (Balance-Updates etc.)
export function getServiceClient() {
  return createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY')
  );
}

// Publishable-Client mit User-JWT für RLS-geschützte Queries
export function getUserClient(authHeader: string) {
  return createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY'),
    {
      global: { headers: { Authorization: authHeader } },
    }
  );
}
