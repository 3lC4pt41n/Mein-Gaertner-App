🌱 Digitaler Gärtner App
Die KI-basierte Pflanzenpflege-App für iOS, Android & Web (React Native + Expo + Supabase + OpenAI GPT-4o).

🚀 Features
Pflanzen erkennen (via Foto & GPT-4o)

Pflanzenpflege speichern & anzeigen

Healthcheck mit Score (automatisch nach Erkennung)

Chatbot ("Ben") für Pflanzenfragen & Bildanalysen

Eigene Aufgaben / ToDo-Engine (Task System, Beta)

Supabase Storage für alle Bilder (keine BLOBs in der DB!)

Vollwertige Multi-User-Funktion mit Auth

Dark Mode & Mobile-First Design

EAS Cloud Build-ready (Android .apk, iOS .ipa)

Kein Backend selbst hosten nötig – alles SaaS-fähig

🗂️ Projektstruktur
bash
Kopieren
Bearbeiten
/screens
  AddPlantScreen.js
  PlantListScreen.js
  PlantDetailScreen.js
  AssistantScreen.js
  TaskListScreen.js
  ...
/services
  plantService.js
  chatService.js
  uploadService.js
  taskService.js
  ...
/assets
  /avatars
    ben.png
    tim.png
  ...
/supabase.js
/app.json, eas.json, package.json
...
⚡ Getting Started
1. Setup & Installation
Node.js >= 18 empfohlen

Git-Repo klonen

Alle Pakete installieren:

sh
Kopieren
Bearbeiten
npm install
2. Umgebungsvariablen
Supabase:
SUPABASE_URL, SUPABASE_ANON_KEY
→ in /supabase.js eintragen

OpenAI API Key:

Wird in Supabase Tabelle config hinterlegt:

sql
Kopieren
Bearbeiten
INSERT INTO config (key, value) VALUES ('OPENAI_API_KEY', 'sk-...');
3. Starten
Web:

sh
Kopieren
Bearbeiten
npx expo start --web
Android/iOS:

sh
Kopieren
Bearbeiten
npx expo start
... und dann QR-Code mit der Expo Go App scannen.

4. Cloud Build (Beta-APK für Tester)
Siehe Abschnitt "Build & Beta" weiter unten!

🛠️ Technische Hauptbestandteile
Expo SDK 53

React Native 0.79+

Supabase (DB + Auth + Storage)

OpenAI GPT-4o

expo-image-picker

@react-native-community/datetimepicker

Cloud-first (keine lokalen DBs, alles sync-fähig)

🧩 Wichtigste Services & Logic
Pflanzen-Upload & Erkennung
Fotos werden IMMER erst in Supabase Storage hochgeladen (plant-images oder chat-images)

Die URL (kein base64) wird in der Tabelle plants oder messages gespeichert

Bildanalyse (GPT) immer über signed URL (nicht über base64!)
→ robust für Web UND Android/iOS

Chatbot ("Ben")
GPT-4o, mit system prompt für Persönlichkeit

Kennt Kontext, akzeptiert Bilder (als Link, nicht als base64)

Healthcheck
Healthcheck-Resultat wird in eigener Tabelle plant_healthcheck gespeichert, inkl. Bewertungsmatrix

Der neueste Healthcheck wird im PlantDetailScreen angezeigt

Aufgaben/Task-System (Beta)
Aufgaben mit Typ, Zeit, Notiz pro Pflanze

Logik nach dem Scheduling-Blueprint (siehe [docs/Ben-TaskEngine.md])

📦 Cloud Build & Beta Testing
APK für Beta-User bauen (EAS Build)
EAS CLI installieren

sh
Kopieren
Bearbeiten
npm install -g eas-cli
eas.json prüfen

json
Kopieren
Bearbeiten
{
  "build": {
    "preview": {
      "android": { "buildType": "apk" }
    }
  }
}
Build starten

sh
Kopieren
Bearbeiten
eas build -p android --profile preview
Download-Link aus dem Terminal kopieren (kommt nach ein paar Minuten)

Tester installieren das APK direkt
(ggf. "Unbekannte Quellen" erlauben)

🐞 Troubleshooting
Bilder erscheinen nicht im Bucket:
Prüfe:

Die verwendete Upload-Funktion (uploadService.js)

Korrekte Bucket-Namen ("plant-images", "chat-images")

Richtiger Content-Type (image/jpeg)

fetch(uri).blob() funktioniert auf Web UND Mobile (bei Mobile KEIN base64 nötig!)

Network Request Failed auf Android:

Android benötigt ggf. zusätzliche Berechtigungen (AndroidManifest.xml)

Prüfe, ob die supabase.storage.from(...).upload-Funktion das richtige Format erhält

Logging (DEBUG=true) aktivieren, um Fehler zu sehen

Foto kommt im Chat an, aber nicht in DB:

Prüfe, ob nach dem Upload auch saveMessage korrekt aufgerufen wird (mit image_url)

Prüfe, ob das URL-Feld in Supabase nicht null ist

GPT erkennt Foto nicht:

Schicke den signed URL als "image_url" an OpenAI (nicht base64, nicht public URL!)

Web: Blob-Upload

Android/iOS: URI direkt via fetch + blob (siehe uploadService.js)

App lässt sich nicht bauen:

Prüfe alle Dependency-Warnungen nach Expo-Upgrade (SDK 53 ist neu, ggf. sind manche Libs inkompatibel → immer changelog lesen!)

🧑‍💻 Entwicklung
Neue Screens immer als eigene Datei in /screens

Wiederverwendbare Logik → /services

Assets, Avatare → /assets

Supabase-Tabellenstruktur und Migrationsskripte → /docs/db-schema.sql

Feature-Roadmap & Architektur → /docs/Ben-TaskEngine.md

🏗️ Weitere Pläne
Full Task-Engine nach Backbone-Blueprint

Gamification, Score, Leaderboard

Offline-Fähigkeit

iOS-TestFlight Build

Push Notifications

💡 FAQ
Q: Wie kann ich einen neuen Plant-Healthcheck anstoßen?
A: Über den "Healthcheck durchführen"-Button im PlantDetailScreen.

Q: Wieso erscheinen meine Fotos nicht sofort in der Liste?
A: Stelle sicher, dass das Bild-Upload abgeschlossen ist und die URL in die DB geschrieben wurde, bevor die Pflanze gespeichert wird.

📄 Lizenz
MIT, 2024/2025 by Tim & Monday
[OpenAI GPT Support, not affiliated]

Letztes Update: 2025-07-07
(Bitte bei jedem größeren Commit mit-pflegen!)

Bei Fragen:
monday@digitaler-gaertner.app oder hier im Chat

