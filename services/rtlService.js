import { I18nManager, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { getLanguageMeta } from '../i18n/registry';

const DISABLE_NATIVE_RTL_RELOAD =
  process.env.EXPO_PUBLIC_SCREENSHOT_DISABLE_NATIVE_RTL_RELOAD === '1';

function getCurrentRTL() {
  return Boolean(I18nManager.isRTL);
}

export function isRTLLanguage(input) {
  return Boolean(getLanguageMeta(input).rtl);
}

export function getDirectionStatus(input) {
  const rtl = isRTLLanguage(input);
  return {
    rtl,
    currentRTL: getCurrentRTL(),
    restartRequired: getCurrentRTL() !== rtl,
  };
}

export function configureRTLForLanguage(input) {
  const status = getDirectionStatus(input);

  I18nManager.allowRTL(true);
  if (typeof I18nManager.swapLeftAndRightInRTL === 'function') {
    I18nManager.swapLeftAndRightInRTL(true);
  }

  if (!DISABLE_NATIVE_RTL_RELOAD && status.restartRequired) {
    I18nManager.forceRTL(status.rtl);
  }

  return status;
}

export async function reloadAppForDirectionChange() {
  if (DISABLE_NATIVE_RTL_RELOAD) return;

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.reload) {
      window.location.reload();
    }
    return;
  }

  try {
    await Updates.reloadAsync();
  } catch (error) {
    if (__DEV__) {
      console.warn('[rtlService] App reload after RTL change failed.', error);
    }
  }
}
