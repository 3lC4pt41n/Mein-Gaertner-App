import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  LayoutAnimation,
  UIManager,
  Platform,
  StyleSheet,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import { supabase } from '../supabase';
import { Ionicons } from '@expo/vector-icons';
import { fetchPlants } from '../services/plantService';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import { t } from '../i18n';
import { useAuth } from '../contexts/AuthContext';

// Native animation auf Android aktivieren
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Fetch all plants with their latest healthcheck in a single query
async function getPlantsWithHealthscores(userId) {
  const result = await fetchPlants(userId);
  const plants = result?.data ?? result ?? [];

  if (plants.length === 0) {
    return plants;
  }

  // Fetch all latest healthchecks in ONE query instead of N queries
  const plantIds = plants.map((p) => p.id);
  const { data: healthchecks } = await supabase
    .from('plant_healthchecks')
    .select('plant_id, healthscore')
    .in('plant_id', plantIds)
    .order('created_at', { ascending: false });

  // Create a map of plant_id -> latest healthscore
  const healthscoreMap = {};
  if (healthchecks) {
    for (let hc of healthchecks) {
      // Only keep the first (latest) healthcheck per plant
      if (!healthscoreMap[hc.plant_id]) {
        healthscoreMap[hc.plant_id] = hc.healthscore;
      }
    }
  }

  // Merge healthscores into plants
  const plantsWithScores = plants.map((plant) => ({
    ...plant,
    healthscore: healthscoreMap[plant.id] ?? null,
  }));

  return plantsWithScores;
}

// Dummy Service: Pflanzen gruppiert nach location > zones > plants
async function getGroupedPlants(userId, plants) {
  // Reuse the same plants data that was already fetched
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name')
    .eq('user_id', userId);
  const { data: zones } = await supabase
    .from('zones')
    .select('id, name, location_id')
    .in(
      'location_id',
      (locations || []).map((l) => l.id)
    );

  // Grouping: location > zones > plants
  return (locations || []).map((location) => ({
    ...location,
    zones: (zones || [])
      .filter((z) => z.location_id === location.id)
      .map((zone) => ({
        ...zone,
        plants: (plants || []).filter((p) => p.zone_id === zone.id),
      })),
  }));
}

export default function PlantListScreen() {
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
  const { userId } = useAuth();
  const [expandedZones, setExpandedZones] = useState({}); // { [zoneId]: true }

  // Reload plant list every time screen gains focus (e.g. after adding a plant)
  useFocusEffect(
    useCallback(() => {
      if (userId) {
        loadAll();
      }
    }, [userId])
  );

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch plants once with healthscores, then use for both views
      const plants = await getPlantsWithHealthscores(userId);
      setAllPlants(plants);
      setGrouped(await getGroupedPlants(userId, plants));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Einzelnes Plant-Item
  const renderPlantItem = ({ item }) => (
    <TouchableOpacity onPress={() => navigation.navigate('PlantDetail', { plant: item })}>
      <View style={styles.plantCardContainer}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.plantImage} />
        ) : (
          <View style={styles.plantImagePlaceholder}>
            <Text>🌱</Text>
          </View>
        )}
        <View style={styles.plantTextContainer}>
          <Text style={styles.plantName}>{item.name || '?'}</Text>
          <Text style={styles.plantNote}>{item.note}</Text>
          {item.healthscore !== null && (
            <Text style={styles.plantHealthscore}>
              {t('plants.healthscoreValue', { score: item.healthscore })}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  // "Alle"-Tab
  const AllRoute = () =>
    loading ? (
      <ActivityIndicator size="large" color={colors.primaryLight} style={styles.loadingIndicator} />
    ) : error ? (
      <ErrorState message={error} onRetry={loadAll} />
    ) : (
      <FlatList
        data={allPlants}
        keyExtractor={(item) => item.id?.toString()}
        renderItem={renderPlantItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadAll();
            }}
          />
        }
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
    );

  // "Zuhause"-Tab: Accordion Location > Zone > Pflanzen
  const toggleZone = (zoneId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedZones((prev) => ({ ...prev, [zoneId]: !prev[zoneId] }));
  };

  const HomesRoute = () =>
    loading ? (
      <ActivityIndicator size="large" color={colors.primaryLight} style={styles.loadingIndicator} />
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
                            {plant.image_url ? (
                              <Image
                                source={{ uri: plant.image_url }}
                                style={styles.zonePlantImage}
                              />
                            ) : (
                              <View style={styles.zonePlantImagePlaceholder}>
                                <Text>🌱</Text>
                              </View>
                            )}
                            <View>
                              <Text style={styles.zonePlantName}>{plant.name}</Text>
                              <Text style={styles.zonePlantNote}>{plant.note}</Text>
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
    );

  return (
    <View style={styles.screenContainer}>
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
        renderScene={SceneMap({
          all: AllRoute,
          homes: HomesRoute,
        })}
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
  zonePlantName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
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
