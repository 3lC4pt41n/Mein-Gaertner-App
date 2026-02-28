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
import { colors, spacing, radius, shadows } from '../theme';

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
  let color = colors.borderLight;
  if (score >= 90) color = colors.primaryLight;
  else if (score >= 75) color = "#8bc34a";
  else if (score >= 60) color = "#ffeb3b";
  else if (score >= 40) color = colors.warning;
  else color = colors.danger;
  return (
    <View style={{
      width: 76, height: 76, borderRadius: 38, backgroundColor: color + '22',
      alignItems: "center", justifyContent: "center", marginVertical: spacing.sm, alignSelf: "center",
      borderWidth: 4, borderColor: color, shadowColor: color, shadowOpacity: 0.25, shadowRadius: 10
    }}>
      <Text style={{ fontSize: 28, fontWeight: "bold", color }}>{score}</Text>
      <Text style={{ fontSize: 14, color: colors.textTertiary, marginTop: -2 }}>{label}</Text>
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

  // Aktuelle Zone inkl. Location-Namen laden (ohne PostgREST-Join)
  async function fetchAssignedZone() {
    const { data: zone, error } = await supabase
      .from("zones")
      .select("id, name, type, location_id")
      .eq("id", plant.zone_id)
      .maybeSingle();
    if (zone && zone.location_id) {
      const { data: loc } = await supabase
        .from("locations")
        .select("name")
        .eq("id", zone.location_id)
        .maybeSingle();
      zone.location = loc || null;
    }
    setAssignedZone(zone || null);
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
      Alert.alert("Erfolg", `Pflanze jetzt in Zone „${zone.name}"`);
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
    <ScrollView contentContainerStyle={{ padding: spacing.xl, backgroundColor: colors.background, flexGrow: 1 }}>
      {/* Bild + Name */}
      <View style={styles.card}>
        {plant.image_url &&
          <Image source={{ uri: plant.image_url }} style={{ width: width, height: width * 2 / 3, borderRadius: radius.lg, alignSelf: "center", marginBottom: 10, backgroundColor: "#ddd" }} resizeMode="cover" />}
        <Text style={styles.title}>{plant.name}</Text>
        <Text style={styles.subtitle}>{plant.note}</Text>
        {healthcheck && typeof healthcheck.healthscore === "number" &&
          <ScoreCircle score={healthcheck.healthscore} label={plantDetailsText.healthLabel} />}

        {/* Zugewiesene Zone */}
        {assignedZone ? (
          <View style={{ alignItems: "center", marginVertical: spacing.sm }}>
            <Ionicons name="home-outline" size={18} color={colors.primaryLight} />
            <Text style={{ color: colors.textPrimary, fontWeight: "bold", fontSize: 16 }}>
              Zugewiesen: {assignedZone.name}
              {assignedZone.location?.name ? ` (${assignedZone.location.name})` : ""}
            </Text>
            <View style={{ flexDirection: "row", marginTop: spacing.sm }}>
              <TouchableOpacity
                style={[styles.zoneBtn, { backgroundColor: colors.textTertiary, marginRight: spacing.sm }]}
                onPress={() => { setPickerVisible(true); loadZones(); }}
              >
                <Ionicons name="swap-horizontal" size={18} color={colors.surface} style={{ marginRight: spacing.sm }} />
                <Text style={{ color: colors.surface, fontWeight: "bold" }}>Zone wechseln</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.zoneBtn, { backgroundColor: colors.danger }]}
                onPress={removeZone}
              >
                <Ionicons name="close" size={18} color={colors.surface} style={{ marginRight: spacing.sm }} />
                <Text style={{ color: colors.surface, fontWeight: "bold" }}>Zone entfernen</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.zoneBtn}
            onPress={() => { setPickerVisible(true); loadZones(); }}
          >
            <Ionicons name="home-outline" size={18} color={colors.surface} style={{ marginRight: spacing.sm }} />
            <Text style={{ color: colors.surface, fontWeight: "bold" }}>Zone zuweisen</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: "row", marginVertical: spacing.lg, justifyContent: "center" }}>
        {tabNames.map(t => (
          <TouchableOpacity key={t.key} onPress={() => setTab(t.key)}
            style={{
              backgroundColor: tab === t.key ? colors.primary : colors.borderLight,
              borderRadius: radius.pill, paddingVertical: spacing.sm, paddingHorizontal: 18,
              marginHorizontal: 2, elevation: tab === t.key ? 2 : 0
            }}>
            <Text style={{
              color: tab === t.key ? colors.surface : colors.textPrimary,
              fontWeight: "bold",
              fontSize: 16
            }}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      <View style={styles.card}>
        {tab === 'health' ? (
          loading ? <ActivityIndicator color={colors.primaryLight} /> : healthcheck ? (
            <View>
              <ScoreCircle score={healthcheck.healthscore} label={plantDetailsText.healthLabel} />
              <Text style={{ textAlign: "center", fontSize: 17, marginBottom: spacing.sm, color: colors.textSecondary }}>
                {healthcheck.summary}
              </Text>
              <View style={{ marginBottom: spacing.lg }}>
                {Array.isArray(healthcheck.table_json) && healthcheck.table_json.map((row, idx) => (
                  <View key={idx} style={{
                    borderBottomWidth: idx === healthcheck.table_json.length - 1 ? 0 : 1,
                    borderBottomColor: colors.border,
                    paddingVertical: spacing.sm
                  }}>
                    <Text style={{ fontWeight: "bold", color: colors.textPrimary }}>{row.Kriterium} <Text style={{ color: colors.primaryLight }}>{row.Bewertung}/100</Text></Text>
                    <Text style={{ fontSize: 14, color: colors.textSecondary }}>Beobachtung: <Text style={{ color: colors.textPrimary }}>{row.Beobachtung}</Text></Text>
                    {row.Begründung && <Text style={{ fontSize: 13, color: colors.textTertiary }}>Grund: {row.Begründung}</Text>}
                  </View>
                ))}
              </View>
              <Text style={{
                fontStyle: "italic", color: colors.info, fontWeight: "bold",
                fontSize: 15, textAlign: "center"
              }}>{healthcheck.recommendation}</Text>
            </View>
          ) : <Text style={{ color: colors.textDisabled, textAlign: "center" }}>{plantDetailsText.noHealthcheck}</Text>
        ) : details[tab] ? (
          <View>
            {Object.entries(details[tab]).map(([k, v]) => (
              <View key={k} style={{ marginBottom: spacing.md }}>
                <Text style={{ fontWeight: "bold", color: colors.textPrimary, fontSize: 15 }}>{k}</Text>
                <Text style={{ marginLeft: spacing.xs, color: colors.textSecondary }}>{v}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ color: colors.textDisabled }}>{plantDetailsText.noDetails}</Text>
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
              <ActivityIndicator size="large" color={colors.primaryLight} />
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
                    <Ionicons name="home-outline" size={22} color={colors.primaryLight} style={{ marginRight: spacing.sm }} />
                    <Text style={styles.zoneName}>{item.name} <Text style={styles.zoneType}>({item.type})</Text></Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={{ textAlign: "center", color: colors.textSecondary }}>Keine Zonen angelegt.</Text>}
              />
            ) : (
              <Text style={{ textAlign: "center", color: colors.textSecondary }}>Keine Zonen angelegt.</Text>
            )}
            {savingZone && <ActivityIndicator size="large" color={colors.primaryLight} style={{ marginTop: spacing.md }} />}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    padding: 18,
    ...shadows.sm,
    alignSelf: "center",
    width: "100%",
    maxWidth: 500,
  },
  title: {
    fontSize: 23,
    fontWeight: "bold",
    marginBottom: 2,
    textAlign: "center",
    color: colors.textPrimary,
    letterSpacing: 0.2
  },
  subtitle: {
    color: colors.textTertiary,
    marginBottom: 7,
    textAlign: "center"
  },
  zoneBtn: {
    flexDirection: "row",
    alignSelf: "center",
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "60%",
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: spacing.md,
    textAlign: "center",
  },
  sectionHeader: {
    fontWeight: "bold",
    fontSize: 15,
    backgroundColor: colors.background,
    paddingVertical: spacing.xs,
    paddingHorizontal: 2,
    marginTop: spacing.lg,
    color: colors.textSecondary
  },
  zoneRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  zoneName: { fontSize: 16 },
  zoneType: { color: colors.textTertiary, fontSize: 13 },
  locationTxt: { color: colors.textTertiary, fontSize: 12 },
});
