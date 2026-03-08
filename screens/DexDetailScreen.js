import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  Share,
  Alert,
  TouchableOpacity,
} from 'react-native';
import MapView, { Circle } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { fetchSpeciesDetail } from '../services/dexService';
import { fetchHeatmapGridBySpecies, formatDisplayName } from '../services/discoveryService';
import { colors, spacing, radius } from '../theme/tokens';
import { t } from '../i18n';
import { friendlyError } from '../utils/errorMessages';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_HEIGHT = Math.min(SCREEN_WIDTH * 0.75, 340);
const HEATMAP_HEIGHT = 220;
const DEFAULT_SPECIES_REGION = {
  latitude: 48.2,
  longitude: 11.8,
  latitudeDelta: 24,
  longitudeDelta: 24,
};

// Native config sections are not available at runtime via Constants.expoConfig.
// Use the boolean flag exposed through extra by app.config.js instead.
const MAPS_KEY_AVAILABLE = !!Constants.expoConfig?.extra?.googleMapsEnabled;

function heatColor(count) {
  if (count >= 15) return 'rgba(244, 67, 54, 0.50)';
  if (count >= 8) return 'rgba(255, 87, 34, 0.45)';
  if (count >= 3) return 'rgba(255, 193, 7, 0.40)';
  return 'rgba(76, 175, 80, 0.35)';
}

function heatRadius(count) {
  if (count >= 15) return 2200;
  if (count >= 8) return 1600;
  if (count >= 3) return 1100;
  return 750;
}

