# Lazy-Loading i18n + Multi-Language Onboarding — Plan

**Repo:** FloraPilot (`digitaler-gaertner`) · **Stand:** 2026-06-02 · **Status:** Umgesetzt

## Umsetzungsstand

Dieser Stand setzt den Plan vollständig um: Übersetzungen werden lazy geladen, die Sprachliste kommt aus einer Registry, der Sprachwechsel ist async mit explizitem Re-Render, die zwölf neuen LTR-Sprachen und die vier RTL-Sprachen sind als vollständige Locale-Dateien enthalten.

RTL (`ar`, `he`, `fa`, `ur`) läuft über `I18nManager.allowRTL`, `swapLeftAndRightInRTL`, `forceRTL` und einen Reload-Hinweis beim Sprachwechsel. Richtungspfeile/Chevrons werden über `utils/directionalIcon.js` gespiegelt.

Wiederholbare Checks:

- `npm run i18n:sync` prüft Key-Coverage und Platzhalter über alle 23 Sprachen.
- `npm run i18n:measure` dokumentiert die Parse-Differenz zwischen lazy Startup (`de`) und eager All-Locales.
- `npm run i18n:font-audit` listet kritische Script-Samples für Device-Smoke-Tests und prüft die Locale-Dateien.

## Ziel

Übersetzungen **lazy laden** statt alle Sprachen beim App-Start zu bündeln und zu parsen, damit:

1. Startup-Kosten konstant bleiben, egal wie viele Sprachen es gibt.
2. Neue Sprachen / Wording-Korrekturen ohne App-Store-Review live gehen — via **Expo OTA (`eas update`)**.
3. Als erste Anwendung die **fehlenden Sprachen aus „Der Dritte"** ergänzt werden.

## Ansatz: gebündelt + dynamic import, ausgeliefert via OTA

Die Locale-JSONs bleiben **im App-Bundle** (offline-sicher), werden aber **lazy** geladen statt eager: nicht mehr `import de from …` für alle Sprachen, sondern eine statische Loader-Map, die pro Sprache erst beim Bedarf den JSON-Body auswertet. Updates an Übersetzungen und neue Sprachen werden per `eas update` (OTA) ausgespielt — kein Store-Review nötig, solange die native Runtime gleich bleibt.

**Warum nicht Remote (Supabase)?** Der einzige echte Mehrwert von Remote — „neue Sprachen ohne Release" — liefert OTA bereits, ohne Netz-Abhängigkeit zur Laufzeit, ohne Cache-/Offline-/Race-Komplexität. UI-Strings sind klein (~34 KB/Sprache), die echten Startkosten kommen vom eager Parse, und das löst lazy bundled import vollständig offline. Remote-gegen-Supabase bliebe nur dann sinnvoll, wenn **Nicht-Entwickler Übersetzungen live editieren** sollen (CMS/Community) — das ist hier nicht das Ziel und kann später nachgerüstet werden.

## Sprachen-Delta (Der Dritte → FloraPilot)

FloraPilot hat heute 7: `de, en, fr, it, es, ru, tr`.
Der Dritte (derdritte.app) hat 22 (Portugiesisch hier in **BR + PT** gesplittet). Es kommen **16** dazu:

| Neu                | Code      | Skript  | Hinweis                                    |
| ------------------ | --------- | ------- | ------------------------------------------ |
| Niederländisch     | `nl`      | LTR     |                                            |
| Dänisch            | `da`      | LTR     |                                            |
| Polnisch           | `pl`      | LTR     |                                            |
| Ukrainisch         | `uk`      | LTR     | kyrillisch                                 |
| Portugiesisch (BR) | `pt-BR`   | LTR     |                                            |
| Portugiesisch (PT) | `pt-PT`   | LTR     | gemeinsame Basis, nur Abweichungen pflegen |
| Hindi              | `hi`      | LTR     | Devanagari-Font prüfen                     |
| Bengalisch         | `bn`      | LTR     | Font prüfen                                |
| Japanisch          | `ja`      | LTR     | CJK-Font                                   |
| Koreanisch         | `ko`      | LTR     | CJK-Font                                   |
| Chinesisch         | `zh-Hans` | LTR     | vereinfachtes Chinesisch                   |
| Indonesisch        | `id`      | LTR     |                                            |
| **Arabisch**       | `ar`      | **RTL** | Layout-Spiegelung                          |
| **Hebräisch**      | `he`      | **RTL** | Layout-Spiegelung                          |
| **Persisch**       | `fa`      | **RTL** | Layout-Spiegelung                          |
| **Urdu**           | `ur`      | **RTL** | Layout-Spiegelung + Font                   |

