export const SUPPORTED_LANGUAGES = [
  'de',
  'en',
  'fr',
  'it',
  'es',
  'ru',
  'tr',
  'nl',
  'da',
  'pl',
  'uk',
  'pt-BR',
  'pt-PT',
  'hi',
  'bn',
  'ja',
  'ko',
  'zh-Hans',
  'id',
  'ar',
  'he',
  'fa',
  'ur',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'de';

const LANGUAGE_PROMPT_NAMES: Record<SupportedLanguage, string> = {
  de: 'German (Deutsch)',
  en: 'English',
  fr: 'French (Français)',
  it: 'Italian (Italiano)',
  es: 'Spanish (Español)',
  ru: 'Russian (Русский)',
  tr: 'Turkish (Türkçe)',
  nl: 'Dutch (Nederlands)',
  da: 'Danish (Dansk)',
  pl: 'Polish (Polski)',
  uk: 'Ukrainian (Українська)',
  'pt-BR': 'Brazilian Portuguese (Português do Brasil)',
  'pt-PT': 'European Portuguese (Português de Portugal)',
  hi: 'Hindi (हिन्दी)',
  bn: 'Bengali (বাংলা)',
  ja: 'Japanese (日本語)',
  ko: 'Korean (한국어)',
  'zh-Hans': 'Simplified Chinese (简体中文)',
  id: 'Indonesian (Bahasa Indonesia)',
  ar: 'Arabic (العربية)',
  he: 'Hebrew (עברית)',
  fa: 'Persian (فارسی)',
  ur: 'Urdu (اردو)',
};

const LANGUAGE_ALIASES: Record<string, SupportedLanguage> = {
  de: 'de',
  deutsch: 'de',
  german: 'de',
  deutschland: 'de',
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
  russisch: 'ru',
  tr: 'tr',
  turkish: 'tr',
  türkçe: 'tr',
  turkce: 'tr',
  türkisch: 'tr',
  tuerkisch: 'tr',
  nl: 'nl',
  dutch: 'nl',
  nederlands: 'nl',
  niederländisch: 'nl',
  niederlaendisch: 'nl',
  da: 'da',
  danish: 'da',
  dansk: 'da',
  dänisch: 'da',
  daenisch: 'da',
  pl: 'pl',
  polish: 'pl',
  polski: 'pl',
  polnisch: 'pl',
  uk: 'uk',
  ua: 'uk',
  ukrainian: 'uk',
  ukrainisch: 'uk',
  українська: 'uk',
  pt: 'pt-BR',
  'pt-br': 'pt-BR',
  'pt br': 'pt-BR',
  'pt-brazil': 'pt-BR',
  'pt brazil': 'pt-BR',
  portuguese: 'pt-BR',
  portugiesisch: 'pt-BR',
  português: 'pt-BR',
  portugues: 'pt-BR',
  brasil: 'pt-BR',
  brazil: 'pt-BR',
  'pt-pt': 'pt-PT',
  'pt pt': 'pt-PT',
  'pt-portugal': 'pt-PT',
  'pt portugal': 'pt-PT',
  'portuguese portugal': 'pt-PT',
  'portugiesisch portugal': 'pt-PT',
  hi: 'hi',
  hindi: 'hi',
  hindī: 'hi',
  हिन्दी: 'hi',
  bn: 'bn',
  bengali: 'bn',
  bengalisch: 'bn',
  bangla: 'bn',
  বাংলা: 'bn',
  ja: 'ja',
  japanese: 'ja',
  japanisch: 'ja',
  日本語: 'ja',
  ko: 'ko',
  korean: 'ko',
  koreanisch: 'ko',
  한국어: 'ko',
  zh: 'zh-Hans',
  'zh-cn': 'zh-Hans',
  'zh-hans': 'zh-Hans',
  'zh hans': 'zh-Hans',
  chinese: 'zh-Hans',
  chinesisch: 'zh-Hans',
  'simplified chinese': 'zh-Hans',
  'vereinfachtes chinesisch': 'zh-Hans',
  简体中文: 'zh-Hans',
  id: 'id',
  indonesian: 'id',
  indonesisch: 'id',
  'bahasa indonesia': 'id',
  ar: 'ar',
  arabic: 'ar',
  arabisch: 'ar',
  العربية: 'ar',
  he: 'he',
  iw: 'he',
  hebrew: 'he',
  hebräisch: 'he',
  hebraeisch: 'he',
  עברית: 'he',
  fa: 'fa',
  persian: 'fa',
  persisch: 'fa',
  farsi: 'fa',
  فارسی: 'fa',
  ur: 'ur',
  urdu: 'ur',
  اردو: 'ur',
};

function normalizeAlias(input?: string | null): string {
  return String(input || '')
    .trim()
    .replace(/_/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function getSupportedLanguage(input?: string | null): SupportedLanguage | null {
  const normalized = normalizeAlias(input);
  if (!normalized) return null;

  const direct = LANGUAGE_ALIASES[normalized];
  if (direct) return direct;

  const baseCode = normalized.split('-')[0];
  return LANGUAGE_ALIASES[baseCode] || null;
}

export function isSupportedLanguage(input?: string | null): boolean {
  return getSupportedLanguage(input) !== null;
}

export function normalizeLanguage(input?: string | null): SupportedLanguage {
  return getSupportedLanguage(input) || DEFAULT_LANGUAGE;
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

  return getSupportedLanguage(data?.language) || normalizeLanguage(requestedLanguage);
}
