import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import { supabase } from '../supabase';
import { fetchPlants, fetchHealthchecks } from '../services/plantService';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import { t } from '../i18n';
import { useAuth } from '../contexts/AuthContext';

// Native animation auf Android aktivieren
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Fetch all plants with their latest healthcheck in a single query
async function getPlantsWithHealthscores(userId) {
  const plants = await fetchPlants(userId);

  if (plants.length === 0) {
    return plants;
  }

  // Fetch all latest healthchecks in ONE query instead of N queries
  const plantIds = plants.map((p) => p.id);
  const { data: healthchecks } = await supabase
    .from('healthchecks')
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

// Dummy Service: Alle Pflanzen flach
async function getAllPlants(userId) {
  return getPlantsWithHealthscores(userId);
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
  const navigation = useNavigation();
  const { userId } = useAuth();
  const [expandedZones, setExpandedZones] = useState({}); // { [zoneId]: true }

  useEffect(() => {
    if (userId) {
      loadAll();
    }
  }, [userId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      // Fetch plants once with healthscores, then use for both views
      const plants = await getPlantsWithHealthscores(userId);
      setAllPlants(plants);
      setGrouped(await getGroupedPlants(userId, plants));
    } catch (e) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Einzelnes Plant-Item
  const renderPlantItem = ({ item }) => (
    <TouchableOpacity onPress={() => navigation.navigate('PlantDetail', { plant: item })}>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          margin: spacing.md,
          padding: spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          ...shadows.sm,
        }}
      >
        {item.image_url ? (
          <Image
            source={{ uri: item.image_url }}
            style={{
              width: 80,
              height: 80,
              borderRadius: radius.md,
              marginRight: spacing.lg + 2,
              backgroundColor: colors.border,
            }}
          />
        ) : (
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: radius.md,
              marginRight: spacing.lg + 2,
              backgroundColor: colors.textDisabled,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text>🌱</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.textPrimary }}>
            {item.name || '?'}
          </Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs }}>
            {item.note}
          </Text>
          {item.healthscore !== null && (
            <Text style={{ fontSize: 12, color: colors.primary, marginTop: 2 }}>
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
      <ActivityIndicator size="large" color={colors.primaryLight} style={{ marginTop: 30 }} />
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
            <Text style={{ textAlign: 'center', color: colors.textTertiary, marginTop: 100 }}>
              {t('plants.noPlants')}
            </Text>
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
      <ActivityIndicator size="large" color={colors.primaryLight} style={{ marginTop: 30 }} />
    ) : (
      <ScrollView style={{ flex: 1 }}>
        {grouped.length === 0 && (
          <Text style={{ textAlign: 'center', color: colors.textTertiary, marginTop: 100 }}>
            {t('plants.noLocations')}
          </Text>
        )}
        {grouped.map((location) => (
          <View key={location.id} style={{ marginBottom: spacing.xxl }}>
            <Text
              style={{
                fontSize: 22,
                fontWeight: 'bold',
                color: colors.textPrimary,
                marginLeft: spacing.lg,
                marginBottom: spacing.xs,
              }}
            >
              {location.name}
            </Text>
            {location.zones.map((zone) => (
              <View
                key={zone.id}
                style={{
                  marginLeft: spacing.md,
                  marginBottom: 6,
                  backgroundColor: colors.background,
                  borderRadius: radius.sm,
                }}
              >
                <TouchableOpacity
                  onPress={() => toggleZone(zone.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md }}
                >
                  <Text
                    style={{ fontSize: 18, fontWeight: '600', flex: 1, color: colors.textPrimary }}
                  >
                    {zone.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textTertiary }}>
                    {t('plants.plantsCount', { count: zone.plants.length })}
                  </Text>
                  <Text style={{ marginLeft: spacing.sm, color: colors.primary }}>
                    {expandedZones[zone.id] ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>
                {expandedZones[zone.id] && zone.plants.length > 0 && (
                  <View style={{ marginLeft: spacing.md }}>
                    {zone.plants.map((plant) => (
                      <TouchableOpacity
                        key={plant.id}
                        onPress={() => navigation.navigate('PlantDetail', { plant })}
                      >
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: spacing.sm,
                            borderBottomWidth: 1,
                            borderColor: colors.borderLight,
                          }}
                        >
                          {plant.image_url ? (
                            <Image
                              source={{ uri: plant.image_url }}
                              style={{
                                width: 50,
                                height: 50,
                                borderRadius: radius.sm,
                                marginRight: spacing.md,
                                backgroundColor: colors.border,
                              }}
                            />
                          ) : (
                            <View
                              style={{
                                width: 50,
                                height: 50,
                                borderRadius: radius.sm,
                                marginRight: spacing.md,
                                backgroundColor: colors.textDisabled,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Text>🌱</Text>
                            </View>
                          )}
                          <View>
                            <Text
                              style={{
                                fontSize: 18,
                                fontWeight: 'bold',
                                color: colors.textPrimary,
                              }}
                            >
                              {plant.name}
                            </Text>
                            <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                              {plant.note}
                            </Text>
                            {plant.healthscore !== null && (
                              <Text style={{ fontSize: 12, color: colors.primary }}>
                                {t('plants.healthscoreValue', { score: plant.healthscore })}
                              </Text>
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                    {zone.plants.length === 0 && (
                      <Text
                        style={{
                          color: colors.textTertiary,
                          marginLeft: spacing.sm,
                          marginBottom: spacing.md,
                        }}
                      >
                        {t('plants.noZonePlants')}
                      </Text>
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
          indicatorStyle={{ backgroundColor: colors.primary }}
          style={{ backgroundColor: colors.surface }}
          labelStyle={{ color: colors.textPrimary, fontWeight: 'bold' }}
          activeColor={colors.primary}
          inactiveColor={colors.textTertiary}
        />
      )}
    />
  );
}
