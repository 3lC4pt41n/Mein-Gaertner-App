import { supabase } from '../supabase';
import i18n from '../i18n';

export const LANGUAGE_OPTIONS = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'es', label: 'Español' },
  { code: 'ru', label: 'Русский' },
  { code: 'tr', label: 'Türkçe' },
];

const LANGUAGE_ALIAS_TO_CODE = {
  de: 'de',
  deutsch: 'de',
  german: 'de',
  en: 'en',
  english: 'en',
  englisch: 'en',
  fr: 'fr',
  francais: 'fr',
  français: 'fr',
  french: 'fr',
  franzoesisch: 'fr',
  französisch: 'fr',
  it: 'it',
  italian: 'it',
  italiano: 'it',
  italienisch: 'it',
  es: 'es',
  espanol: 'es',
  español: 'es',
  spanish: 'es',
  spanisch: 'es',
  ru: 'ru',
  russian: 'ru',
  русский: 'ru',
  russisch: 'ru',
  tr: 'tr',
  turkish: 'tr',
  türkçe: 'tr',
  türkisch: 'tr',
};

export function normalizeLanguage(input) {
  if (!input) return 'de';
  const raw = String(input).trim().toLowerCase();
  return LANGUAGE_ALIAS_TO_CODE[raw] || 'de';
}

export function getLanguageLabel(input) {
  const code = normalizeLanguage(input);
  return LANGUAGE_OPTIONS.find((opt) => opt.code === code)?.label || 'Deutsch';
}

/**
 * Sets the i18n locale from a language input (code, label, or alias).
 * Returns the normalized language code.
 */
export function applyLanguage(langInput) {
  const code = normalizeLanguage(langInput);
  i18n.locale = code;
  return code;
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
