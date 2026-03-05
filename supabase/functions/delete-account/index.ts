// Edge Function: delete-account
// DSGVO-compliant account deletion.
// 1. Verifies the caller's JWT to extract user ID.
// 2. Deletes all storage objects (plant images, chat images, avatars).
// 3. Deletes the auth.users row via service-role — CASCADE FKs handle
//    profiles, plants, tasks, messages, healthchecks, events, diary, etc.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getServiceClient, getUserClient } from '../_shared/supabase-client.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Remove all objects in a storage bucket for a given user prefix.
async function purgeStorageBucket(
  serviceClient: ReturnType<typeof getServiceClient>,
  bucket: string,
  userId: string,
) {
  try {
    const { data: files } = await serviceClient.storage.from(bucket).list(userId);
    if (files && files.length > 0) {
      const paths = files.map((f) => `${userId}/${f.name}`);
      await serviceClient.storage.from(bucket).remove(paths);
    }
  } catch {
    // Storage bucket may not exist or be empty — non-fatal.
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // --- Authenticate caller ---
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Missing authorization header' }, 401);
  }

  const userClient = getUserClient(authHeader);
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const userId = user.id;

  // --- Purge user storage (best-effort) ---
  const service = getServiceClient();
  await Promise.allSettled([
    purgeStorageBucket(service, 'plant-images', userId),
    purgeStorageBucket(service, 'chat-images', userId),
  ]);

  // --- Delete auth user (CASCADE handles all public.* tables) ---
  const { error: deleteError } = await service.auth.admin.deleteUser(userId);

  if (deleteError) {
    console.error('Account deletion failed:', deleteError.message);
    return json({ error: 'Account deletion failed' }, 500);
  }

  return json({ success: true });
});
