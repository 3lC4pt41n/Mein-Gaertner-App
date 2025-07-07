import React, { useState } from 'react';
import { View, Text, TextInput, Button, TouchableOpacity, Platform, Modal } from 'react-native';

let DateTimePicker = null;
try {
  // Mobile only – auf Web wird nichts importiert!
  if (Platform.OS !== "web") {
    DateTimePicker = require('@react-native-community/datetimepicker').default;
  }
} catch { /* Ignorieren für Web / Expo Go ohne Picker */ }

const TASK_TYPES = [
  "Gießen", "Düngen", "Healthcheck", "Umtopfen", "Sonstiges"
];

export default function AddTaskDialog({ visible, onClose, onSave, initialPlantName }) {
  const [type, setType] = useState(TASK_TYPES[0]);
  const [date, setDate] = useState(new Date());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [note, setNote] = useState('');

  // Hilfsfunktion für Zeit/Datum
  const formatLocalDateTime = (dateObj) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    const h = String(dateObj.getHours()).padStart(2, '0');
    const min = String(dateObj.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} ${h}:${min}`;
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{
        flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.15)"
      }}>
        <View style={{
          backgroundColor: "#fff", minWidth: 300, borderRadius: 16,
          padding: 18, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 10
        }}>
          <Text style={{ fontWeight: "bold", fontSize: 18, marginBottom: 12 }}>Neue Aufgabe</Text>
          
          <Text style={{ marginBottom: 6 }}>Typ:</Text>
          {TASK_TYPES.map(t => (
            <TouchableOpacity key={t} onPress={() => setType(t)}>
              <Text style={{
                color: t === type ? "#4CAF50" : "#333",
                fontWeight: t === type ? "bold" : "normal",
                paddingVertical: 4
              }}>{t}</Text>
            </TouchableOpacity>
          ))}

          <Text style={{ marginTop: 12, marginBottom: 4 }}>Zu welcher Pflanze:</Text>
          <Text style={{ fontWeight: "bold", color: "#2196f3" }}>
            {initialPlantName || "(wird verknüpft...)"}
          </Text>

          <Text style={{ marginTop: 14 }}>Datum & Zeit:</Text>
          {Platform.OS === "web" || !DateTimePicker ? (
            <TextInput
              value={formatLocalDateTime(date)}
              onChangeText={str => {
                // Erwartet Format: yyyy-mm-dd hh:mm
                const [datum, zeit] = str.split(' ');
                if (!datum || !zeit) return;
                const [year, month, day] = datum.split('-').map(Number);
                const [hour, minute] = zeit.split(':').map(Number);
                if (!year || !month || !day || hour === undefined || minute === undefined) return;
                setDate(new Date(year, month - 1, day, hour, minute));
              }}
              style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 6 }}
              placeholder="JJJJ-MM-TT hh:mm"
            />
          ) : (
            <View>
              <TouchableOpacity onPress={() => setShowDate(true)}>
                <Text style={{
                  borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 8, marginTop: 8,
                  backgroundColor: "#f9f9f9"
                }}>
                  📅 {date.toLocaleDateString()}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowTime(true)}>
                <Text style={{
                  borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 8, marginTop: 8,
                  backgroundColor: "#f9f9f9"
                }}>
                  ⏰ {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </TouchableOpacity>
              {showDate && DateTimePicker && (
                <DateTimePicker
                  value={date}
                  mode="date"
                  display="default"
                  onChange={(event, selectedDate) => {
                    setShowDate(false);
                    if (selectedDate) {
                      const newDate = new Date(date);
                      newDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                      setDate(newDate);
                    }
                  }}
                />
              )}
              {showTime && DateTimePicker && (
                <DateTimePicker
                  value={date}
                  mode="time"
                  is24Hour={true}
                  display="default"
                  onChange={(event, selectedDate) => {
                    setShowTime(false);
                    if (selectedDate) {
                      const newDate = new Date(date);
                      newDate.setHours(selectedDate.getHours(), selectedDate.getMinutes());
                      setDate(newDate);
                    }
                  }}
                />
              )}
            </View>
          )}

          <Text style={{ marginTop: 10 }}>Notiz (optional):</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="z.B. 'Mit lauwarmem Wasser gießen'"
            style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 6, minHeight: 40, marginBottom: 8 }}
            multiline
          />

          <View style={{ flexDirection: "row", marginTop: 12, justifyContent: "flex-end" }}>
            <Button title="Abbrechen" onPress={onClose} color="#888" />
            <View style={{ width: 8 }} />
            <Button
              title="Speichern"
              onPress={() => onSave({ type, date, note })}
              color="#4CAF50"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
