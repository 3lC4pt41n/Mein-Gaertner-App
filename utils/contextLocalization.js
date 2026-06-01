import i18n from '../i18n';
import { normalizeLanguage } from '../services/languageService';

const SEASON_NAME_TO_KEY = {
  frühling: 'spring',
  fruehling: 'spring',
  spring: 'spring',
  sommer: 'summer',
  summer: 'summer',
  herbst: 'autumn',
  autumn: 'autumn',
  fall: 'autumn',
  winter: 'winter',
};

const TIME_NAME_TO_KEY = {
  morgen: 'morning',
  morning: 'morning',
  vormittag: 'lateMorning',
  latemorning: 'lateMorning',
  middag: 'noon',
  mittag: 'noon',
  noon: 'noon',
  nachmittag: 'afternoon',
  afternoon: 'afternoon',
  abend: 'evening',
  evening: 'evening',
  nacht: 'night',
  night: 'night',
};

function normalizedLookup(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
}

function translate(key, language, options = {}) {
  return i18n.t(key, { ...options, locale: normalizeLanguage(language || i18n.locale) });
}

export function getSeasonKey(season) {
  if (!season) return null;
  if (typeof season === 'string') return SEASON_NAME_TO_KEY[normalizedLookup(season)] || null;
  return season.key || SEASON_NAME_TO_KEY[normalizedLookup(season.name)] || null;
}

export function getTimeOfDayKey(time) {
  if (!time) return null;
  if (typeof time === 'string') return TIME_NAME_TO_KEY[normalizedLookup(time)] || null;
  return time.key || TIME_NAME_TO_KEY[normalizedLookup(time.name)] || null;
}

export function getLocalizedSeasonName(season, language) {
  const key = getSeasonKey(season);
  if (!key) return typeof season === 'string' ? season : season?.name || '';
  return translate(`context.seasons.${key}`, language);
}

export function getLocalizedSeasonalTip(season, language) {
  const key = getSeasonKey(season);
  if (!key) return translate('context.seasonTips.default', language);
  return translate(`context.seasonTips.${key}`, language);
}

export function getLocalizedTimeOfDayName(time, language) {
  const key = getTimeOfDayKey(time);
  if (!key) return typeof time === 'string' ? time : time?.name || '';
  return translate(`context.timeOfDay.${key}`, language);
}

export function getLocalizedContextText(key, language, options = {}) {
  return translate(`context.${key}`, language, options);
}
