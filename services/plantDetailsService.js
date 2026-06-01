import { supabase } from '../supabase';
import { fetchCachedSpeciesDetails } from './dexService';
import { normalizeLanguage } from './languageService';

const DETAIL_LANGUAGE_HINTS = {
  de: ['Deutscher Name', 'Botanischer Name', 'Wissenschaftlicher Name', 'Gießen'],
  en: ['Common Name', 'Botanical Name', 'Scientific Name', 'Watering'],
  fr: ['Nom commun', 'Nom botanique', 'Nom scientifique', 'Arrosage'],
  it: ['Nome comune', 'Nome botanico', 'Nome scientifico', 'Annaffiatura'],
  es: ['Nombre común', 'Nombre comun', 'Nombre botánico', 'Nombre científico', 'Riego'],
  ru: ['Народное название', 'Ботаническое название', 'Научное название', 'Полив'],
  tr: ['Yaygın Ad', 'Yaygın ad', 'Botanik Ad', 'Botanik Adı', 'Bilimsel ad', 'Sulama'],
};

function detailKeys(details) {
  if (!details || typeof details !== 'object') return [];
  return Object.keys(details.overview || {});
}

export function inferPlantDetailsLanguage(details) {
  const keys = detailKeys(details);
  if (keys.length === 0) return null;

  for (const [language, hints] of Object.entries(DETAIL_LANGUAGE_HINTS)) {
    if (hints.some((hint) => keys.includes(hint))) return language;
  }

  return null;
}

function isLegacyDetailsForLanguage(details, language) {
  return inferPlantDetailsLanguage(details) === normalizeLanguage(language);
}

async function fetchMatchingLegacyPlantDetails({ plantId, speciesId, language, userId }) {
  const normalizedLanguage = normalizeLanguage(language);
  const { data: plantRow, error } = await supabase
    .from('plants')
    .select('details, species_id, user_id')
    .eq('id', plantId)
    .maybeSingle();

  if (error) throw error;
  const legacyDetails = plantRow?.details;
  if (!isLegacyDetailsForLanguage(legacyDetails, normalizedLanguage)) return null;

  if (userId && plantRow?.user_id === userId) {
    savePlantDetailsForLanguage({
      plantId,
      userId,
      speciesId: speciesId || plantRow?.species_id,
      language: normalizedLanguage,
      details: legacyDetails,
      source: 'backfill',
    }).catch((saveError) => {
      if (__DEV__) {
        console.warn('[plantDetails] legacy snapshot save failed:', saveError?.message);
      }
    });
  }

  return legacyDetails;
}

export async function fetchPlantDetailsForLanguage({ plantId, speciesId, language, userId }) {
  const normalizedLanguage = normalizeLanguage(language);

  if (!plantId) {
    return { details: null, language: normalizedLanguage, source: null };
  }

  const { data: plantDetails, error } = await supabase
    .from('plant_details')
    .select('details, language, source, generated_at')
    .eq('plant_id', plantId)
    .eq('language', normalizedLanguage)
    .maybeSingle();

  if (error) throw error;
  if (plantDetails?.details) {
    return {
      details: plantDetails.details,
      language: normalizedLanguage,
      source: plantDetails.source || 'plant_details',
    };
  }

  if (!speciesId) {
    const legacyDetails = await fetchMatchingLegacyPlantDetails({
      plantId,
      speciesId,
      language: normalizedLanguage,
      userId,
    });
    return {
      details: legacyDetails,
      language: normalizedLanguage,
      source: legacyDetails ? 'legacy_plant' : null,
    };
  }

  const speciesDetails = await fetchCachedSpeciesDetails(speciesId, normalizedLanguage);
  if (!speciesDetails) {
    const legacyDetails = await fetchMatchingLegacyPlantDetails({
      plantId,
      speciesId,
      language: normalizedLanguage,
      userId,
    });
    return {
      details: legacyDetails,
      language: normalizedLanguage,
      source: legacyDetails ? 'legacy_plant' : null,
    };
  }

  if (userId) {
    savePlantDetailsForLanguage({
      plantId,
      userId,
      speciesId,
      language: normalizedLanguage,
      details: speciesDetails,
      source: 'species_cache',
    }).catch((saveError) => {
      if (__DEV__) {
        console.warn('[plantDetails] cache snapshot save failed:', saveError?.message);
      }
    });
  }

  return { details: speciesDetails, language: normalizedLanguage, source: 'species_cache' };
}

export async function fetchPlantDetailsMapForLanguage(plants, language) {
  const normalizedLanguage = normalizeLanguage(language);
  const plantIds = (plants || []).map((plant) => plant?.id).filter(Boolean);
  const speciesIds = [...new Set((plants || []).map((plant) => plant?.species_id).filter(Boolean))];

  if (plantIds.length === 0) return {};

  const { data: plantRows, error: plantError } = await supabase
    .from('plant_details')
    .select('plant_id, details')
    .in('plant_id', plantIds)
    .eq('language', normalizedLanguage);

  if (plantError) throw plantError;

  const detailsByPlant = Object.fromEntries(
    (plantRows || []).map((row) => [row.plant_id, row.details])
  );

  const missingSpeciesIds = [
    ...new Set(
      (plants || [])
        .filter((plant) => plant?.species_id && !detailsByPlant[plant.id])
        .map((plant) => plant.species_id)
    ),
  ];

  if (missingSpeciesIds.length === 0 && speciesIds.length === 0) {
    return detailsByPlant;
  }

  if (missingSpeciesIds.length > 0) {
    const { data: speciesRows, error: speciesError } = await supabase
      .from('species_details')
      .select('species_id, details')
      .in('species_id', missingSpeciesIds)
      .eq('language', normalizedLanguage);

    if (speciesError) throw speciesError;

    const detailsBySpecies = Object.fromEntries(
      (speciesRows || []).map((row) => [row.species_id, row.details])
    );

    for (const plant of plants || []) {
      if (!detailsByPlant[plant.id] && plant.species_id && detailsBySpecies[plant.species_id]) {
        detailsByPlant[plant.id] = detailsBySpecies[plant.species_id];
      }
    }
  }

  for (const plant of plants || []) {
    if (
      !detailsByPlant[plant.id] &&
      isLegacyDetailsForLanguage(plant.details, normalizedLanguage)
    ) {
      detailsByPlant[plant.id] = plant.details;
    }
  }

  return detailsByPlant;
}

export async function savePlantDetailsForLanguage({
  plantId,
  userId,
  speciesId,
  language,
  details,
  source = 'ai',
  model = null,
}) {
  if (!plantId || !userId || !details) return null;

  const normalizedLanguage = normalizeLanguage(language);
  const { data, error } = await supabase
    .from('plant_details')
    .upsert(
      {
        plant_id: plantId,
        user_id: userId,
        species_id: speciesId || null,
        language: normalizedLanguage,
        details,
        source,
        model,
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'plant_id,language' }
    )
    .select('details, language, source')
    .single();

  if (error) throw error;
  return data;
}
