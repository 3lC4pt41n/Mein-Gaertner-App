import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet, Alert, Platform } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { fetchTasks, completeTask, skipTask } from '../services/taskService';
import { useNavigation } from '@react-navigation/native';

function getTaskColor(state, due_at) {
  if (state === "COMPLETED") return "#B2DFDB";
  if (state === "SKIPPED") return "#FFF3E0";
  if (new Date(due_at) < new Date() && state === "DUE") return "#FFCDD2";
  if (state === "DUE") return "#C8E6C9";
  return "#F8F8F8";
}

function formatDateTime(due_at) {
  const d = new Date(due_at);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function TaskScreen() {
  const [tasks, setTasks] = useState([]);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  useEffect(() => {
    (async () => {
      const supabase = require('../supabase').supabase;
      const { data } = await supabase.auth.getUser();
      setUserId(data?.user?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    if (userId) loadTasks();
    // eslint-disable-next-line
  }, [userId]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await fetchTasks(userId);
      setTasks(data ?? []);
    } catch (e) {
      Alert.alert("Fehler", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDone = async (task) => {
    try {
      await completeTask(task, userId);
      loadTasks();
    } catch (e) {
      Alert.alert("Fehler", "Abschließen fehlgeschlagen: " + e.message);
    }
  };

  const handleSkip = async (task) => {
    try {
      await skipTask(task, userId, "Manuell übersprungen");
      loadTasks();
    } catch (e) {
      Alert.alert("Fehler", "Überspringen fehlgeschlagen: " + e.message);
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('TaskDetail', { task: item })}
      activeOpacity={0.9}
      style={[
        styles.card,
        { backgroundColor: getTaskColor(item.state, item.due_at) },
        item.state === "COMPLETED" && { opacity: 0.6 }
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Ionicons name={
          item.type === "Gießen" ? "water-outline" :
          item.type === "Düngen" ? "leaf-outline" :
          item.type === "Umtopfen" ? "flower-outline" :
          item.type === "Healthcheck" ? "pulse-outline" :
          "calendar-outline"
        } size={32} color="#4CAF50" style={{ marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "bold", fontSize: 16 }}>{item.type} • <Text style={{ color: "#2196f3" }}>{item.plant?.name || "?"}</Text></Text>
          <Text style={{ color: "#777", marginTop: 2 }}>{formatDateTime(item.due_at)}</Text>
          {!!item.note && <Text style={{ color: "#444", fontSize: 13, marginTop: 3 }}>{item.note}</Text>}
        </View>
        {item.state === "DUE" &&
          <TouchableOpacity onPress={() => handleDone(item)} style={styles.actionBtn}>
            <Ionicons name="checkmark-circle-outline" size={30} color="#43A047" />
          </TouchableOpacity>}
        {item.state === "DUE" &&
          <TouchableOpacity onPress={() => handleSkip(item)} style={styles.actionBtn}>
            <MaterialIcons name="not-interested" size={28} color="#FFA726" />
          </TouchableOpacity>}
        {item.state === "COMPLETED" &&
          <Ionicons name="checkmark-done" size={28} color="#43A047" style={{ marginLeft: 10 }} />}
        {item.state === "SKIPPED" &&
          <Ionicons name="remove-circle-outline" size={28} color="#FFA726" style={{ marginLeft: 10 }} />}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#f8f8f8" }}>
      <Text style={{ fontSize: 26, fontWeight: "bold", textAlign: "center", marginTop: 20, marginBottom: 10, color: "#222" }}>
        Aufgaben & Termine
      </Text>
      {loading && <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 30 }} />}
      <FlatList
        data={tasks}
        keyExtractor={item => item.id?.toString()}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListEmptyComponent={!loading && (
          <Text style={{ textAlign: "center", color: "#888", marginTop: 80 }}>Keine Aufgaben für dich offen 🎉</Text>
        )}
      />
      {/* FAB zum neuen Task */}
      <TouchableOpacity
        style={{
          position: "absolute", right: 28, bottom: 30, backgroundColor: "#4CAF50",
          borderRadius: 35, width: 60, height: 60, alignItems: "center", justifyContent: "center",
          shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 12, elevation: 8
        }}
        onPress={() => navigation.navigate('AddTask')}
      >
        <Ionicons name="add" size={36} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 15,
    marginBottom: 16,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 1,
    width: "100%",
  },
  actionBtn: {
    marginLeft: 8,
    padding: 4
  }
});
