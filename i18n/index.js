// i18n/index.js – Internationalisierung mit i18n-js v4 + expo-localization
import { I18n } from 'i18n-js';
import { getLocales } from 'expo-localization';
import de from './locales/de.json';
import en from './locales/en.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
import es from './locales/es.json';

const i18n = new I18n({ de, en, fr, it, es });

i18n.defaultLocale = 'de';
i18n.enableFallback = true;

// Initial: Gerätesprache verwenden (wird durch Profile-Sprache überschrieben)
const deviceLocale = getLocales()?.[0]?.languageCode ?? 'de';
const SUPPORTED = ['de', 'en', 'fr', 'it', 'es'];
i18n.locale = SUPPORTED.includes(deviceLocale) ? deviceLocale : 'de';

export default i18n;
export const t = (key, options) => i18n.t(key, options);
