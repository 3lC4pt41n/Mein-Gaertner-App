import i18n from '../i18n';
import { normalizeLanguage } from '../services/languageService';

const LOCAL_NAME_KEYS = {
  de: ['Deutscher Name', 'Deutscher Trivialname', 'Trivialname', 'Volksname', 'Gemeiner Name'],
  en: ['Common Name', 'Common name', 'English name', 'Vernacular Name'],
  fr: ['Nom commun', 'Nom vulgaire'],
  it: ['Nome comune', 'Nome volgare'],
  es: ['Nombre común', 'Nombre comun', 'Nombre vulgar'],
  ru: ['Народное название', 'Обычное название', 'Распространённое название'],
  tr: ['Yaygın Ad', 'Yaygın ad', 'Yerel ad'],
};

const BOTANICAL_NAME_KEYS = {
  de: ['Botanischer Name', 'Wissenschaftlicher Name', 'Lateinischer Name'],
  en: ['Botanical Name', 'Scientific Name', 'Scientific name', 'Latin Name'],
  fr: ['Nom botanique', 'Nom scientifique'],
  it: ['Nome botanico', 'Nome scientifico'],
  es: ['Nombre botánico', 'Nombre científico'],
  ru: ['Ботаническое название', 'Научное название'],
  tr: ['Botanik Ad', 'Bilimsel ad'],
};

const LOCAL_FIELD_KEYS = [
  'local_name',
  'localName',
  'common_name',
  'commonName',
  'vernacular_name',
  'vernacularName',
  'display_name',
  'displayName',
  'deutscher_name',
  'deutscherName',
];

const BOTANICAL_FIELD_KEYS = [
  'botanical_name',
  'botanicalName',
  'scientific_name',
  'scientificName',
  'latin_name',
  'latinName',
];

const EMPTY_DETAIL_VALUES = new Set([
  '-',
  '—',
  'n/a',
  'na',
  'unknown',
  'unbekannt',
  'keine angabe',
  'nicht bekannt',
]);

export function normalizePlantName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function cleanDetailValue(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (!cleaned || EMPTY_DETAIL_VALUES.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

function normalizeDetailKey(value) {
  return normalizePlantName(value).replace(/[^\p{L}\p{N}]+/gu, '');
}

function findValueByKeys(source, keys) {
  if (!source || typeof source !== 'object') return null;

  for (const key of keys) {
    const value = cleanDetailValue(source[key]);
    if (value) return value;
  }

  const normalizedTargets = new Set(keys.map(normalizeDetailKey));
  for (const [key, value] of Object.entries(source)) {
    if (normalizedTargets.has(normalizeDetailKey(key))) {
      const cleaned = cleanDetailValue(value);
      if (cleaned) return cleaned;
    }
  }

  return null;
}

function localizedKeyList(keys, language = i18n.locale) {
  const normalizedLanguage = normalizeLanguage(language);
  const preferredKeys = keys[normalizedLanguage] || [];
  const candidateKeys = [
    ...preferredKeys,
    ...Object.values(keys)
      .flat()
      .filter((key) => !preferredKeys.includes(key)),
  ].filter(Boolean);

  return [...new Set(candidateKeys)];
}

function pickLocalizedOverviewValue(overview, keys, language = i18n.locale) {
  return findValueByKeys(overview, localizedKeyList(keys, language));
}

function pickDirectValue(details, fieldKeys) {
  const sources = [details, details?.species, details?.plant, details?.identification].filter(
    Boolean
  );
  for (const source of sources) {
    const value = findValueByKeys(source, fieldKeys);
    if (value) return value;
  }
  return null;
}

export function extractLocalSpeciesName(details, language = i18n.locale) {
  const overview = details?.overview;
  return (
    pickDirectValue(details, LOCAL_FIELD_KEYS) ||
    pickLocalizedOverviewValue(overview, LOCAL_NAME_KEYS, language)
  );
}

export function extractBotanicalSpeciesName(details, language = i18n.locale) {
  const overview = details?.overview;
  return (
    pickDirectValue(details, BOTANICAL_FIELD_KEYS) ||
    pickLocalizedOverviewValue(overview, BOTANICAL_NAME_KEYS, language)
  );
}

export function getPlantTitleParts(plant, language = i18n.locale) {
  const details = plant?.details || null;
  const botanicalName =
    extractBotanicalSpeciesName(details, language) || cleanDetailValue(plant?.name) || '?';
  const localName = extractLocalSpeciesName(details, language);

  return {
    botanicalName,
    localName:
      localName && normalizePlantName(localName) !== normalizePlantName(botanicalName)
        ? localName
        : null,
  };
}
