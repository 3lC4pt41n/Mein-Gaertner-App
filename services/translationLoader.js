import i18n from '../i18n';
import { loaders } from '../i18n/loaders';
import { DEFAULT_LANGUAGE_CODE, LANGUAGE_FALLBACKS, normalizeLanguageCode } from '../i18n/registry';

const loadingByCode = new Map();

function unwrapModule(module) {
  return module?.default || module;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isPlainObject(base)) return override;
  if (!isPlainObject(override)) return base;

  const merged = { ...base };
  Object.entries(override).forEach(([key, value]) => {
    merged[key] = isPlainObject(value) ? deepMerge(base[key], value) : value;
  });
  return merged;
}

function hasTranslations(code) {
  return Boolean(i18n.translations?.[code]);
}

async function loadLanguage(code) {
  const loader = loaders[code];
  if (!loader) return false;

  const fallbackCode = LANGUAGE_FALLBACKS[code];
  let fallbackTranslations = null;

  if (fallbackCode) {
    const fallbackLoaded = await ensureLanguageLoaded(fallbackCode);
    if (fallbackLoaded) fallbackTranslations = i18n.translations[fallbackCode];
  }

  const module = await loader();
  const translations = unwrapModule(module);
  i18n.translations[code] = fallbackTranslations
    ? deepMerge(fallbackTranslations, translations)
    : translations;

  return true;
}

export async function ensureLanguageLoaded(input) {
  const code = normalizeLanguageCode(input);
  if (hasTranslations(code)) return true;

  if (!loaders[code]) {
    if (__DEV__) {
      console.warn(`[translationLoader] Kein Loader für Locale "${code}" gefunden.`);
    }
    return false;
  }

  if (!loadingByCode.has(code)) {
    loadingByCode.set(
      code,
      loadLanguage(code).catch((error) => {
        if (__DEV__) {
          console.warn(`[translationLoader] Locale "${code}" konnte nicht geladen werden.`, error);
        }
        return false;
      })
    );
  }

  const loaded = await loadingByCode.get(code);
  if (!loaded) loadingByCode.delete(code);
  return loaded;
}

export function injectLanguageTranslations(input, translations) {
  const code = normalizeLanguageCode(input);
  if (code === DEFAULT_LANGUAGE_CODE || loaders[code]) {
    i18n.translations[code] = translations;
    loadingByCode.delete(code);
    return true;
  }
  return false;
}
