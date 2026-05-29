# Codex-Auftrag: Kontext-Awareness (Wetter, Saison, Uhrzeit) für „Mein Gärtner"

## Ziel
Ben der Gärtner und die drei Screens (Mein Zuhause, Meine Pflanzen, Mein Gärtner) sollen sich des aktuellen Kontexts bewusst sein:
- **Wetter** (abhängig vom Standort)
- **Saison** (standortabhängig, inkl. Südhalbkugel)
- **Uhrzeit / Tageszeit**

Aktuell wird dieser Kontext nirgends an Ben (das LLM) übergeben, und Tageszeit existiert gar nicht. Dieser Auftrag schließt die Lücke **end-to-end** (App → gardenerService → Supabase Edge Function).

## Regeln (aus `.cursorrules`)
- Code-Kommentare und UI-Texte auf **Deutsch**.
- React Native + Expo, Supabase Backend, AsyncStorage lokal.
- **Reduce, reduce, reduce. Keep it simple.**
- **Keine Mock-Daten** — immer echte Quellen (Open-Meteo, expo-location, Supabase).

---

## Architektur-Entscheidung (wichtig, bitte so umsetzen)
Kontext **einmal zentral** in `App.js` bauen und als Prop `context` an alle drei Screens durchreichen — statt in jedem Screen einzeln Wetter zu fetchen.

Begründung: `App.js` holt bereits `location`. Wenn dort zusätzlich Wetter geholt und ein `context`-Objekt gebaut wird, vermeiden wir doppelte API-Calls und haben **eine einzige Quelle der Wahrheit**. Die Screens werden dadurch dünner.

Datenfluss (Soll):
```
App.js (initApp)
  └─ getCurrentLocation()      → location
  └─ getWeather(lat, lon)      → weather
  └─ buildContext({location, weather}) → context  (enthält weather, season, time, location)
        │
        ├─ <MeinZuhauseScreen   context={context} />
        ├─ <MeinePflanzenScreen context={context} />
        └─ <MeinGartnerScreen   context={context} />
                                    └─ askGardener(frage, context)
                                          └─ Edge Function chat-gardener  (baut Kontext in System-Prompt)
```

---

## Datei-für-Datei-Spezifikation

### 1. NEU: `src/utils/timeUtils.js`
Tageszeit-Logik. Existiert noch nicht.

```js
// timeUtils.js - Tageszeit-Logik

export function getTimeOfDay(date = new Date()) {
  const hour = date.getHours();

  if (hour >= 5 && hour < 10)  return { name: 'Morgen',      icon: '🌅', hour };
  if (hour >= 10 && hour < 12) return { name: 'Vormittag',   icon: '🌤️', hour };
  if (hour >= 12 && hour < 14) return { name: 'Mittag',      icon: '☀️', hour };
  if (hour >= 14 && hour < 18) return { name: 'Nachmittag',  icon: '🌇', hour };
  if (hour >= 18 && hour < 22) return { name: 'Abend',       icon: '🌆', hour };
  return { name: 'Nacht', icon: '🌙', hour };
}
```
Akzeptanz: reine Funktion, keine Seiteneffekte, testbar mit übergebenem `date`.

> Optional (nur falls einfach): später Sonnenauf-/-untergang aus Open-Meteo (`daily=sunrise,sunset`) nutzen, um „Tag/Nacht" präziser zu machen. **Für diesen Auftrag nicht nötig** — Uhr-basiert reicht.

---

### 2. ÄNDERN: `src/utils/seasonUtils.js`
`getCurrentSeason()` ist aktuell rein monatsbasiert und **immer Nordhalbkugel**. Standortabhängig machen.

Signatur erweitern auf `getCurrentSeason(latitude, date = new Date())`:
- `latitude` optional. Wenn `latitude < 0` (Südhalbkugel) → Saison um 6 Monate verschieben (Sommer/Winter & Frühling/Herbst tauschen).
- Rückwärtskompatibel: ohne `latitude` weiterhin Nordhalbkugel-Verhalten.

