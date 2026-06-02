export const DEFAULT_LANGUAGE_CODE = 'de';

export const LANGUAGES = [
  {
    code: 'de',
    label: 'Deutsch',
    rtl: false,
    aliases: ['deutsch', 'german', 'deutschland'],
  },
  {
    code: 'en',
    label: 'English',
    rtl: false,
    aliases: ['english', 'englisch'],
  },
  {
    code: 'fr',
    label: 'Français',
    rtl: false,
    aliases: ['francais', 'français', 'french', 'franzoesisch', 'französisch'],
  },
  {
    code: 'it',
    label: 'Italiano',
    rtl: false,
    aliases: ['italian', 'italiano', 'italienisch'],
  },
  {
    code: 'es',
    label: 'Español',
    rtl: false,
    aliases: ['espanol', 'español', 'spanish', 'spanisch'],
  },
  {
    code: 'ru',
    label: 'Русский',
    rtl: false,
    aliases: ['russian', 'русский', 'russisch'],
  },
  {
    code: 'tr',
    label: 'Türkçe',
    rtl: false,
    aliases: ['turkish', 'türkçe', 'turkce', 'türkisch', 'tuerkisch'],
  },
  {
    code: 'nl',
    label: 'Nederlands',
    rtl: false,
    aliases: ['dutch', 'niederländisch', 'niederlaendisch', 'nederlands'],
  },
  {
    code: 'da',
    label: 'Dansk',
    rtl: false,
    aliases: ['danish', 'dänisch', 'daenisch', 'dansk'],
  },
  {
    code: 'pl',
    label: 'Polski',
    rtl: false,
    aliases: ['polish', 'polnisch', 'polski'],
  },
  {
    code: 'uk',
    label: 'Українська',
    rtl: false,
    aliases: ['ua', 'ukrainian', 'ukrainisch', 'українська'],
  },
  {
    code: 'pt-BR',
    label: 'Português (BR)',
    rtl: false,
    aliases: ['pt', 'pt-br', 'portuguese', 'portugiesisch', 'português', 'brasil'],
  },
  {
    code: 'pt-PT',
    label: 'Português (PT)',
    rtl: false,
    aliases: ['pt-pt', 'portuguese portugal', 'portugiesisch portugal'],
  },
  {
    code: 'hi',
    label: 'हिन्दी',
    rtl: false,
    aliases: ['hindi', 'hindī', 'hindi deutsch', 'हिन्दी'],
  },
  {
    code: 'bn',
    label: 'বাংলা',
    rtl: false,
    aliases: ['bengali', 'bengalisch', 'bangla', 'বাংলা'],
  },
  {
    code: 'ja',
    label: '日本語',
    rtl: false,
    aliases: ['japanese', 'japanisch', '日本語'],
  },
  {
    code: 'ko',
    label: '한국어',
    rtl: false,
    aliases: ['korean', 'koreanisch', '한국어'],
  },
  {
    code: 'zh-Hans',
    label: '简体中文',
    rtl: false,
    aliases: [
      'zh',
      'zh-cn',
      'chinese',
      'chinesisch',
      'simplified chinese',
      'vereinfachtes chinesisch',
    ],
  },
  {
    code: 'id',
    label: 'Bahasa Indonesia',
    rtl: false,
    aliases: ['indonesian', 'indonesisch', 'bahasa indonesia'],
  },
  {
    code: 'ar',
    label: 'العربية',
    rtl: true,
    aliases: ['arabic', 'arabisch', 'العربية'],
  },
  {
    code: 'he',
    label: 'עברית',
    rtl: true,
    aliases: ['iw', 'hebrew', 'hebräisch', 'hebraeisch', 'עברית'],
  },
  {
    code: 'fa',
    label: 'فارسی',
    rtl: true,
    aliases: ['persian', 'persisch', 'farsi', 'فارسی'],
  },
  {
    code: 'ur',
    label: 'اردو',
    rtl: true,
    aliases: ['urdu', 'اردو'],
  },
];

export const SUPPORTED_LANGUAGE_CODES = LANGUAGES.map((language) => language.code);

export const LANGUAGE_OPTIONS = LANGUAGES.map(({ code, label }) => ({ code, label }));

export const LANGUAGE_FALLBACKS = {
  'pt-PT': 'pt-BR',
};

function normalizeAlias(input) {
  return String(input || '')
    .trim()
    .replace(/_/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const LANGUAGE_ALIAS_TO_CODE = LANGUAGES.reduce((aliases, language) => {
  aliases[normalizeAlias(language.code)] = language.code;
  language.aliases.forEach((alias) => {
    aliases[normalizeAlias(alias)] = language.code;
  });
  return aliases;
}, {});

export function getSupportedLanguageCode(input) {
  const normalized = normalizeAlias(input);
  if (!normalized) return null;
  if (LANGUAGE_ALIAS_TO_CODE[normalized]) return LANGUAGE_ALIAS_TO_CODE[normalized];

  const baseCode = normalized.split('-')[0];
  return LANGUAGE_ALIAS_TO_CODE[baseCode] || null;
}

export function normalizeLanguageCode(input) {
  return getSupportedLanguageCode(input) || DEFAULT_LANGUAGE_CODE;
}

export function getLanguageMeta(input) {
  const code = normalizeLanguageCode(input);
  return LANGUAGES.find((language) => language.code === code) || LANGUAGES[0];
}

export function isSupportedLanguage(input) {
  return Boolean(getSupportedLanguageCode(input));
}
