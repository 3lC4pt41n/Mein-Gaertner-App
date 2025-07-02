import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Button, Alert, Image, ActivityIndicator } from 'react-native';
import { fetchPlants, deletePlant } from '../services/plantService';
import { supabase } from '../supabase';

export default function PlantListScreen() {
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);

  const loadPlants = async (uid) => {
    try {
      setLoading(true);
      const data = await fetchPlants(uid);
      setPlants(data);
    } catch (err) {
      Alert.alert("Fehler beim Laden", err.message);
    } finally {
      setLoading(false);
    }
  };

  const removePlant = async (id) => {
    try {
      await deletePlant(id);
      if (userId) await loadPlants(userId); // neu laden
    } catch (err) {
      Alert.alert("Fehler beim Löschen", err.message);
    }
  };

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user?.id) {
        setUserId(data.user.id);
        await loadPlants(data.user.id);
      } else {
        Alert.alert("Nicht eingeloggt", "Bitte logge dich ein.");
      }
    };
    init();
  }, []);

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>🌱 Meine Pflanzen</Text>
      {loading ? (
        <ActivityIndicator size="large" />
      ) : (
        <FlatList
          data={plants}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={{ marginBottom: 12, borderWidth: 1, padding: 10, borderRadius: 10 }}>
              {item.image_url && (
                <Image source={{ uri: item.image_url }} style={{ width: "100%", height: 150 }} />
              )}
              <Text style={{ fontWeight: 'bold' }}>{item.name}</Text>
              {item.note && <Text>{item.note}</Text>}
              <Button title="🗑️ Löschen" onPress={() => removePlant(item.id)} color="#d9534f" />
            </View>
          )}
        />
      )}
    </View>
  );
}
