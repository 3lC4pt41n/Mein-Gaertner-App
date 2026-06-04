# Web-App Plan — FloraPilot (digitaler-gaertner)

**Stand:** 2026-06-02 · **Version:** 1.0
**Ziel:** Eine Web-App neben iOS und Android, mit voller Feature-Parität. Bilder, die im Web hochgeladen werden, werden erkannt und wie Handy-Fotos zu Pflanzen hinzugefügt — **nehmen aber nicht an den (Erst-)Entdeckungen teil.**

**Entscheidungen (bestätigt):**

- **Scope:** Volle Parität (alle Screens)
- **Enforcement:** Client-Gate **plus** Server-Härtung (abuse-sicher)
- **Hosting:** Cloudflare Pages (analog zu „Der Dritte")

---

## 1. Ausgangslage (Ist-Zustand)

Das Repo ist bereits web-fähig vorbereitet, aber Web ist kein offizielles Target:

- `react-native-web@^0.21.0`, `react-dom@19.1.0` sind als Dependencies vorhanden.
- `package.json` hat `"web": "expo start --web"`.
- Es existiert ein `dist/`-Verzeichnis und eine große `index.html` (≈150 KB) — also wurde bereits mindestens einmal ein Web-Export erzeugt.
- Expo SDK 54 / React Native 0.81 / React 19 — moderner Stack, web-tauglich.

**Discovery-Mechanik (der Kern der Anforderung):**

Der einzige Aufrufer von `logDiscovery` ist `screens/AddPlantScreen.js`. In `handleSave` wird die Entdeckung **nur** geloggt, wenn `scanMode === 'ai'`:

```js
// screens/AddPlantScreen.js  (handleSave)
let discovery = null;
if (scanMode === 'ai') {
  const location = await getDiscoveryLocation();
  discovery = await logDiscovery(userId, discoverySpeciesName, plant?.id, location, plantType);
  if (discovery?.speciesId && plant?.id) {
    linkPlantToSpecies(plant.id, discovery.speciesId);  // ← Dex-Verknüpfung hängt aktuell an logDiscovery
  }
}
```

`logDiscovery` (in `services/discoveryService.js`) macht **drei** Dinge in einem Rutsch:

1. **Species-Upsert** (`species`-Tabelle, `canonical_name` UNIQUE) — legt ggf. neue Art an, setzt `first_discovered_by` = Erstentdecker.
2. **Discovery-Event** (`discovery_events`) — `is_first`, optional `latitude`/`longitude`. UNIQUE-Index `(user_id, species_id)` → max. 1 pro User/Art.
3. **Credit-Belohnung** über RPC `award_discovery_credits` — **25 CR** für Welt-Erstentdeckung (`is_first`), **5 CR** für persönliche Erstentdeckung.

Folgekonsequenzen einer Entdeckung:

- **Leaderboard:** `get_leaderboard_public_rows()` zählt `COUNT(discovery_events) + 5 × is_first`.
- **Heatmap:** `get_heatmap_grid` / `get_heatmap_species_grid` aggregieren `latitude`/`longitude` der `discovery_events` (opt-in, ~1 km²-Raster).
- **Trigger:** `update_species_discoverer_count` (SECURITY DEFINER) hält `species.total_discoverers` aktuell.

**Wichtige Erkenntnis:** Die Verknüpfung `plant.species_id` (für den Dex-Cache und Detail-Generierung) wird heute als **Seiteneffekt** von `logDiscovery` gesetzt. Wenn wir im Web `logDiscovery` einfach überspringen, verliert die Web-Pflanze ihre Species-Verknüpfung. Das muss der Plan sauber entkoppeln (siehe §4).

**RLS-Status:** `discovery_events` erlaubt authentifizierten Usern `INSERT` der eigenen Zeilen (`auth.uid() = user_id`). Das heißt: Ein reines Client-Gate (`Platform.OS === 'web'`) ist umgehbar — der Web-Client hat dieselben Supabase-Credentials. Deshalb die Server-Härtung in §5.

---

## 2. Zielarchitektur

Eine einzige Expo-Codebasis, drei Targets (iOS, Android, Web). Web läuft über `react-native-web`; plattformspezifische Unterschiede werden über **Platform-Splitting** (`*.web.js` / `Platform.OS`) gekapselt.

```
Eine Expo/RN-Codebasis
├── iOS / Android   → EAS Build, native Module voll verfügbar
└── Web             → expo export -p web → statisches Bundle → Cloudflare Pages
                       react-native-web + Platform-Splits für native-only Module
```

Backend (Supabase, Edge Functions, PlantNet/OpenAI) bleibt **unverändert geteilt**. Web ist nur ein weiterer Client. Der einzige Backend-Eingriff ist die Discovery-Härtung (§5).

---

## 3. Web-Build & Cloudflare-Deployment

### 3.1 Native-only Module abstrahieren

Volle Parität heißt: jedes Screen muss im Web rendern. Diese Module haben kein direktes Web-Äquivalent und brauchen eine Web-Fallback-Schicht:

| Modul | Nutzung | Web-Strategie |
|---|---|---|
| `react-native-maps` | Heatmap, „My Finds"-Overlay (`HeatmapScreen`, `DexDetailScreen`) | Web-Split: `MapView.web.js` mit MapLibre GL / Leaflet ODER read-only statisches Raster. Karte ist im Web read-only (keine GPS-Discoveries). |
| `expo-image-picker` | Kamera + Galerie (`AddPlantScreen`, `imagePickerHelper`) | Im Web liefert `launchImageLibraryAsync` einen `<input type=file>`-Dialog. Kamera-Autostart wird im Web deaktiviert (§4). |
| `expo-location` | GPS für Discovery-Standort (`discoveryService.getDiscoveryLocation`) | Im Web **nicht** verwenden — Web-Uploads haben ohnehin keine Discovery (§4/§5). `getDiscoveryLocation` gibt im Web früh `null` zurück. |
| `react-native-purchases` (RevenueCat) | Shop/Credits (`StoreScreen`, `purchaseService`) | RevenueCat hat **Web Billing / RC Web SDK**. Für v1 empfohlen: Web-Split, der auf Stripe-Checkout (RC Web) zeigt oder Kauf im Web ausblendet und auf Mobile verweist. |
| `expo-notifications` | Push (`notificationService`) | Web Push (VAPID) optional; für v1 Feature-Detection + No-op im Web. |
| `expo-apple-authentication` | „Sign in with Apple" | Im Web Apple JS-SDK ODER nur E-Mail/Google-Login im Web. |
| `@react-native-async-storage/async-storage` | Session-Persistenz | Funktioniert im Web (localStorage-Backend) — kein Eingriff nötig. |
| `expo-image` | Bildanzeige | Web-kompatibel. |

**Muster:** Für jedes problematische Modul eine dünne Wrapper-Datei mit `*.web.js`-Gegenstück, z. B. `components/MapView/index.native.js` + `index.web.js`. Screens importieren nur den Wrapper. So bleibt der Screen-Code plattformneutral.

### 3.2 Build-Pipeline

1. `npx expo export --platform web` erzeugt statisches Bundle in `dist/`.
2. **Cloudflare Pages**: Repo verbinden, Build-Command `npx expo export -p web`, Output-Verzeichnis `dist`. SPA-Fallback (`_redirects` mit `/* /index.html 200`) für client-seitiges Routing.
3. **Env-Vars** in Cloudflare Pages setzen (analog `.env.local`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` etc. Nur `EXPO_PUBLIC_*` landet im Web-Bundle — **keine** Secrets (Service-Role, OpenAI-Keys bleiben in Edge Functions).
4. **Supabase Auth Redirect-URLs**: Cloudflare-Domain in Supabase → Auth → URL Configuration eintragen (Magic-Link / OAuth-Callback).
5. **CORS**: Supabase erlaubt Browser-Origins standardmäßig; Edge Functions ggf. `Access-Control-Allow-Origin` für die Web-Domain ergänzen.
6. Bestehende statische Rechtsseiten (`impressum.html`, `privacy-policy.html`, `terms.html`, `account-deletion.html`) können auf derselben Domain mit ausgeliefert werden.

### 3.3 Routing & Responsive

- React Navigation unterstützt Web (`@react-navigation/native` + Linking-Config für saubere URLs). Tab-Topologie aus `App.js` bleibt; im Web ggf. als Sidebar/Topbar bei breiten Viewports.
- Responsive Breakpoints, da Web auch Desktop-Breiten bedient (Mobile-First-Layout skaliert nach oben).

---

## 4. Foto-Upload & KI-Erkennung im Web (Client-Gate)

### 4.1 Foto-Schritt im Web

`AddPlantScreen` startet heute auf nativen Geräten automatisch die Kamera (`useEffect` → `takePhoto`). Im Web:

- **Kein** Kamera-Autostart. Stattdessen ein Upload-Bereich: Button „Foto hochladen" → `safeLaunchLibrary` (= `<input type=file accept="image/*">` im Web) oder Drag&Drop-Zone.
- Optional: `capture`-Attribut für mobile Browser, die direkt die Kamera öffnen können — aber das ändert nichts am Discovery-Status (Web bleibt Web).
- Rest des Flows identisch: Upload via `uploadPlantImage`, dann `recognizePlantFromImageUrl(imageUrl, language)` → Name/Note/`plant_type`. **Die KI-Erkennung funktioniert im Web unverändert**, weil sie serverseitig (Edge Function) läuft.

### 4.2 Entdeckung entkoppeln (der eigentliche Eingriff)

Heute hängt sowohl die Species-Verknüpfung als auch die Entdeckung an `logDiscovery`. Wir trennen das in zwei Verantwortlichkeiten:

**Neu in `services/discoveryService.js`:**

```js
/**
 * Löst die Species auf (Upsert) und gibt speciesId zurück,
 * OHNE ein discovery_event zu erzeugen und OHNE Credits.
 * Für Web-Uploads: Pflanze wird mit Art verknüpft (Dex-Cache),
 * nimmt aber nicht an (Erst-)Entdeckungen teil.
 */
export async function resolveSpeciesWithoutDiscovery(speciesName, plantType = null) {
  // identischer Upsert-Block wie in logDiscovery, aber:
  //  - KEIN insert in discovery_events
  //  - KEIN award_discovery_credits
  //  - first_discovered_by wird NICHT gesetzt (bzw. nur falls Art neu, ohne Credit)
  //    → Empfehlung: bei Web NIE first_discovered_by setzen
  return { speciesId, displayName };
}
```

**Anpassung in `AddPlantScreen.handleSave`:**

```js
import { Platform } from 'react-native';

let discovery = null;
let speciesId = null;

if (scanMode === 'ai') {
  if (Platform.OS === 'web') {
    // Web: erkennen + verknüpfen, aber KEINE Entdeckung/Credits/Leaderboard
    const res = await resolveSpeciesWithoutDiscovery(discoverySpeciesName, plantType);
    speciesId = res?.speciesId ?? null;
  } else {
    const location = await getDiscoveryLocation();
    discovery = await logDiscovery(userId, discoverySpeciesName, plant?.id, location, plantType);
    speciesId = discovery?.speciesId ?? null;
  }
  if (speciesId && plant?.id) {
    linkPlantToSpecies(plant.id, speciesId);   // ← jetzt plattformunabhängig
  }
}

// Discovery-Reveal-Modal nur, wenn es eine echte Entdeckung gab:
if (discovery?.isNewForUser) {
  setDiscoveryResult(discovery);
  setShowReveal(true);
}
```

**Ergebnis aus Sicht des Web-Users:** Foto hochladen → Pflanze wird erkannt → erscheint im Garten, in der Pflanzenliste, mit korrekter Art im Dex (sofern die Art schon existiert) → **aber** kein „Entdeckt!"-Reveal, keine Credits, kein Leaderboard-Punkt, kein Heatmap-Pin, keine Welt-Erstentdeckung.

`getDiscoveryLocation` wird im Web zusätzlich abgesichert (früher `return null`), damit `expo-location` im Browser nicht geladen/abgefragt wird.

---

## 5. Server-Härtung (Defense in Depth)

Das Client-Gate allein genügt nicht: Der Web-Client nutzt denselben Anon-Key, und die RLS-Policy erlaubt jedem authentifizierten User, eigene `discovery_events` zu schreiben. Ein manipulierter Web-Client könnte sonst `is_first=true` + erfundene Koordinaten einschleusen (= 25-CR-Exploit + Fake-Heatmap-Pins). Daher folgende Migration.

### 5.1 Neue Migration `2026XXXX_discovery_source_hardening.sql`

```sql
-- 1. Herkunft jeder Entdeckung kennzeichnen
ALTER TABLE public.discovery_events
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'mobile'
  CHECK (source IN ('mobile', 'web', 'manual'));

-- 2. Web darf NIE Erstentdecker sein und KEINE Location beisteuern.
--    Trigger erzwingt das unabhängig vom Client.
CREATE OR REPLACE FUNCTION public.enforce_discovery_source_rules()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.source = 'web' THEN
    NEW.is_first := false;        -- keine Welt-Erstentdeckung aus dem Web
    NEW.latitude := NULL;         -- keine Heatmap-Beteiligung
    NEW.longitude := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_discovery_source ON public.discovery_events;
CREATE TRIGGER trg_enforce_discovery_source
  BEFORE INSERT ON public.discovery_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_discovery_source_rules();
```

> **Hinweis zur gewählten Strategie:** Laut Anforderung nehmen Web-Uploads *gar nicht* an Entdeckungen teil. Dann schreibt der Client im Web **überhaupt keine** `discovery_events` (§4). Die `source`-Spalte + der Trigger sind die **Versicherung**: Falls je ein Web-Pfad doch `discovery_events` schreibt (z. B. künftiger „Web zählt teilweise mit"-Modus, oder ein manipulierter Client), kann er weder `is_first` noch Location fälschen. Damit ist die strengste Auslegung (kein Event) und eine spätere Lockerung beide sauber abgesichert.

### 5.2 Aggregationen absichern

- `award_discovery_credits`: zusätzliche Bedingung, dass das Event nicht `source='web'` ist (Web bekommt nie Credits). Da der Client für Web ohnehin kein Event schreibt, ist das nur Redundanz — aber billig und wirksam.
- `get_heatmap_grid` / `get_heatmap_species_grid`: `WHERE latitude IS NOT NULL` filtert Web ohnehin raus (Trigger nullt die Koordinaten). Optional explizit `source <> 'web'`.
- `get_leaderboard_public_rows`: optional `FILTER (WHERE source <> 'web')` in den Discovery-Counts, falls Web-Events je geschrieben werden sollten.

### 5.3 Optional: RLS-Verschärfung

Wenn man Web-`discovery_events` **vollständig** verbieten will, kann die INSERT-Policy zusätzlich prüfen, dass `source <> 'web'`. Da der Server die Plattform nicht zuverlässig aus dem JWT ableiten kann, ist der Trigger-Ansatz (5.1) der pragmatische Standard; eine harte Policy lohnt nur, wenn „Web schreibt nie Events" eine dauerhafte Invariante sein soll.

---

## 6. Umsetzungs-Reihenfolge

**Phase A — Web lauffähig machen (Foundation)**
1. `expo export -p web` lokal grün bekommen; Build-Bricher (native-only Imports auf Top-Level) identifizieren.
2. Wrapper + `*.web.js`-Splits für Maps, Notifications, RevenueCat, Apple-Auth.
3. React Navigation Linking-Config + Responsive-Grundlayout.

**Phase B — Foto/Erkennung im Web (Kernanforderung Teil 1)**
4. `AddPlantScreen`: Web-Foto-Schritt (Upload/Drag&Drop statt Kamera-Autostart).
5. `resolveSpeciesWithoutDiscovery` + Entkopplung von `linkPlantToSpecies`.
6. `Platform.OS === 'web'`-Gate in `handleSave`; `getDiscoveryLocation` im Web → `null`.

**Phase C — Server-Härtung (Kernanforderung Teil 2)**
7. Migration `discovery_source_hardening.sql` (source-Spalte + Trigger).
8. Aggregations-Filter (Credits/Heatmap/Leaderboard) ergänzen.

**Phase D — Deployment**
9. Cloudflare Pages verbinden, Env-Vars, `_redirects`, Supabase Auth-Redirect-URLs.
10. Smoke-Test auf der Live-Domain (Login, Foto-Upload, Erkennung, kein Discovery-Reveal).

---

## 7. Test- & Verifikationsplan

- **Unit:** `discoveryService.test.js` erweitern — `resolveSpeciesWithoutDiscovery` legt Species an / verlinkt, schreibt **kein** `discovery_events`, vergibt **keine** Credits.
- **Plattform-Gate:** Test/Mocks für `Platform.OS === 'web'` in `AddPlantScreen`-Logik (kein `logDiscovery`-Aufruf, kein Reveal-Modal).
- **DB-Trigger:** SQL-Test — Insert mit `source='web', is_first=true, latitude=…` → nach Insert `is_first=false`, `latitude=NULL`.
- **Credits:** `award_discovery_credits` vergibt bei `source='web'` 0 CR.
- **E2E (manuell):** Auf Cloudflare-Deploy: Foto hochladen → Pflanze erscheint im Garten + korrekte Art im Dex; **kein** Entdeckungs-Reveal, Credit-Stand unverändert, Heatmap unverändert, Leaderboard-Punkte unverändert.
- **Regression Mobile:** Auf iOS/Android bleibt Kamera-Autostart + Discovery + Credits unverändert.

---

## 8. Risiken & offene Punkte

- **RevenueCat im Web:** Käufe im Browser brauchen RC Web Billing (Stripe) oder werden im Web ausgeblendet. Entscheidung vor Phase A/D nötig, da es die Shop-UX betrifft.
- **Maps-Lizenz/Key im Web:** Google Maps JS braucht einen separaten Browser-API-Key + Domain-Restriction; alternativ MapLibre/OSM (kostenfrei). Heatmap im Web ist read-only.
- **Bundle-Größe:** RN-Web-Bundle kann groß werden; Code-Splitting/Lazy-Loading der schweren Screens (Maps) einplanen.
- **Auth-Parität:** „Sign in with Apple" im Web erfordert Apple-Web-Konfiguration; sonst Web nur E-Mail/Google.
- **„Erkennung ohne existierende Art":** Lädt ein Web-User die Erstaufnahme einer noch nie erfassten Art hoch, entsteht die Species zwar (Upsert), aber **ohne** `first_discovered_by` — die Welt-Erstentdeckung bleibt für den ersten *mobilen* Finder reserviert. Das ist gewollt, sollte aber im UX/Wording berücksichtigt werden (Web zeigt keinen Erstentdecker-Anspruch an).

---

## 9. Betroffene Dateien (Übersicht)

| Datei | Änderung |
|---|---|
| `app.json` / `app.config.js` | Web-Config (Favicon, bundler, output: 'static') |
| `package.json` | Build-Script `export:web`, ggf. MapLibre/Leaflet-Dep |
| `screens/AddPlantScreen.js` | Web-Foto-Schritt, `Platform.OS`-Gate, Entkopplung von `linkPlantToSpecies` |
| `services/discoveryService.js` | neue `resolveSpeciesWithoutDiscovery`, `getDiscoveryLocation` Web-Guard |
| `components/MapView/*` (neu) | native/web-Split für `react-native-maps` |
| `services/purchaseService.js` + `StoreScreen.js` | Web-Split RevenueCat |
| `services/notificationService.js` | Web-No-op / Web-Push |
| `supabase/migrations/2026XXXX_discovery_source_hardening.sql` (neu) | source-Spalte + Trigger + Aggregations-Filter |
| `__tests__/services/discoveryService.test.js` | Tests für neuen Pfad |
| Cloudflare Pages (extern) | Build-Config, Env, `_redirects` |
| Supabase Auth (extern) | Redirect-URLs der Web-Domain |

---

*Dieser Plan ändert das geteilte Backend minimal-invasiv: ein neuer entdeckungsfreier Species-Pfad im Client plus eine Härtungs-Migration. iOS/Android-Verhalten bleibt unverändert.*
