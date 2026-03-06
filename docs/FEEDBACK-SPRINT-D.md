# Sprint D – Feedback-Auswertung & Implementierungsplan

**Stand:** 06.03.2026
**Feedback-Quelle:** 15 Einträge (+ 2 Test), 2 User, 8 Screenshots
**Bereits gefixt:** Healthcheck-Parse-Fehler (Commit `967d6bb`)

---

## Übersicht: 12 Bugs, 3 Feature-Requests

### BEREITS GEFIXT ✅

| # | Bug | Status |
|---|-----|--------|
| H1 | Healthcheck liefert 0 / Parse-Fehler | ✅ Commit `967d6bb` — Edge Function gibt 422 + Refund bei Parse-Fehler, Client-Guard gegen null |
| H2 | Healthcheck Fehler-Screenshot (2. User) | ✅ Gleicher Fix |

---

## Sprint D-1: Quick Wins (EASY) — ~2-3h gesamt

### D1.1 — Home-Kacheln & Dex-Counter nicht aktuell (Bug #1 + #7)

**Problem:** Dex-Fortschritt auf Home zeigt "22/26" statt "23/27". Kachel aktualisiert sich nicht automatisch.
**Ursache:** `HomeManager.jsx` lädt Dex-Daten nur einmal im `useEffect`, nicht bei Screen-Focus.
**Fix:** `useEffect` → `useFocusEffect` für `reload()` in HomeManager.
**Dateien:** `screens/HomeManager.jsx`
**Aufwand:** 15 min

### D1.2 — Anzeigename wird bei Back-Navigation nicht gespeichert (Bug #4)

**Problem:** Öffentlicher Anzeigename geht verloren wenn man "Zurück" drückt.
**Ursache:** `onBlur` wird nicht zuverlässig bei nativer Back-Navigation gefeuert.
**Fix:** Save-Aufruf im `useFocusEffect` Cleanup oder "Speichern"-Button hinzufügen.
**Dateien:** `screens/SettingsScreen.js`
**Aufwand:** 20 min

### D1.3 — Dex-Detail Fehler beim Antippen (Bug #5)

**Problem:** Fehler beim Klick auf Pflanze im Pflanzendex.
**Ursache:** Fehlende Param-Validierung in `DexDetailScreen.js`, stille Error-Handler.
**Fix:** Route-Params validieren, Error-Handling verbessern, Fallback-UI.
**Dateien:** `screens/DexDetailScreen.js`, `screens/PlantDexScreen.js`
**Aufwand:** 30 min

### D1.4 — Layout-Sprung beim Dex-Laden (Bug #6)

**Problem:** Padding ändert sich nach dem Laden der Dex-Pflanzen → visueller Sprung.
**Ursache:** Inkonsistente Padding-Werte zwischen Loading-, Empty- und Loaded-State.
**Fix:** Einheitliches Padding über alle Zustände.
**Dateien:** `screens/PlantDexScreen.js`
**Aufwand:** 15 min

### D1.5 — Unklare Fehlermeldungen (Bug #10)

**Problem:** User fragt "Was heißt das?" bei kryptischer Fehlermeldung.
**Ursache:** Rohe API-Fehler werden direkt angezeigt (z.B. Netzwerk-Timeouts, API-Codes).
**Fix:** Error-Helper mit kategorisierten, user-freundlichen Meldungen erstellen.
**Dateien:** Neuer Helper `utils/errorMessages.js`, Updates in `AddPlantScreen.js`, `PlantDexScreen.js`
**Aufwand:** 45 min

---

## Sprint D-2: Mittlere Fixes (MEDIUM) — ~4-5h gesamt

### D2.1 — Pflanzenliste aktualisiert sich nicht nach Hinzufügen (Bug #8)

**Problem:** Nach dem Anlegen einer Pflanze muss man manuell aktualisieren.
**Ursache:** `useFocusEffect` in PlantListScreen ist korrekt implementiert, aber der Navigationsfluss nach Pflanzen-Erstellung triggert den Focus-Event nicht zuverlässig.
**Fix:** Navigation-Flow in AddPlantScreen überarbeiten: nach Speichern explizit `navigation.navigate('PlantList')` mit Reset, oder Event-basierte Aktualisierung.
**Dateien:** `screens/PlantListScreen.js`, `screens/AddPlantScreen.js`
**Aufwand:** 1h

