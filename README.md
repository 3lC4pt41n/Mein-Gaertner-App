# FloraScout

**A real-world plant Pokédex for hobby gardeners.**

Scan plants with your camera, let PlantNet identify the species, use GPT-5.5 for care context and fallback logic, build your collection, track care tasks, and compete on leaderboards — all in one app.

<!-- Hero image: To add a screenshot or GIF, place the file at docs/hero.png and uncomment:
<p align="center">
  <img src="docs/hero.png" alt="FloraScout — Discovery Reveal + Plant Dex" width="320" />
</p>
-->

[![License: BSL 1.1](https://img.shields.io/badge/License-BSL_1.1-orange.svg)](LICENSE)
[![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react)](https://reactnative.dev)
[![Expo SDK 54](https://img.shields.io/badge/Expo%20SDK-54-000020?logo=expo)](https://docs.expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-JavaScript-3178C6?logo=typescript)](https://www.typescriptlang.org)

## Status

Active side-project. Plant Pokedex with PlantNet-powered scanning and server-side AI.

Source-available under BSL 1.1, converts to MIT on 2030-05-20.
Bandwidth limited. Response when time allows. No support SLA.

## Core Documents

- [VISION.md](VISION.md) — product north star, user promise, and strategic decision filter
- [ARCHITECTURE.md](ARCHITECTURE.md) — system context, runtime flows, data model, and delivery pipeline

## Documentation

- [docs/architecture/](docs/architecture/) — subsystem notes and deeper technical analysis
- [docs/audits/](docs/audits/) — audit snapshots, fix reports, and repository reviews
- [docs/roadmap/](docs/roadmap/) — launch and release-readiness roadmaps
- [docs/planning/](docs/planning/) — implementation plans and quality follow-ups
- [docs/prompts/](docs/prompts/) — prompt-engineering analysis
- [docs/hosting/github-pages.md](docs/hosting/github-pages.md) — landing-page hosting and domain setup
- [docs/hosting/cloudflare-pages.md](docs/hosting/cloudflare-pages.md) — Expo web-app deployment on Cloudflare Pages
- [docs/STORE_SUBMISSION_CHECKLIST.md](docs/STORE_SUBMISSION_CHECKLIST.md) — store submission checklist
- [docs/INCIDENT_RUNBOOK.md](docs/INCIDENT_RUNBOOK.md) — incident handling guide

## Features

- **Hybrid Plant Scanner** — Snap a photo, let PlantNet identify the species, and use GPT-5.5 for care context and fallback handling
- **Plant Dex** — Build your plant encyclopedia with discovery tracking and explorer status
- **Care Tasks** — Create one-time or recurring tasks with automatic rescheduling and calendar view
- **AI Health Check** — Get a plant health score (0-100) via image analysis
- **Weather Integration** — Location-based weather data drives automatic care task suggestions
- **Leaderboard** — Compete with other gardeners on weekly, monthly, and all-time rankings
- **AI Gardener Assistant** — Chat with "Ben," your AI gardener with image analysis and function calling (main tab: "FloraScout")
- **Crash Monitoring** — Sentry integration with DSGVO-compliant PII filtering (no email/IP)
- **Onboarding Carousel** — 3-step swipeable intro for new users (value prop, features, credits)
- **In-App Feedback** — Users can submit bug reports and feature requests directly from the app
- **7 Languages** — German, English, French, Italian, Spanish, Russian, Turkish
- **Additional Features** — Plant diary with photos, push notifications, avatar generation, credit system

## Tech Stack

| Component     | Technology                                                                                |
| ------------- | ----------------------------------------------------------------------------------------- |
| Framework     | React Native 0.81 + Expo SDK 54                                                           |
| Language      | JavaScript (JSX) / TypeScript (Edge Functions)                                            |
| Backend       | Supabase (PostgreSQL, Auth, Storage, Edge Functions)                                      |
| AI            | PlantNet API + OpenAI GPT-5.5 + GPT-4o Vision + DALL-E 3 (server-side via Edge Functions) |
| Payments      | RevenueCat (iOS + Android)                                                                |
| Weather       | OpenWeather API                                                                           |
| Navigation    | React Navigation 6                                                                        |
| i18n          | i18n-js (7 languages)                                                                     |
| Notifications | expo-notifications                                                                        |
| Location      | expo-location                                                                             |
| Images        | expo-image (disk + memory cache, blurhash)                                                |
| Maps          | react-native-maps (Google Maps)                                                           |
| Tests         | Jest 29 + React Testing Library                                                           |
| Crash Monitor | Sentry (DSGVO-compliant, PII-filtered)                                                    |
| Linting       | ESLint + Prettier                                                                         |
| CI/CD         | GitHub Actions + EAS Build/Submit                                                         |

## Quick Start

### Prerequisites

- Node.js >= 18
- npm
- [Expo Go](https://expo.dev/go) app (for local testing on iOS/Android)
- Supabase project (Database, Auth, Storage, Edge Functions)
- RevenueCat account (in-app purchases)
- PlantNet API key
- OpenWeather API key
- Google Maps API key (Android + iOS, configured via EAS secret)

### Installation

```bash
# Clone the repository
git clone https://github.com/3lC4pt41n/Mein-Gaertner-App.git
cd Mein-Gaertner-App

# Install dependencies
npm install

# Set up environment variables (see .env.example)
cp .env.example .env.local

# Start the dev server
npx expo start
```

Then scan the QR code with Expo Go on your phone to run the app.

### Environment Setup

Create a `.env.local` file with:

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
SUPABASE_SECRET_KEY=your_supabase_secret_key
OPENAI_API_KEY=your_openai_key
PLANTNET_API_KEY=your_plantnet_key
OPENWEATHER_API_KEY=your_openweather_key
REVENUECAT_API_KEY_IOS=your_ios_key
REVENUECAT_API_KEY_ANDROID=your_android_key
GOOGLE_MAPS_API_KEY=your_maps_key
```

See `.env.example` for details.

### Storage Image Strategy

- `plant-images` are stored in DB as **storage paths** (not long-lived signed URLs).
- Signed URLs are generated **on-demand** in read flows (`getPlantImageUrl`, `getPlantImageUrls`).
- Legacy `http(s)` URLs remain backward-compatible and are passed through unchanged.

### Latest Updates (v1.4.3, June 2026)

- **Native Runtime Guard** — The app version was bumped so OTA updates for `1.4.3` are isolated from older native binaries.
- **Apple Sign-In Capability** — iOS config explicitly declares Apple Sign-In support for App Review and reproducible native builds.
- **Plant Dex Performance** — `expo-image` with disk caching, blurhash placeholders, and `recyclingKey`. `SectionList` virtualization (`windowSize`, `maxToRenderPerBatch`, `removeClippedSubviews`). `DexCard` wrapped in `React.memo`.
- **Signed URL Cache** — In-memory cache (50 min TTL, max 500 entries) in `uploadService.js` prevents redundant API calls for plant images.
- **Species Details Cache** — Server-side `species_details` table caches AI-generated plant details, reducing repeat Edge Function calls.
- **Maps Runtime Fix** — Google Maps key availability exposed via `extra.googleMapsEnabled` (native config sections are not accessible at JS runtime via `Constants.expoConfig`).
- **PlantListScreen Parallelization** — Plant list and healthscores load in parallel; plants render immediately while scores stream in.
- **Profile Draft Persistence** — Profile form state persists across auth state changes.

## Project Structure

```
.
├── App.js                          # Navigation & push notifications
├── supabase.js                     # Supabase client setup
├── sentry.config.js                # Sentry crash monitoring (DSGVO-compliant)
│
├── contexts/
│   └── AuthContext.js              # Central auth state (useAuth hook)
│
├── screens/                        # 21 screens (Home, Plants, Chat, Tasks, Dex, Onboarding, etc.)
├── services/                       # Business logic (AI, credits, tasks, plants, etc.)
├── components/                     # Reusable UI (EmptyState, ErrorState, OfflineState, OfflineBanner, etc.)
├── hooks/                          # Custom React hooks
├── theme/                          # Design system & tokens
├── i18n/                           # Translations (6 languages)
│
├── supabase/
│   ├── functions/                  # Edge functions (TypeScript)
│   │   ├── ai-plant-scan           # Plant identification
│   │   ├── ai-plant-details        # Generate plant details
│   │   ├── ai-healthcheck          # Health analysis
│   │   ├── ai-chat                 # Chat with Ben (+ function calling for task creation)
│   │   ├── ai-gardener-avatar      # Avatar generation
│   │   ├── weather-proxy           # Weather API proxy
│   │   ├── revenucat-webhook       # Payment webhooks
│   │   ├── delete-account          # DSGVO account deletion
│   │   ├── privacy-policy          # GDPR compliance (→ redirect to GitHub Pages)
│   │   └── _shared/               # Shared utilities (credits, OpenAI, rate-limit, validation)
│   └── migrations/                 # SQL database migrations
│
├── __tests__/                      # 13 test suites
├── .github/
│   ├── workflows/                  # CI/CD workflows
│   ├── ISSUE_TEMPLATE/             # Issue templates
│   └── pull_request_template.md    # PR template
│
├── store-assets/                   # App Store graphics
├── assets/                         # Icons & images
└── docs/                           # Documentation
```

## Available Scripts

```bash
npm start              # Start dev server
npm test               # Run Jest tests
npm run lint           # Lint code
npm run lint:fix       # Auto-fix linting
npm run format         # Format with Prettier
npm run ios            # Build for iOS
npm run android        # Build for Android
npm run web            # Run web version
```

## Credit System

The app uses a credit system for AI features:

| Feature            | Cost |
| ------------------ | ---- |
| Plant Scan         | 12   |
| Details Generation | 15   |
| Health Check       | 8    |
| Chat Message       | 3    |
| Avatar Generation  | 20   |

Users can purchase credits via subscriptions or one-time purchases. Beta testers receive 100 free credits.

See `services/pricingConfig.js` for the single source of truth.

## Deployment

### Edge Functions & Database

Automatic deployment via GitHub Actions on push to main:

```bash
git push origin main
# Automatically deploys all functions and migrations
```

Functions are deployed without JWT verification but validate all requests via custom headers.
Local store submission credentials are expected under `_local/credentials/` and are injected in CI
from repository secrets.

### App Builds

Trigger builds by tagging a release:

```bash
git tag v1.4.3
git push origin v1.4.3
# Automatically builds and submits to app stores via GitHub Actions
```

Manual build:

```bash
npm install -g eas-cli
eas build -p android --profile production
eas build -p ios --profile production
```

## Testing

```bash
# Run all tests
npm test

# Run a single suite
npx jest __tests__/services/languageService.test.js

# With coverage
npx jest --coverage
```

13 test suites cover core logic: task engine, scoring, language service, AI service, credit service, leaderboards, weather, notifications, error handling, auth context, chat service, and network policy.

## License

Source-available under [BSL 1.1](LICENSE). The repository converts to MIT on 2030-05-20.

---

Built with ❤️ for gardeners who love data.
