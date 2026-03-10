# Store Submission Checklist — FloraScout

## Apple App Store (iOS)
- [x] Privacy Policy URL set in App Store Connect
- [x] Terms of Service URL set in App Store Connect
- [x] In-app Account Deletion flow (Settings → Delete Account)
- [x] Data Safety declarations match actual data usage
- [x] Tester account credentials prepared for Review team
- [x] IAP products configured in App Store Connect + RevenueCat
- [x] Restore Purchases button accessible (Settings)
- [x] App loads and operates without crashes (Sentry monitored)
- [x] No placeholder content in production build
- [x] All 6 languages functional (DE/EN/FR/ES/IT/RU)

## Google Play Store (Android)
- [x] Privacy Policy URL set in Google Play Console
- [x] Data Safety form completed
- [x] Account Deletion disclosed in Data Safety
- [x] In-app purchases configured via Google Play Console + RevenueCat
- [x] Target API level compliant (Expo SDK 54)
- [x] Permissions justified (Camera, Location, Notifications)

## Technical Go/No-Go
- [x] Account Deletion: auth + DB + storage deletion (recursive/paginated)
- [x] Sentry DSN injected via EAS Secrets, test-crash verified
- [x] Store shows localized live prices from RevenueCat (hardcoded fallback)
- [x] Network resilience layer (timeout/retry) on all critical paths
- [x] 6-language smoke test passed (Onboarding + Tasks + Settings + Store)
- [x] CI gates: lint + test must pass before merge
- [x] OTA update pipeline verified (eas update → production channel)
- [x] Supabase migrations deploy automatically on push to main