### D2.2 — Keine weiteren Pflanzen nach erster Anlage (Bug #9)

**Problem:** Plus-Button funktioniert nach dem Anlegen der ersten Pflanze nicht mehr.
**Ursache:** Dependency-Array-Bug in `useFocusEffect` — `[step]` als Dependency führt zu unzuverlässigem Reset.
**Fix:** `step` aus Dependency entfernen, Ref-basiertes Tracking ob Screen gerade zurückkehrt.
**Dateien:** `screens/AddPlantScreen.js`
**Aufwand:** 45 min

### D2.3 — Keine Erfolgsmeldung nach Pflanzen-Entdeckung (Bug #3)

**Problem:** Nach Entdeckung einer neuen Pflanze keine Erfolgsmeldung, landet auf Scanner-Screen.
**Ursache:** Discovery-Logging schlägt still fehl → `isNewForUser` ist `null` → Modal wird nicht gezeigt.
**Fix:** Error-Handling in AddPlantScreen differenzieren: "already discovered" vs. "error" getrennt behandeln.
**Dateien:** `screens/AddPlantScreen.js`, `components/DiscoveryRevealModal.js`
**Aufwand:** 1h

### D2.4 — Credit-Verbrauch zeigt keine Einnahmen (Bug #2)

**Problem:** Unter Verbrauch sieht man nur Abzüge, keine gewonnenen Credits.
**Ursache:** `fetchUsageHistory()` queried nur `usage_log` (Abzüge). Verdiente Credits (Discovery-Awards, Purchases) fehlen.
**Fix:** Unified Query über `usage_log` + `transactions` Table, UI mit +/- Formatierung.
**Dateien:** `services/creditService.js`, `screens/StoreScreen.js`
**Aufwand:** 1.5h

---

## Sprint D-3: Feature-Requests (Backlog)

### F1 — Aufgaben-Tab im Plant-Detail-Screen

**Beschreibung:** Neuer Tab um Aufgaben pro Pflanze anzulegen, verwalten, bestätigen. Option für "Ben übernimmt Verwaltung".
**Aufwand:** ~8-12h (neuer Screen-Tab, Task-CRUD pro Pflanze, Ben-Auto-Scheduling)
**Priorität:** HOCH — direkt UX-verbessernd für Power-User

### F2 — Dex nach Spezies untergliedern

**Beschreibung:** Pflanzendex sinnvoll nach Spezies-Kategorien sortiert.
**Aufwand:** ~4-6h (Backend: species_group Feld, Frontend: SectionList mit Headern)
**Priorität:** MITTEL — verbessert Übersichtlichkeit bei wachsender Collection

### F3 — Welt-Heatmap im Dex-Detail

**Beschreibung:** Heatmap der Welt nach Häufigkeit der Entdeckung pro Spezies.
**Aufwand:** ~6-10h (Geolocation bei Discovery speichern, Map-Library, Aggregation-Query)
**Priorität:** NIEDRIG — "nice to have", benötigt zusätzliche Geodaten

---

## Empfohlene Reihenfolge

```
Sprint D-1 (Quick Wins)     →  1 Session, ~2-3h
  D1.1  Home-Kacheln Focus-Refresh
  D1.2  Anzeigename Save
  D1.3  Dex-Detail Error
  D1.4  Dex Layout-Sprung
  D1.5  Error-Messages

Sprint D-2 (Mittlere Fixes)  →  1-2 Sessions, ~4-5h
  D2.2  Plus-Button Fix (blockiert User!)
  D2.1  Pflanzenliste Auto-Refresh
  D2.3  Discovery-Erfolgsmeldung
  D2.4  Credit-Verbrauch komplett

Feature Backlog               →  Spätere Sprints
  F1   Aufgaben-Tab (nächster Sprint)
  F2   Dex-Kategorien
  F3   Welt-Heatmap
```

**Empfehlung:** Sprint D-1 + D2.2 sofort umsetzen — das sind die Bugs die am meisten stören und User blockieren (besonders D2.2: Plus-Button). D-2 Rest kann im Anschluss folgen.
