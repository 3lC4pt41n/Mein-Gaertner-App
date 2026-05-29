// contextUtils.js - Sammelt Wetter, Saison, Tageszeit und Standort

import { getCurrentSeason } from './seasonUtils';
import { getLocalDateTime, getTimeOfDay } from './timeUtils';

function getWeatherTemperature(weather) {
  return weather?.temperature ?? weather?.temp ?? null;
}

function getWeatherText(weather) {
  return weather?.weatherText ?? weather?.description ?? null;
}

function getWeatherWindSpeed(weather) {
  return weather?.windSpeed ?? weather?.wind_speed ?? null;
}

export function buildContext({ location, weather } = {}) {
  const now = new Date();
  const normalizedLocation = location
    ? {
        ...location,
        city: location.city || weather?.city || null,
        country: location.country || weather?.country || null,
      }
    : weather?.city
      ? { city: weather.city, country: weather.country || null }
      : null;

  return {
    location: normalizedLocation,
    weather: weather || null,
    season: getCurrentSeason(location?.latitude),
    time: getTimeOfDay(now),
    localDateTime: getLocalDateTime(now),
    localTime: now.toISOString(),
  };
}

export function formatContextForPrompt(context) {
  if (!context) return '';

  const parts = [];
  const city = context.location?.city || context.weather?.city;
  const country = context.location?.country || context.weather?.country;
  const weather = context.weather;
  const weatherText = getWeatherText(weather);
  const temperature = getWeatherTemperature(weather);
  const windSpeed = getWeatherWindSpeed(weather);

  if (city) {
    parts.push(`Ort: ${country ? `${city}, ${country}` : city}`);
  }

  if (weather) {
    const weatherParts = [];
    if (weatherText) weatherParts.push(weatherText);
    if (temperature !== null) weatherParts.push(`${temperature}°C`);
    if (typeof weather.humidity === 'number') weatherParts.push(`Luftfeuchte ${weather.humidity}%`);
    if (windSpeed !== null) weatherParts.push(`Wind ${windSpeed} km/h`);
    if (typeof weather.isDay === 'boolean')
      weatherParts.push(weather.isDay ? 'Tageslicht' : 'Nacht');
    if (weatherParts.length) parts.push(`Wetter: ${weatherParts.join(', ')}`);
  }

  if (context.season) parts.push(`Jahreszeit: ${context.season.name}`);
  if (context.localDateTime) {
    const timezone = context.localDateTime.timeZone ? ` (${context.localDateTime.timeZone})` : '';
    parts.push(
      `Aktuelle lokale Zeit: ${context.localDateTime.timeText}, ${context.localDateTime.dateText}${timezone}`
    );
  } else if (context.time) {
    parts.push(`Aktuelle lokale Zeit: ${context.time.formattedTime || `${context.time.hour} Uhr`}`);
  }
  if (context.time) parts.push(`Tageszeit: ${context.time.name}`);

  return parts.join('\n');
}
