import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { fetchTasks, completeTask, skipTask, createTask, createRecurringTask, catchUpMissedTasks } from '../services/taskService';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AddTaskDialog from '../components/AddTaskDialog';
import { colors, spacing, radius, shadows, typography } from '../theme';
import { t } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import { rescheduleAllTaskReminders, cancelTaskReminder } from '../services/notificationService';

function getTaskColor(state, due_at) {
  if (state === "COMPLETED") return "#B2DFDB";
  if (state === "SKIPPED") return colors.warningSurface;
  if (new Date(due_at) < new Date() && state === "DUE") return "#FFCDD2";
  if (state === "DUE") return colors.primaryMuted;
  return colors.background;
}

function formatDateTime(due_at) {
  const d = new Date(due_at);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function TaskScreen() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const navigation = useNavigation();
  const { userId } = useAuth();

  useFocusEffect(
    useCallback(() => {
      if (userId) {
        catchUpMissedTasks(userId).then(() => loadTasks());
      }
    }, [userId])
  );

  useEffect(() => {
    if (userId) loadTasks();
  }, [userId]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await fetchTasks(userId);
      setTasks(data ?? []);
      // Reschedule all local notification reminders for DUE tasks
      rescheduleAllTaskReminders(data ?? []).catch(console.warn);
    } catch (e) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDone = async (task) => {
    try {
      await completeTask(task, userId);
      cancelTaskReminder(task.id).catch(console.warn);
      loadTasks();
    } catch (e) {
      Alert.alert(t('common.error'), t('tasks.completeFailed') + ": " + e.message);
    }
  };

  const handleSkip = async (task) => {
    try {
      await skipTask(task, userId, t('tasks.manualSkipReason'));
      cancelTaskReminder(task.id).catch(console.warn);
      loadTasks();
    } catch (e) {
      Alert.alert(t('common.error'), t('tasks.skipFailed') + ": " + e.message);
    }
  };

  const handleAddTask = async ({ type, due_at, note, plant_id, recurring, interval_days }) => {
    try {
      if (recurring && interval_days) {
        await createRecurringTask({ plant_id, user_id: userId, type, due_at, note, interval_days });
      } else {
        await createTask({ plant_id, user_id: userId, type, due_at, note });
      }
      setShowAddDialog(false);
      loadTasks();
    } catch (e) {
      Alert.alert(t('common.error'), t('tasks.createFailed') + ": " + e.message);
    }
  };

  const renderItem = ({ item }) => {
    const isRecurring = !!item.template_id;
    return (
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
          } size={32} color={colors.primaryLight} style={{ marginRight: spacing.md }} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontWeight: "bold", fontSize: 16 }}>
                {item.type} {isRecurring ? "" : ""} <Text style={{ color: colors.info }}>{item.plant?.name || "?"}</Text>
              </Text>
              {isRecurring && (
                <Ionicons name="repeat" size={14} color={colors.primaryLight} style={{ marginLeft: 6 }} />
              )}
            </View>
            <Text style={{ color: colors.textTertiary, marginTop: 2 }}>{formatDateTime(item.due_at)}</Text>
            {!!item.note && <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 3 }}>{item.note}</Text>}
          </View>
          {item.state === "DUE" &&
            <TouchableOpacity onPress={() => handleDone(item)} style={styles.actionBtn}>
              <Ionicons name="checkmark-circle-outline" size={30} color={colors.success} />
            </TouchableOpacity>}
          {item.state === "DUE" &&
            <TouchableOpacity onPress={() => handleSkip(item)} style={styles.actionBtn}>
              <MaterialIcons name="not-interested" size={28} color={colors.warning} />
            </TouchableOpacity>}
          {item.state === "COMPLETED" &&
            <Ionicons name="checkmark-done" size={28} color={colors.success} style={{ marginLeft: 10 }} />}
          {item.state === "SKIPPED" &&
            <Ionicons name="remove-circle-outline" size={28} color={colors.warning} style={{ marginLeft: 10 }} />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Text style={{ ...typography.xxl, fontWeight: "bold", textAlign: "center", marginTop: spacing.xl, marginBottom: spacing.md, color: colors.textPrimary }}>
        {t('tasks.title')}
      </Text>
      {loading && <ActivityIndicator size="large" color={colors.primaryLight} style={{ marginTop: spacing.xxxl }} />}
      <FlatList
        data={tasks}
        keyExtractor={item => item.id?.toString()}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        ListEmptyComponent={!loading && (
          <Text style={{ textAlign: "center", color: colors.textTertiary, marginTop: 80 }}>{t('tasks.noTasks')}</Text>
        )}
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowAddDialog(true)}
      >
        <Ionicons name="add" size={36} color="#FFF" />
      </TouchableOpacity>

      <AddTaskDialog
        visible={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSave={handleAddTask}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    padding: spacing.lg + 2,
    ...shadows.sm,
    width: "100%",
  },
  actionBtn: {
    marginLeft: spacing.sm,
    padding: spacing.xs,
  },
  fab: {
    position: "absolute", right: 28, bottom: 30,
    backgroundColor: colors.primary,
    borderRadius: radius.pill, width: 60, height: 60,
    alignItems: "center", justifyContent: "center",
    ...shadows.lg,
  },
});
