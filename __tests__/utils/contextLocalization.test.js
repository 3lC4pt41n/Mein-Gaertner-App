const {
  getLocalizedContextText,
  getLocalizedSeasonName,
  getLocalizedSeasonalTip,
  getLocalizedTimeOfDayName,
} = require('../../utils/contextLocalization');
const { ensureLanguageLoaded } = require('../../services/translationLoader');

describe('contextLocalization', () => {
  beforeAll(async () => {
    for (const language of ['en', 'tr', 'fr', 'es']) {
      await ensureLanguageLoaded(language);
    }
  });

  it('localizes season labels by stable season key', () => {
    expect(getLocalizedSeasonName({ key: 'summer', name: 'Sommer', icon: '☀️' }, 'en')).toBe(
      'Summer'
    );
    expect(getLocalizedSeasonName({ key: 'winter', name: 'Winter', icon: '❄️' }, 'tr')).toBe('Kış');
  });

  it('localizes German legacy season names when key is missing', () => {
    expect(getLocalizedSeasonName({ name: 'Herbst', icon: '🍂' }, 'en')).toBe('Autumn');
    expect(getLocalizedSeasonalTip({ name: 'Sommer' }, 'en')).toContain('Summer mode');
  });

  it('localizes time-of-day labels by stable time key', () => {
    expect(getLocalizedTimeOfDayName({ key: 'afternoon', name: 'Nachmittag' }, 'en')).toBe(
      'Afternoon'
    );
    expect(getLocalizedTimeOfDayName({ key: 'morning', name: 'Morgen' }, 'fr')).toBe('Matin');
  });

  it('uses the requested locale for context text interpolation', () => {
    expect(getLocalizedContextText('hotBody', 'en', { temperature: 31 })).toContain('31°C');
    expect(getLocalizedContextText('activeTitle', 'es')).toBe('Contexto activo');
  });
});
