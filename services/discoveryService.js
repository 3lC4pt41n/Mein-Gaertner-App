import { supabase } from '../supabase';

/**
 * Discovery-Event bei Pflanzenerkennung loggen.
 * Upsert in species-Tabelle + Insert in discovery_events.
 *
 * @param {string} userId - User-ID
 * @param {string} speciesName - Erkannter Pflanzenname (canonical)
 * @param {string|null} plantId - Plant-ID nach dem Speichern
 */
export async function logDiscovery(userId, speciesName, plantId = null) {
  if (!userId || !speciesName) return;

  const canonical = speciesName.trim().toLowerCase();

  // 1. Species upsert (canonical_name ist UNIQUE)
  const { data: existing } = await supabase
    .from('species')
    .select('id, first_discovered_by')
    .eq('canonical_name', canonical)
    .maybeSingle();

  let speciesId;
  let isFirst = false;

  if (existing) {
    speciesId = existing.id;
  } else {
    // Neue Species – dieser User ist Erstentdecker
    const { data: newSpecies, error: insertError } = await supabase
      .from('species')
      .insert({
        canonical_name: canonical,
        first_discovered_by: userId,
        first_discovered_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertError) {
      // Race-Condition: Anderer User hat gleichzeitig eingefügt
      if (insertError.code === '23505') {
        const { data: retry } = await supabase
          .from('species')
          .select('id, first_discovered_by')
          .eq('canonical_name', canonical)
          .single();
        speciesId = retry.id;
      } else {
        throw insertError;
      }
    } else {
      speciesId = newSpecies.id;
      isFirst = true;
    }
  }

  // 2. Discovery-Event loggen (max 1 pro Species/User durch UNIQUE INDEX)
  const { error: eventError } = await supabase
    .from('discovery_events')
    .insert({
      user_id: userId,
      species_id: speciesId,
      plant_id: plantId,
      is_first: isFirst,
    });

  // Duplicate ignorieren (UNIQUE constraint: 1 pro Species/User)
  if (eventError && eventError.code !== '23505') {
    throw eventError;
  }
}

/**
 * Entdeckte Pflanzenarten eines Users abrufen.
 */
export async function fetchMyDiscoveries(userId) {
  const { data, error } = await supabase
    .from('discovery_events')
    .select('*, species:species_id(canonical_name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * Anzahl entdeckter Arten + Erstentdeckungen eines Users.
 */
export async function fetchDiscoveryStats(userId) {
  const { data, error } = await supabase
    .from('discovery_events')
    .select('id, is_first')
    .eq('user_id', userId);
  if (error) throw error;

  return {
    totalDiscoveries: data.length,
    firstDiscoveries: data.filter(d => d.is_first).length,
  };
}
