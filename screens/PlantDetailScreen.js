// screens/PlantDetailScreen.js
import React, { useEffect, useState } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, Dimensions, Modal, SectionList, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { fetchLatestHealthcheck } from '../services/plantService';
import { useNavigation } from '@react-navigation/native';
import { fetchCurrentUserLanguage, getUiText } from '../services/languageService';

// Helper zum Gruppieren Locations > Zonen
async function fetchZonesWithLocationsGrouped() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht eingeloggt");
  const { data: locations, error: locError } = await supabase
    .from("locations")
    .select("id, name")
    .eq("user_id", user.id);
  if (locError) throw locError;
  const locationIds = (locations || []).map(l => l.id);
  if (!locationIds.length) return [];
  const { data: zones, error: zonesError } = await supabase
    .from("zones")
    .select("id, name, type, location_id")
    .in("location_id", locationIds)
    .order("name");
  if (zonesError) throw zonesError;
  // Group zones by location
  const grouped = locations.map(location => ({
    title: location.name,
    data: zones.filter(z => z.location_id === location.id)
  })).filter(section => section.data.length > 0);
  return grouped;
}

function ScoreCircle({ score = 0, label = "Health" }) {
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
      <Text style={{ fontSize: 14, color: "#888", marginTop: -2 }}>{label}</Text>
    </View>
  );
}

