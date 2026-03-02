# Digitaler Gaertner

KI-basierte Pflanzenpflege-App fuer iOS, Android & Web.

React Native 0.81 + Expo SDK 54 | Supabase | OpenAI GPT-4o | RevenueCat

---

## Features

- **Pflanzen erkennen** -- Foto aufnehmen, GPT-4o identifiziert die Pflanze automatisch
- **Healthcheck mit Score** -- KI-Bewertung des Pflanzenzustands per Bildanalyse (0-100)
- **Chatbot "Ben"** -- Persoenlicher Gaertner-Assistent mit Chat-Verlauf, Bildanalyse & Function Calling (Aufgaben erstellen, Wetter abfragen, Pflanzen nachschlagen)
- **Pflanzen-Dex** -- Enzyklopaedie aller Pflanzenarten mit Entdeckungs-Tracking, Erst-Entdecker-Status und Fortschrittsanzeige
- **Pflanzen-Tagebuch** -- Manuelle Eintraege mit Fotos, Auto-Logging von Healthchecks, Aufgaben & Entdeckungen, Timeline- und Galerie-Ansicht
- **Wetterbasierte Pflege** -- Standortbasierte Wetterdaten (OpenWeather API), automatische Pflege-Aufgaben je nach Wetterlage
- **Gaertner-Avatar** -- KI-generiertes Profilbild im Gaertner-Stil
- **Aufgaben-System** -- Einmalige & wiederkehrende Aufgaben mit Auto-Rescheduling und Kalenderansicht
- **Push-Benachrichtigungen** -- Lokale Erinnerungen fuer faellige Pflegeaufgaben
- **Standort- & Zonen-Verwaltung** -- Mehrere Zuhause mit Raeumen, Balkon, Garten etc.
- **Rangliste & Scoring** -- Gaertner-Score und Entdecker-Score mit Wettbewerb
- **Credit-System** -- KI-Funktionen kosten Credits, kaufbar per Abo oder Einmalkauf
- **Feedback-System** -- In-App Feedback (Bug, Feature, Sonstiges) direkt an die Datenbank
- **Admin Dashboard** -- Tagesstatistiken, Nutzer-Details und Umsatz-Tracking
- **6 Sprachen** -- Deutsch, English, Français, Italiano, Español, Русский
- **Offline-Erkennung** -- Banner bei fehlender Internetverbindung
- **Design System** -- Einheitliche UI-Tokens, wiederverwendbare Komponenten
- **DSGVO-konform** -- Datenschutzerklaerung, Konto-Loeschung mit 30-Tage-Frist, Cascade Delete

---

## Projektstruktur

