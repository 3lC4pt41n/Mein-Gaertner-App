// i18n/index.js – Internationalisierung mit i18n-js v4 + expo-localization
import { I18n } from 'i18n-js';
import { getLocales } from 'expo-localization';
import de from './locales/de.json';
import {
  DEFAULT_LANGUAGE_CODE,
  SUPPORTED_LANGUAGE_CODES,
  getSupportedLanguageCode,
} from './registry';

const i18n = new I18n({ de });

i18n.defaultLocale = DEFAULT_LANGUAGE_CODE;
i18n.enableFallback = true;

function getDeviceLanguageCode() {
  const deviceLocale = getLocales()?.[0];
  if (!deviceLocale) return DEFAULT_LANGUAGE_CODE;

  return (
    getSupportedLanguageCode(deviceLocale.languageTag) ||
    getSupportedLanguageCode(
      deviceLocale.regionCode
        ? `${deviceLocale.languageCode}-${deviceLocale.regionCode}`
        : deviceLocale.languageCode
    ) ||
    getSupportedLanguageCode(deviceLocale.languageCode) ||
    DEFAULT_LANGUAGE_CODE
  );
}

// Initial: Gerätesprache vormerken; nicht-de Locales werden danach lazy geladen.
i18n.locale = getDeviceLanguageCode();

export default i18n;
export const t = (key, options) => i18n.t(key, options);
export const SUPPORTED = SUPPORTED_LANGUAGE_CODES;
