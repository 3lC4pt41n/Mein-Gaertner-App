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
  const { error } = await supabase
    .from("messages")
    .insert([row]);
  if (error) throw error;
}

const PAGE_SIZE = 30;

// Signed URLs fuer Messages mit image_path generieren
async function resolveImageUrls(messages) {
  return Promise.all(
    messages.map(async (msg) => {
      if (msg.image_path) {
        const { data: signedData } = await supabase.storage
          .from('chat-images')
          .createSignedUrl(msg.image_path, 60 * 60); // 1 Stunde
        return { ...msg, image_url: signedData?.signedUrl || msg.image_url };
      }
      return msg;
    })
  );
}

// Lädt den Verlauf für einen User (paginiert, mit on-demand Signed URLs)
// before: ISO-Timestamp, laedt nur Messages aelter als dieser Zeitpunkt
export async function fetchMessages(user_id, { before = null, limit = PAGE_SIZE } = {}) {
  let query = supabase
    .from("messages")
    .select('*')
    .eq("user_id", user_id)
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
