import { supabase } from '../supabase';
import i18n from '../i18n';
import { getPlantImageUrl, getPlantImageUrls } from './uploadService';
import { normalizeLanguage } from './languageService';
import { extractLocalSpeciesName, normalizePlantName } from '../utils/plantNameUtils';

export { extractLocalSpeciesName } from '../utils/plantNameUtils';

function isRenderableImageUrl(value) {
  return (
    typeof value === 'string' &&
    (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:image/'))
  );
}

async function fetchLocalNamesForSpecies(speciesIds, language = i18n.locale) {
  const uniqueSpeciesIds = [...new Set((speciesIds || []).filter(Boolean))];
  if (!uniqueSpeciesIds.length) return {};

  try {
    const normalizedLanguage = normalizeLanguage(language);
    const { data, error } = await supabase
      .from('species_details')
      .select('species_id, details')
      .in('species_id', uniqueSpeciesIds)
      .eq('language', normalizedLanguage);

    if (error) return {};

    return (data || []).reduce((acc, row) => {
      const localName = extractLocalSpeciesName(row.details, normalizedLanguage);
      if (localName) acc[row.species_id] = localName;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

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
      'id, canonical_name, first_discovered_by, first_discovered_at, image_url, description, care_summary, total_discoverers, plant_type'
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

  // Fallback images: for species without image_url, use the first plant photo
  const speciesWithoutImage = (allSpecies || []).filter((s) => !s.image_url);
  let plantImageMap = {};
  if (speciesWithoutImage.length > 0) {
    // Get one plant image per species via canonical_name match
    const { data: plantImages } = await supabase
      .from('plants')
      .select('name, image_url')
      .eq('user_id', userId)
      .not('image_url', 'is', null);
    for (const p of plantImages || []) {
      const key = p.name?.trim().toLowerCase();
      if (key && p.image_url && !plantImageMap[key]) {
        plantImageMap[key] = p.image_url;
      }
    }
  }

  // Resolve species/fallback image references (legacy URLs + storage paths).
  const unresolvedImageUrls = (allSpecies || []).map(
    (species) =>
      species.image_url || plantImageMap[species.canonical_name?.trim().toLowerCase()] || null
  );
  const resolvedImageUrls = await getPlantImageUrls(unresolvedImageUrls);

  // Assign dexNumber BEFORE filtering so slot numbers stay stable across filters.
  //
  // ⚠️ KNOWN LIMITATION: dexNumber is derived from alphabetical sort order of
  // canonical_name (see .order('canonical_name') above). If a new species is added
  // whose name sorts earlier alphabetically, all subsequent dex numbers shift.
  // This is acceptable for the MVP but means dex numbers are NOT permanent IDs.
  // For stable IDs, a dedicated `species.dex_number` column in the DB is needed.
  let result = (allSpecies || []).map((species, idx) => ({
    ...species,
    image_url:
      resolvedImageUrls[idx] ||
      (isRenderableImageUrl(unresolvedImageUrls[idx]) ? unresolvedImageUrls[idx] : null),
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

  const localNamesBySpecies = await fetchLocalNamesForSpecies(
    result.filter((species) => species.discovered).map((species) => species.id)
  );

  return result.map((species) => {
    const localName = localNamesBySpecies[species.id] || null;
    return {
      ...species,
      local_name:
        localName && normalizePlantName(localName) !== normalizePlantName(species.canonical_name)
          ? localName
          : null,
    };
  });
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
 * Gecachte Art-Details aus species_details laden (Dex-Cache).
 * Gibt die Details als JSONB zurück oder null wenn kein Cache-Eintrag existiert.
 *
 * @param {string} speciesId - Species UUID
 * @param {string} language - Sprachcode ('de', 'en', ...)
 * @returns {Promise<Object|null>} Details-JSONB oder null
 */
export async function fetchCachedSpeciesDetails(speciesId, language = 'de') {
  if (!speciesId) return null;
  const { data, error } = await supabase
    .from('species_details')
    .select('details')
    .eq('species_id', speciesId)
    .eq('language', language)
    .maybeSingle();
  if (error || !data) return null;
  return data.details;
}

/**
 * Fetch all photos the user has taken of a given species.
 * Combines plant main images + diary photos across all plants of that species.
 *
 * @param {string} speciesId - Species UUID
 * @param {string} userId - User UUID
 * @returns {Promise<Array>} [{ id, image_url, title, created_at, type }]
 */
export async function fetchSpeciesGallery(speciesId, userId) {
  if (!speciesId || !userId) return [];

  // 1. Look up species canonical_name
  const { data: speciesRow, error: specErr } = await supabase
    .from('species')
    .select('canonical_name')
    .eq('id', speciesId)
    .maybeSingle();
  if (specErr) throw specErr;
  if (!speciesRow?.canonical_name) return [];

  // 2. Find all user plants matching this species by name (no species_id FK on plants)
  const { data: allUserPlants, error: plantsErr } = await supabase
    .from('plants')
    .select('id, image_url, name, created_at')
    .eq('user_id', userId);
  if (plantsErr) throw plantsErr;

  const canonical = speciesRow.canonical_name.trim().toLowerCase();
  const plants = (allUserPlants || []).filter((p) => p.name?.trim().toLowerCase() === canonical);
  if (plants.length === 0) return [];

  const plantIds = plants.map((p) => p.id);

  // 2. Fetch diary photos for those plants
  const { data: diaryPhotos, error: diaryErr } = await supabase
    .from('plant_diary')
    .select('id, title, image_url, created_at, type')
    .in('plant_id', plantIds)
    .not('image_url', 'is', null)
    .order('created_at', { ascending: false });
  if (diaryErr) throw diaryErr;

  // 3. Combine: plant main images + diary photos
  const allPhotos = [
    ...plants
      .filter((p) => p.image_url)
      .map((p) => ({
        id: `plant-main-${p.id}`,
        image_url: p.image_url,
        title: p.name || '',
        created_at: p.created_at,
        type: 'discovery',
      })),
    ...(diaryPhotos || []),
  ];

  if (allPhotos.length === 0) return [];

  // 4. Batch-resolve storage paths → signed URLs
  const rawUrls = allPhotos.map((p) => p.image_url);
  const resolved = await getPlantImageUrls(rawUrls);
  return allPhotos.map((p, i) => ({ ...p, image_url: resolved[i] || p.image_url }));
}

/**
 * Get detailed information about a single species.
 *
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
  const localNamesBySpecies = await fetchLocalNamesForSpecies([speciesId]);
  const localName = localNamesBySpecies[speciesId] || null;
  data.local_name =
    localName && normalizePlantName(localName) !== normalizePlantName(data.canonical_name)
      ? localName
      : null;
  if (data?.image_url) {
    data.image_url = (await getPlantImageUrl(data.image_url)) || data.image_url;
  }
  return data;
}
