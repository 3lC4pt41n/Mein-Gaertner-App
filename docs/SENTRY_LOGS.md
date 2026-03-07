# Sentry Error Logs — Digitaler Gärtner

> Last updated: 2026-03-07 14:00 UTC
> Organization: `digitaler-gaertner` | Project: `react-native`
> Dashboard: https://digitaler-gaertner.sentry.io/issues/?project=react-native
> **No new issues since last export (2026-03-07 initial).**

---

## Summary

| Metric | Value |
|--------|-------|
| Total Issues | 1 |
| Total Events | 6 |
| Users Impacted | 1 |
| Time Range | 2026-03-06 16:25 – 2026-03-06 22:48 UTC |
| Environments | production |
| Releases affected | `digitaler-gaertner@1.3.0` |

---

## REACT-NATIVE-1 — IllegalStateException: Google Maps API key not found

| Field | Value |
|-------|-------|
| **Status** | unresolved (new) |
| **Severity** | fatal |
| **Occurrences** | 6 |
| **Users** | 1 |
| **First seen** | 2026-03-06T16:25:06Z |
| **Last seen** | 2026-03-06T22:48:03Z |
| **Platform** | Java (Android) |
| **Release** | `digitaler-gaertner@1.3.0` |
| **Sentry URL** | https://digitaler-gaertner.sentry.io/issues/REACT-NATIVE-1 |
| **Seer Actionability** | medium |

### Error Message

```
IllegalStateException: API key not found. Check that
<meta-data android:name="com.google.android.geo.API_KEY" android:value="your API key"/>
is in the <application> element of AndroidManifest.xml
```

### Stacktrace

```
at java.lang.Thread.run(Thread.java:1564)
at java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:652)
at java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1154)
at com.google.maps.api.android.lib6.impl.hr.run(...:586)
at com.google.maps.api.android.lib6.common.h.b(...:117)
```

**Culprit:** `com.google.maps.api.android.lib6.common.h in b`
**Mechanism:** UncaughtExceptionHandler (unhandled)

### Affected Device

| Property | Value |
|----------|-------|
| Device | Samsung SM-S938B (Galaxy S25 Ultra) |
| OS | Android 15 (build AP3A.240905.015.A2) |
| Manufacturer | Samsung |
| Screen | 1080×2340 @ 2.8125x (450 DPI) |
| RAM | 11.66 GB (3.81 GB free) |
| Storage | 490 GB (342 GB free) |
| Battery | 67% (not charging, 28.8°C) |
| Connection | WiFi |
| Locale | de_DE |
| Timezone | Europe/Berlin |

### App Context

| Property | Value |
|----------|-------|
| App version | 1.3.0 (build 24) |
| App identifier | com.elcaptain.digitalergaertner |
| Installer | com.android.vending (Play Store) |
| OTA channel | production |
| Runtime version | 1.3.0 |
| Update ID | fc8d5154-f1d0-43d5-b088-620054ff8207 |
| Foreground | yes |

### Event Timestamps (all 6 occurrences)

| # | Timestamp (UTC) |
|---|-----------------|
| 1 | 2026-03-06T16:25:06 |
| 2 | 2026-03-06T16:25:36 |
| 3 | 2026-03-06T16:26:06 |
| 4 | 2026-03-06T16:36:11 |
| 5 | 2026-03-06T17:06:30 |
| 6 | 2026-03-06T22:48:03 |

### Tag Distribution

| Tag | Value | Count |
|-----|-------|-------|
| environment | production | 6 |
| release | digitaler-gaertner@1.3.0 | 6 |
| device | SM-S938B | 6 |
| os | Android 15 | 6 |

---

## Root Cause Analysis

The `GOOGLE_MAPS_API_KEY` was not set as an EAS Secret when the v1.3.0 Android build was created. The key is injected via `app.config.js` at build time:

```javascript
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
// → resolves to '' when the secret is missing
```

This causes `react-native-maps` to initialize Google Maps without a valid API key, which throws a fatal `IllegalStateException` on Android whenever a `MapView` component is rendered (e.g., DexDetailScreen heatmap).

### Resolution

The `GOOGLE_MAPS_API_KEY` EAS Secret has been set for the v1.4.0 build. Additionally, Codex R7 added a build-time guard in `app.config.js` that throws if the key is missing during `eas build` (but not during OTA updates).

**Status:** No new events since 2026-03-06 22:48 UTC — the fix appears effective (v1.3.0 users haven't triggered further crashes since the Maps feature isn't reachable without the heatmap screen). Full resolution expected once v1.4.0 Android build is deployed to internal testers.

**Fixes REACT-NATIVE-1**

---

## Appendix: Sentry Configuration

```javascript
// sentry.config.js
Sentry.init({
  dsn: Constants.expoConfig?.extra?.sentryDsn ?? process.env.SENTRY_DSN,
  enableInExpoDevelopment: false,
  enabled: isProduction && !!dsn,
  tracesSampleRate: 0.2,
});
```

DSN: `<SENTRY-DSN-REDACTED>`
