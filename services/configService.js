import { supabase } from '../supabase';

export async function getConfigValue(key) {
  const { data, error } = await supabase
    .from('config')
    .select('value')
    .eq('key', key)
    .single();
  if (error) throw error;
  return data.value;
}
