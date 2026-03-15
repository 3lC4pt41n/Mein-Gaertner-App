import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { getTaskTypeIcon, getTaskTypeI18nKey, normalizeTaskType } from '../constants/taskTypes';
import { fetchTask, completeTask, skipTask, deleteTask } from '../services/taskService';
import { colors, spacing, radius } from '../theme/tokens';
import { t } from '../i18n';

export default function TaskDetailScreen({ route, navigation }) {
  const { task: initialTask } = route.params;
  const [task, setTask] = useState(initialTask);
  const [loading, setLoading] = useState(!initialTask.id);

  useEffect(() => {
    if (!initialTask?.id) return;
    (async () => {
      setLoading(true);
      try {
        const fetched = await fetchTask(initialTask.id, initialTask.user_id);
        setTask(fetched);
      } catch (e) {
        Alert.alert(t('common.error'), e.message);
      }
      setLoading(false);
    })();
  }, [initialTask]);

  const handleDone = async () => {
    try {
      await completeTask(task, task.user_id);
      Alert.alert(t('tasks.taskDone'), t('tasks.taskDoneMessage'));
      navigation.goBack();
    } catch (e) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  const handleSkip = async () => {
    try {
      await skipTask(task, task.user_id, t('tasks.skipReason'));
      Alert.alert(t('tasks.taskSkipped'), t('tasks.taskSkippedMessage'));
      navigation.goBack();
    } catch (e) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  const handleDelete = () => {
    Alert.alert(t('tasks.deleteTitle'), t('tasks.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTask(task.id, task.user_id);
            navigation.goBack();
          } catch (e) {
            Alert.alert(t('common.error'), e.message);
          }
        },
      },
    ]);
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 50 }} color={colors.primaryLight} />;

  return (
    <ScrollView style={{ padding: spacing.lg + 6, backgroundColor: colors.surface }}>
      <View
        style={{
          backgroundColor: colors.background,
          borderRadius: radius.lg,
          padding: spacing.lg + 2,
          alignItems: 'center',
          marginBottom: spacing.lg + 6,
        }}
      >
        <Ionicons
          name={getTaskTypeIcon(task.type)}
          size={52}
          color={colors.primaryLight}
          style={{ marginBottom: spacing.md }}
        />
        <Text
          style={{
            fontWeight: 'bold',
            fontSize: 22,
            marginBottom: spacing.xs,
            color: colors.textPrimary,
          }}
        >
          {t(getTaskTypeI18nKey(task.type))}
        </Text>
        <Text style={{ color: colors.info, fontWeight: 'bold', fontSize: 18 }}>
          {task.plant?.name || t('common.plantUnknown')}
        </Text>
        <Text style={{ color: colors.textTertiary, marginTop: spacing.sm, fontSize: 14 }}>
          {new Date(task.due_at).toLocaleString()}
        </Text>
      </View>

      {task.note && (
        <View
          style={{
            marginBottom: spacing.lg + 6,
            padding: spacing.md + 2,
            backgroundColor: colors.primarySurface,
            borderRadius: radius.md,
          }}
        >
          <Text style={{ fontWeight: 'bold', color: colors.textPrimary }}>
            {t('tasks.noteLabel')}
          </Text>
          <Text style={{ marginTop: spacing.xs, color: colors.textPrimary }}>{task.note}</Text>
        </View>
      )}

      {/* Status Info */}
      <View style={{ marginBottom: spacing.lg, flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons
          name={
            task.state === 'COMPLETED'
              ? 'checkmark-done'
              : task.state === 'DUE'
                ? 'hourglass-outline'
                : task.state === 'SKIPPED'
                  ? 'remove-circle-outline'
                  : 'help-circle-outline'
          }
          size={22}
          color={
            task.state === 'COMPLETED'
              ? colors.success
              : task.state === 'SKIPPED'
                ? colors.warning
                : colors.textSecondary
          }
          style={{ marginRight: 6 }}
        />
        <Text style={{ fontWeight: 'bold', color: colors.textPrimary }}>
          {t('tasks.statusLabel', { state: task.state })}
        </Text>
      </View>

      {/* Action Buttons */}
      {task.state === 'DUE' && (
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-evenly', marginTop: spacing.lg }}
        >
          <TouchableOpacity
            style={{
              backgroundColor: colors.primary,
              borderRadius: radius.sm,
              padding: spacing.md + 2,
              minWidth: 120,
              alignItems: 'center',
            }}
            onPress={handleDone}
          >
            <Ionicons name="checkmark-circle-outline" size={28} color={colors.surface} />
            <Text style={{ color: colors.surface, fontWeight: 'bold' }}>{t('common.done')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              backgroundColor: colors.warning,
              borderRadius: radius.sm,
              padding: spacing.md + 2,
              minWidth: 120,
              alignItems: 'center',
            }}
            onPress={handleSkip}
          >
            <MaterialIcons name="not-interested" size={28} color={colors.surface} />
            <Text style={{ color: colors.surface, fontWeight: 'bold' }}>{t('common.skip')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Delete Button */}
      <TouchableOpacity
        style={{
          marginTop: spacing.xl,
          alignSelf: 'center',
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
        }}
        onPress={handleDelete}
      >
        <Ionicons name="trash-outline" size={18} color={colors.error} style={{ marginRight: 6 }} />
        <Text style={{ color: colors.error, fontSize: 14 }}>{t('tasks.deleteTask')}</Text>
      </TouchableOpacity>

      {/* Healthcheck Quickstart */}
      {normalizeTaskType(task.type) === 'healthcheck' && (
        <TouchableOpacity
          style={{
            marginTop: spacing.xxl + 6,
            alignSelf: 'center',
            backgroundColor: colors.info,
            borderRadius: radius.lg,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.xl + 10,
          }}
          onPress={() =>
            navigation.navigate('MeinePflanzenTab', {
              screen: 'PlantDetail',
              params: { plant: task.plant },
            })
          }
        >
          <Ionicons
            name="pulse"
            size={20}
            color={colors.surface}
            style={{ marginRight: spacing.sm }}
          />
          <Text style={{ color: colors.surface, fontWeight: 'bold' }}>
            {t('tasks.healthcheckDetails')}
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
