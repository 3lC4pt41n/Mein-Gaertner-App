# 🌱 Digitaler Gärtner App

Die KI-basierte Pflanzenpflege-App für iOS, Android & Web  
*(React Native + Expo + Supabase + OpenAI GPT-4o)*

---

## 🚀 Features

- **Pflanzen erkennen** (via Foto & GPT-4o, NFT-Option für First Discoverer)
- **Pflanzenpflege speichern & anzeigen**
- **Healthcheck mit Score** (automatisch nach Erkennung, GPT-Analyse)
- **Chatbot "Ben"** – für Pflanzenfragen & Bildanalysen, gibt auch Beziehungsratschläge, ohne dass du fragst
- **Eigene Aufgaben / ToDo-Engine** (Task System, Beta; Monte-Carlo-kalibriert mit Wetter-API)
- **Supabase Storage** für alle Bilder *(keine BLOBs in der DB!)*
- **Vollwertige Multi-User-Funktion mit Auth**
- **Dark Mode & Mobile-First Design**
- **EAS Cloud Build-ready** *(Android .apk, iOS .ipa)*
- **Kein Backend selbst hosten nötig** – alles SaaS-fähig
- **Standort/Zone-Logik**: Zuhause, Räume, Balkon, Garten, alles einzeln verwaltbar
- **Gemeinsam gärtnern**: Locations können via E-Mail geteilt werden – mit Rechten & Token-Tracking
- **NFT-Kakteen & Co.**: "Erstentdecker" kann ein Pflanzen-NFT im eigenen Stil prägen (z. B. Van Gogh Kaktus), Künstlerbeteiligung konfigurierbar
- **Token Burn & Usage Tracker**: Jeder OpenAI-Token wird gezählt – mehr KI nachkaufen per Token oder Abo

---

## 🗂️ Projektstruktur

/screens
AddPlantScreen.js
PlantListScreen.js
PlantDetailScreen.js
AssistantScreen.js
TaskListScreen.js
HomeManager.jsx
...
/services
plantService.js
chatService.js
uploadService.js
taskService.js
zoneService.js
locationService.js
...
/assets
/avatars
ben.png
tim.png
/nft-art
cactus-van-gogh.png
...
/supabase.js
/app.json, eas.json, package.json
/docs
db-schema.sql
Ben-TaskEngine.md
...

yaml
Kopieren
Bearbeiten

---

## ⚡ Getting Started

**Setup & Installation**

