import { supabase } from '../supabase';

export async function savePlantToSupabase({ name, note, image, user_id }) {
  const { data, error } = await supabase.from("plants").insert([
    { name, note, image_url: image, user_id }
  ]);
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchPlants(user_id) {
  const { data, error } = await supabase
    .from('plants')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function deletePlant(id) {
  const { error } = await supabase.from('plants').delete().eq('id', id);
  if (error) throw error;
}
