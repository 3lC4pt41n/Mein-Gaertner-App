import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Platform, Modal,
  ScrollView, Switch, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';

let NativeDateTimePicker = null;
try {
  if (Platform.OS !== "web") {
    NativeDateTimePicker = require('@react-native-community/datetimepicker').default;
  }
} catch { /* Web / Expo Go ohne Picker */ }

const TASK_TYPES = [
  { key: "Gießen", icon: "water-outline", color: "#2196f3" },
  { key: "Düngen", icon: "leaf-outline", color: "#8BC34A" },
  { key: "Healthcheck", icon: "pulse-outline", color: "#FF9800" },
  { key: "Umtopfen", icon: "flower-outline", color: "#9C27B0" },
  { key: "Sonstiges", icon: "calendar-outline", color: "#607D8B" },
];

const INTERVAL_PRESETS = [
  { label: "Jeden Tag", days: 1 },
  { label: "Alle 3 Tage", days: 3 },
  { label: "Alle 5 Tage", days: 5 },
  { label: "Jede Woche", days: 7 },
  { label: "Alle 2 Wochen", days: 14 },
  { label: "Jeden Monat", days: 30 },
];

export default function AddTaskDialog({ visible, onClose, onSave, initialPlantId, initialPlantName }) {
  const [type, setType] = useState(TASK_TYPES[0].key);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    return d;
  });
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [note, setNote] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [intervalDays, setIntervalDays] = useState(5);
  const [customInterval, setCustomInterval] = useState('');

  // Pflanzenwahl (nur wenn keine Pflanze vorgegeben)
  const [plants, setPlants] = useState([]);
  const [selectedPlant, setSelectedPlant] = useState(null);
  const [showPlantPicker, setShowPlantPicker] = useState(false);
  const [loadingPlants, setLoadingPlants] = useState(false);

  // Pflanzen laden wenn Dialog öffnet und keine Pflanze vorgegeben
  useEffect(() => {
    if (visible && !initialPlantId) {
      loadPlants();
    }
    if (visible && initialPlantId) {
      setSelectedPlant({ id: initialPlantId, name: initialPlantName || '?' });
    }
  }, [visible, initialPlantId]);

  // Reset bei Schließen
  useEffect(() => {
    if (!visible) {
      setType(TASK_TYPES[0].key);
      const d = new Date();
      d.setHours(8, 0, 0, 0);
      setDate(d);
      setNote('');
      setRecurring(false);
      setIntervalDays(5);
      setCustomInterval('');
      setSelectedPlant(initialPlantId ? { id: initialPlantId, name: initialPlantName } : null);
      setShowPlantPicker(false);
    }
  }, [visible]);

  const loadPlants = async () => {
    setLoadingPlants(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('plants')
        .select('id, name')
        .eq('user_id', user.id)
        .order('name');
      if (!error && data) setPlants(data);
    } catch (e) {
      console.warn('loadPlants error:', e.message);
    } finally {
      setLoadingPlants(false);
    }
  };

  const formatLocalDate = (d) =>
    `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;

  const formatLocalTime = (d) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  const handleSave = () => {
    if (!selectedPlant) {
      alert('Bitte wähle eine Pflanze aus!');
      return;
    }

    // Timezone-Fix: toISOString() konvertiert die lokale Date korrekt nach UTC
    const dueAtIso = date.toISOString();
    const effectiveInterval = customInterval ? parseInt(customInterval, 10) : intervalDays;

    if (recurring && (!effectiveInterval || effectiveInterval < 1)) {
      alert('Bitte ein Intervall > 0 angeben!');
      return;
    }

    onSave({
      type,
      due_at: dueAtIso,
      note,
      plant_id: selectedPlant.id,
      plant_name: selectedPlant.name,
      recurring,
      interval_days: recurring ? effectiveInterval : null,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{
        flex: 1, justifyContent: "center", alignItems: "center",
        backgroundColor: "rgba(0,0,0,0.2)"
      }}>
        <View style={{
          backgroundColor: "#fff", width: '90%', maxWidth: 380, maxHeight: '85%',
          borderRadius: 18, padding: 20,
          shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12, elevation: 5
        }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={{ fontWeight: "bold", fontSize: 20, marginBottom: 14, color: "#222" }}>
              Neue Aufgabe
            </Text>

            {/* ── Pflanzenwahl ──────────────────────── */}
            <Text style={{ fontWeight: "600", marginBottom: 6 }}>Pflanze:</Text>
            {initialPlantId ? (
              <Text style={{ fontWeight: "bold", color: "#2196f3", marginBottom: 12, fontSize: 15 }}>
                {initialPlantName || '?'}
              </Text>
            ) : (
              <TouchableOpacity
                style={{
                  borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 10,
                  marginBottom: 12, backgroundColor: "#fafafa",
                  flexDirection: "row", alignItems: "center", justifyContent: "space-between"
                }}
                onPress={() => setShowPlantPicker(!showPlantPicker)}
              >
                <Text style={{ color: selectedPlant ? "#222" : "#999", fontSize: 15 }}>
                  {selectedPlant ? selectedPlant.name : "Pflanze auswählen..."}
                </Text>
                <Ionicons name={showPlantPicker ? "chevron-up" : "chevron-down"} size={18} color="#888" />
              </TouchableOpacity>
            )}

            {showPlantPicker && !initialPlantId && (
              <View style={{
                borderWidth: 1, borderColor: "#e0e0e0", borderRadius: 8,
                maxHeight: 150, marginBottom: 10, backgroundColor: "#fff"
              }}>
                {loadingPlants ? (
                  <ActivityIndicator style={{ padding: 16 }} color="#4CAF50" />
                ) : plants.length === 0 ? (
                  <Text style={{ padding: 12, color: "#999", textAlign: "center" }}>
                    Keine Pflanzen vorhanden
                  </Text>
                ) : (
                  <ScrollView nestedScrollEnabled>
                    {plants.map(p => (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => {
                          setSelectedPlant(p);
                          setShowPlantPicker(false);
                        }}
                        style={{
                          padding: 10, borderBottomWidth: 1, borderBottomColor: "#f0f0f0",
                          backgroundColor: selectedPlant?.id === p.id ? "#E8F5E9" : "transparent"
                        }}
                      >
                        <Text style={{
                          fontWeight: selectedPlant?.id === p.id ? "bold" : "normal",
                          color: "#333"
                        }}>
                          {p.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {/* ── Aufgabentyp ──────────────────────── */}
            <Text style={{ fontWeight: "600", marginBottom: 6 }}>Typ:</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 14 }}>
              {TASK_TYPES.map(t => (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setType(t.key)}
                  style={{
                    flexDirection: "row", alignItems: "center",
                    paddingVertical: 6, paddingHorizontal: 10, marginRight: 6, marginBottom: 6,
                    borderRadius: 20, borderWidth: 1.5,
                    borderColor: t.key === type ? t.color : "#ddd",
                    backgroundColor: t.key === type ? t.color + '15' : "transparent",
                  }}
                >
                  <Ionicons name={t.icon} size={16} color={t.key === type ? t.color : "#999"} />
                  <Text style={{
                    marginLeft: 4, fontSize: 13,
                    fontWeight: t.key === type ? "bold" : "normal",
                    color: t.key === type ? t.color : "#555"
                  }}>{t.key}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Datum & Zeit ──────────────────────── */}
            <Text style={{ fontWeight: "600", marginBottom: 6 }}>Datum & Zeit:</Text>
            {Platform.OS === "web" || !NativeDateTimePicker ? (
              <TextInput
                value={`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${formatLocalTime(date)}`}
                onChangeText={str => {
                  const [datum, zeit] = str.split(' ');
                  if (!datum || !zeit) return;
                  const [year, month, day] = datum.split('-').map(Number);
                  const [hour, minute] = zeit.split(':').map(Number);
                  if (!year || !month || !day || hour === undefined || minute === undefined) return;
                  setDate(new Date(year, month - 1, day, hour, minute));
                }}
                style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 8, marginBottom: 12 }}
                placeholder="JJJJ-MM-TT HH:MM"
              />
            ) : (
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row" }}>
                  <TouchableOpacity
                    onPress={() => setShowDate(true)}
                    style={{
                      flex: 1, borderWidth: 1, borderColor: "#ccc", borderRadius: 8,
                      padding: 10, backgroundColor: "#fafafa", marginRight: 8
                    }}
                  >
                    <Text>{formatLocalDate(date)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowTime(true)}
                    style={{
                      flex: 1, borderWidth: 1, borderColor: "#ccc", borderRadius: 8,
                      padding: 10, backgroundColor: "#fafafa"
                    }}
                  >
                    <Text>{formatLocalTime(date)}</Text>
                  </TouchableOpacity>
                </View>
                {showDate && NativeDateTimePicker && (
                  <NativeDateTimePicker
                    value={date}
                    mode="date"
                    display="default"
                    onChange={(event, selectedDate) => {
                      setShowDate(false);
                      if (selectedDate) {
                        const nd = new Date(date);
                        nd.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                        setDate(nd);
                      }
                    }}
                  />
                )}
                {showTime && NativeDateTimePicker && (
                  <NativeDateTimePicker
                    value={date}
                    mode="time"
                    is24Hour={true}
                    display="default"
                    onChange={(event, selectedDate) => {
                      setShowTime(false);
                      if (selectedDate) {
                        const nd = new Date(date);
                        nd.setHours(selectedDate.getHours(), selectedDate.getMinutes());
                        setDate(nd);
                      }
                    }}
                  />
                )}
              </View>
            )}

            {/* ── Wiederholen ──────────────────────── */}
            <View style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              marginBottom: recurring ? 8 : 14,
              padding: 10, borderRadius: 10, backgroundColor: recurring ? "#E8F5E9" : "#f5f5f5"
            }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="repeat" size={20} color={recurring ? "#4CAF50" : "#999"} />
                <Text style={{ marginLeft: 8, fontWeight: "600", color: recurring ? "#2E7D32" : "#555" }}>
                  Wiederholen
                </Text>
              </View>
              <Switch
                value={recurring}
                onValueChange={setRecurring}
                trackColor={{ true: "#4CAF50" }}
                thumbColor={recurring ? "#fff" : "#f4f3f4"}
              />
            </View>

            {recurring && (
              <View style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
                  {INTERVAL_PRESETS.map(p => (
                    <TouchableOpacity
                      key={p.days}
                      onPress={() => { setIntervalDays(p.days); setCustomInterval(''); }}
                      style={{
                        paddingVertical: 6, paddingHorizontal: 10,
                        marginRight: 6, marginBottom: 6,
                        borderRadius: 16, borderWidth: 1,
                        borderColor: intervalDays === p.days && !customInterval ? "#4CAF50" : "#ddd",
                        backgroundColor: intervalDays === p.days && !customInterval ? "#E8F5E9" : "transparent",
                      }}
                    >
                      <Text style={{
                        fontSize: 12,
                        fontWeight: intervalDays === p.days && !customInterval ? "bold" : "normal",
                        color: intervalDays === p.days && !customInterval ? "#2E7D32" : "#555"
                      }}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ color: "#555", marginRight: 6 }}>Oder alle</Text>
                  <TextInput
                    value={customInterval}
                    onChangeText={val => {
                      setCustomInterval(val.replace(/[^0-9]/g, ''));
                    }}
                    placeholder={String(intervalDays)}
                    keyboardType="number-pad"
                    style={{
                      borderWidth: 1, borderColor: "#ccc", borderRadius: 6,
                      padding: 4, width: 50, textAlign: "center"
                    }}
                  />
                  <Text style={{ color: "#555", marginLeft: 6 }}>Tage</Text>
                </View>
              </View>
            )}

            {/* ── Notiz ────────────────────────────── */}
            <Text style={{ fontWeight: "600", marginBottom: 4 }}>Notiz (optional):</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="z.B. 'Mit lauwarmem Wasser gießen'"
              style={{
                borderWidth: 1, borderColor: "#ccc", borderRadius: 8,
                padding: 8, minHeight: 40, marginBottom: 14
              }}
              multiline
            />

            {/* ── Buttons ──────────────────────────── */}
            <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
              <TouchableOpacity
                onPress={onClose}
                style={{
                  paddingVertical: 10, paddingHorizontal: 18,
                  borderRadius: 8, backgroundColor: "#f0f0f0", marginRight: 8
                }}
              >
                <Text style={{ color: "#888", fontWeight: "600" }}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                style={{
                  paddingVertical: 10, paddingHorizontal: 18,
                  borderRadius: 8, backgroundColor: "#4CAF50"
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "bold" }}>
                  {recurring ? "Serie anlegen" : "Speichern"}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