export default function PlantDetailScreen({ route }) {
  const { plant } = route.params;
  const navigation = useNavigation();

  const [tab, setTab] = useState('overview');
  const details = plant.details || {};
  const [healthcheck, setHealthcheck] = useState(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState('de');

  // --- Zone-Picker States ---
  const [sections, setSections] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [savingZone, setSavingZone] = useState(false);

  // Für Zonen-Anzeige:
  const [assignedZone, setAssignedZone] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const hc = await fetchLatestHealthcheck(plant.id);
        setHealthcheck(hc);
      } catch {
        setHealthcheck(null);
      }
      setLoading(false);
    })();
    // Hole ggf. Zone/Location falls zugewiesen:
    if (plant.zone_id) {
      fetchAssignedZone();
    }
  }, [plant.id, plant.zone_id]);

  useEffect(() => {
    fetchCurrentUserLanguage()
      .then(setLanguage)
      .catch(() => setLanguage('de'));
  }, []);

  const plantDetailsText = getUiText(language).plantDetails;
  const tabNames = [
    { key: 'overview', label: plantDetailsText.tabOverview },
    { key: 'care', label: plantDetailsText.tabCare },
    { key: 'extras', label: plantDetailsText.tabExtras },
    { key: 'health', label: plantDetailsText.tabHealth },
  ];

  // Aktuelle Zone inkl. Location-Namen laden
  async function fetchAssignedZone() {
    const { data, error } = await supabase
      .from("zones")
      .select("id, name, type, location:locations(name)")
      .eq("id", plant.zone_id)
      .maybeSingle();
    setAssignedZone(data || null);
  }

  // Zonen (gruppiert) laden beim Öffnen des Modals
  const loadZones = async () => {
    if (zonesLoading) return;
    setZonesLoading(true);
    try {
      const data = await fetchZonesWithLocationsGrouped();
      setSections(data);
    } catch (err) {
      Alert.alert("Fehler", err.message);
      setSections([]);
    }
    setZonesLoading(false);
  };

  // Pflanze einer Zone zuweisen
  const assignZone = async (zone) => {
    setSavingZone(true);
    try {
      const { error } = await supabase
        .from("plants")
        .update({ zone_id: zone.id })
        .eq("id", plant.id);
      if (error) throw error;
      Alert.alert("Erfolg", `Pflanze jetzt in Zone „${zone.name}“`);
      setPickerVisible(false);
      setAssignedZone(zone);
    } catch (e) {
      Alert.alert("Fehler", e.message);
    } finally {
      setSavingZone(false);
    }
  };

  // Pflanze aus Zone entfernen (Austreten)
  const removeZone = async () => {
    Alert.alert(
      "Zone entfernen?",
      "Soll die Pflanze wirklich aus dieser Zone entfernt werden?",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Entfernen",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("plants")
                .update({ zone_id: null })
                .eq("id", plant.id);
              if (error) throw error;
              setAssignedZone(null);
              Alert.alert("Erfolg", "Zone entfernt. Jetzt kannst du eine neue zuweisen.");
            } catch (e) {
              Alert.alert("Fehler", e.message);
            }
          }
        }
      ]
    );
  };

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
          <ScoreCircle score={healthcheck.healthscore} label={plantDetailsText.healthLabel} />}

        {/* Zugewiesene Zone */}
        {assignedZone ? (
          <View style={{ alignItems: "center", marginVertical: 8 }}>
            <Ionicons name="home-outline" size={18} color="#4caf50" />
            <Text style={{ color: "#333", fontWeight: "bold", fontSize: 16 }}>
              Zugewiesen: {assignedZone.name}
              {assignedZone.location?.name ? ` (${assignedZone.location.name})` : ""}
            </Text>
            <View style={{ flexDirection: "row", marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.zoneBtn, { backgroundColor: "#999", marginRight: 8 }]}
                onPress={() => { setPickerVisible(true); loadZones(); }}
              >
                <Ionicons name="swap-horizontal" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={{ color: "#fff", fontWeight: "bold" }}>Zone wechseln</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.zoneBtn, { backgroundColor: "#e53935" }]}
                onPress={removeZone}
              >
                <Ionicons name="close" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={{ color: "#fff", fontWeight: "bold" }}>Zone entfernen</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.zoneBtn}
            onPress={() => { setPickerVisible(true); loadZones(); }}
          >
            <Ionicons name="home-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={{ color: "#fff", fontWeight: "bold" }}>Zone zuweisen</Text>
          </TouchableOpacity>
        )}
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
              <ScoreCircle score={healthcheck.healthscore} label={plantDetailsText.healthLabel} />
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
          ) : <Text style={{ color: "#AAA", textAlign: "center" }}>{plantDetailsText.noHealthcheck}</Text>
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
          <Text style={{ color: "#AAA" }}>{plantDetailsText.noDetails}</Text>
        )}
      </View>

      {/* --------- Zone Picker Modal: SectionList mit Locations als Header --------- */}
      <Modal
        visible={pickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerVisible(false)}
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPressOut={() => setPickerVisible(false)}>
          <TouchableOpacity style={styles.sheet} activeOpacity={1}>
            <Text style={styles.sheetTitle}>Zone auswählen</Text>
            {zonesLoading ? (
              <ActivityIndicator size="large" color="#4CAF50" />
            ) : sections.length ? (
              <SectionList
                sections={sections}
                keyExtractor={item => item.id}
                renderSectionHeader={({ section: { title } }) => (
                  <Text style={styles.sectionHeader}>{title}</Text>
                )}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.zoneRow}
                    onPress={() => assignZone(item)}
                    disabled={savingZone}
                  >
                    <Ionicons name="home-outline" size={22} color="#4CAF50" style={{ marginRight: 8 }} />
                    <Text style={styles.zoneName}>{item.name} <Text style={styles.zoneType}>({item.type})</Text></Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={{ textAlign: "center", color: "#666" }}>Keine Zonen angelegt.</Text>}
              />
            ) : (
              <Text style={{ textAlign: "center", color: "#666" }}>Keine Zonen angelegt.</Text>
            )}
            {savingZone && <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 12 }} />}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  },
  zoneBtn: {
    flexDirection: "row",
    alignSelf: "center",
    backgroundColor: "#4CAF50",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 6,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "60%",
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  sectionHeader: {
    fontWeight: "bold",
    fontSize: 15,
    backgroundColor: "#F5F5F5",
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginTop: 14,
    color: "#6b6b6b"
  },
  zoneRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  zoneName: { fontSize: 16 },
  zoneType: { color: "gray", fontSize: 13 },
  locationTxt: { color: "gray", fontSize: 12 },
});
