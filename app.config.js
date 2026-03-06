// app.config.js – Dynamic Expo config
// Merges EAS environment variables into expo.extra so they're
// accessible at runtime via Constants.expoConfig.extra.*
// See: https://docs.expo.dev/build-reference/variables/

const IS_DEV = process.env.APP_VARIANT === 'development';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

module.exports = ({ config }) => {
  return {
    ...config,
    ios: {
      ...config.ios,
      config: {
        ...config.ios?.config,
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      },
    },
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          apiKey: GOOGLE_MAPS_API_KEY,
        },
      },
    },
    extra: {
      ...config.extra,
      // Sentry DSN from EAS Secrets (set via `eas secret:create`)
      sentryDsn: process.env.SENTRY_DSN || '',
      // Environment tag for Sentry / logging
      environment: IS_DEV ? 'development' : process.env.APP_ENV || 'production',
    },
  };
};
