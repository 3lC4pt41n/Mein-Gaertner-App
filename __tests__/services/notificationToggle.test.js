/**
 * Tests for the notification toggle behavior in SettingsScreen.
 *
 * The toggle logic (when notifications are enabled/disabled) should:
 *   - enable  → fetchTasks(user.id) + rescheduleAllTaskReminders(tasks)
 *   - disable → rescheduleAllTaskReminders([])
 *
 * We test the underlying service calls directly since the toggle handler
 * calls these functions imperatively.
 */

import * as Notifications from 'expo-notifications';
import { rescheduleAllTaskReminders } from '../../services/notificationService';

describe('Notification toggle behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when notifications are enabled', () => {
    it('reschedules reminders for DUE tasks', async () => {
      const tasks = [
        { id: 't1', state: 'DUE', title: 'Water plant', due_at: new Date(Date.now() + 3600000).toISOString() },
        { id: 't2', state: 'DONE', title: 'Completed task' },
        { id: 't3', state: 'DUE', title: 'Fertilize', due_at: new Date(Date.now() + 7200000).toISOString() },
      ];

      Notifications.scheduleNotificationAsync.mockResolvedValue('notif-id');

      await rescheduleAllTaskReminders(tasks);

      // Should cancel all first, then schedule only for DUE tasks
      expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
      // 2 DUE tasks = 2 schedule calls
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe('when notifications are disabled', () => {
    it('cancels all reminders when called with empty array', async () => {
      await rescheduleAllTaskReminders([]);

      expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('handles null/undefined tasks gracefully', async () => {
      await expect(rescheduleAllTaskReminders(null)).resolves.not.toThrow();
      expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });
  });
});
