import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.2";

// Service-Role-Client für serverseitige Operationen (Balance-Updates etc.)
export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// Anon-Client mit User-JWT für RLS-geschützte Queries
export function getUserClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
}