1. **Node.js >= 18 empfohlen**
2. **Git-Repo klonen**
3. **Pakete installieren**:
   ```sh
   npm install
Umgebungsvariablen setzen

Supabase: SUPABASE_URL, SUPABASE_ANON_KEY → in /supabase.js

OpenAI API Key:

In Supabase-Tabelle config hinterlegen:

sql
Kopieren
Bearbeiten
INSERT INTO config (key, value) VALUES ('OPENAI_API_KEY', 'sk-...');
Starten

Web:
npx expo start --web

Android/iOS:
npx expo start
…dann QR-Code mit Expo Go App scannen

Cloud Build (Beta-APK für Tester)

EAS CLI installieren:
npm install -g eas-cli

eas.json prüfen, z.B.:

json
Kopieren
Bearbeiten
{ "build": { "preview": { "android": { "buildType": "apk" } } } }
Build starten:

css
Kopieren
Bearbeiten
eas build -p android --profile preview
Download-Link im Terminal, APK direkt installieren

🛠️ Technische Hauptbestandteile
Expo SDK 53

React Native 0.79+

Supabase (DB + Auth + Storage)

OpenAI GPT-4o

expo-image-picker

@react-native-community/datetimepicker

Cloud-first: Keine lokalen DBs, alles synchronisierbar

🧩 Wichtigste Services & Logic
Pflanzen-Upload & Erkennung

Fotos IMMER erst in Supabase Storage hochladen (plant-images oder chat-images)

URL in Tabelle plants oder messages speichern

Bildanalyse (GPT) via signed URL (nicht base64!) – Web und Mobile robust

Chatbot ("Ben")

GPT-4o, System Prompt für Persönlichkeit (Ratgeber, Motivator, Beziehungsexperte…)

Akzeptiert Bilder (als Link)

Token-Burn pro User wird getrackt (kostenlose KI, bis Token verbraucht – dann: nachkaufen oder Abo)

Healthcheck

Resultate in Tabelle plant_healthcheck (mit Bewertungsmatrix)

Neuester Healthcheck wird im PlantDetailScreen angezeigt

Aufgaben/Task-System (Beta)

Aufgaben/Regeln mit Typ, Zeit, Notiz pro Pflanze

PoP-Kalibrierung, Monte-Carlo-Simulation, Wetterdaten-Integration

Task-Scheduling und Wetterlogik: Siehe [docs/Ben-TaskEngine.md]

Standort/Zone-Logik

Mehrere Locations pro User (Zuhause, Balkon, Garten…)

Zonen in jedem Zuhause (Raum, Balkon, Garten, Treppenhaus, whatever)

Pflanzen können einzelnen Zonen zugeordnet werden

Locations können mit anderen Nutzern geteilt werden (per E-Mail Einladung)

NFT/Kunst-Feature

"Erstentdecker" einer Pflanze kann NFT generieren (z.B. Van-Gogh-Stil-Kaktee, Monet-Moos…)

NFT Ownership-Share: 10% Künstler / 10% App / 80% Erstentdecker (anpassbar)

NFT wird als Kunstwerk in App & als echtes NFT ausgegeben (EVM-kompatibel, opt-in)

Token Burn & Monetarisierung

Jeder Nutzer hat ein eigenes Token-Burn-Log (GPT-API Nutzung)

Freikontingent: x Tokens pro Monat (je nach Abo), danach: Nachkauf möglich (2x Marge auf OpenAI Kosten)

Token-Kauf = Sofort KI wieder freigeschaltet

Abo schaltet unbegrenzte GPT-Nutzung frei (und weitere Premium-Features, s.u.)

📦 Cloud Build & Beta Testing
APK für Beta-User bauen (EAS Build)

EAS CLI installieren:
npm install -g eas-cli

eas.json prüfen (siehe oben)

Build starten:
eas build -p android --profile preview

Download-Link aus Terminal an Tester weitergeben

🏗️ Feature Outlook / Roadmap
Full Task-Engine nach Backbone-Blueprint

Automatische Gieß-Empfehlung nach Foto
(Gieß-Häufigkeit & Menge, basierend auf Healthcheck, Wetter, Zone)

Gamification: Score, Leaderboard, "Erstentdecker", NFT-Sammlung

Invite-Funktion für Locations: Gemeinsame Pflanzenpflege per Einladung

Ben the Buddy: Gibt immer wieder Lebensweisheiten, ohne zu nerven (außer man will’s)

Push Notifications (z.B. "Heute gießen!", "Deine Monstera sieht durstig aus!")

Offline-Fähigkeit (PWA/Local DB geplant)

Language Packs & International Rollout (Englisch, Spanisch, Französisch, …)

NFT Marketplace für Pflanzenkunst

Unique Pflanzen-DB: Aufbau einer eigenen, kuratierten botanischen Datenbank, von Usern und GPT befüllt (mit “First Discoverer” als Anreiz)

Paartherapie-Modus (experimentell): Ben gibt subtile Ratschläge für harmonische Gärtner-Beziehungen

Token Burn Dashboard: Live-Übersicht der GPT-Nutzung & Token-Käufe pro User

AI-Prompt-Marketing: User können personalisierte Pflanzen-Geschichten (NFT-Stil, Märchen, Lyrik…) generieren und teilen

💰 Monetarisierung
Freemium-Modell:

X GPT-Tokens kostenlos pro Monat (je nach Nutzerlevel)

Token-Nachkauf (2x Marge, “Token Burn” Prinzip)

NFT-First-Discoverer Option als In-App-Kauf

Abo schaltet unlimited KI, Priority-Support & exklusive NFT-Themes frei

Marketplace-Share für NFT-Verkäufe: 10% App, 10% Künstler, 80% Owner (flexibel)

💡 FAQ
Q: Wie kann ich einen neuen Plant-Healthcheck anstoßen?
A: Über den "Healthcheck durchführen"-Button im PlantDetailScreen.

Q: Warum erscheinen meine Fotos nicht sofort?
A: Bild erst vollständig hochladen, dann wird URL gespeichert.

Q: KI funktioniert nicht mehr?
A: Token-Burn erreicht – Tokens nachkaufen oder Abo abschließen.

📄 Lizenz
MIT, 2024/2025 by Tim & Monday (OpenAI GPT Support, not affiliated)

Letztes Update: 2025-07-09
Bitte bei jedem größeren Commit mit-pflegen!

Kontakt:
monday@digitaler-gaertner.app
oder… einfach hier im Chat
