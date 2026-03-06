// components/PlantTasksList.js
// Displays tasks filtered by a specific plant — used inside PlantDetailScreen's "tasks" tab.
import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../supabase';
import { completeTask, skipTask, createTask, createRecurringTask } from '../services/taskService';
import { resolveTaskType } from '../constants/taskTypes';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import { t } from '../i18n';
import AddTaskDialog from './AddTaskDialog';

/**
 * Fetch tasks for a specific plant.
 */
async function fetchPlantTasks(plantId, userId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('plant_id', plantId)
    .eq('user_id', userId)
    .order('due_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

function formatDueDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d - now;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 0) return `${t('tasks.today')} ${timeStr}`;
  if (diffDays === 1) return `${t('tasks.tomorrow')} ${timeStr}`;
  if (diffDays === -1) return `${t('tasks.yesterday')} ${timeStr}`;
  if (diffDays < -1) {
    return `${Math.abs(diffDays)} ${t('tasks.daysOverdue')}`;
  }
  return `${t('tasks.inDays', { count: diffDays })} · ${timeStr}`;
}

export default function PlantTasksList({ plantId, plantName, userId }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchPlantTasks(plantId, userId);
      setTasks(data);
    } catch (e) {
      if (__DEV__) console.warn('PlantTasksList load error:', e.message);
    } finally {
      setLoading(false);
    }
  }, [plantId, userId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const handleComplete = async (task) => {
    setBusyTaskId(task.id);
    try {
      await completeTask(task, userId);
      await load();
    } catch (e) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleSkip = (task) => {
    Alert.alert(t('tasks.skipTitle'), t('tasks.skipMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('tasks.skip'),
        style: 'destructive',
        onPress: async () => {
          setBusyTaskId(task.id);
          try {
            await skipTask(task, userId);
            await load();
          } catch (e) {
            Alert.alert(t('common.error'), e.message);
          } finally {
            setBusyTaskId(null);
          }
        },
      },
    ]);
  };

  const handleTaskSaved = async ({ type, due_at, note, plant_id, recurring, interval_days }) => {
    try {
      if (recurring && interval_days) {
        await createRecurringTask({
          plant_id: plant_id || plantId,
          user_id: userId,
          type,
          due_at,
          note,
          interval_days,
        });
      } else {
        await createTask({
          plant_id: plant_id || plantId,
          user_id: userId,
          type,
          due_at,
          note,
        });
      }
      setShowDialog(false);
      await load();
    } catch (e) {
      Alert.alert(t('common.error'), t('tasks.createFailed') + ': ' + e.message);
    }
  };

  const dueTasks = tasks.filter((tk) => tk.state === 'DUE');
  const doneTasks = tasks
    .filter((tk) => tk.state === 'COMPLETED' || tk.state === 'SKIPPED')
    .slice(0, 10);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primaryLight} />
      </View>
    );
  }

  const renderTaskItem = (task) => {
    const tt = resolveTaskType(task.type);
    const icon = tt?.icon || 'calendar-outline';
    const iconColor = tt?.color || colors.textTertiary;
    const isDue = task.state === 'DUE';
    const isOverdue = isDue && task.due_at && new Date(task.due_at) < new Date();
    const isBusy = busyTaskId === task.id;

    return (
      <View key={task.id} style={[styles.taskRow, isOverdue && styles.taskRowOverdue]}>
        <View style={[styles.taskIcon, { backgroundColor: iconColor + '22' }]}>
          <Ionicons name={icon} size={20} color={iconColor} />
        </View>
        <View style={styles.taskInfo}>
          <Text style={styles.taskType}>{t(`tasks.taskTypes.${tt?.code || 'other'}`)}</Text>
          {task.note ? (
            <Text style={styles.taskNote} numberOfLines={1}>
              {task.note}
            </Text>
          ) : null}
          <Text style={[styles.taskDue, isOverdue && styles.taskDueOverdue]}>
            {isDue
              ? formatDueDate(task.due_at)
              : task.state === 'COMPLETED'
                ? `✓ ${t('tasks.completed')}`
                : `⏭ ${t('tasks.skipped')}`}
          </Text>
        </View>
        {isDue && (
          <View style={styles.taskActions}>
            {isBusy ? (
              <ActivityIndicator size="small" color={colors.primaryLight} />
            ) : (
              <>
                <TouchableOpacity style={styles.completeBtn} onPress={() => handleComplete(task)}>
                  <Ionicons name="checkmark" size={20} color={colors.surface} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.skipBtn} onPress={() => handleSkip(task)}>
                  <Ionicons name="play-skip-forward" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View>
      {/* Add Task Button */}
      <TouchableOpacity style={styles.addBtn} onPress={() => setShowDialog(true)}>
        <Ionicons name="add" size={18} color={colors.surface} style={{ marginRight: spacing.xs }} />
        <Text style={styles.addBtnText}>{t('plants.addTask')}</Text>
      </TouchableOpacity>

      {/* Due Tasks */}
      {dueTasks.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('plants.dueTasks')}</Text>
          {dueTasks.map(renderTaskItem)}
        </View>
      ) : (
        <View style={styles.emptyBox}>
          <Ionicons name="checkmark-circle-outline" size={36} color={colors.primaryLight} />
          <Text style={styles.emptyText}>{t('plants.noTasks')}</Text>
        </View>
      )}

      {/* Recent History */}
      {doneTasks.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('plants.taskHistory')}</Text>
          {doneTasks.map(renderTaskItem)}
        </View>
      )}

      <AddTaskDialog
        visible={showDialog}
        onClose={() => setShowDialog(false)}
        onSave={handleTaskSaved}
        initialPlantId={plantId}
        initialPlantName={plantName}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  addBtn: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  addBtnText: {
    color: colors.surface,
    fontWeight: 'bold',
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  taskRowOverdue: {
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
  },
  taskIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  taskInfo: {
    flex: 1,
  },
  taskType: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  taskNote: {
    fontSize: 13,
    color: colors.textTertiary,
    marginTop: 1,
  },
  taskDue: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  taskDueOverdue: {
    color: colors.danger,
    fontWeight: '600',
  },
  taskActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  completeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyText: {
    color: colors.textTertiary,
    fontSize: 15,
  },
});

PlantTasksList.propTypes = {
  plantId: PropTypes.string.isRequired,
  plantName: PropTypes.string.isRequired,
  userId: PropTypes.string.isRequired,
};
