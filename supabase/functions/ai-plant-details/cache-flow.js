/**
 * Pure helpers for ai-plant-details cache-flow decisions.
 * Kept side-effect free so behavior can be covered in Jest.
 */

/**
 * Decide which source should answer the request.
 * @param {Object} params
 * @param {boolean} params.hasSpecies
 * @param {boolean} params.cachedBeforeCredits
 * @param {boolean} params.cachedAfterCredits
 * @returns {'dex_cache_pre'|'dex_cache_post_refund'|'llm'}
 */
export function decideDetailsSource({
  hasSpecies,
  cachedBeforeCredits,
  cachedAfterCredits,
}) {
  if (hasSpecies && cachedBeforeCredits) return 'dex_cache_pre';
  if (hasSpecies && cachedAfterCredits) return 'dex_cache_post_refund';
  return 'llm';
}

/**
 * Build generation input for OpenAI.
 * If a species is resolved, canonical_name wins and note hint is discarded
 * to protect shared cache quality.
 * @param {Object} params
 * @param {string} params.requestedName
 * @param {string|undefined|null} params.note
 * @param {string|undefined|null} params.canonicalName
 */
export function buildGenerationContext({ requestedName, note, canonicalName }) {
  const normalizedRequestedName = typeof requestedName === 'string' ? requestedName.trim() : '';
  const normalizedCanonicalName =
    typeof canonicalName === 'string' ? canonicalName.trim() : '';

  if (normalizedCanonicalName) {
    return {
      generationName: normalizedCanonicalName,
      generationHint: '',
      requestedName: normalizedRequestedName,
    };
  }

  return {
    generationName: normalizedRequestedName,
    generationHint: note || '',
    requestedName: normalizedRequestedName,
  };
}

