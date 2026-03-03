/**
 * Weather Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Permission handling (2026-03-13):
 *   Location permission denial is propagated as a structured status object
 *   `{ denied: true }` through the entire call chain:
 *     requestLocationPermission → getLocation → getCurrentWeather/getWeatherForecast → getWeatherForTasks
 *
 *   This allows the UI (WeatherWidget) to distinguish between:
 *     - Permission denied → show "open settings" CTA
 *     - Service unavailable → show generic retry CTA
 *
 *   No API requests are made when location is denied (saves bandwidth/quota).
 *
 * Caching:
 *   - Weather data: CACHE_TTL (1h) via AsyncStorage
 *   - Location: LOCATION_TTL (30min) to avoid excessive GPS polls
 * ─────────────────────────────────────────────────────────────────────────────
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { SUPABASE_URL, supabase } from '../supabase.js';

// API Configuration - use Supabase Edge Function proxy
const SUPABASE_WEATHER_PROXY = `${SUPABASE_URL}/functions/v1/weather-proxy`;

/**
 * Get current session token for authenticated requests
 */
const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
};

// Cache Configuration
const CACHE_KEY_WEATHER = '@weather_current';
const CACHE_KEY_FORECAST = '@weather_forecast';
const CACHE_KEY_LOCATION = '@user_location';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const LOCATION_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Check if cached data is still valid
 */
const isCacheValid = (timestamp) => {
  if (!timestamp) return false;
  return Date.now() - timestamp < CACHE_TTL;
};

/**
 * Request location permission and get user location
 */
export const requestLocationPermission = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== 'granted') {
      console.warn('Location permission denied');
      return { denied: true };
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const { latitude, longitude } = location.coords;

    // Save to AsyncStorage
    await AsyncStorage.setItem(
      CACHE_KEY_LOCATION,
      JSON.stringify({
        latitude,
        longitude,
        timestamp: Date.now(),
      })
    );

    return { latitude, longitude };
  } catch (error) {
    console.warn('Error requesting location:', error.message);
    return null;
  }
};

/**
 * Get cached location or request new one
 */
const getLocation = async () => {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY_LOCATION);
    if (cached) {
      const { latitude, longitude, timestamp } = JSON.parse(cached);
      if (timestamp && Date.now() - timestamp < LOCATION_TTL) {
        return { latitude, longitude };
      }
    }

    return await requestLocationPermission();
  } catch (error) {
    console.warn('Error getting location:', error.message);
    return null;
  }
};

/**
 * Fetch current weather from Supabase Weather Proxy
 */
const fetchWeatherFromAPI = async (latitude, longitude) => {
  try {
    const url = `${SUPABASE_WEATHER_PROXY}?lat=${latitude}&lon=${longitude}&type=current&units=metric`;
    const headers = await getAuthHeaders();
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      temp: Math.round(data.main.temp),
      feels_like: Math.round(data.main.feels_like),
      humidity: data.main.humidity,
      description: data.weather[0].main,
      icon: data.weather[0].icon,
      rain_mm: data.rain?.['1h'] || 0,
      wind_speed: Math.round(data.wind.speed * 10) / 10,
      city: data.name,
      country: data.sys.country,
    };
  } catch (error) {
    console.warn('Error fetching weather from API:', error.message);
    return null;
  }
};

/**
 * Fetch weather forecast from Supabase Weather Proxy
 */
