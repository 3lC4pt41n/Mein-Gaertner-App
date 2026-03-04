export type SupportedLanguage = 'de' | 'en' | 'fr' | 'it' | 'es' | 'ru';

const LANGUAGE_ALIASES: Record<string, SupportedLanguage> = {
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
  русский: 'ru',
  russian: 'ru',
};

const LANGUAGE_PROMPT_NAMES: Record<SupportedLanguage, string> = {
  de: 'German (Deutsch)',
  en: 'English',
  fr: 'French (Français)',
  it: 'Italian (Italiano)',
  es: 'Spanish (Español)',
  ru: 'Russian (Russisch)',
};

export function normalizeLanguage(input?: string | null): SupportedLanguage {
  if (!input) return 'de';
  const raw = String(input).trim().toLowerCase();
  return LANGUAGE_ALIASES[raw] || 'de';
}

export function getLanguagePromptName(language: SupportedLanguage): string {
  return LANGUAGE_PROMPT_NAMES[language] || LANGUAGE_PROMPT_NAMES.de;
}

export async function getUserLanguage(
  serviceClient: any,
  userId: string,
  requestedLanguage?: string
): Promise<SupportedLanguage> {
  const { data } = await serviceClient
    .from('profiles')
    .select('language')
    .eq('id', userId)
    .maybeSingle();

  return normalizeLanguage(data?.language || requestedLanguage);
}
