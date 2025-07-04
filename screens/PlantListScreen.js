import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { supabase } from '../supabase';
import { fetchPlants, deletePlant, saveHealthcheck, fetchHealthchecks } from '../services/plantService';
import { useNavigation } from '@react-navigation/native';

export default function PlantListScreen() {
  const [plants, setPlants] = useState([]);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data?.user?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    if (userId) loadPlants();
  }, [userId]);

  const loadPlants = async () => {
    setLoading(true);
    try {
      const plants = await fetchPlants(userId);
      // Hole für jede Pflanze den neuesten Healthcheck
      for (let plant of plants) {
        const healthchecks = await fetchHealthchecks(plant.id);
        if (healthchecks && healthchecks.length > 0) {
          plant.healthscore = healthchecks[0].healthscore;
        } else {
          plant.healthscore = null;
        }
      }
      setPlants(plants ?? []);
    } catch (e) {
      Alert.alert("Fehler", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deletePlant(id);
      setPlants(plants => plants.filter(p => p.id !== id));
    } catch (e) {
      Alert.alert("Fehler", "Löschen fehlgeschlagen: " + e.message);
    }
  };

  const handleHealthcheck = async (plant) => {
    // Bild wählen, zu GPT schicken, Healthcheck speichern
    Alert.alert("Healthcheck", "Das kommt als nächstes…");
  };

  const renderItem = ({ item }) => (
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
        <TouchableOpacity onPress={() => handleHealthcheck(item)} style={{ marginLeft: 8 }}>
          <Text style={{ color: "#4CAF50", fontWeight: "bold", fontSize: 18 }}>🩺</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={{ marginLeft: 8 }}>
          <Text style={{ color: "#e53935", fontWeight: "bold", fontSize: 18 }}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#fafafa" }}>
      {loading && <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 30 }} />}
      <FlatList
        data={plants}
        keyExtractor={item => item.id?.toString()}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => {
            setRefreshing(true);
            loadPlants();
          }} />
        }
        ListEmptyComponent={!loading && (
          <Text style={{ textAlign: "center", color: "#888", marginTop: 100 }}>Noch keine Pflanzen gespeichert.</Text>
        )}
      />
    </View>
  );
}
