import { supabase } from '../supabase';
import { uploadPlantImage } from './uploadService';

/**
 * Add a manual diary entry (user writes note + optional photo)
 */
export async function addDiaryEntry({ plant_id, user_id, title, note, imageUri }) {
  let image_url = null;
  if (imageUri) {
    image_url = await uploadPlantImage(imageUri, user_id);
  }
  const { data, error } = await supabase
    .from('plant_diary')
    .insert({ plant_id, user_id, type: 'manual', title, note, image_url })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Auto-log diary entry (called by other services)
 * Types: 'healthcheck', 'task', 'discovery'
 */
export async function addAutoDiaryEntry({ plant_id, user_id, type, title, note, image_url, meta }) {
  const { error } = await supabase
    .from('plant_diary')
    .insert({ plant_id, user_id, type, title, note, image_url, meta });
  if (error) console.warn('Auto diary entry error:', error.message);
}

/**
 * Fetch paginated diary entries for a plant
 */
export async function fetchDiaryEntries(plant_id, page = 0, limit = 20) {
  const from = page * limit;
  const to = from + limit - 1;
  const { data, error, count } = await supabase
    .from('plant_diary')
    .select('*', { count: 'exact' })
    .eq('plant_id', plant_id)
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;
  return { entries: data || [], total: count || 0, hasMore: (data?.length || 0) === limit };
}

/**
 * Fetch gallery (only entries with images)
 */
export async function fetchGallery(plant_id) {
  const { data, error } = await supabase
    .from('plant_diary')
    .select('id, title, image_url, created_at, type')
    .eq('plant_id', plant_id)
    .not('image_url', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