Skizze:
```js
export function getCurrentSeason(latitude, date = new Date()) {
  const month = date.getMonth(); // 0-11
  const southern = typeof latitude === 'number' && latitude < 0;
  // Auf Südhalbkugel den Monat um 6 verschieben
  const m = southern ? (month + 6) % 12 : month;

  if (m >= 2 && m <= 4)  return { name: 'Frühling', icon: '🌸' };
  if (m >= 5 && m <= 7)  return { name: 'Sommer',   icon: '☀️' };
  if (m >= 8 && m <= 10) return { name: 'Herbst',   icon: '🍂' };
  return { name: 'Winter', icon: '❄️' };
}
```
`getSeasonalTip(season)` bleibt unverändert.

Achtung: Aufrufstelle in `MeinZuhauseScreen.js` (`getCurrentSeason()`) muss auf `getCurrentSeason(context?.location?.latitude)` umgestellt werden (siehe unten). Repo nach allen `getCurrentSeason(` Aufrufen durchsuchen.

---

### 3. NEU: `src/utils/contextUtils.js`
Zentraler Kontext-Sammler + Prompt-Formatierer. Single Source of Truth.

```js
// contextUtils.js - Sammelt Wetter/Saison/Tageszeit/Standort zu einem Kontext

import { getCurrentSeason } from './seasonUtils';
import { getTimeOfDay } from './timeUtils';

// Baut ein normalisiertes Kontext-Objekt
export function buildContext({ location, weather }) {
  const time = getTimeOfDay();
  const season = getCurrentSeason(location?.latitude);
  return {
    location: location || null,   // { latitude, longitude, city }
    weather: weather || null,     // siehe weatherService
    season,                       // { name, icon }
    time,                         // { name, icon, hour }
    localTime: new Date().toISOString(),
  };
}

// Formatiert den Kontext als deutschen Text-Block für das LLM
export function formatContextForPrompt(context) {
  if (!context) return '';
  const parts = [];
  if (context.location?.city) parts.push(`Ort: ${context.location.city}`);
  if (context.weather) {
    parts.push(`Wetter: ${context.weather.weatherText}, ${context.weather.temperature}°C, Luftfeuchte ${context.weather.humidity}%, Wind ${context.weather.windSpeed} km/h`);
  }
  if (context.season) parts.push(`Jahreszeit: ${context.season.name}`);
  if (context.time)   parts.push(`Tageszeit: ${context.time.name} (${context.time.hour} Uhr)`);
  return parts.join('\n');
}
```
Akzeptanz: funktioniert auch wenn `weather` oder `location` `null` sind (App startet ggf. ohne Standortfreigabe → Fallback Berlin, Wetter evtl. null).

---

### 4. ÄNDERN: `src/services/weatherService.js`
Optional, aber empfohlen (kleiner Aufwand, großer Nutzen für Ben): `is_day` mitholen, damit Tag/Nacht-Signal aus echtem Sonnenstand kommt.

In der URL `current=...` um `is_day` ergänzen und im Rückgabeobjekt durchreichen:
```js
// ...&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m,is_day&timezone=auto
return {
  temperature: Math.round(data.current.temperature_2m),
  humidity: data.current.relative_humidity_2m,
  windSpeed: Math.round(data.current.wind_speed_10m),
  weatherText: weather.text,
  weatherIcon: weather.icon,
  weatherCode: code,
  isDay: data.current.is_day === 1,   // NEU
};
```
Falls dir das zu viel ist: weglassen — kein Blocker.

---

### 5. ÄNDERN: `src/services/gardenerService.js`
Das Kernproblem: `context` wird akzeptiert, aber nicht gesendet.

- `formatContextForPrompt` importieren.
- Den Kontext **sowohl** strukturiert **als auch** als Textblock an die Edge Function schicken (Edge Function entscheidet, was sie nutzt → robust gegen Versions-Drift).

