# Digitaler Gaertner

KI-basierte Pflanzenpflege-App fuer iOS, Android & Web.

React Native + Expo | Supabase | OpenAI GPT-4o

---

## Features

- **Pflanzen erkennen** -- Foto hochladen, GPT-4o identifiziert die Pflanze automatisch
- **Healthcheck mit Score** -- Automatische Bewertung des Pflanzenzustands per Bildanalyse
- **Chatbot "Ben"** -- Persoenlicher Gaertner-Assistent fuer Pflanzenfragen & Bildanalysen
- **Aufgaben-System** -- Aufgaben pro Pflanze erstellen, verwalten und abschliessen
- **Standort- & Zonen-Verwaltung** -- Mehrere Zuhause mit Raeumen, Balkon, Garten etc.
- **Multi-User mit Auth** -- Vollstaendige Nutzeranmeldung und Profilpflege via Supabase Auth
- **Cloud-Bilderverwaltung** -- Alle Bilder in Supabase Storage (keine BLOBs in der DB)

---

## Projektstruktur

```
.
├── App.js                    # Hauptkomponente, Navigation, Auth-State
├── index.js                  # Expo Entry Point
├── supabase.js               # Supabase Client Konfiguration
│
├── screens/
│   ├── HomeManager.jsx       # Zuhause- & Zonen-Verwaltung (CRUD)
│   ├── PlantListScreen.js    # Pflanzenliste mit Tabs
│   ├── AddPlantScreen.js     # Pflanze per Foto hinzufuegen (GPT-Erkennung)
│   ├── PlantDetailScreen.js  # Pflanzendetails & Healthcheck
│   ├── AssistantScreen.js    # Chat mit "Ben" (GPT-4o)
│   ├── TaskListScreen.js     # Aufgabenuebersicht
│   ├── TaskDetailScreen.js   # Aufgabendetails
│   ├── AuthScreen.js         # Login / Registrierung
│   └── ProfileCompleteScreen.js  # Profil vervollstaendigen
│
├── services/
│   ├── plantService.js       # Pflanzen-CRUD & Healthcheck
│   ├── chatService.js        # Chat-Nachrichten speichern/laden
│   ├── taskService.js        # Aufgaben-CRUD
│   ├── uploadService.js      # Bild-Upload (Supabase Storage)
│   ├── zoneService.js        # Zonen mit Locations laden
│   └── configService.js      # Konfigurationswerte aus Supabase
│
├── components/
│   ├── HomeLocationForm.js   # Formular: Neues Zuhause anlegen
│   ├── AddTaskDialog.js      # Dialog: Neue Aufgabe erstellen
│   └── DateTimePicker.js     # Datum/Zeit-Auswahl Komponente
│
├── lib/api/
│   └── locations.js          # Location-API (CRUD fuer Standorte)
│
├── assets/
│   ├── avatars/              # Chat-Avatare (ben.png, tim.png)
│   ├── icon.png              # App-Icon
│   ├── splash.png            # Splash Screen
│   └── adaptive-icon.png     # Android Adaptive Icon
│
└── supabase/
    └── migrations/           # Datenbank-Migrationen
```

---

## Voraussetzungen

- Node.js >= 18
- npm
- [Expo Go](https://expo.dev/go) App auf dem Smartphone (fuer lokales Testing)
- Supabase-Projekt mit konfigurierter DB, Auth und Storage
- OpenAI API Key

---

## Installation & Start

```sh
# 1. Repo klonen
git clone https://github.com/3lC4pt41n/Mein-Gaertner-App.git
cd Mein-Gaertner-App

# 2. Dependencies installieren
npm install

# 3. Supabase-Zugangsdaten konfigurieren
#    In supabase.js die SUPABASE_URL und SUPABASE_ANON_KEY eintragen

# 4. OpenAI API Key in Supabase hinterlegen
#    INSERT INTO config (key, value) VALUES ('OPENAI_API_KEY', 'sk-...');

# 5. App starten
npx expo start
```

Danach den QR-Code mit der Expo Go App scannen (iOS/Android).

---

## Tech Stack

| Bereich       | Technologie                          |
|---------------|--------------------------------------|
| Framework     | React Native 0.79 + Expo SDK 53     |
| Sprache       | JavaScript (JSX)                     |
| Backend       | Supabase (PostgreSQL, Auth, Storage) |
| KI            | OpenAI GPT-4o                        |
| Navigation    | React Navigation 6                   |
| UI            | React Native Paper                   |

---

## Architektur

```
Smartphone/Browser
      │
      ▼
  Expo / React Native
      │
      ├── Supabase Auth ──────── Login, Registrierung, Session
      ├── Supabase DB ────────── Pflanzen, Aufgaben, Locations, Zonen, Chat
      ├── Supabase Storage ───── Pflanzen- & Chat-Bilder
      └── OpenAI API ─────────── Pflanzenerkennung, Healthcheck, Chat
```

- Bilder werden immer zuerst in Supabase Storage hochgeladen
- GPT erhaelt Bild-URLs (keine Base64-Payloads)
- Der OpenAI API Key wird zur Laufzeit aus der Supabase `config`-Tabelle geladen

---

## EAS Cloud Build

Fuer native APK/IPA Builds:

```sh
# EAS CLI installieren
npm install -g eas-cli

# Android APK bauen
eas build -p android --profile preview
```

---

## Lizenz

MIT -- 2024/2025