> Gesamt nach Vollausbau: **23 Sprachen**. Die 4 RTL-Sprachen (`ar, he, fa, ur`) sind kein reines Übersetzungsthema — sie brauchen Layout-Arbeit (`I18nManager`) und einen echten Release. Deshalb eigene, späte Phase (Phase 4).
>
> `pt-BR`/`pt-PT`: eine Datei als Basis, die zweite enthält nur die Abweichungen; `enableFallback` (siehe unten) füllt den Rest aus dem Basis-Locale bzw. `de`.

## Ist-Architektur

- **Lib:** `i18n-js` v4 + `expo-localization`.
- **`i18n/index.js`:** importiert alle 7 Locale-JSONs **eager**, erzeugt `new I18n({...})`. Jede Datei ~34 KB / 715 Keys → alle landen im Bundle **und werden beim Start geparst**.
- **`t()` ist synchron** und wird an ~80 Stellen direkt aus Render-Pfaden aufgerufen (`import { t } from '../i18n'`).
- **Sprachwechsel ist synchron:** `i18n.locale = code` (in `AuthContext.js`, `languageService.applyLanguage`).
- **Kein expliziter Re-Render-Mechanismus:** Wechsel wird heute implizit über `setProfile(data)` re-rendert. Kein `LanguageContext`, kein `forceUpdate`, kein Event.
- **Hartcodierte Sprachlisten an 3 Stellen:** `SUPPORTED` (`i18n/index.js`), `LANGUAGE_OPTIONS` + `LANGUAGE_ALIAS_TO_CODE` (`services/languageService.js`).
- **Kein RTL-Handling** (`I18nManager` nirgends referenziert).
- **Persistenz:** aktive Sprache in `profiles.language` (Supabase) + Geräte-Locale als Initial.
- **OTA bereits vorhanden:** `expo-updates` ist Dependency → JSON-/JS-Änderungen sind per `eas update` ausspielbar.

## Kern-Herausforderung

`t()` ist synchron, der Lazy-Load (dynamic import) ist async. Wir wollen `t()` **nicht** zu `async` umbauen (~80 Call-Sites). Lösung:

> **Lade-vor-Anzeige-Prinzip:** Eine Sprache wird _vollständig in den In-Memory-Store geladen, bevor_ `i18n.locale` darauf gesetzt und ein Re-Render ausgelöst wird. `t()` bleibt synchron und liest immer gegen einen bereits vorhandenen Store. Fehlt eine Sprache noch, greift der gebündelte Fallback (`de`).

## Soll-Architektur

### Loader-Map (Metro-freundlich)

Metro kann dynamic `import()` **nur mit statischen Pfaden** code-splitten — daher eine explizite Map statt variabler Pfade:

```js
// i18n/loaders.js
export const loaders = {
  de: () => require('./locales/de.json'), // de bleibt eager (Fallback)
  en: () => import('./locales/en.json'),
  fr: () => import('./locales/fr.json'),
  // … alle weiteren Sprachen
  ar: () => import('./locales/ar.json'),
};
```

- `import()` gibt ein Promise zurück → JSON wird erst bei Bedarf ausgewertet, bleibt aber **im Bundle** (offline-sicher).
- `de` bleibt synchron via `require` → garantierter Fallback ohne Wartezeit, auch beim allerersten Frame.

### Sprach-Registry (statt remote Manifest)

Eine gebündelte Registry als **Single Source of Truth** für die Sprachliste — ersetzt die 3 hartcodierten Listen:

```js
// i18n/registry.js
export const LANGUAGES = [
  { code: 'de', label: 'Deutsch', rtl: false },
  { code: 'en', label: 'English', rtl: false },
  { code: 'pt-BR', label: 'Português (BR)', rtl: false },
  { code: 'ar', label: 'العربية', rtl: true },
  // …
];
```

`LANGUAGE_OPTIONS`, `SUPPORTED` und die Alias-Tabelle werden daraus abgeleitet. Neue Sprache = ein Eintrag hier + eine JSON + ein Loader-Map-Eintrag, ausgespielt per OTA.

