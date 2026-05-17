# Action Plan 4: From 8/10 to 10/10

Pruefstand: Nach Runde 3 ist das Repo release-faehig, aber noch nicht auf 10/10-Niveau.

Ziel dieses Plans:

- die letzten funktionalen Restfaelle schliessen
- versteckte Produkt-Schulden entfernen
- Sicherheits- und Wartbarkeitsniveau anheben
- die kritischen Fixes durch Tests absichern

## Erfolgskriterium fuer 10/10

Damit die naechste Abnahme auf 10/10 geht, muessen alle folgenden Punkte erfuellt sein:

1. Keine offenen funktionalen Restfaelle mehr
2. Keine versteckten oder halbfertigen Produktpfade mehr
3. Security-Haertung fuer neue DB-RPCs abgeschlossen
4. Kritische Fixes aus Runde 3 sind durch Tests abgesichert
5. Repo ist sauber: `git status` clean, `lint` gruen, `test` gruen
6. Die finalen Architekturentscheidungen sind kurz dokumentiert

---

## Phase 1: Restfaelle wirklich schliessen

### 1. Weather-Permission-Fall vollstaendig symmetrisch machen

Ort:

- `services/weatherService.js`
- `components/WeatherWidget.js`

Problem:

- `getCurrentWeather()` behandelt `location.denied`.
- `getWeatherForecast()` behandelt den denied-Fall noch nicht gleich.
- Das Widget zeigt aktuell nur einen generischen Retry-State statt eines klaren Permission-States.

Claude muss:

- in `getWeatherForecast()` dieselbe `location.denied`-Behandlung wie in `getCurrentWeather()` einbauen
- den Service optional auf einen expliziten Status rueckbauen, z. B.:
  - `{ denied: true }`
  - `{ unavailable: true }`
- `WeatherWidget` so anpassen, dass bei verweigerter Freigabe ein spezifischer State gerendert wird

Done-Kriterien:

- kein Forecast-Request mehr bei verweigerter Standortfreigabe
- UI unterscheidet sauber zwischen "Standort nicht freigegeben" und "Weather derzeit nicht verfuegbar"

---

### 2. Delete-Account-Restlogik sauber entfernen oder vollstaendig liefern

Ort:

- `screens/SettingsScreen.js`
- ggf. passende Migrationen / Backend-Flows

Problem:

- Die UI ist versteckt, aber der Loeschpfad und die `deleted_at`-Annahme sind weiter im Code.
- Das ist kein akuter User-Bug mehr, aber ein halbfertiger Produktpfad.

Claude muss entweder:

- den gesamten Delete-Account-Code vorerst komplett entfernen

oder vollstaendig liefern:

- Migration fuer das benoetigte Schema
- Backend-/Supabase-Flow
- Logout / Session-Cleanup
- UX-Bestaetigung und Fehlerfall
- dokumentiertes Verhalten fuer Cascade Delete / Recovery

Done-Kriterien:

- kein toter oder halbfertiger Delete-Account-Pfad mehr im Code
- keine Schema-Annahme ohne abgesicherte Migration

---

### 3. Leaderboard-RPCs haerten

Ort:

- `supabase/migrations/20260313_leaderboard_rank_rpc.sql`

Problem:

- Die neuen RPCs funktionieren, aber `SECURITY DEFINER` sollte explizit gehaertet werden.

Claude muss:

- `SET search_path = public` oder eine gleichwertig saubere Haertung in beide Funktionen aufnehmen
- kurz kommentieren, warum das gemacht wurde

Done-Kriterien:

- Funktionen bleiben funktional unveraendert
- Security-Haertung ist explizit im SQL sichtbar

---

## Phase 2: Von "funktioniert" zu "belastbar"

### 4. Tests fuer die Runde-3-Fixes ergaenzen

Ort:

- `__tests__/...`

Problem:

- Die bestehenden Tests sind gruen, decken aber die frisch gefixten Randfaelle kaum ab.

Claude muss mindestens folgende Tests ergaenzen:

- Notification-Toggle:
  - enable -> `fetchTasks(user.id)` + `rescheduleAllTaskReminders(tasks)`
  - disable -> `rescheduleAllTaskReminders([])`
- Weather-Service:
  - denied permission -> kein Forecast-/Proxy-Pfad
- Leaderboard-Service:
  - `getMyRank()` nutzt `supabase.rpc('get_my_rank', ...)`
  - kein Full-Table-Scan ueber `.from('leaderboard_public')` im My-Rank-Pfad
- optional:
  - UI-Test fuer `PlantDetail` no-zones CTA

Done-Kriterien:

- Kritische Runde-3-Fixes sind testseitig abgedeckt
- Ein Rueckfall in die alten Fehlerbilder wuerde Tests brechen

---

### 5. Produkt-Flags zentralisieren

Ort:

- aktuell `screens/SettingsScreen.js`
- Ziel z. B. `services/featureFlags.js`

Problem:

- `SHOW_ACCOUNT_DELETION` und `SHOW_TERMS_LINK` leben aktuell lokal im Screen.
- Das ist besser als `false &&`, aber noch kein sauberer Produktzustand.

Claude muss:

- eine kleine zentrale Feature-Flag-Datei einfuehren, z. B.:
  - `services/featureFlags.js`
- `SettingsScreen` nur noch aus dieser Quelle lesen
- bei Bedarf kuenftige gated Features ebenfalls dort andocken

Done-Kriterien:

- keine screen-lokalen Hardcoded Feature-Flags mehr
- Produkt-Flags sind an einer Stelle nachvollziehbar

---

## Phase 3: Abschluss auf 10/10-Niveau

### 6. Release-Hygiene explizit nachweisen

Claude muss nach den Aenderungen aus Phase 1 und 2 folgendes erneut ausfuehren:

- `git status --short`
- `npm run lint -- --quiet`
- `npm test -- --runInBand`

Done-Kriterien:

- `git status` ist clean
- Lint ist gruen
- Tests sind gruen

Zusatz:

- Die Ergebnisse kurz in einer Handoff-Datei, PR-Beschreibung oder Abschlussnotiz dokumentieren

---

### 7. Mini-Doku fuer die letzten Architekturentscheidungen

Ort:

- `services/leaderboardService.js`
- `services/weatherService.js`
- `screens/SettingsScreen.js`
- optional eine kurze technische Notiz in `HANDOFF.md` oder separater MD-Datei

Claude muss kurz dokumentieren:

- warum Leaderboard jetzt ueber RPC statt Client-Scan laeuft
- wie der Weather-Permission-State gedacht ist
- welche Produktfeatures bewusst deaktiviert sind und wo sie zentral konfiguriert werden

Done-Kriterien:

- ein neuer Reviewer versteht die finalen Entscheidungen ohne Git-Archäologie

---

## Prioritaet

1. Weather-Permission-Fall sauber schliessen
2. Delete-Account-Restlogik aufraeumen
3. RPC-Haertung mit `search_path`
4. Tests fuer Runde-3-Fixes
5. Feature-Flags zentralisieren
6. Lint/Test/Git-Status sauber nachweisen
7. Mini-Doku ergaenzen

---

## Was fuer 10/10 konkret abgeliefert werden muss

- keine offenen funktionalen Restfaelle
- keine versteckten halbfertigen Produktpfade
- sicherheitsseitig gehaertete DB-RPCs
- testseitig abgesicherte Runde-3-Fixes
- sauberer Repo-Zustand
- kurze, klare Doku zu den finalen Entscheidungen

Wenn all das sitzt, ist die Differenz von 8/10 auf 10/10 real geschlossen und nicht nur kosmetisch.
