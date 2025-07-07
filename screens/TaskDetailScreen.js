import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { fetchTask, completeTask, skipTask } from '../services/taskService';

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

  if (loading) return <ActivityIndicator style={{ marginTop: 50 }} color="#4CAF50" />;

  return (
    <ScrollView style={{ padding: 22, backgroundColor: "#fff" }}>
      <View style={{
        backgroundColor: "#f8f8f8", borderRadius: 18, padding: 18, alignItems: "center", marginBottom: 22
      }}>
        <Ionicons
          name={
            task.type === "Gießen" ? "water-outline" :
              task.type === "Düngen" ? "leaf-outline" :
                task.type === "Umtopfen" ? "flower-outline" :
                  task.type === "Healthcheck" ? "pulse-outline" : "calendar-outline"
          }
          size={52}
          color="#4CAF50"
          style={{ marginBottom: 12 }}
        />
        <Text style={{ fontWeight: "bold", fontSize: 20, marginBottom: 2 }}>{task.type}</Text>
        <Text style={{ color: "#2196f3", fontWeight: "bold", fontSize: 16 }}>
          {task.plant?.name || "Pflanze unbekannt"}
        </Text>
        <Text style={{ color: "#888", marginTop: 8, fontSize: 14 }}>
          {new Date(task.due_at).toLocaleString()}
        </Text>
      </View>

      {task.note &&
        <View style={{ marginBottom: 22, padding: 14, backgroundColor: "#F1F8E9", borderRadius: 10 }}>
          <Text style={{ fontWeight: "bold" }}>Notiz:</Text>
          <Text style={{ marginTop: 4 }}>{task.note}</Text>
        </View>
      }

      {/* Status Info */}
      <View style={{ marginBottom: 16, flexDirection: "row", alignItems: "center" }}>
        <Ionicons
          name={task.state === "COMPLETED" ? "checkmark-done" :
            task.state === "DUE" ? "hourglass-outline" :
              task.state === "SKIPPED" ? "remove-circle-outline" :
                "help-circle-outline"}
          size={22}
          color={task.state === "COMPLETED" ? "#388E3C" :
            task.state === "SKIPPED" ? "#FFA726" : "#757575"}
          style={{ marginRight: 6 }}
        />
        <Text style={{ fontWeight: "bold" }}>Status: {task.state}</Text>
      </View>

      {/* Action Buttons */}
      {task.state === "DUE" && (
        <View style={{ flexDirection: "row", justifyContent: "space-evenly", marginTop: 16 }}>
          <TouchableOpacity style={{
            backgroundColor: "#4CAF50", borderRadius: 8, padding: 14, minWidth: 120, alignItems: "center"
          }} onPress={handleDone}>
            <Ionicons name="checkmark-circle-outline" size={28} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "bold" }}>Erledigt</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{
            backgroundColor: "#FFA726", borderRadius: 8, padding: 14, minWidth: 120, alignItems: "center"
          }} onPress={handleSkip}>
            <MaterialIcons name="not-interested" size={28} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "bold" }}>Überspringen</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Healthcheck Quickstart */}
      {task.type === "Healthcheck" && (
        <TouchableOpacity
          style={{
            marginTop: 30,
            alignSelf: "center",
            backgroundColor: "#1976d2",
            borderRadius: 20,
            paddingVertical: 12,
            paddingHorizontal: 30
          }}
          onPress={() => navigation.navigate('PlantDetail', { plant: task.plant })}
        >
          <Ionicons name="pulse" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={{ color: "#fff", fontWeight: "bold" }}>Healthcheck & Details</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
