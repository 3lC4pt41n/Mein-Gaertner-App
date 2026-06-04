import { Linking, Platform } from 'react-native';
import * as Localization from 'expo-localization';
import { WEB_PURCHASE_STEERING } from './featureFlags';

const ALLOWED_REGIONS = new Set([
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
  'US',
]);

export const WEB_PURCHASE_URL = process.env.EXPO_PUBLIC_WEB_APP_URL || 'https://florapilot.app';

export function shouldShowWebPurchaseSteering() {
  if (!WEB_PURCHASE_STEERING || Platform.OS === 'web') return false;

  const locale = Localization.getLocales?.()[0];
  const region = String(locale?.regionCode || '').toUpperCase();
  return ALLOWED_REGIONS.has(region);
}

export async function openWebPurchasePage() {
  await Linking.openURL(WEB_PURCHASE_URL);
}
