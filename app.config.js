// app.config.js – Dynamic Expo config
// Merges EAS environment variables into expo.extra so they're
// accessible at runtime via Constants.expoConfig.extra.*
// See: https://docs.expo.dev/build-reference/variables/

const IS_DEV = process.env.APP_VARIANT === 'development';
const IS_EAS_BUILD = process.env.EAS_BUILD === 'true'; // Set automatically by EAS Build

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const HAS_GOOGLE_MAPS_KEY = !!GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== 'GOOGLE_MAPS_API_KEY';

// Only set a definitive runtime flag when it is trustworthy:
// - EAS Build: we know exactly whether the native key is injected
// - With explicit key: true is safe
// During OTA/local config evaluation without secret access, omit the flag
// so screens can fall back to `?? true` for already-built binaries.
const GOOGLE_MAPS_ENABLED_RUNTIME_FLAG = HAS_GOOGLE_MAPS_KEY
  ? true
  : IS_EAS_BUILD
    ? false
    : undefined;

if (IS_EAS_BUILD && !IS_DEV && !GOOGLE_MAPS_API_KEY) {
  throw new Error(
    'Missing GOOGLE_MAPS_API_KEY for production build. Set it as an EAS secret before building.'
  );
}

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
      // Runtime flag: native config sections (ios.config, android.config) are NOT
      // available via Constants.expoConfig at runtime — they're baked into
      // AndroidManifest.xml / Info.plist only. Expose a boolean so JS can check.
      ...(GOOGLE_MAPS_ENABLED_RUNTIME_FLAG === undefined
        ? {}
        : { googleMapsEnabled: GOOGLE_MAPS_ENABLED_RUNTIME_FLAG }),
    },
  };
};
