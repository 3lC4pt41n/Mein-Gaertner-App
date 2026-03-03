import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentWeather, getWeatherForTasks } from '../services/weatherService';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import { t } from '../i18n';

/**
 * Map weather icon codes to Ionicons names
 */
const getWeatherIcon = (iconCode, description) => {
  const iconMap = {
    '01d': 'sunny',
    '01n': 'moon',
    '02d': 'partly-sunny',
    '02n': 'partly-sunny-night',
    '03d': 'cloudy',
    '03n': 'cloudy',
    '04d': 'cloudy',
    '04n': 'cloudy',
    '09d': 'rainy',
    '09n': 'rainy',
    '10d': 'rainy',
    '10n': 'rainy',
    '11d': 'thunderstorm',
    '11n': 'thunderstorm',
    '13d': 'snow',
    '13n': 'snow',
    '50d': 'water',
    '50n': 'water',
  };

  // Map description to icon if code mapping fails
  const descriptionMap = {
    'Sunny': 'sunny',
    'Clear': 'sunny',
    'Partly cloudy': 'partly-sunny',
    'Cloudy': 'cloudy',
    'Overcast': 'cloudy',
    'Rainy': 'rainy',
    'Rain': 'rainy',
    'Light rain': 'rainy',
    'Heavy rain': 'rainy',
    'Thunderstorm': 'thunderstorm',
    'Thunderstorms': 'thunderstorm',
    'Snow': 'snow',
    'Light snow': 'snow',
    'Heavy snow': 'snow',
    'Sleet': 'snow',
    'Fog': 'water',
    'Mist': 'water',
    'Haze': 'water',
  };

  return iconMap[iconCode] || descriptionMap[description] || 'cloud';
};

const WeatherWidget = () => {
  const [weather, setWeather] = useState(null);
  const [weatherTasks, setWeatherTasks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadWeather = async () => {
    setLoading(true);
    setError(null);
    try {
      const [currentWeather, tasksWeather] = await Promise.all([
        getCurrentWeather(),
        getWeatherForTasks(),
      ]);

      setWeather(currentWeather);
      setWeatherTasks(tasksWeather);
    } catch (err) {
      console.warn('Error loading weather in widget:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWeather();

    // Refresh weather every 30 minutes
    const interval = setInterval(loadWeather, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (!weather || !weatherTasks) {
    return (
      <TouchableOpacity
        style={styles.errorCard}
        onPress={loadWeather}
        accessibilityRole="button"
        accessibilityLabel={t('weather.tapToRetry')}
      >
        <Ionicons name="cloud-offline-outline" size={24} color={colors.textTertiary} />
        <Text style={styles.errorText}>{t('weather.unavailable')}</Text>
        <Text style={styles.errorHint}>{t('weather.tapToRetry')}</Text>
      </TouchableOpacity>
    );
  }

  const iconName = getWeatherIcon(weather.icon, weather.description);

  return (
    <View style={styles.card}>
      {/* Left: Weather Icon */}
      <View style={styles.iconContainer}>
        <Ionicons name={iconName} size={48} color={colors.primary} />
      </View>

      {/* Center: Temperature and Description */}
      <View style={styles.centerContainer}>
        <Text style={styles.temperature}>{weather.temp}°C</Text>
        <Text style={styles.city}>{weather.city}</Text>
        <Text style={styles.description}>{weather.description}</Text>
      </View>

      {/* Right: Humidity and Badges */}
      <View style={styles.rightContainer}>
        <View style={styles.humidityContainer}>
          <Ionicons name="water" size={16} color={colors.info} />
          <Text style={styles.humidity}>{weather.humidity}%</Text>
        </View>

        <View style={styles.badgesContainer}>
          {weatherTasks.isRainy && (
            <View style={styles.badge_rain}>
              <Ionicons name="rainy" size={12} color={colors.info} />
              <Text style={styles.badgeText_rain}>{t('weather.rain')}</Text>
            </View>
          )}

          {weatherTasks.isFrosty && (
            <View style={styles.badge_frost}>
              <Ionicons name="snow" size={12} color={colors.surface} />
              <Text style={styles.badgeText_frost}>{t('weather.frost')}</Text>
            </View>
          )}

          {weatherTasks.isHot && (
            <View style={styles.badge_heat}>
              <Ionicons name="sunny" size={12} color={colors.surface} />
              <Text style={styles.badgeText_heat}>{t('weather.heat')}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    gap: spacing.sm,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: colors.textTertiary,
  },
  errorHint: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    alignItems: 'center',
    ...shadows.md,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  temperature: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  city: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  description: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  rightContainer: {
    marginLeft: spacing.md,
    alignItems: 'flex-end',
  },
  humidityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  humidity: {
    marginLeft: spacing.xs,
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  badgesContainer: {
    gap: spacing.xs,
  },
  badge_rain: {
    flexDirection: 'row',
    backgroundColor: colors.infoSurface,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    gap: spacing.xs,
  },
  badgeText_rain: {
    fontSize: 10,
    color: colors.info,
    fontWeight: '600',
  },
  badge_frost: {
    flexDirection: 'row',
    backgroundColor: colors.dangerSurface,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    gap: spacing.xs,
  },
  badgeText_frost: {
    fontSize: 10,
    color: colors.danger,
    fontWeight: '600',
  },
  badge_heat: {
    flexDirection: 'row',
    backgroundColor: colors.warningSurface,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    gap: spacing.xs,
  },
  badgeText_heat: {
    fontSize: 10,
    color: colors.warning,
    fontWeight: '600',
  },
});

export default WeatherWidget;
