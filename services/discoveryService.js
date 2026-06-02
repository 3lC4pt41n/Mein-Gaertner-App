import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '../supabase';

const LOCATION_CACHE_KEY = '@user_location'; // shared with weatherService
const LEGACY_LOCATION_CACHE_KEY = '@weather_location';
const LOCATION_TTL = 30 * 60 * 1000;

const normalizeSpeciesName = (name) =>
  String(name || '')
    .trim()
    .toLowerCase();

const resolveSpeciesRecord = async (speciesName, plantType = null, firstDiscovererId = null) => {
  const canonical = normalizeSpeciesName(speciesName);
  if (!canonical) return null;

  const displayName = formatDisplayName(speciesName);

  const { data: existing, error: existingError } = await supabase
    .from('species')
    .select('id, first_discovered_by, total_discoverers, plant_type')
    .eq('canonical_name', canonical)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    if (plantType && (!existing.plant_type || existing.plant_type === 'other')) {
      await supabase.from('species').update({ plant_type: plantType }).eq('id', existing.id);
    }

    return {
      speciesId: existing.id,
      displayName,
      isFirst:
        !!firstDiscovererId &&
        !existing.first_discovered_by &&
        (existing.total_discoverers || 0) === 0,
      totalDiscoverers: existing.total_discoverers || 0,
    };
  }

  const insertPayload = {
    canonical_name: canonical,
    ...(plantType ? { plant_type: plantType } : {}),
    ...(firstDiscovererId
      ? {
          first_discovered_by: firstDiscovererId,
          first_discovered_at: new Date().toISOString(),
        }
      : {}),
  };

  const { data: newSpecies, error: insertError } = await supabase
    .from('species')
    .insert(insertPayload)
    .select('id, total_discoverers')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: retry, error: retryError } = await supabase
        .from('species')
        .select('id, first_discovered_by, total_discoverers')
        .eq('canonical_name', canonical)
        .single();

      if (retryError) throw retryError;

      return {
        speciesId: retry.id,
        displayName,
        isFirst:
          !!firstDiscovererId && !retry.first_discovered_by && (retry.total_discoverers || 0) === 0,
        totalDiscoverers: retry.total_discoverers || 0,
      };
    }

    throw insertError;
  }

  return {
    speciesId: newSpecies.id,
    displayName,
    isFirst: !!firstDiscovererId,
    totalDiscoverers: newSpecies.total_discoverers || 0,
  };
};

const getFreshCachedLocation = async () => {
  const cacheKeys = [LOCATION_CACHE_KEY, LEGACY_LOCATION_CACHE_KEY];

  for (const cacheKey of cacheKeys) {
    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (!cached) continue;

      const { latitude, longitude, timestamp } = JSON.parse(cached);
      if (
        typeof latitude === 'number' &&
        typeof longitude === 'number' &&
        timestamp &&
        Date.now() - timestamp < LOCATION_TTL
      ) {
        return { latitude, longitude };
      }
    } catch {
      // Ignore corrupt cache entries and fall back to permission/GPS.
    }
  }

  return null;
};

const ensureForegroundLocationPermission = async () => {
  const currentPermission = await Location.getForegroundPermissionsAsync();
  if (currentPermission.status === 'granted') return true;
  if (currentPermission.canAskAgain === false) return false;

  const requestedPermission = await Location.requestForegroundPermissionsAsync();
  return requestedPermission.status === 'granted';
};

/**
 * Best-effort GPS location for discovery events.
 * Returns { latitude, longitude } or null (never throws, never blocks UI).
 * Re-uses the 30-min cached location from weatherService when available.
 * Requests foreground permission at discovery time if no fresh cache exists.
 */
export async function getDiscoveryLocation() {
  if (Platform.OS === 'web') return null;

  try {
    const cachedLocation = await getFreshCachedLocation();
    if (cachedLocation) return cachedLocation;

    const hasPermission = await ensureForegroundLocationPermission();
    if (!hasPermission) return null;

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      timeout: 5000,
    });

    const { latitude, longitude } = loc.coords;

    await AsyncStorage.setItem(
      LOCATION_CACHE_KEY,
      JSON.stringify({ latitude, longitude, timestamp: Date.now() })
    );

    return { latitude, longitude };
  } catch {
    return null;
  }
}

/**
 * Resolve or create a species record without creating a discovery event.
 * Used for web AI uploads, where plants can be linked to Dex species but do
 * not count towards discoveries, credits, leaderboard, heatmap, or reveal UI.
 */
export async function resolveSpeciesWithoutDiscovery(speciesName, plantType = null) {
  const resolved = await resolveSpeciesRecord(speciesName, plantType, null);
  if (!resolved) return null;

  return {
    speciesId: resolved.speciesId,
    displayName: resolved.displayName,
    totalDiscoverers: resolved.totalDiscoverers,
  };
}

