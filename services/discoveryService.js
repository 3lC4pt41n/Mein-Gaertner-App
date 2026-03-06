import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

const LOCATION_CACHE_KEY = '@weather_location'; // shared with weatherService

/**
 * Best-effort GPS location for discovery events.
 * Returns { latitude, longitude } or null (never throws, never blocks UI).
 * Re-uses the 30-min cached location from weatherService when available.
 */
export async function getDiscoveryLocation() {
  try {
    // 1. Check cache first (shared with weatherService)
    const cached = await AsyncStorage.getItem(LOCATION_CACHE_KEY);
    if (cached) {
      const { latitude, longitude, timestamp } = JSON.parse(cached);
      // Accept cache within 30 min
      if (Date.now() - timestamp < 30 * 60 * 1000) {
        return { latitude, longitude };
      }
    }

    // 2. Check permission without prompting
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    // 3. Get current position (balanced accuracy, 5s timeout)
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      timeout: 5000,
    });

    const { latitude, longitude } = loc.coords;

    // Update shared cache
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
 * Discovery-Event bei Pflanzenerkennung loggen.
 * Upsert in species-Tabelle + Insert in discovery_events.
 * Returns discovery metadata for the reveal UI.
 *
 * @param {string} userId - User-ID
 * @param {string} speciesName - Erkannter Pflanzenname (canonical)
 * @param {string|null} plantId - Plant-ID nach dem Speichern
 * @param {{ latitude: number, longitude: number }|null} location - GPS coords at discovery time
 * @returns {Promise<Object>} { speciesId, isFirst, isNewForUser, totalDiscoverers, displayName }
 */
export async function logDiscovery(userId, speciesName, plantId = null, location = null) {
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
  let totalDiscoverers = existing?.total_discoverers || 0;

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
          .select('id, first_discovered_by, total_discoverers')
          .eq('canonical_name', canonical)
          .single();
        speciesId = retry.id;
        totalDiscoverers = retry.total_discoverers || 0;
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
  const { data, error } = await supabase
    .from('heatmap_grid')
    .select('grid_lat, grid_lon, discovery_count, species_count, first_discoveries');
  if (error) throw error;
  return data ?? [];
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
