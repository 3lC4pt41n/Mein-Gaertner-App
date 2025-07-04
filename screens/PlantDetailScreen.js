import React, { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { fetchLatestHealthcheck } from '../services/plantService';

const tabNames = [
  { key: 'overview', label: 'Überblick' },
  { key: 'care', label: 'Pflege & Standort' },
  { key: 'extras', label: 'Extras' },
  { key: 'health', label: 'Healthcheck' }
];

export default function PlantDetailScreen({ route }) {
  const { plant } = route.params;
  const [tab, setTab] = useState('overview');
  const details = plant.details || {};
  const [healthcheck, setHealthcheck] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const hc = await fetchLatestHealthcheck(plant.id);
        setHealthcheck(hc);
      } catch (e) {
        setHealthcheck(null);
      }
      setLoading(false);
    })();
  }, [plant.id]);

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Image source={{ uri: plant.image_url }} style={{ width: "100%", height: 200, borderRadius: 8, marginBottom: 10 }} />
      <Text style={{ fontSize: 22, fontWeight: "bold", marginBottom: 4 }}>{plant.name}</Text>
      <Text style={{ color: "#888", marginBottom: 10 }}>{plant.note}</Text>
      {/* Tabs */}
      <View style={{ flexDirection: "row", marginBottom: 12 }}>
        {tabNames.map(t => (
          <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} style={{
            backgroundColor: tab === t.key ? "#4CAF50" : "#EEE",
            borderRadius: 16, paddingVertical: 6, paddingHorizontal: 16, marginRight: 6
          }}>
            <Text style={{ color: tab === t.key ? "#FFF" : "#222", fontWeight: "bold" }}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {/* Content */}
      {tab === 'health' ? (
        loading ? <ActivityIndicator color="#4CAF50" /> : healthcheck ? (
          <View style={{ backgroundColor: "#F6F6F6", borderRadius: 10, padding: 16 }}>
            <Text style={{ fontWeight: "bold", fontSize: 18 }}>Healthscore: {healthcheck.healthscore} / 100</Text>
            <Text style={{ marginTop: 6, marginBottom: 8 }}>{healthcheck.summary}</Text>
            <View>
              {Array.isArray(healthcheck.table_json) && healthcheck.table_json.map((row, idx) => (
                <View key={idx} style={{ borderBottomWidth: 1, borderBottomColor: "#eee", marginBottom: 6, paddingBottom: 4 }}>
                  <Text style={{ fontWeight: "bold" }}>{row.Kriterium} ({row.Bewertung}/100)</Text>
                  <Text>Beobachtung: {row.Beobachtung}</Text>
                  <Text>Begründung: {row.Begründung}</Text>
                </View>
              ))}
            </View>
            <Text style={{ marginTop: 10, fontStyle: "italic" }}>{healthcheck.recommendation}</Text>
          </View>
        ) : <Text style={{ color: "#AAA" }}>Kein Healthcheck vorhanden.</Text>
      ) : details[tab] ? (
        <View style={{ backgroundColor: "#F6F6F6", borderRadius: 10, padding: 16 }}>
          {Object.entries(details[tab]).map(([k, v]) => (
            <View key={k} style={{ marginBottom: 10 }}>
              <Text style={{ fontWeight: "bold" }}>{k}</Text>
              <Text style={{ marginLeft: 4 }}>{v}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ color: "#AAA" }}>Keine Details verfügbar.</Text>
      )}
    </ScrollView>
  );
}
