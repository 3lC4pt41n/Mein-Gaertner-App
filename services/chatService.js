import { supabase } from '../supabase';

// Speichert Textnachricht oder Bildnachricht
// image_path: stabiler Storage-Pfad (neu), image_url: Legacy Signed URL
export async function saveMessage({ user_id, sender, content, image_path, image_url }) {
  const row = { user_id, sender, content };
  if (image_path) {
    row.image_path = image_path;
    row.image_url = image_url || null; // Legacy-Feld optional mitsetzen
  } else if (image_url) {
    row.image_url = image_url; // Backward compat fuer alte Aufrufe
  }
  const { error } = await supabase.from('messages').insert([row]);
  if (error) throw error;
}

const PAGE_SIZE = 30;
const SIGNED_URL_TTL = 60 * 60; // 1 hour

// Signed URLs fuer Messages mit image_path generieren
async function resolveImageUrls(messages) {
  if (!messages?.length) return [];

  const resolved = [...messages];
  const pathEntries = [];

  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.image_path) {
      pathEntries.push({ index: i, path: messages[i].image_path });
    }
  }

  if (pathEntries.length === 0) {
    return resolved;
  }

  const uniquePaths = [...new Set(pathEntries.map((entry) => entry.path))];
  const pathToSignedUrl = new Map();
  const bucket = supabase.storage.from('chat-images');

  try {
    if (typeof bucket.createSignedUrls !== 'function') {
      throw new Error('createSignedUrls unavailable');
    }
    const { data, error } = await bucket.createSignedUrls(uniquePaths, SIGNED_URL_TTL);
    if (error) throw error;

    uniquePaths.forEach((path, index) => {
      pathToSignedUrl.set(path, data?.[index]?.signedUrl || null);
    });
  } catch (batchError) {
    if (__DEV__) {
      console.warn(
        '[chatService] createSignedUrls failed, using per-image fallback:',
        batchError?.message
      );
    }

    await Promise.all(
      uniquePaths.map(async (path) => {
        try {
          const { data: signedData, error: signedError } = await bucket.createSignedUrl(
            path,
            SIGNED_URL_TTL
          );
          if (signedError) throw signedError;
          pathToSignedUrl.set(path, signedData?.signedUrl || null);
        } catch {
          pathToSignedUrl.set(path, null);
        }
      })
    );
  }

  pathEntries.forEach(({ index, path }) => {
    const fallbackUrl = messages[index]?.image_url || null;
    resolved[index] = {
      ...messages[index],
      image_url: pathToSignedUrl.get(path) || fallbackUrl,
    };
  });

  return resolved;
}

// Lädt den Verlauf für einen User (paginiert, mit on-demand Signed URLs)
// before: ISO-Timestamp, laedt nur Messages aelter als dieser Zeitpunkt
export async function fetchMessages(user_id, { before = null, limit = PAGE_SIZE } = {}) {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Chronologische Reihenfolge fuer Anzeige
  const chronological = (data || []).reverse();
  const withUrls = await resolveImageUrls(chronological);

  return {
    messages: withUrls,
    hasMore: (data || []).length === limit,
  };
}
