import {
  normalizeLanguage,
  getLanguageLabel,
  LANGUAGE_OPTIONS,
  applyLanguage,
} from '../../services/languageService';
import i18n from '../../i18n';

describe('normalizeLanguage', () => {
  it('returns "de" for null/undefined/empty input', () => {
    expect(normalizeLanguage(null)).toBe('de');
    expect(normalizeLanguage(undefined)).toBe('de');
    expect(normalizeLanguage('')).toBe('de');
  });

  it('normalizes direct language codes', () => {
    expect(normalizeLanguage('de')).toBe('de');
    expect(normalizeLanguage('en')).toBe('en');
    expect(normalizeLanguage('fr')).toBe('fr');
    expect(normalizeLanguage('it')).toBe('it');
    expect(normalizeLanguage('es')).toBe('es');
    expect(normalizeLanguage('nl')).toBe('nl');
    expect(normalizeLanguage('pt-BR')).toBe('pt-BR');
    expect(normalizeLanguage('pt-PT')).toBe('pt-PT');
    expect(normalizeLanguage('zh-Hans')).toBe('zh-Hans');
    expect(normalizeLanguage('ar')).toBe('ar');
    expect(normalizeLanguage('he')).toBe('he');
    expect(normalizeLanguage('fa')).toBe('fa');
    expect(normalizeLanguage('ur')).toBe('ur');
  });

  it('normalizes case-insensitive codes', () => {
    expect(normalizeLanguage('DE')).toBe('de');
    expect(normalizeLanguage('En')).toBe('en');
    expect(normalizeLanguage('FR')).toBe('fr');
  });

  it('normalizes German language names', () => {
    expect(normalizeLanguage('Deutsch')).toBe('de');
    expect(normalizeLanguage('deutsch')).toBe('de');
    expect(normalizeLanguage('German')).toBe('de');
  });

  it('normalizes English language names', () => {
    expect(normalizeLanguage('English')).toBe('en');
    expect(normalizeLanguage('english')).toBe('en');
    expect(normalizeLanguage('Englisch')).toBe('en');
  });

  it('normalizes French language names', () => {
    expect(normalizeLanguage('Français')).toBe('fr');
    expect(normalizeLanguage('francais')).toBe('fr');
    expect(normalizeLanguage('French')).toBe('fr');
    expect(normalizeLanguage('Französisch')).toBe('fr');
    expect(normalizeLanguage('franzoesisch')).toBe('fr');
  });

  it('normalizes Italian language names', () => {
    expect(normalizeLanguage('Italiano')).toBe('it');
    expect(normalizeLanguage('Italian')).toBe('it');
    expect(normalizeLanguage('Italienisch')).toBe('it');
  });

  it('normalizes Spanish language names', () => {
    expect(normalizeLanguage('Español')).toBe('es');
    expect(normalizeLanguage('espanol')).toBe('es');
    expect(normalizeLanguage('Spanish')).toBe('es');
    expect(normalizeLanguage('Spanisch')).toBe('es');
  });

  it('normalizes Russian language names', () => {
    expect(normalizeLanguage('ru')).toBe('ru');
    expect(normalizeLanguage('Russian')).toBe('ru');
    expect(normalizeLanguage('русский')).toBe('ru');
    expect(normalizeLanguage('Russisch')).toBe('ru');
  });

  it('normalizes new LTR language names and region aliases', () => {
    expect(normalizeLanguage('Dutch')).toBe('nl');
    expect(normalizeLanguage('Dänisch')).toBe('da');
    expect(normalizeLanguage('Polish')).toBe('pl');
    expect(normalizeLanguage('Ukrainisch')).toBe('uk');
    expect(normalizeLanguage('Portuguese')).toBe('pt-BR');
    expect(normalizeLanguage('Portuguese Portugal')).toBe('pt-PT');
    expect(normalizeLanguage('Hindi')).toBe('hi');
    expect(normalizeLanguage('Bengali')).toBe('bn');
    expect(normalizeLanguage('Japanese')).toBe('ja');
    expect(normalizeLanguage('Korean')).toBe('ko');
    expect(normalizeLanguage('Chinese')).toBe('zh-Hans');
    expect(normalizeLanguage('Indonesian')).toBe('id');
    expect(normalizeLanguage('Arabic')).toBe('ar');
    expect(normalizeLanguage('Hebrew')).toBe('he');
    expect(normalizeLanguage('iw')).toBe('he');
    expect(normalizeLanguage('Persian')).toBe('fa');
    expect(normalizeLanguage('Urdu')).toBe('ur');
  });

  it('returns "de" for unknown languages', () => {
    expect(normalizeLanguage('xyz')).toBe('de');
  });

  it('trims whitespace', () => {
    expect(normalizeLanguage('  en  ')).toBe('en');
    expect(normalizeLanguage(' Deutsch ')).toBe('de');
  });

  it('handles numeric input gracefully', () => {
    expect(normalizeLanguage(123)).toBe('de');
  });
});

describe('getLanguageLabel', () => {
  it('returns correct labels for language codes', () => {
    expect(getLanguageLabel('de')).toBe('Deutsch');
    expect(getLanguageLabel('en')).toBe('English');
    expect(getLanguageLabel('fr')).toBe('Français');
    expect(getLanguageLabel('it')).toBe('Italiano');
    expect(getLanguageLabel('es')).toBe('Español');
    expect(getLanguageLabel('ru')).toBe('Русский');
    expect(getLanguageLabel('pt-BR')).toBe('Português (BR)');
    expect(getLanguageLabel('zh-Hans')).toBe('简体中文');
    expect(getLanguageLabel('ar')).toBe('العربية');
    expect(getLanguageLabel('he')).toBe('עברית');
  });

  it('returns "Deutsch" for unknown input', () => {
    expect(getLanguageLabel('xyz')).toBe('Deutsch');
    expect(getLanguageLabel(null)).toBe('Deutsch');
  });

  it('resolves aliases to labels', () => {
    expect(getLanguageLabel('German')).toBe('Deutsch');
    expect(getLanguageLabel('English')).toBe('English');
    expect(getLanguageLabel('Français')).toBe('Français');
  });
});

describe('LANGUAGE_OPTIONS', () => {
  it('contains all supported languages', () => {
    expect(LANGUAGE_OPTIONS).toHaveLength(23);
  });

  it('each option has code and label', () => {
    LANGUAGE_OPTIONS.forEach((opt) => {
      expect(opt).toHaveProperty('code');
      expect(opt).toHaveProperty('label');
      expect(typeof opt.code).toBe('string');
      expect(typeof opt.label).toBe('string');
    });
  });
});

describe('applyLanguage', () => {
  it('loads a language before switching the active locale', async () => {
    delete i18n.translations.nl;

    await expect(applyLanguage('nl')).resolves.toBe('nl');

    expect(i18n.locale).toBe('nl');
    expect(i18n.translations.nl?.common?.save).toBeTruthy();
  });
});