const fetchForecastFromAPI = async (latitude, longitude, days = 5) => {
  try {
    const url = `${SUPABASE_WEATHER_PROXY}?lat=${latitude}&lon=${longitude}&type=forecast&units=metric`;
    const headers = await getAuthHeaders();
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const dailyForecasts = {};

    // Group forecasts by day
    data.list.forEach((item) => {
      const date = new Date(item.dt * 1000).toISOString().split('T')[0];

      if (!dailyForecasts[date]) {
        dailyForecasts[date] = {
          date,
          temps: [],
          descriptions: [],
          icons: [],
          rain_probability: 0,
          rain_mm: 0,
        };
      }

      dailyForecasts[date].temps.push(item.main.temp);
      dailyForecasts[date].descriptions.push(item.weather[0].main);
      dailyForecasts[date].icons.push(item.weather[0].icon);
      dailyForecasts[date].rain_probability = Math.max(
        dailyForecasts[date].rain_probability,
        (item.pop || 0) * 100
      );
      dailyForecasts[date].rain_mm += item.rain?.['3h'] || 0;
    });

    // Convert to array and limit to specified days
    return Object.values(dailyForecasts)
      .slice(0, days)
      .map((day) => ({
        date: day.date,
        temp_min: Math.round(Math.min(...day.temps)),
        temp_max: Math.round(Math.max(...day.temps)),
        description: day.descriptions[0],
        icon: day.icons[0],
        rain_probability: Math.round(day.rain_probability),
        rain_mm: Math.round(day.rain_mm * 10) / 10,
      }));
  } catch (error) {
    console.warn('Error fetching forecast from API:', error.message);
    return null;
  }
};

/**
 * Get current weather with caching
 */
export const getCurrentWeather = async () => {
  try {
    // Check cache first
    const cached = await AsyncStorage.getItem(CACHE_KEY_WEATHER);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (isCacheValid(timestamp)) {
        return data;
      }
    }

    // Get location
    const location = await getLocation();
    if (!location || location.denied) {
      console.warn('No location available for weather');
      return location?.denied ? { denied: true } : null;
    }

    // Fetch from API
    const weather = await fetchWeatherFromAPI(location.latitude, location.longitude);

    if (weather) {
      // Cache the result
      await AsyncStorage.setItem(
        CACHE_KEY_WEATHER,
        JSON.stringify({
          data: weather,
          timestamp: Date.now(),
        })
      );
    }

    return weather;
  } catch (error) {
    console.warn('Error getting current weather:', error.message);
    return null;
  }
};

/**
 * Get weather forecast with caching
 */
export const getWeatherForecast = async (days = 5) => {
  try {
    // Check cache first
    const cached = await AsyncStorage.getItem(CACHE_KEY_FORECAST);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (isCacheValid(timestamp)) {
        return data;
      }
    }

    // Get location
    const location = await getLocation();
    if (!location || location.denied) {
      console.warn('No location available for forecast');
      return location?.denied ? { denied: true } : null;
    }

    // Fetch from API
    const forecast = await fetchForecastFromAPI(
      location.latitude,
      location.longitude,
      days
    );

    if (forecast) {
      // Cache the result
      await AsyncStorage.setItem(
        CACHE_KEY_FORECAST,
        JSON.stringify({
          data: forecast,
          timestamp: Date.now(),
        })
      );
    }

    return forecast;
  } catch (error) {
    console.warn('Error getting weather forecast:', error.message);
    return null;
  }
};

/**
 * Get weather conditions relevant for gardening tasks
 */
export const getWeatherForTasks = async () => {
  try {
    const weather = await getCurrentWeather();

    if (!weather || weather.denied) {
      return weather?.denied ? { denied: true } : null;
    }

    const forecast = await getWeatherForecast(1);

    const temperature = weather.temp;
    const isRainy = weather.rain_mm > 0 || (forecast && forecast[0]?.rain_probability > 50);
    const isFrosty = temperature < 2;
    const isHot = temperature > 30;

    const rainForecast24h = forecast
      ? forecast[0]?.rain_mm || 0
      : weather.rain_mm;

    return {
      isRainy,
      isFrosty,
      isHot,
      temperature,
      rainForecast24h,
    };
  } catch (error) {
    console.warn('Error getting weather for tasks:', error.message);
    return null;
  }
};

/**
 * Clear all cached weather data
 */
export const clearWeatherCache = async () => {
  try {
    await AsyncStorage.multiRemove([
      CACHE_KEY_WEATHER,
      CACHE_KEY_FORECAST,
    ]);
  } catch (error) {
    console.warn('Error clearing weather cache:', error.message);
  }
};
