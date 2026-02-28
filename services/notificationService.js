// services/notificationService.js – Local push notifications for task reminders
// ─────────────────────────────────────────────────────────────────────────────
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { t } from '../i18n';

// ── Configure how notifications appear when the app is in foreground ────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ── Storage keys ────────────────────────────────────────────────────────────
const NOTIFICATION_ID_PREFIX = 'notification_';
const PUSH_TOKEN_KEY = 'expo_push_token';

// ═══════════════════════════════════════════════════════════════════════════════
// Permissions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Request notification permissions from the user.
 * Returns true if granted, false otherwise.
 */
export async function requestNotificationPermissions() {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === 'granted') return true;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (e) {
    console.warn('requestNotificationPermissions error:', e.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Push Token Registration (for future remote push via Expo)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the Expo push token and store it in the user's profile.
 * Stores locally to avoid repeated calls.
 * @param {string} userId - The user's Supabase ID
 * @param {object} supabase - Supabase client instance
 */
export async function registerForPushNotifications(userId, supabase) {
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return null;

    // Android requires a notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('task-reminders', {
        name: 'Task Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2E7D32',
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData?.data;
    if (!token) return null;

    // Only update DB if token changed
    const storedToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (storedToken !== token) {
      await supabase
        .from('profiles')
        .update({ push_token: token })
        .eq('id', userId);
      await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    }

    return token;
  } catch (e) {
    console.warn('registerForPushNotifications error:', e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Local Notification Scheduling for Tasks
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Schedule a local notification reminder for a task.
 * Notification fires at 8:00 AM on the task's due date.
 * If the due date is in the past, no notification is scheduled.
 *
 * @param {object} task - Task object with at least { id, type, due_at, plant }
 */
export async function scheduleTaskReminder(task) {
  try {
    if (!task?.id || !task?.due_at) return;

    const dueDate = new Date(task.due_at);
    // Schedule for 8:00 AM on the due date
    const triggerDate = new Date(dueDate);
    triggerDate.setHours(8, 0, 0, 0);

    // Don't schedule if the trigger time is in the past
    if (triggerDate <= new Date()) return;

    const plantName = task.plant?.name || t('common.plantUnknown');
    const taskType = task.type || '';

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: t('notifications.taskDueTitle'),
        body: t('notifications.taskDueBody', { type: taskType, plant: plantName }),
        data: { taskId: task.id, type: 'task_reminder' },
        ...(Platform.OS === 'android' && { channelId: 'task-reminders' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });

    // Store the notification ID for later cancellation
    await AsyncStorage.setItem(
      `${NOTIFICATION_ID_PREFIX}${task.id}`,
      notificationId
    );
  } catch (e) {
    console.warn('scheduleTaskReminder error:', e.message);
  }
}

/**
 * Cancel a previously scheduled notification for a task.
 * @param {string} taskId - The task ID
 */
export async function cancelTaskReminder(taskId) {
  try {
    const notificationId = await AsyncStorage.getItem(
      `${NOTIFICATION_ID_PREFIX}${taskId}`
    );
    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      await AsyncStorage.removeItem(`${NOTIFICATION_ID_PREFIX}${taskId}`);
    }
  } catch (e) {
    console.warn('cancelTaskReminder error:', e.message);
  }
}

/**
 * Cancel all existing task reminders and reschedule for all DUE tasks.
 * Called on app start / task list refresh.
 *
 * @param {Array} tasks - Array of task objects (only DUE tasks will get reminders)
 */
export async function rescheduleAllTaskReminders(tasks) {
  try {
    // Cancel all currently scheduled notifications
    await Notifications.cancelAllScheduledNotificationsAsync();

    // Clear all stored notification IDs
    const allKeys = await AsyncStorage.getAllKeys();
    const notificationKeys = allKeys.filter((k) =>
      k.startsWith(NOTIFICATION_ID_PREFIX)
    );
    if (notificationKeys.length > 0) {
      await AsyncStorage.multiRemove(notificationKeys);
    }

    // Schedule reminders only for DUE tasks
    const dueTasks = (tasks || []).filter((t) => t.state === 'DUE');
    for (const task of dueTasks) {
      await scheduleTaskReminder(task);
    }
  } catch (e) {
    console.warn('rescheduleAllTaskReminders error:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Notification Response Handler
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Set up a listener for when users tap on notifications.
 * Returns a subscription that should be cleaned up.
 *
 * @param {function} onTaskTap - Callback receiving { taskId } when a task notification is tapped
 * @returns {object} subscription - Call subscription.remove() to clean up
 */
export function addNotificationResponseListener(onTaskTap) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response?.notification?.request?.content?.data;
    if (data?.type === 'task_reminder' && data?.taskId && onTaskTap) {
      onTaskTap({ taskId: data.taskId });
    }
  });
}
