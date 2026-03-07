// Edge Function: delete-account
// DSGVO-compliant account deletion.
// 1. Verifies the caller's JWT to extract user ID.
// 2. Deletes all storage objects (plant images, chat images, avatars).
// 3. Deletes the auth.users row via service-role — CASCADE FKs handle
//    profiles, plants, tasks, messages, healthchecks, events, diary, etc.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getServiceClient, getUserClient } from '../_shared/supabase-client.ts';
import { extractBearerToken } from '../_shared/credits.ts';
import { getCorsHeaders, rejectDisallowedOrigin } from '../_shared/cors.ts';

function json(body: Record<string, unknown>, corsHeaders: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Remove all objects in a storage bucket that belong to a given user.
// Files are stored flat with naming patterns:
//   plant-images: plant_<userId>_<ts>.jpg, feedback/fb_<userId>_<ts>.jpg
//   chat-images:  chat_<userId>_<ts>.jpg
// We list the root (and known sub-folders), then filter by userId substring.
// Paginated: Supabase Storage returns max 1000 items per list() call.
async function purgeStorageBucket(
  serviceClient: ReturnType<typeof getServiceClient>,
  bucket: string,
  userId: string,
) {
  const foldersToScan = ['', 'feedback']; // root + known sub-folders
  let totalDeleted = 0;

  for (const folder of foldersToScan) {
    try {
      let offset = 0;
      const PAGE_SIZE = 1000;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: files, error } = await serviceClient.storage
          .from(bucket)
          .list(folder || undefined, { limit: PAGE_SIZE, offset });

        if (error || !files || files.length === 0) break;

        // Filter files that belong to this user (userId appears in filename)
        const userFiles = files.filter(
          (f) => f.name.includes(userId) || f.name.includes(`_${userId}_`)
        );

        if (userFiles.length > 0) {
          const prefix = folder ? `${folder}/` : '';
          const paths = userFiles.map((f) => `${prefix}${f.name}`);
          await serviceClient.storage.from(bucket).remove(paths);
          totalDeleted += paths.length;
        }

        // If we got fewer than PAGE_SIZE, we've reached the end
        if (files.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
    } catch {
      // Storage bucket or folder may not exist — non-fatal, continue.
    }
  }

  return totalDeleted;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, 'POST, OPTIONS');
  const blockedOrigin = rejectDisallowedOrigin(req, corsHeaders);
  if (blockedOrigin) return blockedOrigin;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  // --- Authenticate caller ---
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Missing authorization header' }, corsHeaders, 401);
  }

  try {
    extractBearerToken(authHeader);
  } catch {
    return json({ error: 'Unauthorized' }, corsHeaders, 401);
  }

  const userClient = getUserClient(authHeader);
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return json({ error: 'Unauthorized' }, corsHeaders, 401);
  }

  const userId = user.id;

  // --- Purge user storage (best-effort, paginated) ---
  const service = getServiceClient();
  const results = await Promise.allSettled([
    purgeStorageBucket(service, 'plant-images', userId),
    purgeStorageBucket(service, 'chat-images', userId),
    purgeStorageBucket(service, 'avatars', userId),
  ]);

  const deletedCount = results
    .filter((r) => r.status === 'fulfilled')
    .reduce((sum, r) => sum + ((r as PromiseFulfilledResult<number>).value || 0), 0);

  console.log(`Purged ${deletedCount} storage objects for user ${userId}`);

  // --- Delete auth user (CASCADE handles all public.* tables) ---
  const { error: deleteError } = await service.auth.admin.deleteUser(userId);

  if (deleteError) {
    console.error('Account deletion failed:', deleteError.message);
    return json({ error: 'Account deletion failed' }, corsHeaders, 500);
  }

  return json({ success: true, storageObjectsDeleted: deletedCount }, corsHeaders);
});