```js
import { supabase } from '../supabase/client';
import { formatContextForPrompt } from '../utils/contextUtils';

const SYSTEM_PROMPT = `Du bist Ben, ein freundlicher und erfahrener Gärtner.
Du hilfst Menschen bei der Pflege ihrer Pflanzen.
Beziehe den aktuellen Kontext (Wetter, Jahreszeit, Tageszeit, Ort) in deine Ratschläge ein, wenn er relevant ist.
Antworte immer auf Deutsch, freundlich und mit praktischen Tipps.
Halte deine Antworten kurz und hilfreich.`;

export async function askGardener(question, context = {}) {
  try {
    const { data, error } = await supabase.functions.invoke('chat-gardener', {
      body: {
        question,
        systemPrompt: SYSTEM_PROMPT,
        context,                                  // strukturiert
        contextText: formatContextForPrompt(context), // vorformatiert
      },
    });
    if (error) throw error;
    return data.answer;
  } catch (error) {
    console.log('Gardener error:', error);
    return 'Entschuldigung, ich kann gerade nicht antworten. Versuche es später nochmal.';
  }
}
```

---

### 6. ÄNDERN: `src/screens/MeinGartnerScreen.js`
Den `context`-Prop (aus App.js) an Ben durchreichen. Aktuell: `askGardener(userMessage)`.

- Signatur: `export default function MeinGartnerScreen({ context })` (statt `location`).
- Im `handleSend`: `const answer = await askGardener(userMessage, context);`

> Optional (eigenständige Verbesserung, gern erwähnen aber nicht zwingend): Chat-Historie wird geladen, aber nicht ans Modell gesendet. Für Gesprächskontinuität könnte man die letzten N Nachrichten mitsenden. **Nicht Teil dieses Auftrags** — nur als Hinweis.

---

### 7. ÄNDERN: `src/screens/MeinZuhauseScreen.js`
- Auf zentralen `context`-Prop umstellen statt selbst Wetter/Saison zu holen (Wetter kommt jetzt aus App.js).
  - Signatur: `function MeinZuhauseScreen({ context })`.
  - `weather = context?.weather`, `season = context?.season` (bereits hemisphärenkorrekt), zusätzlich `time = context?.time`.
  - Den lokalen `getWeather`-Fetch entfernen ODER beibehalten als Fallback — **bevorzugt entfernen** (Single Source of Truth). Pflanzen-Zähler (`getPlants`) bleibt im Screen.
- **Tageszeit anzeigen**: im Header neben Saison einen Block `{time.icon} {time.name}` ergänzen.

Beispiel Header-Ergänzung:
```jsx
<Text style={styles.season}>{season.icon} {season.name}</Text>
<Text style={styles.season}>{time.icon} {time.name}</Text>
```

---

