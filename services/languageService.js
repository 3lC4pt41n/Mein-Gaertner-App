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

export { LANGUAGE_OPTIONS };
export const SUPPORTED = SUPPORTED_LANGUAGE_CODES;

let changeVersion = 0;
let latestApplyToken = 0;
const listeners = new Set();

function emitLanguageChange(locale) {
  changeVersion += 1;
  listeners.forEach((listener) => listener(locale, changeVersion));
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
 * Sets the i18n locale from a language input (code, label, or alias).
 * Returns the normalized language code.
 */
export async function applyLanguage(langInput) {
  const token = ++latestApplyToken;
  const code = normalizeLanguage(langInput);
  const loaded = await ensureLanguageLoaded(code);
  const nextLocale = loaded ? code : DEFAULT_LANGUAGE_CODE;

  if (token !== latestApplyToken) {
    return normalizeLanguage(i18n.locale);
  }

  i18n.locale = nextLocale;
  emitLanguageChange(nextLocale);
  return nextLocale;
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
