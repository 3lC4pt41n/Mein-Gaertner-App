import React, { useState } from 'react';
import { View, Text, TextInput, Button, TouchableOpacity, Platform } from 'react-native';
import { colors, spacing, radius } from '../theme';

const TASK_TYPES = ["Gießen", "Düngen", "Healthcheck", "Sonstiges"];

export default function AddTaskDialog({ onClose, onSave }) {
  const [type, setType] = useState(TASK_TYPES[0]);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  const today = new Date().toISOString().slice(0, 10);

  return (
    <View style={{
      backgroundColor: colors.surface, margin: 30, borderRadius: radius.lg,
      padding: 18, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 10
    }}>
      <Text style={{ fontWeight: "bold", fontSize: 18, marginBottom: spacing.md }}>Neue Aufgabe anlegen</Text>
      <Text style={{ marginTop: spacing.sm }}>Typ:</Text>
      {TASK_TYPES.map(t => (
        <TouchableOpacity key={t} onPress={() => setType(t)}>
          <Text style={{
            color: t === type ? colors.primary : colors.textPrimary,
            fontWeight: t === type ? "bold" : "normal",
            paddingVertical: spacing.xs,
          }}>{t}</Text>
        </TouchableOpacity>
      ))}
      <Text style={{ marginTop: spacing.sm }}>Datum (YYYY-MM-DD):</Text>
      <TextInput
        value={date}
        onChangeText={setDate}
        placeholder={today}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 6 }}
      />
      <Text style={{ marginTop: spacing.sm }}>Zeit (HH:MM):</Text>
      <TextInput
        value={time}
        onChangeText={setTime}
        placeholder="08:00"
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 6 }}
      />
      <View style={{ flexDirection: "row", marginTop: spacing.md, justifyContent: "flex-end" }}>
        <Button title="Abbrechen" onPress={onClose} color={colors.textTertiary} />
        <View style={{ width: spacing.sm }} />
        <Button
          title="Speichern"
          onPress={() => {
            if (!date || !time) return alert("Bitte Datum und Zeit angeben!");
            onSave(type, `${date}T${time}:00`);
          }}
          color={colors.primary}
        />
      </View>
    </View>
  );
}
