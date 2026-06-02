import { supabase } from '../supabase';
import i18n from '../i18n';
import {
  DEFAULT_LANGUAGE_CODE,
  LANGUAGE_OPTIONS,
  SUPPORTED_LANGUAGE_CODES,
  getLanguageMeta,
  normalizeLanguageCode,
} from '../i18n/registry';
import { ensureLanguageLoaded } from './translationLoader';
import {
  configureRTLForLanguage,
  getDirectionStatus,
  reloadAppForDirectionChange,
} from './rtlService';

export { LANGUAGE_OPTIONS };
export const SUPPORTED = SUPPORTED_LANGUAGE_CODES;

let changeVersion = 0;
let latestApplyToken = 0;
const listeners = new Set();

function emitLanguageChange(locale, direction) {
  changeVersion += 1;
  listeners.forEach((listener) => listener(locale, changeVersion, direction));
}

export function subscribeLanguageChanges(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function normalizeLanguage(input) {
  return normalizeLanguageCode(input);
}

export function getLanguageLabel(input) {
  return getLanguageMeta(input).label;
}

export function getCurrentLanguage() {
  return normalizeLanguage(i18n.locale);
}

/**
 * Loads and applies the i18n locale from a language input.
 * Returns locale plus direction metadata for callers that need to handle RTL reloads.
 */
export async function applyLanguageDetailed(langInput, options = {}) {
  const token = ++latestApplyToken;
  const code = normalizeLanguage(langInput);
  const loaded = await ensureLanguageLoaded(code);
  const nextLocale = loaded ? code : DEFAULT_LANGUAGE_CODE;

  if (token !== latestApplyToken) {
    const currentLocale = normalizeLanguage(i18n.locale);
    return { locale: currentLocale, direction: getDirectionStatus(currentLocale) };
  }

  i18n.locale = nextLocale;
  const direction = configureRTLForLanguage(nextLocale);
  emitLanguageChange(nextLocale, direction);

  if (options.reloadOnRTLChange && direction.restartRequired) {
    await reloadAppForDirectionChange();
  }

  return { locale: nextLocale, direction };
}

/**
 * Sets the i18n locale from a language input (code, label, or alias).
 * Returns the normalized language code.
 */
export async function applyLanguage(langInput, options = {}) {
  const result = await applyLanguageDetailed(langInput, options);
  return result.locale;
}

export async function fetchCurrentUserLanguage() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) return 'de';

  const { data } = await supabase
    .from('profiles')
    .select('language')
    .eq('id', user.id)
    .maybeSingle();

  return normalizeLanguage(data?.language);
}
