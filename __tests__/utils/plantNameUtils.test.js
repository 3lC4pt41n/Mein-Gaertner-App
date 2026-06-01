const {
  extractBotanicalSpeciesName,
  extractLocalSpeciesName,
  getPlantTitleParts,
  extractPlantSummary,
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

  it('extracts local names from common aliases and direct fields', () => {
    expect(
      extractLocalSpeciesName(
        {
          overview: {
            Trivialname: 'Fensterblatt',
          },
        },
        'de'
      )
    ).toBe('Fensterblatt');

    expect(
      extractLocalSpeciesName({
        common_name: 'Swiss cheese plant',
      })
    ).toBe('Swiss cheese plant');
  });

  it('prefers generated botanical names over stored display names', () => {
    const plant = {
      name: 'Fensterblatt',
      details: {
        overview: {
          'Botanischer Name': 'Monstera deliciosa',
          'Deutscher Name': 'Fensterblatt',
        },
      },
    };

    expect(extractBotanicalSpeciesName(plant.details, 'de')).toBe('Monstera deliciosa');
    expect(getPlantTitleParts(plant, 'de')).toEqual({
      botanicalName: 'Monstera deliciosa',
      localName: 'Fensterblatt',
    });
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

  it('falls back to species canonical names before stored display names', () => {
    expect(
      getPlantTitleParts({
        name: 'Fensterblatt',
        canonical_name: 'Monstera deliciosa',
      })
    ).toEqual({
      botanicalName: 'Monstera deliciosa',
      localName: null,
    });
  });

  it('normalizes accents and whitespace for name comparisons', () => {
    expect(normalizePlantName('  Café   au lait ')).toBe('cafe au lait');
  });

  it('extracts localized list summaries from details', () => {
    const details = {
      overview: {
        Highlight: 'Sehr robust und pflegeleicht.',
      },
      care: {
        Gießen: 'Mäßig gießen.',
      },
    };

    expect(extractPlantSummary(details, 'de')).toBe('Sehr robust und pflegeleicht.');
  });
});
