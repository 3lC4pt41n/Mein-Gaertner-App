const {
  extractLocalSpeciesName,
  getPlantTitleParts,
  normalizePlantName,
} = require('../../utils/plantNameUtils');

describe('plantNameUtils', () => {
  it('extracts localized common names from generated plant details', () => {
    const details = {
      overview: {
        'Deutscher Name': 'Fensterblatt',
        'Botanischer Name': 'Monstera deliciosa',
      },
    };

    expect(extractLocalSpeciesName(details, 'de')).toBe('Fensterblatt');
  });

  it('falls back to available common names across languages', () => {
    const details = {
      overview: {
        'Common Name': 'Swiss cheese plant',
        'Botanischer Name': 'Monstera deliciosa',
      },
    };

    expect(extractLocalSpeciesName(details, 'de')).toBe('Swiss cheese plant');
  });

  it('returns title parts without duplicating identical botanical and local names', () => {
    const plant = {
      name: 'Monstera deliciosa',
      details: {
        overview: {
          'Deutscher Name': 'Monstera deliciosa',
        },
      },
    };

    expect(getPlantTitleParts(plant, 'de')).toEqual({
      botanicalName: 'Monstera deliciosa',
      localName: null,
    });
  });

  it('normalizes accents and whitespace for name comparisons', () => {
    expect(normalizePlantName('  Café   au lait ')).toBe('cafe au lait');
  });
});
