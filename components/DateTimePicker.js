import React, { useState } from 'react';
import { View, Text, TextInput, Button, TouchableOpacity, Platform } from 'react-native';

const TASK_TYPES = ["Gießen", "Düngen", "Healthcheck", "Sonstiges"];

export default function AddTaskDialog({ onClose, onSave }) {
  const [type, setType] = useState(TASK_TYPES[0]);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  // Einfache ISO-Date + Zeit Handling (ohne Picker für Basic-Start)
  const today = new Date().toISOString().slice(0, 10);

  return (
    <View style={{
      backgroundColor: "#fff", margin: 30, borderRadius: 16,
      padding: 18, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 10
    }}>
      <Text style={{ fontWeight: "bold", fontSize: 18, marginBottom: 10 }}>Neue Aufgabe anlegen</Text>
      <Text style={{ marginTop: 6 }}>Typ:</Text>
      {TASK_TYPES.map(t => (
        <TouchableOpacity key={t} onPress={() => setType(t)}>
          <Text style={{
            color: t === type ? "#4CAF50" : "#333",
            fontWeight: t === type ? "bold" : "normal",
            paddingVertical: 4
          }}>{t}</Text>
        </TouchableOpacity>
      ))}
      <Text style={{ marginTop: 8 }}>Datum (YYYY-MM-DD):</Text>
      <TextInput
        value={date}
        onChangeText={setDate}
        placeholder={today}
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 6 }}
      />
      <Text style={{ marginTop: 8 }}>Zeit (HH:MM):</Text>
      <TextInput
        value={time}
        onChangeText={setTime}
        placeholder="08:00"
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 6 }}
      />
      <View style={{ flexDirection: "row", marginTop: 12, justifyContent: "flex-end" }}>
        <Button title="Abbrechen" onPress={onClose} color="#888" />
        <View style={{ width: 8 }} />
        <Button
          title="Speichern"
          onPress={() => {
            if (!date || !time) return alert("Bitte Datum und Zeit angeben!");
            onSave(type, `${date}T${time}:00`);
          }}
          color="#4CAF50"
        />
      </View>
    </View>
  );
}
