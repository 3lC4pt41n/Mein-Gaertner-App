import { supabase } from '../supabase';

// Speichert Textnachricht oder Bildnachricht (image_url optional)
export async function saveMessage({ user_id, sender, content, image_url }) {
  const { error } = await supabase
    .from("messages")
    .insert([{ user_id, sender, content, image_url }]);
  if (error) throw error;
}

// Lädt den Verlauf für einen User
export async function fetchMessages(user_id) {
  const { data, error } = await supabase
    .from("messages")
    .select('*')
    .eq("user_id", user_id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}
