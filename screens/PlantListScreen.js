import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  LayoutAnimation,
  UIManager,
  Platform,
  StyleSheet,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import { supabase } from '../supabase';
import { Ionicons } from '@expo/vector-icons';
import { fetchPlants } from '../services/plantService';
import { getPlantImageUrls, getPlantImageUrl } from '../services/uploadService';
import { fetchPlantDetailsMapForLanguage } from '../services/plantDetailsService';
import { normalizeLanguage } from '../services/languageService';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import { t } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import { extractPlantSummary, getPlantTitleParts } from '../utils/plantNameUtils';
import {
  getLocalizedContextText,
  getLocalizedSeasonName,
  getLocalizedSeasonalTip,
} from '../utils/contextLocalization';

// Native animation auf Android aktivieren
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * PlantImage – shows the plant thumbnail, resolving storage paths on-demand
 * when the batch-signed URL is missing (e.g. freshly uploaded images).
 */
function PlantImage({ uri, style, placeholderStyle }) {
  const isHttp = uri && (uri.startsWith('http://') || uri.startsWith('https://'));
  const [resolved, setResolved] = useState(isHttp ? uri : null);

  useEffect(() => {
    if (uri && !isHttp) {
      getPlantImageUrl(uri).then((url) => {
        if (url) setResolved(url);
      });
    }
  }, [uri]);

  if (resolved) {
    return (
      <ExpoImage
        source={{ uri: resolved }}
        style={style}
        contentFit="cover"
        cachePolicy="disk"
        transition={200}
        placeholder={{ blurhash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.' }}
        placeholderContentFit="cover"
      />
    );
  }
  return (
    <View style={placeholderStyle}>
      <Ionicons name="leaf-outline" size={32} color={colors.textTertiary} />
    </View>
  );
}

function getContextTip(context, language) {
  const weather = context?.weather;
  const season = context?.season;
  const temperature = weather?.temperature ?? weather?.temp;
  const roundedTemperature =
    typeof temperature === 'number' ? Math.round(temperature * 10) / 10 : null;

  if (typeof temperature === 'number' && temperature > 30) {
    return {
      icon: 'sunny-outline',
      title: getLocalizedContextText('hotTitle', language),
      body: getLocalizedContextText('hotBody', language, { temperature: roundedTemperature }),
    };
  }

  if (typeof temperature === 'number' && temperature < 2) {
    return {
      icon: 'snow-outline',
      title: getLocalizedContextText('frostTitle', language),
      body: getLocalizedContextText('frostBody', language, { temperature: roundedTemperature }),
    };
  }

  if (weather?.rain_mm > 0) {
    return {
      icon: 'rainy-outline',
      title: getLocalizedContextText('rainTitle', language),
      body: getLocalizedContextText('rainBody', language),
    };
  }

  if (season) {
    return {
      icon: 'leaf-outline',
      title: `${season.icon} ${getLocalizedSeasonName(season, language)}`,
      body: getLocalizedSeasonalTip(season, language),
    };
  }

  return {
    icon: 'time-outline',
    title: getLocalizedContextText('activeTitle', language),
    body: getLocalizedContextText('activeBody', language),
  };
}

function PlantTitle({ plant, language, compact = false }) {
  const { botanicalName, localName } = getPlantTitleParts(plant, language);

  if (!localName) {
    return (
      <Text
        style={compact ? styles.zonePlantName : styles.plantName}
        numberOfLines={compact ? 1 : 2}
      >
        {botanicalName}
      </Text>
    );
  }

  return (
    <View>
      <Text
        style={compact ? styles.zonePlantLocalName : styles.plantLocalName}
        numberOfLines={compact ? 1 : 2}
      >
        {localName}
      </Text>
      <Text
        style={compact ? styles.zonePlantBotanicalName : styles.plantBotanicalName}
        numberOfLines={1}
      >
        {botanicalName}
      </Text>
    </View>
  );
}

function PlantSummary({ plant, language, compact = false }) {
  const summary = extractPlantSummary(plant.details, language);
  if (!summary) return null;
  return (
    <Text style={compact ? styles.zonePlantNote : styles.plantNote} numberOfLines={compact ? 1 : 2}>
      {summary}
    </Text>
  );
}

async function attachLocalizedDetails(plants, language) {
  if (!plants?.length) return plants;

  try {
    const detailsByPlant = await fetchPlantDetailsMapForLanguage(plants, language);
    return plants.map((plant) => ({
      ...plant,
      details: detailsByPlant[plant.id] || null,
    }));
  } catch (error) {
    console.warn('[PlantList] localized details load failed:', error?.message);
    return plants.map((plant) => ({ ...plant, details: null }));
  }
}

async function fetchSpeciesCanonicalNames(plants) {
  const speciesIds = [...new Set((plants || []).map((plant) => plant?.species_id).filter(Boolean))];
  if (speciesIds.length === 0) return {};

  const { data, error } = await supabase
    .from('species')
    .select('id, canonical_name')
    .in('id', speciesIds);

  if (error) {
    console.warn('[PlantList] species canonical names load failed:', error?.message);
    return {};
  }

  return Object.fromEntries((data || []).map((row) => [row.id, row.canonical_name]));
}

// Fetch plants, healthscores & signed URLs in parallel (nicht sequentiell!)
async function getPlantsWithHealthscores(userId, language) {
  const result = await fetchPlants(userId);
  const plants = result?.data ?? result ?? [];

  if (plants.length === 0) {
    return plants;
  }

  // Healthchecks + Signed URLs PARALLEL laden (statt sequentiell)
  const plantIds = plants.map((p) => p.id);
  const rawUrls = plants.map((p) => p.image_url);

  const [{ data: healthchecks }, resolvedUrls, detailsByPlant, speciesNames] = await Promise.all([
    supabase
      .from('plant_healthchecks')
      .select('plant_id, healthscore')
      .in('plant_id', plantIds)
      .order('created_at', { ascending: false }),
    getPlantImageUrls(rawUrls),
    fetchPlantDetailsMapForLanguage(plants, language).catch((error) => {
      console.warn('[PlantList] localized details load failed:', error?.message);
      return {};
    }),
    fetchSpeciesCanonicalNames(plants),
  ]);

  // Create a map of plant_id -> latest healthscore
  const healthscoreMap = {};
  if (healthchecks) {
    for (let hc of healthchecks) {
      if (!healthscoreMap[hc.plant_id]) {
        healthscoreMap[hc.plant_id] = hc.healthscore;
      }
    }
  }

  // Merge healthscores + resolved URLs into plants
  return plants.map((plant, i) => ({
    ...plant,
    image_url: resolvedUrls[i] || plant.image_url,
    details: detailsByPlant[plant.id] || null,
    canonical_name: speciesNames[plant.species_id] || plant.canonical_name || null,
    healthscore: healthscoreMap[plant.id] ?? null,
  }));
}

// Pflanzen gruppiert nach location > zones > plants
// Fetches ALL assigned plants directly from DB (not limited by pagination)
async function getGroupedPlants(userId, language) {
  // Locations laden, dann Zones (Zones braucht Location-IDs)
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name')
    .eq('user_id', userId);

  const locIds = (locations || []).map((l) => l.id);
  if (!locIds.length) return [];

  const { data: zones } = await supabase
    .from('zones')
    .select('id, name, location_id')
    .in('location_id', locIds);

  const zoneIds = (zones || []).map((z) => z.id);
  if (!zoneIds.length) {
    return (locations || []).map((location) => ({
      ...location,
      zones: (zones || [])
        .filter((z) => z.location_id === location.id)
        .map((zone) => ({ ...zone, plants: [] })),
    }));
  }

  // Fetch ALL plants assigned to these zones (no pagination limit!)
  const { data: assignedPlants } = await supabase
    .from('plants')
    .select('*')
    .eq('user_id', userId)
    .in('zone_id', zoneIds)
    .order('created_at', { ascending: false });

  // Resolve image URLs + healthscores for assigned plants
  const rawUrls = (assignedPlants || []).map((p) => p.image_url);
  const plantIds = (assignedPlants || []).map((p) => p.id);

  const [resolvedUrls, healthchecksResult, speciesNames] = await Promise.all([
    getPlantImageUrls(rawUrls),
    plantIds.length > 0
      ? supabase
          .from('plant_healthchecks')
          .select('plant_id, healthscore')
          .in('plant_id', plantIds)
          .order('created_at', { ascending: false })
      : { data: [] },
    fetchSpeciesCanonicalNames(assignedPlants || []),
  ]);

  const healthscoreMap = {};
  if (healthchecksResult?.data) {
    for (const hc of healthchecksResult.data) {
      if (!healthscoreMap[hc.plant_id]) {
        healthscoreMap[hc.plant_id] = hc.healthscore;
      }
    }
  }

  const localizedAssignedPlants = await attachLocalizedDetails(assignedPlants || [], language);

  const enrichedPlants = localizedAssignedPlants.map((plant, i) => ({
    ...plant,
    image_url: resolvedUrls[i] || plant.image_url,
    canonical_name: speciesNames[plant.species_id] || plant.canonical_name || null,
    healthscore: healthscoreMap[plant.id] ?? null,
  }));

  return (locations || []).map((location) => ({
    ...location,
    zones: (zones || [])
      .filter((z) => z.location_id === location.id)
      .map((zone) => ({
        ...zone,
        plants: enrichedPlants.filter((p) => p.zone_id === zone.id),
      })),
  }));
}

export default function PlantListScreen({ context }) {
  const [index, setIndex] = useState(0);
  const routes = [
    { key: 'all', title: t('plants.tabAll') },
    { key: 'homes', title: t('plants.tabHomes') },
  ];
  const [allPlants, setAllPlants] = useState([]);
  const [grouped, setGrouped] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const navigation = useNavigation();
  const { userId, profile } = useAuth();
  const currentLanguage = useMemo(() => normalizeLanguage(profile?.language), [profile?.language]);
  const [expandedZones, setExpandedZones] = useState({}); // { [zoneId]: true }
  const loadSeq = useRef(0);
  const contextTip = useMemo(
    () => getContextTip(context, currentLanguage),
    [context, currentLanguage]
  );

  const loadAll = useCallback(async () => {
    const seq = ++loadSeq.current;
    const language = currentLanguage;
    setLoading(true);
    setError(null);
    try {
      // Pflanzen laden (mit parallelen Healthscores + URL-Resolution)
      const plants = await getPlantsWithHealthscores(userId, language);
      if (seq !== loadSeq.current) return;
      // Sofort anzeigen — nicht auf Gruppierung warten
      setAllPlants(plants);
      setLoading(false);

      // Gruppierung im Hintergrund nachladen (fetches ALL assigned plants from DB)
      getGroupedPlants(userId, language)
        .then((groupedPlants) => {
          if (seq === loadSeq.current) setGrouped(groupedPlants);
        })
        .catch((e) => console.warn('[PlantList] grouped load failed:', e?.message));
    } catch (e) {
      if (seq === loadSeq.current) {
        setError(e.message);
        setLoading(false);
      }
    } finally {
      if (seq === loadSeq.current) {
        setRefreshing(false);
      }
    }
  }, [currentLanguage, userId]);

  // Reload plant list every time screen gains focus (e.g. after adding a plant)
  useFocusEffect(
    useCallback(() => {
      if (userId) {
        loadAll();
      }
    }, [userId, loadAll])
  );

  // Einzelnes Plant-Item — stable reference for FlatList performance
  const renderPlantItem = useCallback(
    ({ item }) => (
      <TouchableOpacity onPress={() => navigation.navigate('PlantDetail', { plant: item })}>
        <View style={styles.plantCardContainer}>
          <PlantImage
            uri={item.image_url}
            style={styles.plantImage}
            placeholderStyle={styles.plantImagePlaceholder}
          />
          <View style={styles.plantTextContainer}>
            <PlantTitle plant={item} language={currentLanguage} />
            <PlantSummary plant={item} language={currentLanguage} />
            {item.healthscore !== null && (
              <Text style={styles.plantHealthscore}>
                {t('plants.healthscoreValue', { score: item.healthscore })}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    ),
    [navigation, currentLanguage]
  );

  // Stable keyExtractor — avoid recreating on every render
  const keyExtractor = useCallback((item) => item.id?.toString(), []);

  // Stable refresh handler
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll();
  }, [loadAll]);

  // "Alle"-Tab — memoized to prevent re-creation on every render (critical for TabView)
  const AllRoute = useCallback(
    () =>
      loading ? (
        <ActivityIndicator
          size="large"
          color={colors.primaryLight}
          style={styles.loadingIndicator}
        />
      ) : error ? (
        <ErrorState message={error} onRetry={loadAll} />
      ) : (
        <FlatList
          data={allPlants}
          keyExtractor={keyExtractor}
          renderItem={renderPlantItem}
          removeClippedSubviews={Platform.OS !== 'web'}
          windowSize={7}
          maxToRenderPerBatch={10}
          initialNumToRender={10}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            !loading && (
              <EmptyState
                icon="leaf-outline"
                title={t('plants.noPlants')}
                message={t('plants.scanFirstPlant')}
                actionLabel={t('plants.scanFirstPlant')}
                actionIcon="camera-outline"
                onAction={() => navigation.navigate('Pflanze hinzufügen')}
              />
            )
          }
        />
      ),
    [
      loading,
      error,
      allPlants,
      refreshing,
      renderPlantItem,
      keyExtractor,
      onRefresh,
      loadAll,
      navigation,
    ]
  );

  // "Zuhause"-Tab: Accordion Location > Zone > Pflanzen
  const toggleZone = (zoneId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedZones((prev) => ({ ...prev, [zoneId]: !prev[zoneId] }));
  };

  // "Zuhause"-Tab — memoized for TabView performance
  const HomesRoute = useCallback(
    () =>
      loading ? (
        <ActivityIndicator
          size="large"
          color={colors.primaryLight}
          style={styles.loadingIndicator}
        />
      ) : (
        <ScrollView style={styles.homesScrollView}>
          {grouped.length === 0 && (
            <Text style={styles.noLocationsText}>{t('plants.noLocations')}</Text>
          )}
          {grouped.map((location) => (
            <View key={location.id} style={styles.locationContainer}>
              <Text style={styles.locationName}>{location.name}</Text>
              {location.zones.map((zone) => (
                <View key={zone.id} style={styles.zoneAccordionContainer}>
                  <TouchableOpacity
                    onPress={() => toggleZone(zone.id)}
                    style={styles.zoneAccordionHeader}
                  >
                    <Text style={styles.zoneTitle}>{zone.name}</Text>
                    <Text style={styles.zoneCount}>
                      {t('plants.plantsCount', { count: zone.plants.length })}
                    </Text>
                    <Text style={styles.zoneExpandIcon}>{expandedZones[zone.id] ? '▲' : '▼'}</Text>
                  </TouchableOpacity>
                  {expandedZones[zone.id] && (
                    <View style={styles.zoneContentContainer}>
                      {zone.plants.length > 0 ? (
                        zone.plants.map((plant) => (
                          <TouchableOpacity
                            key={plant.id}
                            onPress={() => navigation.navigate('PlantDetail', { plant })}
                          >
                            <View style={styles.zonePlantItemRow}>
                              <PlantImage
                                uri={plant.image_url}
                                style={styles.zonePlantImage}
                                placeholderStyle={styles.zonePlantImagePlaceholder}
                              />
                              <View style={styles.zonePlantTextContainer}>
                                <PlantTitle plant={plant} language={currentLanguage} compact />
                                <PlantSummary plant={plant} language={currentLanguage} compact />
                                {plant.healthscore !== null && (
                                  <Text style={styles.zonePlantHealthscore}>
                                    {t('plants.healthscoreValue', { score: plant.healthscore })}
                                  </Text>
                                )}
                              </View>
                            </View>
                          </TouchableOpacity>
                        ))
                      ) : (
                        <Text style={styles.noZonePlantsText}>{t('plants.noZonePlants')}</Text>
                      )}
                    </View>
                  )}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      ),
    [loading, grouped, expandedZones, navigation, currentLanguage]
  );

  // Memoize scene map so TabView doesn't recreate scenes
  const renderScene = useMemo(
    () =>
      SceneMap({
        all: AllRoute,
        homes: HomesRoute,
      }),
    [AllRoute, HomesRoute]
  );

  return (
    <View style={styles.screenContainer}>
      {contextTip && (
        <View style={styles.contextBanner}>
          <View style={styles.contextIcon}>
            <Ionicons name={contextTip.icon} size={20} color={colors.primary} />
          </View>
          <View style={styles.contextCopy}>
            <Text style={styles.contextTitle}>{contextTip.title}</Text>
            <Text style={styles.contextBody}>{contextTip.body}</Text>
          </View>
        </View>
      )}

      {/* Plant Dex CTA */}
      <TouchableOpacity
        style={plantDexStyles.ctaBar}
        onPress={() => navigation.navigate('PlantDex')}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('dex.title')}
      >
        <View style={plantDexStyles.ctaContent}>
          <Ionicons name="grid-outline" size={20} color={colors.primary} />
          <Text style={plantDexStyles.ctaText}>{t('dex.title')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.primary} />
      </TouchableOpacity>

      <TabView
        navigationState={{ index, routes }}
        renderScene={renderScene}
        onIndexChange={setIndex}
        initialLayout={{ width: 320 }}
        renderTabBar={(props) => (
          <TabBar
            {...props}
            indicatorStyle={styles.tabIndicator}
            style={styles.tabBar}
            labelStyle={styles.tabLabel}
            activeColor={colors.primary}
            inactiveColor={colors.textTertiary}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Screen layout
  screenContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primarySurface,
    borderRadius: radius.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    ...shadows.sm,
  },
  contextIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextCopy: {
    flex: 1,
  },
  contextTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  contextBody: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  homesScrollView: {
    flex: 1,
  },

  // Loading indicators
  loadingIndicator: {
    marginTop: 30,
  },

  // Plant item (all plants list)
  plantCardContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    margin: spacing.md,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadows.sm,
  },
  plantImage: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    marginRight: spacing.lg + 2,
    backgroundColor: colors.border,
  },
  plantImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    marginRight: spacing.lg + 2,
    backgroundColor: colors.textDisabled,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plantTextContainer: {
    flex: 1,
  },
  plantName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  plantLocalName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },
  plantBotanicalName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 1,
  },
  plantNote: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  plantHealthscore: {
    fontSize: 12,
    color: colors.primary,
    marginTop: 2,
  },

  // Empty state (all plants)
  emptyStateContainer: {
    alignItems: 'center',
    marginTop: 80,
    paddingHorizontal: spacing.xl,
  },
  emptyStateText: {
    textAlign: 'center',
    color: colors.textTertiary,
    marginTop: spacing.md,
    fontSize: 16,
  },
  emptyStateButton: {
    marginTop: spacing.lg,
  },

  // Homes tab
  noLocationsText: {
    textAlign: 'center',
    color: colors.textTertiary,
    marginTop: 100,
  },
  locationContainer: {
    marginBottom: spacing.xxl,
  },
  locationName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginLeft: spacing.lg,
    marginBottom: spacing.xs,
  },

  // Zone accordion
  zoneAccordionContainer: {
    marginLeft: spacing.md,
    marginBottom: 6,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
  },
  zoneAccordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  zoneTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    color: colors.textPrimary,
  },
  zoneCount: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  zoneExpandIcon: {
    marginLeft: spacing.sm,
    color: colors.primary,
  },
  zoneContentContainer: {
    marginLeft: spacing.md,
  },

  // Zone plant item
  zonePlantItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderColor: colors.borderLight,
  },
  zonePlantImage: {
    width: 50,
    height: 50,
    borderRadius: radius.sm,
    marginRight: spacing.md,
    backgroundColor: colors.border,
  },
  zonePlantImagePlaceholder: {
    width: 50,
    height: 50,
    borderRadius: radius.sm,
    marginRight: spacing.md,
    backgroundColor: colors.textDisabled,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zonePlantTextContainer: {
    flex: 1,
  },
  zonePlantName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  zonePlantLocalName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
  },
  zonePlantBotanicalName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 1,
  },
  zonePlantNote: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  zonePlantHealthscore: {
    fontSize: 12,
    color: colors.primary,
  },
  noZonePlantsText: {
    color: colors.textTertiary,
    marginLeft: spacing.sm,
    marginBottom: spacing.md,
  },

  // Tab bar
  tabIndicator: {
    backgroundColor: colors.primary,
  },
  tabBar: {
    backgroundColor: colors.surface,
  },
  tabLabel: {
    color: colors.textPrimary,
    fontWeight: 'bold',
  },
});

const plantDexStyles = StyleSheet.create({
  ctaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.primarySurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
});
