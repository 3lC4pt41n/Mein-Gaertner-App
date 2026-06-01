import { supabase } from '../supabase';
import { fetchCachedSpeciesDetails } from './dexService';
import { normalizeLanguage } from './languageService';

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
    return { details: null, language: normalizedLanguage, source: null };
  }

  const speciesDetails = await fetchCachedSpeciesDetails(speciesId, normalizedLanguage);
  if (!speciesDetails) {
    return { details: null, language: normalizedLanguage, source: null };
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
