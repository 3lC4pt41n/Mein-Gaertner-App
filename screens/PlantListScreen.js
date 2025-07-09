import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity, ActivityIndicator, Alert,
  RefreshControl, ScrollView, LayoutAnimation, UIManager, Platform
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import { supabase } from '../supabase';
import { fetchPlants, fetchHealthchecks } from '../services/plantService';

// Native animation auf Android aktivieren
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Dummy Service: Alle Pflanzen flach
async function getAllPlants(userId) {
  const plants = await fetchPlants(userId);
  for (let plant of plants) {
    const healthchecks = await fetchHealthchecks(plant.id);
    plant.healthscore = healthchecks?.[0]?.healthscore ?? null;
  }
  return plants;
}

// Dummy Service: Pflanzen gruppiert nach location > zones > plants
async function getGroupedPlants(userId) {
  // Du solltest einen Service bauen, der alles auf einen Schlag holt.
  // Hier ein Quick'n'Dirty Vorschlag:
  const { data: locations } = await supabase.from('locations').select('id, name').eq('user_id', userId);
  const { data: zones } = await supabase.from('zones').select('id, name, location_id').in('location_id', (locations || []).map(l => l.id));
  const { data: plants } = await supabase.from('plants').select('*').eq('user_id', userId);

  // Healthcheck dazufügen
  for (let plant of plants) {
    const healthchecks = await fetchHealthchecks(plant.id);
    plant.healthscore = healthchecks?.[0]?.healthscore ?? null;
  }

  // Grouping: location > zones > plants
  return (locations || []).map(location => ({
    ...location,
    zones: (zones || [])
      .filter(z => z.location_id === location.id)
      .map(zone => ({
        ...zone,
        plants: (plants || []).filter(p => p.zone_id === zone.id)
      }))
  }));
}

export default function PlantListScreen() {
  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: 'all', title: 'Alle' },
    { key: 'homes', title: 'Zuhause' }
  ]);
  const [allPlants, setAllPlants] = useState([]);
  const [grouped, setGrouped] = useState([]);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation();
  const [expandedZones, setExpandedZones] = useState({}); // { [zoneId]: true }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data?.user?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    if (userId) {
      loadAll();
    }
  }, [userId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      setAllPlants(await getAllPlants(userId));
      setGrouped(await getGroupedPlants(userId));
    } catch (e) {
      Alert.alert("Fehler", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Einzelnes Plant-Item
  const renderPlantItem = ({ item }) => (
    <TouchableOpacity onPress={() => navigation.navigate('PlantDetail', { plant: item })}>
      <View style={{
        backgroundColor: "#fff",
        borderRadius: 16,
        margin: 10,
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
        shadowColor: "#000",
        shadowOpacity: 0.07,
        shadowRadius: 6,
        elevation: 1,
      }}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={{ width: 80, height: 80, borderRadius: 10, marginRight: 18, backgroundColor: "#ddd" }} />
        ) : (
          <View style={{ width: 80, height: 80, borderRadius: 10, marginRight: 18, backgroundColor: "#ccc", alignItems: "center", justifyContent: "center" }}>
            <Text>🌱</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: "bold" }}>{item.name || "?"}</Text>
          <Text style={{ fontSize: 14, color: "#666", marginTop: 4 }}>{item.note}</Text>
          {item.healthscore !== null &&
            <Text style={{ fontSize: 13, color: "#2e7d32", marginTop: 2 }}>Healthscore: {item.healthscore} / 100</Text>
          }
        </View>
      </View>
    </TouchableOpacity>
  );

  // "Alle"-Tab
  const AllRoute = () => (
    loading ? <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 30 }} /> :
    <FlatList
      data={allPlants}
      keyExtractor={item => item.id?.toString()}
      renderItem={renderPlantItem}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true);
          loadAll();
        }} />
      }
      ListEmptyComponent={!loading && (
        <Text style={{ textAlign: "center", color: "#888", marginTop: 100 }}>Noch keine Pflanzen gespeichert.</Text>
      )}
    />
  );

  // "Zuhause"-Tab: Accordion Location > Zone > Pflanzen
  const toggleZone = (zoneId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedZones(prev => ({ ...prev, [zoneId]: !prev[zoneId] }));
  };

  const HomesRoute = () => (
    loading ? <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 30 }} /> :
    <ScrollView style={{ flex: 1 }}>
      {grouped.length === 0 &&
        <Text style={{ textAlign: "center", color: "#888", marginTop: 100 }}>Noch keine Standorte/Zonen/Pflanzen.</Text>
      }
      {grouped.map(location => (
        <View key={location.id} style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 20, fontWeight: "bold", marginLeft: 16, marginBottom: 4 }}>{location.name}</Text>
          {location.zones.map(zone => (
            <View key={zone.id} style={{ marginLeft: 12, marginBottom: 6, backgroundColor: "#F5F5F5", borderRadius: 8 }}>
              <TouchableOpacity onPress={() => toggleZone(zone.id)} style={{ flexDirection: "row", alignItems: "center", padding: 10 }}>
                <Text style={{ fontSize: 16, fontWeight: "600", flex: 1 }}>{zone.name}</Text>
                <Text style={{ color: "#888" }}>{zone.plants.length} Pflanzen</Text>
                <Text style={{ marginLeft: 8, color: "#4CAF50" }}>{expandedZones[zone.id] ? "▲" : "▼"}</Text>
              </TouchableOpacity>
              {expandedZones[zone.id] && zone.plants.length > 0 && (
                <View style={{ marginLeft: 10 }}>
                  {zone.plants.map(plant => (
                    <TouchableOpacity key={plant.id} onPress={() => navigation.navigate('PlantDetail', { plant })}>
                      <View style={{
                        flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1,
                        borderColor: "#eee"
                      }}>
                        {plant.image_url ? (
                          <Image source={{ uri: plant.image_url }} style={{ width: 50, height: 50, borderRadius: 8, marginRight: 10, backgroundColor: "#ddd" }} />
                        ) : (
                          <View style={{ width: 50, height: 50, borderRadius: 8, marginRight: 10, backgroundColor: "#ccc", alignItems: "center", justifyContent: "center" }}>
                            <Text>🌱</Text>
                          </View>
                        )}
                        <View>
                          <Text style={{ fontSize: 15, fontWeight: "bold" }}>{plant.name}</Text>
                          <Text style={{ fontSize: 13, color: "#666" }}>{plant.note}</Text>
                          {plant.healthscore !== null &&
                            <Text style={{ fontSize: 12, color: "#2e7d32" }}>Healthscore: {plant.healthscore} / 100</Text>
                          }
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {zone.plants.length === 0 &&
                    <Text style={{ color: "#aaa", marginLeft: 8, marginBottom: 10 }}>Keine Pflanzen in dieser Zone.</Text>
                  }
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
        homes: HomesRoute
      })}
      onIndexChange={setIndex}
      initialLayout={{ width: 320 }}
      renderTabBar={props =>
        <TabBar
          {...props}
          indicatorStyle={{ backgroundColor: '#4CAF50' }}
          style={{ backgroundColor: '#fff' }}
          labelStyle={{ color: '#222', fontWeight: 'bold' }}
          activeColor="#4CAF50"
          inactiveColor="#888"
        />
      }
    />
  );
}
