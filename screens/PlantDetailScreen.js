import React, { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Dimensions } from 'react-native';
import { fetchLatestHealthcheck } from '../services/plantService';

const tabNames = [
  { key: 'overview', label: 'Überblick' },
  { key: 'care', label: 'Pflege & Standort' },
  { key: 'extras', label: 'Extras' },
  { key: 'health', label: 'Healthcheck' }
];

// Simple ScoreCircle
function ScoreCircle({ score = 0 }) {
  let color = "#eee";
  if (score >= 90) color = "#4caf50";
  else if (score >= 75) color = "#8bc34a";
  else if (score >= 60) color = "#ffeb3b";
  else if (score >= 40) color = "#ff9800";
  else color = "#e53935";
  return (
    <View style={{
      width: 76, height: 76, borderRadius: 38, backgroundColor: color + '22',
      alignItems: "center", justifyContent: "center", marginVertical: 8, alignSelf: "center",
      borderWidth: 4, borderColor: color, shadowColor: color, shadowOpacity: 0.25, shadowRadius: 10
    }}>
      <Text style={{ fontSize: 28, fontWeight: "bold", color }}>{score}</Text>
      <Text style={{ fontSize: 14, color: "#888", marginTop: -2 }}>Health</Text>
    </View>
  );
}

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

  // für schönes Bild (Seitenverhältnis 3:2)
  const width = Math.min(Dimensions.get('window').width, 500) - 40;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, backgroundColor: "#f8f8f8", flexGrow: 1 }}>
      {/* Bild + Name */}
      <View style={styles.card}>
        {plant.image_url &&
          <Image source={{ uri: plant.image_url }} style={{ width: width, height: width * 2 / 3, borderRadius: 14, alignSelf: "center", marginBottom: 10, backgroundColor: "#ddd" }} resizeMode="cover" />}
        <Text style={styles.title}>{plant.name}</Text>
        <Text style={styles.subtitle}>{plant.note}</Text>
        {healthcheck && typeof healthcheck.healthscore === "number" &&
          <ScoreCircle score={healthcheck.healthscore} />}
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: "row", marginVertical: 16, justifyContent: "center" }}>
        {tabNames.map(t => (
          <TouchableOpacity key={t.key} onPress={() => setTab(t.key)}
            style={{
              backgroundColor: tab === t.key ? "#4CAF50" : "#EEE",
              borderRadius: 20, paddingVertical: 6, paddingHorizontal: 18,
              marginHorizontal: 2, elevation: tab === t.key ? 2 : 0
            }}>
            <Text style={{
              color: tab === t.key ? "#FFF" : "#222",
              fontWeight: "bold",
              fontSize: 16
            }}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      <View style={styles.card}>
        {tab === 'health' ? (
          loading ? <ActivityIndicator color="#4CAF50" /> : healthcheck ? (
            <View>
              <ScoreCircle score={healthcheck.healthscore} />
              <Text style={{ textAlign: "center", fontSize: 17, marginBottom: 8, color: "#444" }}>
                {healthcheck.summary}
              </Text>
              <View style={{ marginBottom: 14 }}>
                {Array.isArray(healthcheck.table_json) && healthcheck.table_json.map((row, idx) => (
                  <View key={idx} style={{
                    borderBottomWidth: idx === healthcheck.table_json.length - 1 ? 0 : 1,
                    borderBottomColor: "#e0e0e0",
                    paddingVertical: 8
                  }}>
                    <Text style={{ fontWeight: "bold", color: "#333" }}>{row.Kriterium} <Text style={{ color: "#4caf50" }}>{row.Bewertung}/100</Text></Text>
                    <Text style={{ fontSize: 14, color: "#555" }}>Beobachtung: <Text style={{ color: "#333" }}>{row.Beobachtung}</Text></Text>
                    {row.Begründung && <Text style={{ fontSize: 13, color: "#888" }}>Grund: {row.Begründung}</Text>}
                  </View>
                ))}
              </View>
              <Text style={{
                fontStyle: "italic", color: "#2196f3", fontWeight: "bold",
                fontSize: 15, textAlign: "center"
              }}>{healthcheck.recommendation}</Text>
            </View>
          ) : <Text style={{ color: "#AAA", textAlign: "center" }}>Kein Healthcheck vorhanden.</Text>
        ) : details[tab] ? (
          <View>
            {Object.entries(details[tab]).map(([k, v]) => (
              <View key={k} style={{ marginBottom: 12 }}>
                <Text style={{ fontWeight: "bold", color: "#333", fontSize: 15 }}>{k}</Text>
                <Text style={{ marginLeft: 4, color: "#555" }}>{v}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ color: "#AAA" }}>Keine Details verfügbar.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 14,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
    alignSelf: "center",
    width: "100%",
    maxWidth: 500,
  },
  title: {
    fontSize: 23,
    fontWeight: "bold",
    marginBottom: 2,
    textAlign: "center",
    color: "#222",
    letterSpacing: 0.2
  },
  subtitle: {
    color: "#888",
    marginBottom: 7,
    textAlign: "center"
  }
});