export default function DexDetailScreen({ route, navigation }) {
  const { speciesId, species: initialSpecies } = route.params ?? {};
  const [species, setSpecies] = useState(initialSpecies || null);
  const [loading, setLoading] = useState(!initialSpecies?.description);
  const [error, setError] = useState(null);
  const [speciesHeatmap, setSpeciesHeatmap] = useState([]);
  const [heatmapLoading, setHeatmapLoading] = useState(true);
  const [heatmapError, setHeatmapError] = useState(null);

  useEffect(() => {
    if (!speciesId) {
      setError(t('dex.speciesNotFound'));
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const detail = await fetchSpeciesDetail(speciesId);
        if (!cancelled && detail) setSpecies((prev) => ({ ...prev, ...detail }));
      } catch (err) {
        if (!cancelled && !species) setError(friendlyError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [speciesId]);

  useEffect(() => {
    if (!speciesId) return;
    let cancelled = false;

    (async () => {
      try {
        setHeatmapLoading(true);
        setHeatmapError(null);
        const grid = await fetchHeatmapGridBySpecies(speciesId);
        if (!cancelled) setSpeciesHeatmap(grid);
      } catch (err) {
        if (!cancelled) {
          setHeatmapError(friendlyError(err));
          setSpeciesHeatmap([]);
        }
      } finally {
        if (!cancelled) setHeatmapLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [speciesId]);

  const heatmapRegion = useMemo(() => {
    if (!speciesHeatmap.length) return DEFAULT_SPECIES_REGION;

    const latitudes = speciesHeatmap.map((cell) => Number(cell.grid_lat)).filter(Number.isFinite);
    const longitudes = speciesHeatmap.map((cell) => Number(cell.grid_lon)).filter(Number.isFinite);

    if (!latitudes.length || !longitudes.length) return DEFAULT_SPECIES_REGION;

    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLon = Math.min(...longitudes);
    const maxLon = Math.max(...longitudes);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: Math.max(6, (maxLat - minLat) * 1.8 + 2),
      longitudeDelta: Math.max(6, (maxLon - minLon) * 1.8 + 2),
    };
  }, [speciesHeatmap]);

  const heatmapSummary = useMemo(() => {
    const totalDiscoveries = speciesHeatmap.reduce(
      (sum, cell) => sum + (Number(cell.discovery_count) || 0),
      0
    );
    return {
      totalDiscoveries,
      totalRegions: speciesHeatmap.length,
    };
  }, [speciesHeatmap]);

  const handleShare = async () => {
    if (!species) return;
    const speciesDisplayName = formatDisplayName(species.canonical_name);
    try {
      await Share.share({
        message: `${speciesDisplayName} — ${t('dex.discoveredBy', { count: Math.max(species.total_discoverers || 0, 1) })} 🌱`,
      });
    } catch (error) {
      const cancelled = error?.code === 'ERR_CANCELED' || error?.message === 'User did not share';
      if (!cancelled) {
        Alert.alert(t('common.error'), t('common.shareFailed'));
      }
    }
  };

  if (error && !species) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger ?? '#e74c3c'} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : null)}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!species) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const displayName = formatDisplayName(species.canonical_name);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero Image (responsive) */}
      {species.image_url ? (
        <Image source={{ uri: species.image_url }} style={styles.heroImage} />
      ) : (
        <View style={styles.heroPlaceholder}>
          <Ionicons name="leaf" size={80} color={colors.primary} />
        </View>
      )}

      {/* Name + Actions Row */}
      <View style={styles.nameRow}>
        <Text style={styles.speciesName}>{displayName}</Text>
        <TouchableOpacity
          onPress={handleShare}
          style={styles.shareButton}
          accessibilityRole="button"
          accessibilityLabel="Share"
        >
          <Ionicons name="share-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* First Discoverer Badge */}
      {species.isFirstDiscoverer && (
        <View style={styles.badgeRow}>
          <Ionicons name="star" size={16} color={colors.gold} />
          <Text style={styles.badgeText}>{t('dex.firstDiscoverer')}</Text>
        </View>
      )}

      {/* Discoverers */}
      <View style={styles.statRow}>
        <Ionicons name="people" size={16} color={colors.textSecondary} />
        <Text style={styles.statText}>
          {species.total_discoverers != null && species.total_discoverers > 0
            ? species.total_discoverers
            : species.discovered
              ? 1
              : 0}{' '}
          {t('dex.discoverers')}
        </Text>
      </View>

      {loading && (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
      )}

      {/* Species Heatmap */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('dex.heatmapTitle')}</Text>

        {heatmapLoading ? (
          <View style={styles.heatmapState}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : heatmapError ? (
          <Text style={styles.heatmapStatusText}>{heatmapError}</Text>
        ) : !MAPS_KEY_AVAILABLE ? (
          <Text style={styles.heatmapStatusText}>{t('dex.heatmapUnavailable')}</Text>
        ) : speciesHeatmap.length === 0 ? (
          <Text style={styles.heatmapStatusText}>{t('dex.heatmapEmpty')}</Text>
        ) : (
          <>
            <View style={styles.heatmapCard}>
              <MapView
                style={styles.heatmapMap}
                initialRegion={heatmapRegion}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                toolbarEnabled={false}
              >
                {speciesHeatmap.map((cell) => (
                  <Circle
                    key={`${cell.grid_lat}-${cell.grid_lon}`}
                    center={{
                      latitude: Number(cell.grid_lat),
                      longitude: Number(cell.grid_lon),
                    }}
                    radius={heatRadius(Number(cell.discovery_count) || 0)}
                    fillColor={heatColor(Number(cell.discovery_count) || 0)}
                    strokeColor="transparent"
                  />
                ))}
              </MapView>
            </View>

            <View style={styles.heatmapMetaRow}>
              <Text style={styles.heatmapMetaText}>
                {t('dex.heatmapDiscoveries', { count: heatmapSummary.totalDiscoveries })}
              </Text>
              <Text style={styles.heatmapMetaDot}>•</Text>
              <Text style={styles.heatmapMetaText}>
                {t('dex.heatmapRegions', { count: heatmapSummary.totalRegions })}
              </Text>
            </View>
          </>
        )}

        <Text style={styles.heatmapHint}>{t('dex.heatmapHint')}</Text>
      </View>

      {/* Description */}
      {typeof species.description === 'string' && species.description ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('dex.description')}</Text>
          <Text style={styles.sectionBody}>{species.description}</Text>
        </View>
      ) : null}

      {/* Care Summary */}
      {typeof species.care_summary === 'string' && species.care_summary ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('dex.careSummary')}</Text>
          <Text style={styles.sectionBody}>{species.care_summary}</Text>
        </View>
      ) : null}

      {/* First Discovered By */}
      {typeof species.first_discoverer === 'object' && species.first_discoverer?.username ? (
        <View style={styles.section}>
          <View style={styles.discovererRow}>
            <Ionicons name="trophy" size={18} color={colors.gold} />
            <Text style={styles.sectionTitle}>{t('dex.firstDiscoveredBy')}</Text>
          </View>
          <Text style={styles.discovererName}>
            {species.first_discoverer.display_name || species.first_discoverer.username}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxxl * 2 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heroImage: {
    width: '100%',
    height: HERO_HEIGHT,
    resizeMode: 'cover',
    backgroundColor: colors.primarySurface,
  },
  heroPlaceholder: {
    width: '100%',
    height: HERO_HEIGHT,
    backgroundColor: colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  speciesName: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  shareButton: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySurface,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.gold,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  statText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  heatmapCard: {
    width: '100%',
    height: HEATMAP_HEIGHT,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.primarySurface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heatmapMap: {
    flex: 1,
  },
  heatmapState: {
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heatmapStatusText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  heatmapHint: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.textTertiary,
  },
  heatmapMetaRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  heatmapMetaText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  heatmapMetaDot: {
    marginHorizontal: spacing.xs,
    color: colors.textTertiary,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  sectionBody: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  discovererRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  discovererName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  errorText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    marginHorizontal: spacing.xl,
  },
  backButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.primarySurface,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
});