### Loader

`services/translationLoader.js`:

- `ensureLanguageLoaded(code)`: wenn `i18n.translations[code]` schon da → fertig; sonst `await loaders[code]()` → `i18n.translations[code] = json`. Bei Fehler → `false`, Aufrufer bleibt bei vorheriger/Fallback-Sprache.
- Kein AsyncStorage-/Netz-Cache nötig — die Quelle ist das Bundle.

Sprachwechsel (`languageService.applyLanguage`, jetzt `async`):

```
applyLanguage(code):
  ok = await ensureLanguageLoaded(code)
  i18n.locale = ok ? code : 'de'
  notifyLocaleChanged()    // Re-Render
  return i18n.locale
```

### Re-Render-Mechanismus (neu)

Da der Wechsel jetzt async ist, reicht der implizite `setProfile`-Re-Render nicht mehr zuverlässig:

- `contexts/LanguageContext.js`: hält `locale` + `version`-Counter, stellt `setLanguage(code)` bereit (ruft `applyLanguage`, bumpt `version`).
- `App.js` wrappt die App mit `LanguageProvider`; Navigator re-rendert bei locale-Wechsel (`useLanguage()` oder `key={locale}`).
- `t()` bleibt unverändert importierbar — der Context erzwingt nur den Re-Render.

## Migrationsplan (Phasen)

### Phase 0 — Registry + Loader-Gerüst (kein Verhalten ändert sich)

- `i18n/registry.js` (Sprachliste) + `i18n/loaders.js` (Loader-Map) anlegen, zunächst mit den 7 bestehenden Sprachen.
- `services/translationLoader.js` + `ensureLanguageLoaded`.
- **Exit:** Loader lädt eine Sprache on demand korrekt; bestehende eager imports noch unangetastet.

### Phase 1 — Async Loader verdrahten (Verhalten identisch)

- `LanguageContext` + Re-Render-Verdrahtung in `App.js`.
- `applyLanguage` → async; Aufrufer in `AuthContext.js` (2 Stellen, `i18n.locale = …`) + `ProfileCompleteScreen` anpassen.
- Tests: kalter Start, Sprachwechsel, Offline-Flugmodus (Fallback `de`).
- **Exit:** App lädt aktive Sprache lazy, Fallback sauber. Keine sichtbare Regression. Tests grün.

### Phase 2 — Bundle-Diät + dynamische Sprachliste

- Eager imports für `en, fr, it, es, ru, tr` aus `i18n/index.js` entfernen → nur `de` bleibt eager.
- `LANGUAGE_OPTIONS` + `SUPPORTED` + `LANGUAGE_ALIAS_TO_CODE` aus `registry.js` ableiten statt hartcodieren.
- Startup-Parse-Messung vorher/nachher dokumentieren.
- **Exit:** Beim Start wird nur noch `de` geparst; Picker/Normalisierung kommen aus der Registry.

### Phase 3 — 12 neue LTR-Sprachen onboarden (via OTA)

- Übersetzungen für `nl, da, pl, uk, pt-BR, pt-PT, hi, bn, ja, ko, zh-Hans, id` erzeugen (Pipeline unten).
- Je Sprache: JSON + Registry-Eintrag + Loader-Map-Eintrag.
- Ausspielen per `eas update` — **kein Store-Release**, sofern keine neuen Fonts nötig.
- Font-Coverage prüfen für `hi, bn, ja, ko, zh-Hans` (Devanagari/CJK). Falls System-Font nicht reicht → `expo-font` ergänzen (**das** braucht einen Store-Release).
- **Exit:** 19 Sprachen wählbar und vollständig.

### Phase 4 — RTL-Sprachen (`ar, he, fa, ur`)

- `I18nManager.forceRTL(true/false)` beim Wechsel; braucht App-Reload (`Updates.reloadAsync()`) → UX-Hinweis im Picker.
- Layout-Audit: `marginLeft/Right` → `marginStart/End`, Icons/Chevrons spiegeln, Text-Align.
- Urdu-Font-Check. Store-Release nötig (Layout + ggf. Fonts).
- **Exit:** 23 Sprachen, RTL korrekt gespiegelt in Kern-Screens.

### Phase 5 — Übersetzungs-Pipeline (Wartbarkeit)

