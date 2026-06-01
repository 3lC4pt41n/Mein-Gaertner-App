jest.mock('../../services/dexService', () => ({
  fetchCachedSpeciesDetails: jest.fn(),
}));

const { inferPlantDetailsLanguage } = require('../../services/plantDetailsService');

describe('plantDetailsService', () => {
  describe('inferPlantDetailsLanguage', () => {
    it('detects German generated details from localized overview keys', () => {
      expect(
        inferPlantDetailsLanguage({
          overview: {
            'Deutscher Name': 'Fensterblatt',
            'Botanischer Name': 'Monstera deliciosa',
          },
        })
      ).toBe('de');
    });

    it('detects English generated details from localized overview keys', () => {
      expect(
        inferPlantDetailsLanguage({
          overview: {
            'Common Name': 'Swiss cheese plant',
            'Botanical Name': 'Monstera deliciosa',
          },
        })
      ).toBe('en');
    });

    it('does not guess when details have no language-specific keys', () => {
      expect(
        inferPlantDetailsLanguage({
          overview: {
            name: 'Monstera deliciosa',
          },
        })
      ).toBeNull();
    });
  });
});
