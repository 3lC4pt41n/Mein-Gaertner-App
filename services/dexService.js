import { supabase } from '../supabase';

/**
 * Fetch the Plant-Dex: all species with discovery status for the user
 * @param {string} userId - The user's ID
 * @param {string} filter - Filter type: 'all' | 'discovered' | 'first'
 * @returns {Promise<Array>} Array of species with discovery metadata
 */
export async function fetchDex(userId, filter = 'all') {
  // Get all species
  const { data: allSpecies, error: speciesError } = await supabase
    .from('species')
    .select(
      'id, canonical_name, first_discovered_by, first_discovered_at, image_url, description, care_summary, total_discoverers'
    )
    .order('canonical_name', { ascending: true });

  if (speciesError) throw speciesError;

  // Get user's discoveries
  const { data: myDiscoveries, error: discError } = await supabase
    .from('discovery_events')
    .select('species_id, is_first, created_at')
    .eq('user_id', userId);

  if (discError) throw discError;

  const discoveredMap = {};
  for (const d of myDiscoveries || []) {
    discoveredMap[d.species_id] = d;
  }

  // Assign dexNumber BEFORE filtering so slot numbers stay stable across filters.
  //
  // ⚠️ KNOWN LIMITATION: dexNumber is derived from alphabetical sort order of
  // canonical_name (see .order('canonical_name') above). If a new species is added
  // whose name sorts earlier alphabetically, all subsequent dex numbers shift.
  // This is acceptable for the MVP but means dex numbers are NOT permanent IDs.
  // For stable IDs, a `species.dex_number` column in the DB is needed
  // (see HANDOFF.md → "Bekannte Tech Debt").
  let result = (allSpecies || []).map((species, idx) => ({
    ...species,
    dexNumber: idx + 1,
    discovered: !!discoveredMap[species.id],
    isFirstDiscoverer: discoveredMap[species.id]?.is_first || false,
    discoveredAt: discoveredMap[species.id]?.created_at || null,
  }));

  if (filter === 'discovered') {
    result = result.filter((s) => s.discovered);
  } else if (filter === 'first') {
    result = result.filter((s) => s.isFirstDiscoverer);
  }

  return result;
}

/**
 * Get Dex progress statistics for a user
 * @param {string} userId - The user's ID
 * @returns {Promise<Object>} { total, discovered, firstDiscoveries }
 */
export async function getDexProgress(userId) {
  const { count: totalCount, error: totalErr } = await supabase
    .from('species')
    .select('id', { count: 'exact', head: true });

  if (totalErr) throw totalErr;

  const { count: discoveredCount, error: discErr } = await supabase
    .from('discovery_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (discErr) throw discErr;

  const { count: firstCount, error: firstErr } = await supabase
    .from('discovery_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_first', true);

  if (firstErr) throw firstErr;

  return {
    total: totalCount || 0,
    discovered: discoveredCount || 0,
    firstDiscoveries: firstCount || 0,
  };
}

/**
 * Get detailed information about a single species
 * @param {string} speciesId - The species ID
 * @returns {Promise<Object>} Species with discoverer information
 */
export async function fetchSpeciesDetail(speciesId) {
  const { data, error } = await supabase
    .from('species')
    .select('*, first_discoverer:first_discovered_by(username, display_name)')
    .eq('id', speciesId)
    .single();

  if (error) throw error;
  return data;
}