- `scripts/i18n-sync.js`: vergleicht alle Locales gegen `de` (Source of Truth), listet fehlende Keys.
- Workflow: neue de-Keys → Maschinenübersetzung (DeepL/LLM) → Review → JSON commit → `eas update`.
- Optional: Key-Coverage-Check in CI.

## Konkrete Änderungen (Dateiübersicht)

| Datei                                                   | Änderung                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `i18n/loaders.js`                                       | **NEU** — statische Loader-Map (`require` für `de`, `import()` für Rest) |
| `i18n/registry.js`                                      | **NEU** — Sprachliste als Single Source of Truth (code, label, rtl)      |
| `i18n/index.js`                                         | Nur `de` eager; Loader/Registry-Integration                              |
| `services/translationLoader.js`                         | **NEU** — `ensureLanguageLoaded`, Store-Injektion                        |
| `services/languageService.js`                           | `applyLanguage` async; `LANGUAGE_OPTIONS`/`SUPPORTED`/Alias aus Registry |
| `contexts/LanguageContext.js`                           | **NEU** — locale-State + version-bump für Re-Render                      |
| `contexts/AuthContext.js`                               | 2 Stellen: `i18n.locale = …` → `await applyLanguage(…)`                  |
| `screens/ProfileCompleteScreen.js`, `SettingsScreen.js` | Picker aus Registry + async `setLanguage`                                |
| `App.js`                                                | `LanguageProvider` einhängen; Navigator-Re-Render bei locale-Wechsel     |
| `scripts/i18n-sync.js`                                  | **NEU** — Key-Diff gegen `de`                                            |

## Risiken & Gegenmaßnahmen

- **Sprachwechsel fühlt sich verzögert an** (async Load) → JSON liegt im Bundle, Load ist ein lokaler Parse (Millisekunden); optional Spinner nur bei sehr großen Locales.
- **`t()` läuft vor abgeschlossenem Load** → `enableFallback` + immer präsentes `de` hält Keys lesbar (kein „missing key").
- **Async-Wechsel-Race** (User tippt 2× schnell) → letzter Aufruf gewinnt via Token/Guard im Loader.
- **Metro splittet `import()` nicht** wenn Pfade nicht statisch → bewusst explizite Loader-Map statt variabler Pfade.
- **CJK/Devanagari-Glyphen fehlen** → Font-Audit in Phase 3 (Font-Add braucht Store-Release, Übersetzung via OTA nicht).
- **RTL bricht Layout** → isoliert in Phase 4 hinter eigenem QA-Gate.
- **OTA-Grenze:** native Änderungen (neue Fonts, SDK-Bumps) gehen **nicht** per OTA → solche Sprachen mit dem nächsten Store-Release koppeln.
- **QA-Last bei 23 Sprachen** → Pseudo-Locale + automatisierter Key-Coverage-Check statt manuell pro Sprache.

## Aufwand (grobe Schätzung, Side-Project-Maßstab)

| Phase                      | Aufwand              | Auslieferung           |
| -------------------------- | -------------------- | ---------------------- |
| 0 Registry + Loader        | ~2–3 h               | —                      |
| 1 Async verdrahten         | ~5–7 h               | Store-Release (Code)   |
| 2 Bundle-Diät + dyn. Liste | ~3–4 h               | Store-Release (Code)   |
| 3 12 LTR-Sprachen          | ~3–4 h + Übersetzung | OTA\*                  |
| 4 RTL (4 Sprachen)         | ~8–12 h              | Store-Release (Layout) |
| 5 Pipeline                 | ~3–4 h               | —                      |

\* sofern keine neuen Fonts nötig.

**Empfohlene erste Lieferung:** Phase 0 → 1 → 2 → 3. Danach sind die 12 LTR-Sprachen live, weitere Sprachen/Korrekturen gehen per OTA ohne Store-Review. RTL (Phase 4) bewusst danach.

## Offene Entscheidungen

- ~~`pt` als BR oder PT?~~ → **beide** (`pt-BR` + `pt-PT`), PT nur als Abweichungs-Layer auf BR.
- `zh` → als `zh-Hans` (vereinfacht) angenommen; `zh-Hant` später bei Bedarf.
- Geräte-Locale-Initial soll die neuen Sprachen mit berücksichtigen (Registry-getrieben) — ja, ab Phase 2.
- Spinner beim Sprachwechsel nötig? Erst messen, vermutlich nein.
