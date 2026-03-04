import { supabase } from '../supabase';
import { addAutoDiaryEntry } from './diaryService';

// Slug aus Pflanzenname generieren: "Monstera Deliciosa" → "monstera-deliciosa-a3f2"
function generateSlug(name) {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Umlaute → Basis
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const shortId = Math.random().toString(36).substring(2, 6);
  return `${base}-${shortId}`;
}

// Pflanze speichern, inkl. Details + eindeutigem Slug
export async function savePlantToSupabase({ name, note, image, user_id, details, zone_id }) {
  const slug = generateSlug(name);
  const row = { name, note, image_url: image, user_id, details, slug };
  if (zone_id) row.zone_id = zone_id;
  const { data, error } = await supabase.from('plants').insert([row]).select().single();
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

// Healthcheck speichern + Gardening-Event loggen
export async function saveHealthcheck({
  plant_id,
  user_id,
  healthscore,
  summary,
  table_json,
  recommendation,
}) {
  // Vorherigen Healthscore laden für Delta-Berechnung
  let prevScore = null;
  try {
    const { data: prev } = await supabase
      .from('plant_healthchecks')
      .select('healthscore')
      .eq('plant_id', plant_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    prevScore = prev?.healthscore ?? null;
  } catch (_e) {
    /* Kein vorheriger Healthcheck — Delta bleibt 0 */
  }

  const { data, error } = await supabase
    .from('plant_healthchecks')
    .insert([{ plant_id, user_id, healthscore, summary, table_json, recommendation }])
    .select()
    .single();
  if (error) throw new Error(error.message);

  // Gardening-Event: +0.2 Basis + 0.05 × max(0, deltaHealthscore)
  const delta = prevScore !== null ? healthscore - prevScore : 0;
  const points = 0.2 + 0.05 * Math.max(0, delta);

  const { error: eventError } = await supabase.from('gardening_events').insert({
    user_id,
    event_type: 'healthcheck_logged',
    plant_id,
    points,
    meta: { healthscore, prev_score: prevScore, delta },
  });
  if (eventError) console.warn('gardening_event log error:', eventError.message);

  // Auto-diary entry for healthcheck
  addAutoDiaryEntry({
    plant_id,
    user_id,
    type: 'healthcheck',
    title: `Healthcheck: ${healthscore}/100`,
    note: summary,
    image_url: null,
    meta: { healthscore, delta },
  }).catch((e) => console.warn('Diary auto-entry error:', e.message));

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
