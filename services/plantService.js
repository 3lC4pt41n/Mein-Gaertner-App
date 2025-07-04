import { supabase } from '../supabase';

// Pflanze speichern, inkl. Details
export async function savePlantToSupabase({ name, note, image, user_id, details }) {
  const { data, error } = await supabase
    .from("plants")
    .insert([{ name, note, image_url: image, user_id, details }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// Alle eigenen Pflanzen laden
export async function fetchPlants(user_id) {
  const { data, error } = await supabase
    .from('plants')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Pflanze löschen
export async function deletePlant(id) {
  const { error } = await supabase.from('plants').delete().eq('id', id);
  if (error) throw error;
}

// Healthcheck speichern
export async function saveHealthcheck({ plant_id, user_id, healthscore, summary, table_json, recommendation }) {
  const { data, error } = await supabase
    .from('plant_healthchecks')
    .insert([{ plant_id, user_id, healthscore, summary, table_json, recommendation }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// Den neuesten Healthcheck zur Pflanze holen
export async function fetchLatestHealthcheck(plant_id) {
  const { data, error } = await supabase
    .from('plant_healthchecks')
    .select('*')
    .eq('plant_id', plant_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

// Healthchecks zu einer Pflanze laden (neuster zuerst)
export async function fetchHealthchecks(plant_id) {
  const { data, error } = await supabase
    .from('plant_healthchecks')
    .select('*')
    .eq('plant_id', plant_id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
