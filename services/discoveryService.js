import { supabase } from '../supabase';

/**
 * Discovery-Event bei Pflanzenerkennung loggen.
 * Upsert in species-Tabelle + Insert in discovery_events.
 * Returns discovery metadata for the reveal UI.
 *
 * @param {string} userId - User-ID
 * @param {string} speciesName - Erkannter Pflanzenname (canonical)
 * @param {string|null} plantId - Plant-ID nach dem Speichern
 * @returns {Promise<Object>} { speciesId, isFirst, isNewForUser, totalDiscoverers, displayName }
 */
export async function logDiscovery(userId, speciesName, plantId = null) {
  if (!userId || !speciesName) return null;

  const canonical = speciesName.trim().toLowerCase();
  const displayName = formatDisplayName(speciesName);

  // 1. Species upsert (canonical_name ist UNIQUE)
  const { data: existing } = await supabase
    .from('species')
    .select('id, first_discovered_by, total_discoverers')
    .eq('canonical_name', canonical)
    .maybeSingle();

  let speciesId;
  let isFirst = false;
  let totalDiscoverers = 1;

  if (existing) {
    speciesId = existing.id;
    totalDiscoverers = (existing.total_discoverers || 0) + 1;
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
          .select('id, first_discovered_by, total_discoverers')
          .eq('canonical_name', canonical)
          .single();
        speciesId = retry.id;
        totalDiscoverers = (retry.total_discoverers || 0) + 1;
      } else {
        throw insertError;
      }
    } else {
      speciesId = newSpecies.id;
      isFirst = true;
    }
  }

  // 2. Discovery-Event loggen (max 1 pro Species/User durch UNIQUE INDEX)
  const { error: eventError } = await supabase.from('discovery_events').insert({
    user_id: userId,
    species_id: speciesId,
    plant_id: plantId,
    is_first: isFirst,
  });

  // Check if this is a new discovery for the user
  let isNewForUser = true;
  if (eventError) {
    if (eventError.code === '23505') {
      // Already discovered by this user — not new
      isNewForUser = false;
    } else {
      throw eventError;
    }
  }

  // 3. Credit-Belohnung für Neuentdeckungen
  let creditsAwarded = 0;
  if (isNewForUser) {
    creditsAwarded = isFirst ? 50 : 10;
    try {
      await supabase.rpc('refund_credits', {
        p_user_id: userId,
        p_amount: creditsAwarded,
      });
    } catch (creditError) {
      // Non-critical — Entdeckung trotzdem gültig
      console.warn('Discovery credit award failed:', creditError);
      creditsAwarded = 0;
    }
  }

  return {
    speciesId,
    isFirst,
    isNewForUser,
    totalDiscoverers,
    displayName,
    creditsAwarded,
  };
}

/**
 * Format a canonical species name for display.
 * "monstera deliciosa" → "Monstera Deliciosa"
 */
export function formatDisplayName(name) {
  if (!name) return '';
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
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
    firstDiscoveries: data.filter((d) => d.is_first).length,
  };
}
