const {
  decideDetailsSource,
  buildGenerationContext,
} = require('../../supabase/functions/ai-plant-details/cache-flow.js');

describe('ai-plant-details cache-flow helpers', () => {
  describe('decideDetailsSource', () => {
    it('returns pre-credit cache source on initial cache hit', () => {
      const source = decideDetailsSource({
        hasSpecies: true,
        cachedBeforeCredits: true,
        cachedAfterCredits: false,
      });
      expect(source).toBe('dex_cache_pre');
    });

    it('returns post-refund cache source on double-check hit', () => {
      const source = decideDetailsSource({
        hasSpecies: true,
        cachedBeforeCredits: false,
        cachedAfterCredits: true,
      });
      expect(source).toBe('dex_cache_post_refund');
    });

    it('returns llm when no cache is available', () => {
      const source = decideDetailsSource({
        hasSpecies: true,
        cachedBeforeCredits: false,
        cachedAfterCredits: false,
      });
      expect(source).toBe('llm');
    });

    it('returns llm when species is unknown', () => {
      const source = decideDetailsSource({
        hasSpecies: false,
        cachedBeforeCredits: false,
        cachedAfterCredits: true,
      });
      expect(source).toBe('llm');
    });
  });

  describe('buildGenerationContext', () => {
    it('uses canonical species name and strips hint when species is resolved', () => {
      const ctx = buildGenerationContext({
        requestedName: '  Monstera  ',
        note: 'Meine Wohnzimmerpflanze',
        canonicalName: 'monstera deliciosa',
      });

      expect(ctx).toEqual({
        generationName: 'monstera deliciosa',
        generationHint: '',
        requestedName: 'Monstera',
      });
    });

    it('uses requested name and note when no species is resolved', () => {
      const ctx = buildGenerationContext({
        requestedName: 'Calathea Orbifolia',
        note: 'heller Standort',
        canonicalName: null,
      });

      expect(ctx).toEqual({
        generationName: 'Calathea Orbifolia',
        generationHint: 'heller Standort',
        requestedName: 'Calathea Orbifolia',
      });
    });
  });
});