```
.
├── App.js                        # Navigation, Push-Notification-Setup
├── index.js                      # Expo Entry Point
├── supabase.js                   # Supabase Client Konfiguration
│
├── contexts/
│   └── AuthContext.js            # Zentraler Auth-State (useAuth Hook)
│
├── screens/
│   ├── HomeManager.jsx           # Zuhause- & Zonen-Verwaltung (CRUD)
│   ├── PlantListScreen.js        # Pflanzenliste mit Tabs (Alle / Zuhause)
│   ├── AddPlantScreen.js         # Pflanze per Foto hinzufuegen (GPT-Scan)
│   ├── PlantDetailScreen.js      # Pflanzendetails, Healthcheck, Tagebuch, Zonenzuweisung
│   ├── AssistantScreen.js        # Chat mit "Ben" (GPT-4o + Bildanalyse + Function Calling)
│   ├── PlantDexScreen.js         # Pflanzen-Dex Enzyklopaedie mit Entdeckungs-Tracking
│   ├── TaskListScreen.js         # Aufgabenuebersicht mit Erledigt/Uebersprungen
│   ├── TaskDetailScreen.js       # Aufgabendetails & Historie
│   ├── CalendarScreen.js         # Kalenderansicht fuer Aufgaben
│   ├── TodayScreen.js            # Heutige Aufgaben
│   ├── StoreScreen.js            # Credit-Shop (Abos + Einmalkaeufe)
│   ├── LeaderboardScreen.js      # Rangliste (Woche/Monat/Gesamt)
│   ├── FeedbackScreen.js         # In-App Feedback (Bug/Feature/Sonstiges)
│   ├── AuthScreen.js             # Login / Registrierung / Passwort-Reset
│   ├── ProfileCompleteScreen.js  # Profil vervollstaendigen + Avatar
│   ├── DrawerProfileScreen.js    # Profil bearbeiten (Drawer)
│   ├── AdminDashboardScreen.js   # Admin: Statistiken & User-Details
│   ├── BetaWelcomeScreen.js      # Beta-Onboarding mit Credit-Erklaerung
│   └── MenuHomeScreen.js         # Menue-Uebersicht
│
├── services/
│   ├── aiService.js              # Edge-Function-Calls (Scan, Details, Health, Chat, Avatar)
│   ├── creditService.js          # Credit-Guthaben, Usage-History, Transaktionen
│   ├── purchaseService.js        # RevenueCat Init, Offerings, Kaeufe
│   ├── taskService.js            # Aufgaben-CRUD, Recurring, Auto-Reschedule, Scoring
│   ├── plantService.js           # Pflanzen-CRUD & Healthcheck-Speicherung
│   ├── chatService.js            # Chat-Nachrichten speichern/laden
│   ├── uploadService.js          # Bild-Upload (Supabase Storage)
│   ├── zoneService.js            # Zonen mit Locations laden
│   ├── languageService.js        # Sprach-Normalisierung & i18n-Steuerung
│   ├── leaderboardService.js     # Ranking-Daten & Opt-in
│   ├── discoveryService.js       # Entdecker-Score (neue Pflanzenarten)
│   ├── notificationService.js    # Push-Notifications (Permissions, Scheduling)
│   ├── configService.js          # Konfigurationswerte aus Supabase
│   ├── dexService.js             # Pflanzen-Dex: fetchDex, getDexProgress, getSpeciesDetails
│   ├── diaryService.js           # Tagebuch: Eintraege, Auto-Logging, Galerie
│   └── weatherService.js         # Wetter: OpenWeather API, Standort-Caching, Forecast
│
├── components/
│   ├── ErrorBoundary.js          # Fehler-Auffangkomponente mit Retry
│   ├── AppLoadingScreen.js       # Splash-Screen waehrend App-Start
│   ├── OfflineBanner.js          # Offline-Hinweis bei Netzwerkverlust
│   ├── AddTaskDialog.js          # Aufgabe erstellen (Modal)
│   ├── CreditBadge.js            # Credit-Anzeige
│   ├── HomeLocationForm.js       # Formular: Neues Zuhause anlegen
│   ├── DateTimePicker.js         # Datum/Zeit-Auswahl
│   ├── DexCard.js                # Pflanzen-Dex Kartenkomponente
│   ├── DiaryTimeline.js          # Tagebuch-Timeline mit Pagination
│   ├── PlantGallery.js           # 3-Spalten Fotogalerie mit Lightbox
│   └── WeatherWidget.js          # Wetteranzeige mit Icons & Temperatur
│
├── hooks/
│   └── useNetworkStatus.js       # NetInfo-basierter Connectivity-Hook
│
├── theme/
│   ├── tokens.js                 # Design-Tokens (Colors, Spacing, Typography)
│   ├── index.js                  # Theme-Export
│   ├── DSButton.js               # Design-System Button
│   ├── DSCard.js                 # Design-System Card
│   ├── DSBadge.js                # Design-System Badge
│   ├── DSChips.js                # Design-System Chips
│   └── DSInput.js                # Design-System Input
│
├── i18n/
│   ├── index.js                  # i18n-js Setup (6 Sprachen)
│   └── locales/
│       ├── de.json               # Deutsch
│       ├── en.json               # English
│       ├── es.json               # Español
│       ├── fr.json               # Français
│       ├── it.json               # Italiano
│       └── ru.json               # Русский
│
├── __tests__/                    # 89 Tests, 7 Suites
│   ├── scoring.test.js           # Scoring-Algorithmus
│   ├── taskEngine.test.js        # Task-Engine (Recurring, Catch-Up)
│   ├── services/
│   │   ├── languageService.test.js
│   │   ├── aiService.test.js
│   │   └── creditService.test.js
│   ├── components/
│   │   └── ErrorBoundary.test.js
│   └── contexts/
│       └── AuthContext.test.js
│
├── supabase/
│   ├── config.toml               # Supabase Projekt-Config
│   ├── functions/                # Edge Functions (TypeScript)
│   │   ├── _shared/              # Shared: credits, openai, supabase-client, tokens
│   │   ├── ai-plant-scan/        # Pflanzenerkennung per Foto
│   │   ├── ai-plant-details/     # Detail-Generierung aus Name
│   │   ├── ai-healthcheck/       # Gesundheits-Analyse per Bild
│   │   ├── ai-chat/              # Chat mit Ben (inkl. Function Calling)
│   │   ├── ai-gardener-avatar/   # Avatar-Generierung
│   │   ├── revenucat-webhook/    # RevenueCat Abo-Webhook
│   │   └── privacy-policy/       # DSGVO-konforme Datenschutzerklaerung
│   └── migrations/               # SQL Migrationen (inkl. Diary, Dex, Feedback, DSGVO)
│
├── .github/workflows/            # CI/CD
│   ├── ci.yml                    # Tests & Linting
│   ├── eas-build-submit.yml      # EAS Build & Store-Upload (Tag-getriggert)
│   ├── eas-update.yml            # OTA Updates
│   └── supabase-deploy.yml       # Edge Functions & Migrations
│
├── store-assets/                 # Google Play / App Store Grafiken
│   ├── app-icon-512.*            # App-Symbol (512x512)
│   ├── feature-graphic.*         # Vorstellungsgrafik (1024x500)
│   └── screenshot-*.png          # Screenshots (1080x1920)
│
├── docs/
│   └── privacy-policy.html       # Datenschutzerklaerung (GitHub Pages)
│
├── account-deletion.html         # Konto-Loeschseite (DE/EN, DSGVO)
│
├── email-templates/              # Supabase Auth E-Mail-Templates
│
├── lib/api/
│   └── locations.js              # Location-API (CRUD)
│
└── assets/
    ├── icon.png / splash.png     # App-Icons & Splash
    └── avatars/                  # Chat-Avatare
```

