// Web v1: push/local notifications are disabled until Web Push is configured.

export async function requestNotificationPermissions() {
  return false;
}

export async function registerForPushNotifications() {
  return null;
}

export async function scheduleTaskReminder() {
  return undefined;
}

export async function cancelTaskReminder() {
  return undefined;
}

export async function rescheduleAllTaskReminders() {
  return undefined;
}

export function addNotificationResponseListener() {
  return { remove: () => undefined };
}
