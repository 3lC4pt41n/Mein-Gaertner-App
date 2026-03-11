// sentry.config.js – Zentrale Sentry-Initialisierung
// --------------------------------------------------------
// Wird in App.js importiert. DSN kommt aus Environment/EAS Secrets.
// In Entwicklung: Sentry ist deaktiviert (kein DSN = keine Uploads).

import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const SENTRY_DSN = Constants.expoConfig?.extra?.sentryDsn ?? process.env.SENTRY_DSN ?? '';

const isProduction = !__DEV__;

Sentry.init({
  dsn: SENTRY_DSN,

  // Nur in Production Daten senden
  enabled: isProduction && !!SENTRY_DSN,

  // Environment-Tag (dev | preview | production)
  environment: __DEV__ ? 'development' : (Constants.expoConfig?.extra?.environment ?? 'production'),

  // Release-Version = app version + runtime version für OTA
  release: `${Constants.expoConfig?.slug ?? 'digitaler-gaertner'}@${Constants.expoConfig?.version ?? '0.0.0'}`,

  // Sample Rates (kostenfreundlich für Free Tier)
  tracesSampleRate: 0.2, // 20% der Transaktionen
  profilesSampleRate: 0, // Profiling aus (braucht paid plan)

  // Breadcrumbs: Konsolenlogs + Navigation + HTTP-Requests
  enableAutoSessionTracking: true,
  sessionTrackingIntervalMillis: 30_000,

  // Sensible Defaults
  attachStacktrace: true,

  // PII filtern (DSGVO)
  sendDefaultPii: false,

  // Bekannte, behandelte Fehler nicht an Sentry senden
  ignoreErrors: [
    // Crop-Editor auf manchen Android-Geräten nicht verfügbar — Fallback greift automatisch
    'not available in the current platform',
    'UnsupportedPlatformError',
  ],

  // Vor dem Senden: User-Email / IP entfernen
  beforeSend(event) {
    // Entferne User-PII
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
    }
    return event;
  },
});

export { Sentry };