---

## Voraussetzungen

- Node.js >= 18
- npm
- [Expo Go](https://expo.dev/go) App auf dem Smartphone (fuer lokales Testing)
- Supabase-Projekt mit konfigurierter DB, Auth, Storage und Edge Functions
- RevenueCat-Projekt fuer In-App-Kaeufe (iOS + Android Keys)
- OpenWeather API Key (fuer Wetter-Feature)

---

## Installation & Start

```sh
# 1. Repo klonen
git clone https://github.com/3lC4pt41n/Mein-Gaertner-App.git
cd Mein-Gaertner-App

# 2. Dependencies installieren
npm install

# 3. Supabase-Zugangsdaten in supabase.js konfigurieren
#    SUPABASE_URL und SUPABASE_ANON_KEY eintragen

# 4. App starten
npx expo start
```

Danach den QR-Code mit der Expo Go App scannen (iOS/Android).

---

## Verfuegbare Scripts

```sh
npm start          # Expo Dev Server starten
npm test           # Jest Tests ausfuehren (89 Tests, 7 Suites)
npm run lint       # ESLint Pruefung
npm run lint:fix   # ESLint Auto-Fix
npm run format     # Prettier Formatierung
npm run ios        # iOS Build starten
npm run android    # Android Build starten
```

---

## Architektur

```
Smartphone / Browser
      │
      ▼
  Expo / React Native
      │
      ├── AuthContext ──────────── Zentraler Auth-State (useAuth Hook)
      ├── Supabase Auth ────────── Login, Registrierung, Passwort-Reset, Google SSO
      ├── Supabase DB ──────────── Pflanzen, Aufgaben, Locations, Zonen, Chat, Scores,
      │                            Tagebuch, Dex, Feedback
      ├── Supabase Storage ─────── Pflanzen-Bilder, Chat-Bilder, Avatare, Tagebuch-Fotos
      ├── Edge Functions ───────── KI-Proxy (OpenAI Key bleibt server-seitig)
      │   ├── ai-plant-scan       Pflanzenerkennung
      │   ├── ai-plant-details    Detail-Generierung
      │   ├── ai-healthcheck      Gesundheits-Check
      │   ├── ai-chat             Chat mit Ben (+ Function Calling)
      │   ├── ai-gardener-avatar  Avatar-Erstellung
      │   └── privacy-policy      Datenschutzerklaerung
      ├── OpenWeather API ────────── Wetterdaten fuer standortbasierte Pflege
      ├── RevenueCat ───────────── In-App-Kaeufe (Abos + Einmal)
      └── expo-notifications ───── Lokale Push-Benachrichtigungen
```

**Sicherheit:** Der OpenAI API Key liegt ausschliesslich in den Supabase Edge Functions. Das Frontend hat keinen direkten Zugriff. Alle KI-Aufrufe laufen ueber `supabase.functions.invoke()` mit JWT-Authentifizierung.

**Credits:** Jede KI-Funktion verbraucht Credits. Die Abbuchung erfolgt atomar via PostgreSQL RPC (`deduct_credits`), um Race Conditions zu vermeiden.

**DSGVO:** Vollstaendige Datenschutzerklaerung, Konto-Loeschung mit 30-Tage Hard-Delete, Cascade Delete fuer alle nutzerbezogenen Daten.

---

## Tech Stack

| Bereich         | Technologie                                   |
|-----------------|-----------------------------------------------|
| Framework       | React Native 0.81 + Expo SDK 54              |
| Sprache         | JavaScript (JSX) + TypeScript (Edge Functions)|
| State           | React Context API (AuthContext)               |
| Backend         | Supabase (PostgreSQL, Auth, Storage, Edge Fn) |
| KI              | OpenAI GPT-4o (via Edge Functions)            |
| Wetter          | OpenWeather API (Forecast + Current)          |
| Navigation      | React Navigation 6 (Bottom Tabs + Stack)      |
| UI              | React Native Paper + eigenes Design System    |
| Payments        | RevenueCat (iOS + Android)                    |
| i18n            | i18n-js (DE, EN, FR, IT, ES)                  |
| Notifications   | expo-notifications (lokal)                    |
| Standort        | expo-location                                 |
| Offline         | @react-native-community/netinfo               |
| Tests           | Jest 30 + React Testing Library               |
| Linting         | ESLint (expo-config) + Prettier               |
| CI/CD           | GitHub Actions + EAS Build + Expo Updates     |

---

## Credit-System

| Aktion                | Credits |
|-----------------------|---------|
| Pflanze scannen       | 5       |
| Details generieren    | 3       |
| Healthcheck           | 5       |
| Chat mit Ben          | 1       |
| Avatar generieren     | 10      |

Credits sind per Abo (33% guenstiger, monatlich aufgefuellt) oder als Einmalkauf erhaeltlich. Beta-Tester erhalten 100 Gratis-Credits.

---

## Scoring & Rangliste

- **Gaertner-Score:** Punkte fuer erledigte Aufgaben (gewichtet nach Typ)
- **Entdecker-Score:** Punkte fuer neu entdeckte Pflanzenarten
- **Streak:** Tage in Folge mit erledigten Aufgaben
- **Zeitfenster:** Woche / Monat / Gesamt
- **Opt-in:** Nutzer muessen die Rangliste im Profil aktivieren

---

## EAS Cloud Build & CI/CD

Builds werden automatisch per GitHub Actions getriggert (Tag-Push):

```sh
# Version taggen und pushen (triggert Build + Store-Submit)
git tag v1.0.7
git push origin v1.0.7
```

Manuell:

```sh
# EAS CLI installieren
npm install -g eas-cli

# Android APK bauen
eas build -p android --profile preview

# iOS Build
eas build -p ios --profile preview
```

---

## Tests

```sh
# Alle Tests ausfuehren
npm test

# Einzelne Suite
npx jest __tests__/services/languageService.test.js

# Mit Coverage
npx jest --coverage
```

**89 Tests** in 7 Suiten:
- `taskEngine.test.js` -- Recurring Tasks, Catch-Up, Reschedule
- `scoring.test.js` -- Punkteberechnung, Gewichtung
- `languageService.test.js` -- Normalisierung, Aliase, Labels
- `aiService.test.js` -- Edge-Function-Calls, 402-Handling
- `creditService.test.js` -- Balance-Fetch, Error-Handling
- `ErrorBoundary.test.js` -- Fallback-UI, Retry, Details
- `AuthContext.test.js` -- Provider, useAuth Shape, Admin-Erkennung

---

## Lizenz

MIT -- 2024-2026
