import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { fetchTask, completeTask, skipTask } from '../services/taskService';
import { colors, spacing, radius, shadows } from '../theme';

export default function TaskDetailScreen({ route, navigation }) {
  const { task: initialTask } = route.params;
  const [task, setTask] = useState(initialTask);
  const [loading, setLoading] = useState(!initialTask.id);

  useEffect(() => {
    if (!initialTask?.id) return;
    (async () => {
      setLoading(true);
      try {
        const t = await fetchTask(initialTask.id, initialTask.user_id);
        setTask(t);
      } catch (e) {
        Alert.alert("Fehler", e.message);
      }
      setLoading(false);
    })();
  }, [initialTask]);

  const handleDone = async () => {
    try {
      await completeTask(task, task.user_id);
      Alert.alert("Fertig!", "Aufgabe erledigt ✅");
      navigation.goBack();
    } catch (e) {
      Alert.alert("Fehler", e.message);
    }
  };

  const handleSkip = async () => {
    try {
      await skipTask(task, task.user_id, "Vom Nutzer übersprungen");
      Alert.alert("Übersprungen!", "Die Aufgabe wurde übersprungen.");
      navigation.goBack();
    } catch (e) {
      Alert.alert("Fehler", e.message);
    }
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 50 }} color={colors.primaryLight} />;

  return (
    <ScrollView style={{ padding: 22, backgroundColor: colors.surface }}>
      <View style={{
        backgroundColor: colors.background, borderRadius: 18, padding: 18, alignItems: "center", marginBottom: 22
      }}>
        <Ionicons
          name={
            task.type === "Gießen" ? "water-outline" :
              task.type === "Düngen" ? "leaf-outline" :
                task.type === "Umtopfen" ? "flower-outline" :
                  task.type === "Healthcheck" ? "pulse-outline" : "calendar-outline"
          }
          size={52}
          color={colors.primaryLight}
          style={{ marginBottom: spacing.md }}
        />
        <Text style={{ fontWeight: "bold", fontSize: 20, marginBottom: 2, color: colors.textPrimary }}>{task.type}</Text>
        <Text style={{ color: colors.info, fontWeight: "bold", fontSize: 16 }}>
          {task.plant?.name || "Pflanze unbekannt"}
        </Text>
        <Text style={{ color: colors.textTertiary, marginTop: spacing.sm, fontSize: 14 }}>
          {new Date(task.due_at).toLocaleString()}
        </Text>
      </View>

      {task.note &&
        <View style={{ marginBottom: 22, padding: 14, backgroundColor: colors.primarySurface, borderRadius: radius.md }}>
          <Text style={{ fontWeight: "bold", color: colors.textPrimary }}>Notiz:</Text>
          <Text style={{ marginTop: spacing.xs, color: colors.textPrimary }}>{task.note}</Text>
        </View>
      }

      {/* Status Info */}
      <View style={{ marginBottom: spacing.lg, flexDirection: "row", alignItems: "center" }}>
        <Ionicons
          name={task.state === "COMPLETED" ? "checkmark-done" :
            task.state === "DUE" ? "hourglass-outline" :
              task.state === "SKIPPED" ? "remove-circle-outline" :
                "help-circle-outline"}
          size={22}
          color={task.state === "COMPLETED" ? colors.success :
            task.state === "SKIPPED" ? colors.warning : colors.textSecondary}
          style={{ marginRight: 6 }}
        />
        <Text style={{ fontWeight: "bold", color: colors.textPrimary }}>Status: {task.state}</Text>
      </View>

      {/* Action Buttons */}
      {task.state === "DUE" && (
        <View style={{ flexDirection: "row", justifyContent: "space-evenly", marginTop: spacing.lg }}>
          <TouchableOpacity style={{
            backgroundColor: colors.primary, borderRadius: radius.sm, padding: 14, minWidth: 120, alignItems: "center"
          }} onPress={handleDone}>
            <Ionicons name="checkmark-circle-outline" size={28} color={colors.surface} />
            <Text style={{ color: colors.surface, fontWeight: "bold" }}>Erledigt</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{
            backgroundColor: colors.warning, borderRadius: radius.sm, padding: 14, minWidth: 120, alignItems: "center"
          }} onPress={handleSkip}>
            <MaterialIcons name="not-interested" size={28} color={colors.surface} />
            <Text style={{ color: colors.surface, fontWeight: "bold" }}>Überspringen</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Healthcheck Quickstart */}
      {task.type === "Healthcheck" && (
        <TouchableOpacity
          style={{
            marginTop: 30,
            alignSelf: "center",
            backgroundColor: colors.info,
            borderRadius: radius.lg,
            paddingVertical: spacing.md,
            paddingHorizontal: 30
          }}
          onPress={() => navigation.navigate('PlantDetail', { plant: task.plant })}
        >
          <Ionicons name="pulse" size={20} color={colors.surface} style={{ marginRight: spacing.sm }} />
          <Text style={{ color: colors.surface, fontWeight: "bold" }}>Healthcheck & Details</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