/**
 * Discovery-Event bei Pflanzenerkennung loggen.
 * Upsert in species-Tabelle + Insert in discovery_events.
 * Returns discovery metadata for the reveal UI.
 *
 * @param {string} userId - User-ID
 * @param {string} speciesName - Erkannter Pflanzenname (canonical)
 * @param {string|null} plantId - Plant-ID nach dem Speichern
 * @param {{ latitude: number, longitude: number }|null} location - GPS coords at discovery time
 * @param {string|null} plantType - AI-classified category (houseplant, succulent, etc.)
 * @returns {Promise<Object>} { speciesId, isFirst, isNewForUser, totalDiscoverers, displayName }
 */
export async function logDiscovery(
  userId,
  speciesName,
  plantId = null,
  location = null,
  plantType = null
) {
  if (!userId || !speciesName) return null;

  // 1. Species upsert (canonical_name ist UNIQUE)
  const resolved = await resolveSpeciesRecord(speciesName, plantType, userId);
  if (!resolved) return null;

  const { speciesId, displayName } = resolved;
  let { isFirst, totalDiscoverers } = resolved;

  // 2. Discovery-Event loggen (max 1 pro Species/User durch UNIQUE INDEX)
  const { error: eventError } = await supabase.from('discovery_events').insert({
    user_id: userId,
    species_id: speciesId,
    plant_id: plantId,
    is_first: isFirst,
    source: 'mobile',
    ...(location?.latitude != null && location?.longitude != null
      ? { latitude: location.latitude, longitude: location.longitude }
      : {}),
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

  // 2b. Read counter from DB (single source of truth via trigger)
  const { data: speciesCounterRow, error: counterError } = await supabase
    .from('species')
    .select('total_discoverers')
    .eq('id', speciesId)
    .maybeSingle();

  if (!counterError && speciesCounterRow?.total_discoverers != null) {
    totalDiscoverers = speciesCounterRow.total_discoverers;
  } else if (isNewForUser && totalDiscoverers < 1) {
    // Defensive fallback if counter read fails after a new discovery.
    totalDiscoverers = 1;
  }

  // 3. Credit-Belohnung für Neuentdeckungen (sichere DB-Funktion)
  let creditsAwarded = 0;
  if (isNewForUser) {
    try {
      const { data: reward, error: rewardError } = await supabase.rpc('award_discovery_credits', {
        p_user_id: userId,
        p_species_id: speciesId,
      });
      if (!rewardError && reward) {
        creditsAwarded = reward;
      }
    } catch (creditError) {
      // Non-critical — Entdeckung trotzdem gültig
      console.warn('Discovery credit award failed:', creditError);
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
 * Fetch aggregated heatmap grid data for the world map.
 * Only includes users who opted in (heatmap_opt_in = true).
 * Returns privacy-safe ~1km² grid cells.
 */
export async function fetchHeatmapGrid() {
  const { data, error } = await supabase.rpc('get_heatmap_grid');
  if (!error) return data ?? [];

  // Fallback for clients that receive the JS bundle before the migration lands.
  if (error.code !== '42883' && error.code !== 'PGRST202') throw error;

  const { data: viewData, error: viewError } = await supabase
    .from('heatmap_grid')
    .select('grid_lat, grid_lon, discovery_count, species_count, first_discoveries');
  if (viewError) throw viewError;
  return viewData ?? [];
}

/**
 * Fetch aggregated heatmap grid for a single species.
 * Privacy-safe data only (opt-in users, aggregated grid cells).
 */
export async function fetchHeatmapGridBySpecies(speciesId) {
  if (!speciesId) return [];

  const { data, error } = await supabase.rpc('get_heatmap_species_grid', {
    p_species_id: speciesId,
  });

  if (!error) return data ?? [];
  if (error.code !== '42883' && error.code !== 'PGRST202') throw error;

  const { data: viewData, error: viewError } = await supabase
    .from('heatmap_species_grid')
    .select('grid_lat, grid_lon, discovery_count, first_discoveries')
    .eq('species_id', speciesId);

  if (viewError) throw viewError;
  return viewData ?? [];
}

/**
 * Fetch the current user's discovery events for a single species (with location).
 * Used for the "My Finds" map overlay in the Dex detail screen.
 *
 * @param {string} speciesId - Species UUID
 * @param {string} userId - User UUID
 * @returns {Promise<Array>} [{ latitude, longitude, created_at }]
 */
export async function fetchMyDiscoveriesForSpecies(speciesId, userId) {
  if (!speciesId || !userId) return [];

  const { data, error } = await supabase
    .from('discovery_events')
    .select('latitude, longitude, created_at')
    .eq('species_id', speciesId)
    .eq('user_id', userId);
  if (error) throw error;

  // Only return entries that have location data
  return (data || []).filter((d) => d.latitude != null && d.longitude != null);
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
