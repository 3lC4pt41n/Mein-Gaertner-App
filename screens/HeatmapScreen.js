/**
 * HeatmapScreen – F3b: World heatmap of plant discoveries.
 *
 * Displays aggregated discovery data on an interactive map.
 * Only opted-in users' data is shown (heatmap_opt_in = true).
 * Coordinates are grid-aggregated (~1 km²) for privacy.
 */
import React, { useEffect, useState, useMemo, useCallback, useRef, Component } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
} from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { fetchHeatmapGrid, fetchDiscoveryStats } from '../services/discoveryService';
import { requestLocationPermission } from '../services/weatherService';
import { useAuth } from '../contexts/AuthContext';
import { t } from '../i18n';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import DSCard from '../theme/DSCard';

// ── Maps API Key validation ──────────────────────────────────────
// Native MapView crashes fatally without a valid key — ErrorBoundary
// can't catch that. Check upfront and show fallback UI instead.
const MAPS_KEY_AVAILABLE = (() => {
  const iosKey = Constants.expoConfig?.ios?.config?.googleMapsApiKey;
  const androidKey = Constants.expoConfig?.android?.config?.googleMaps?.apiKey;
  const key = Platform.OS === 'ios' ? iosKey : androidKey;
  // Placeholder or empty = not configured
  return !!key && key !== 'GOOGLE_MAPS_API_KEY';
})();

