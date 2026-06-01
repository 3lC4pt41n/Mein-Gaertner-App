import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

const STARTUP_CHECK_DELAY_MS = 1500;
const FOREGROUND_CHECK_INTERVAL_MS = 15 * 60 * 1000;

let checkInFlight = false;
let lastCheckAt = 0;

function logUpdateFailure(error) {
  if (!__DEV__) return;
  console.warn('[updates] update check failed', {
    channel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
    updateId: Updates.updateId,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    isEnabled: Updates.isEnabled,
    error: error?.message,
  });
}

export async function checkForAppUpdate({ force = false } = {}) {
  if (__DEV__ || !Updates.isEnabled || checkInFlight) {
    return { checked: false };
  }

  const now = Date.now();
  if (!force && now - lastCheckAt < FOREGROUND_CHECK_INTERVAL_MS) {
    return { checked: false };
  }

  checkInFlight = true;
  lastCheckAt = now;

  try {
    const update = await Updates.checkForUpdateAsync();

    if (!update.isAvailable) {
      return { checked: true, available: false };
    }

    const fetched = await Updates.fetchUpdateAsync();
    if (fetched.isNew) {
      await Updates.reloadAsync();
      return { checked: true, available: true, reloaded: true };
    }

    return { checked: true, available: true, reloaded: false };
  } catch (error) {
    logUpdateFailure(error);
    return { checked: true, error };
  } finally {
    checkInFlight = false;
  }
}

export function subscribeToAppUpdateChecks() {
  const startupTimer = setTimeout(() => {
    checkForAppUpdate({ force: true });
  }, STARTUP_CHECK_DELAY_MS);

  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      checkForAppUpdate();
    }
  });

  return () => {
    clearTimeout(startupTimer);
    subscription.remove();
  };
}
