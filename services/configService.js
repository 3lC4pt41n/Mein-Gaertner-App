import { supabase } from '../supabase';

// Generische Config-Werte aus der config-Tabelle laden.
// HINWEIS: Der OPENAI_API_KEY wird NICHT mehr hierüber geladen!
// Er ist jetzt als Supabase Secret in den Edge Functions gespeichert.
// Diese Funktion bleibt für andere Config-Werte erhalten.
export async function getConfigValue(key) {
  const { data, error } = await supabase.from('config').select('value').eq('key', key).single();
  if (error) throw error;
  return data.value;
}