### 8. ÄNDERN: `src/screens/MeinePflanzenScreen.js`
- Auf `context`-Prop umstellen (`function MeinePflanzenScreen({ context })`).
- Mindestens den Kontext **nutzbar machen**: einen kontextbezogenen Hinweis-Header anzeigen, z.B. einen Saison-/Wetter-abhängigen Gieß-Hinweis (`getSeasonalTip(context.season)` oder ein simpler Wetter-Hinweis wie „Heute heiß — Pflanzen mehr gießen" bei `weather.temperature > 25`).
- Halte es simpel: ein Info-Banner oben in der Liste reicht. Kein Umbau der Pflanzen-Logik.

---

### 9. ÄNDERN: `App.js`
- `getWeather` importieren, `buildContext` importieren.
- In `initApp`: nach `getCurrentLocation()` auch `getWeather(loc.latitude, loc.longitude)` holen, dann `const ctx = buildContext({ location: loc, weather })` und `setContext(ctx)`.
- State `context` statt (oder zusätzlich zu) `location`.
- `renderScreen` reicht `context={context}` an alle drei Screens.

Skizze:
```js
const [context, setContext] = useState(null);

const initApp = async () => {
  try {
    const loc = await getCurrentLocation();
    let weather = null;
    if (loc) weather = await getWeather(loc.latitude, loc.longitude);
    setContext(buildContext({ location: loc, weather }));
  } catch (error) {
    console.log('Init error:', error);
  } finally {
    setLoading(false);
  }
};
// renderScreen: <MeinZuhauseScreen context={context} /> usw.
```
> Optional: Kontext alle X Minuten / bei App-Resume aktualisieren (Wetter & Tageszeit veralten). Für v1 reicht einmalig beim Start.

---

### 10. ÄNDERN: Supabase Edge Function `chat-gardener` (`supabase/functions/chat-gardener/index.ts`)
**Ohne diese Änderung erreicht der Kontext das Modell nicht** — wichtigster Schritt.

- `context` und `contextText` aus dem Body lesen.
- Den `systemPrompt` um einen Kontext-Block erweitern (bevorzugt `contextText` nutzen; Fallback: aus `context` selbst zusammenbauen).

```ts
const { question, systemPrompt, context, contextText } = await req.json()

const kontextBlock = contextText
  ? `\n\nAktueller Kontext:\n${contextText}`
  : ''

const finalSystemPrompt = `${systemPrompt}${kontextBlock}`

// ... messages:
messages: [
  { role: 'system', content: finalSystemPrompt },
  { role: 'user', content: question },
],
```

Deployment: Edge Function neu deployen (Supabase CLI `supabase functions deploy chat-gardener` oder via Dashboard). **Backward-compatible**: alte App-Versionen ohne `context` funktionieren weiter (dann leerer Kontext-Block).

---

## Reihenfolge der Umsetzung
1. `timeUtils.js` (neu) — keine Abhängigkeiten.
2. `seasonUtils.js` (hemisphärenbewusst).
3. `contextUtils.js` (neu) — nutzt 1 & 2.
4. `weatherService.js` (`isDay`, optional).
5. `gardenerService.js` (Kontext senden).
6. Edge Function `chat-gardener` (Kontext empfangen + deployen).
7. `App.js` (Kontext zentral bauen + durchreichen).
8. Screens (`MeinZuhause`, `MeinePflanzen`, `MeinGartner`) auf `context`-Prop umstellen.

## Akzeptanzkriterien (Definition of Done)
- [ ] Tageszeit existiert als reine, testbare Funktion und wird in „Mein Zuhause" angezeigt.
- [ ] Saison ist auf der Südhalbkugel korrekt (z.B. lat = −33 im Juni → Winter).
- [ ] Ben (LLM) erhält im System-Prompt nachweislich Wetter + Saison + Tageszeit + Ort. Verifizieren z.B. mit der Frage „Welche Jahreszeit und Uhrzeit ist gerade?" — Antwort passt zum echten Kontext.
- [ ] `gardenerService` sendet `context` an die Edge Function; Edge Function ist deployed.
- [ ] Alle drei Screens beziehen denselben zentralen `context` aus `App.js` (kein doppelter Wetter-Fetch).
- [ ] „Meine Pflanzen" zeigt einen kontextbezogenen Hinweis.
- [ ] Keine Mock-Daten; App startet auch ohne Standortfreigabe (Fallback Berlin) ohne Crash.

## Test-Hinweise
- `getTimeOfDay(new Date('...T08:00')) → Morgen`, `T13:00 → Mittag`, `T23:00 → Nacht`.
- `getCurrentSeason(-33, new Date('2026-06-15')) → Winter`; `getCurrentSeason(52, …) → Sommer`.
- App ohne erteilte Standort-Permission starten → kein Crash, Fallback Berlin, Wetter ggf. null, Ben antwortet trotzdem.
- Edge Function lokal/Staging mit und ohne `context` im Body testen (Backward-Compat).

## Nicht im Scope (bewusst ausgelassen)
- Chat-Historie ans LLM senden (Gesprächskontinuität).
- Sonnenauf-/-untergang als Tageszeit-Quelle.
- Periodisches Kontext-Refresh / App-Resume-Handling.
Diese als mögliche Folge-Tickets notieren.
