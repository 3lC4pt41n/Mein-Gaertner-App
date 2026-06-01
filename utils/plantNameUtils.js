import i18n from '../i18n';
import { normalizeLanguage } from '../services/languageService';

const LOCAL_NAME_KEYS = {
  de: 'Deutscher Name',
  en: 'Common Name',
  fr: 'Nom commun',
  it: 'Nome comune',
  es: 'Nombre común',
  ru: 'Народное название',
  tr: 'Yaygın Ad',
};

const BOTANICAL_NAME_KEYS = {
  de: 'Botanischer Name',
  en: 'Botanical Name',
  fr: 'Nom botanique',
  it: 'Nome botanico',
  es: 'Nombre botánico',
  ru: 'Ботаническое название',
  tr: 'Botanik Ad',
};

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

function pickLocalizedOverviewValue(overview, keys, language = i18n.locale) {
  if (!overview || typeof overview !== 'object') return null;

  const normalizedLanguage = normalizeLanguage(language);
  const preferredKey = keys[normalizedLanguage];
  const candidateKeys = [
    preferredKey,
    ...Object.values(keys).filter((key) => key !== preferredKey),
  ].filter(Boolean);

  for (const key of candidateKeys) {
    const value = cleanDetailValue(overview[key]);
    if (value) return value;
  }

  return null;
}

export function extractLocalSpeciesName(details, language = i18n.locale) {
  const overview = details?.overview;
  return pickLocalizedOverviewValue(overview, LOCAL_NAME_KEYS, language);
}

function extractBotanicalSpeciesName(details, language = i18n.locale) {
  const overview = details?.overview;
  return pickLocalizedOverviewValue(overview, BOTANICAL_NAME_KEYS, language);
}

export function getPlantTitleParts(plant, language = i18n.locale) {
  const details = plant?.details || null;
  const botanicalName =
    cleanDetailValue(plant?.name) || extractBotanicalSpeciesName(details, language) || '?';
  const localName = extractLocalSpeciesName(details, language);

  return {
    botanicalName,
    localName:
      localName && normalizePlantName(localName) !== normalizePlantName(botanicalName)
        ? localName
        : null,
  };
}