// ── Error Boundary for MapView crashes ──────────────────────────────
class MapErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.warn('MapView crashed:', error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="map-outline" size={48} color={colors.textTertiary} />
          <Text
            style={{
              marginTop: 12,
              fontSize: 16,
              fontWeight: '600',
              color: colors.textPrimary,
              textAlign: 'center',
            }}
          >
            {t('heatmap.mapUnavailable') || 'Karte nicht verfügbar'}
          </Text>
          <Text
            style={{ marginTop: 8, fontSize: 14, color: colors.textSecondary, textAlign: 'center' }}
          >
            {t('heatmap.mapUnavailableHint') ||
              'Die Karte konnte nicht geladen werden. Bitte versuche es später erneut.'}
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false })}
            style={{
              marginTop: 16,
              paddingVertical: 10,
              paddingHorizontal: 24,
              backgroundColor: colors.primary,
              borderRadius: 20,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>
              {t('common.retry') || 'Erneut versuchen'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// ── Colour scale for heat circles ──────────────────────────────────
const HEAT_COLORS = [
  'rgba(76, 175, 80, 0.35)', // 1–2 discoveries   (green)
  'rgba(255, 193, 7, 0.40)', // 3–9                (amber)
  'rgba(255, 87, 34, 0.45)', // 10–24              (orange)
  'rgba(244, 67, 54, 0.50)', // 25+                (red)
];

function heatColor(count) {
  if (count >= 25) return HEAT_COLORS[3];
  if (count >= 10) return HEAT_COLORS[2];
  if (count >= 3) return HEAT_COLORS[1];
  return HEAT_COLORS[0];
}

function heatRadius(count) {
  if (count >= 25) return 2400;
  if (count >= 10) return 1800;
  if (count >= 3) return 1200;
  return 800;
}

// ── Default region (central Europe) ────────────────────────────────
const DEFAULT_REGION = {
  latitude: 48.2,
  longitude: 11.8,
  latitudeDelta: 30,
  longitudeDelta: 30,
};

export default function HeatmapScreen() {
  const { userId } = useAuth();
  const mapRef = useRef(null);

  const [grid, setGrid] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [initialRegion, setInitialRegion] = useState(DEFAULT_REGION);

  // ── Load data ──────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [gridData, userStats, location] = await Promise.all([
        fetchHeatmapGrid(),
        userId ? fetchDiscoveryStats(userId) : null,
        requestLocationPermission(),
      ]);

      setGrid(gridData ?? []);
      setStats(userStats);

      // Centre on user location if available
      if (location && !location.denied && location.latitude) {
        setInitialRegion({
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 8,
          longitudeDelta: 8,
        });
      }
    } catch (err) {
      setError(err.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Summary stats ──────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalCells = grid.length;
    const totalDiscoveries = grid.reduce((sum, c) => sum + c.discovery_count, 0);
    const totalSpecies = grid.reduce((sum, c) => sum + c.species_count, 0);
    return { totalCells, totalDiscoveries, totalSpecies };
  }, [grid]);

  // ── Render ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Ionicons name="warning-outline" size={48} color={colors.warning} />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map — key validated + ErrorBoundary to prevent fatal crashes */}
      {!MAPS_KEY_AVAILABLE ? (
        <View style={styles.center}>
          <Ionicons name="map-outline" size={48} color={colors.textTertiary} />
          <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '600', color: colors.textPrimary, textAlign: 'center' }}>
            {t('heatmap.mapUnavailable')}
          </Text>
          <Text style={{ marginTop: 8, fontSize: 14, color: colors.textSecondary, textAlign: 'center' }}>
            {t('heatmap.mapUnavailableHint')}
          </Text>
        </View>
      ) : (
      <MapErrorBoundary>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={initialRegion}
          showsUserLocation
          showsMyLocationButton={Platform.OS === 'android'}
          mapType="standard"
        >
          {grid.map((cell) => (
            <Circle
              key={`${cell.grid_lat}-${cell.grid_lon}`}
              center={{ latitude: cell.grid_lat, longitude: cell.grid_lon }}
              radius={heatRadius(cell.discovery_count)}
              fillColor={heatColor(cell.discovery_count)}
              strokeColor="transparent"
            />
          ))}

          {/* Markers for high-activity cells */}
          {grid
            .filter((c) => c.discovery_count >= 5)
            .map((cell) => (
              <Marker
                key={`m-${cell.grid_lat}-${cell.grid_lon}`}
                coordinate={{ latitude: cell.grid_lat, longitude: cell.grid_lon }}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.markerBubble}>
                  <Text style={styles.markerText}>{cell.discovery_count}</Text>
                </View>
              </Marker>
            ))}
        </MapView>
      </MapErrorBoundary>
      )}

      {/* Stats overlay */}
      <View style={styles.statsOverlay}>
        <DSCard variant="elevated" padding="md">
          <View style={styles.statsRow}>
            <StatBadge
              icon="globe-outline"
              value={summary.totalDiscoveries}
              label={t('heatmap.discoveries')}
            />
            <StatBadge
              icon="leaf-outline"
              value={summary.totalSpecies}
              label={t('heatmap.species')}
            />
            <StatBadge
              icon="location-outline"
              value={summary.totalCells}
              label={t('heatmap.regions')}
            />
          </View>

          {stats && (
            <View style={styles.userRow}>
              <Ionicons name="person-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.userText}>
                {t('heatmap.yourStats', {
                  total: stats.totalDiscoveries,
                  firsts: stats.firstDiscoveries,
                })}
              </Text>
            </View>
          )}
        </DSCard>
      </View>

      {/* Empty state */}
      {grid.length === 0 && (
        <View style={styles.emptyOverlay}>
          <DSCard variant="elevated" padding="lg">
            <View style={styles.emptyContent}>
              <Ionicons name="earth-outline" size={48} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>{t('heatmap.emptyTitle')}</Text>
              <Text style={styles.emptyHint}>{t('heatmap.emptyHint')}</Text>
            </View>
          </DSCard>
        </View>
      )}
    </View>
  );
}

// ── Stat badge sub-component ──────────────────────────────────────
function StatBadge({ icon, value, label }) {
  return (
    <View style={styles.statBadge}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: 14,
  },
  errorText: {
    marginTop: spacing.md,
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
  map: {
    flex: 1,
  },

  // Stats overlay (bottom)
  statsOverlay: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.md,
    right: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statBadge: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  userText: {
    fontSize: 12,
    color: colors.textSecondary,
  },

  // Marker bubble
  markerBubble: {
    backgroundColor: colors.primary,
    borderRadius: radius.round,
    paddingHorizontal: 8,
    paddingVertical: 3,
    ...shadows.sm,
  },
  markerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // Empty state
  emptyOverlay: {
    position: 'absolute',
    top: '35%',
    left: spacing.lg,
    right: spacing.lg,
  },
  emptyContent: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  emptyHint: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
