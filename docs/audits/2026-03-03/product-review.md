# Product Review Audit

Stand: 3. Maerz 2026

## Gesamt-Eindruck

Die App hat bereits eine gute Nutzwert-Basis fuer Hobby-Gaertner: Aufgaben, Wetter, Tagebuch, KI-Assistenz und Discovery-Daten sind da. Aber der Plant Desk ist aktuell noch nicht das Holy-Shit-Feature. Im Code steckt die richtige Datenidee fuer einen echten Pflanzen-Pokedex, nur die UX versteckt ihn, feiert ihn nicht und laesst den wichtigsten Moment nach dem Scan fast komplett verpuffen. Wenn ihr nur einen Hebel zieht, dann diesen: Aus `scan + speichern` muss ein sammelwuerdiger Entdeckungsmoment werden.

## Scorecard

| Bereich                  | Aktuell | Potenzial | Aufwand            |
| ------------------------ | ------- | --------- | ------------------ |
| Plant Desk / Discovery   | 4/10    | 10/10     | Hoch               |
| First Impression         | 3/10    | 9/10      | Mittel             |
| Gaertner-Tauglichkeit    | 7/10    | 9/10      | Mittel             |
| Emotional Design         | 4/10    | 9/10      | Mittel             |
| Feature-Vollstaendigkeit | 6/10    | 9/10      | Mittel bis hoch    |
| GitHub-Praesenz          | 3/10    | 9/10      | Niedrig bis mittel |
| Performance & Mobile     | 5/10    | 8/10      | Mittel bis hoch    |
| Das gewisse Extra        | 3/10    | 10/10     | Hoch               |

## Plant Desk Verdict

- Ist der Plant Desk aktuell ein Holy-Shit-Feature? Nein.
- Was fehlt? Sichtbarkeit, Belohnung, Seltenheit, Saison/Region, Social-Bragging und ein klarer Unterschied zwischen `Erstentdeckung` und `nur fuer mich freigeschaltet`.
- Was ist der eine Moment fuer "guck mal"? Ein Fullscreen-Reveal nach dem Scan: `Neue Art entdeckt` oder `WORLD FIRST / Erstentdecker`, mit Karte, Rarity-Badge, Haptic, Share-Button und direkt sichtbar gefuelltem Dex-Slot.
- Existiert dieser Moment schon? Nein. Es gibt nur Copy-Stubs dafuer in `i18n/locales/de.json`, aber keine UI nutzt sie.

## Kernbefunde

### 1. Holy-Shit-Test

- Der Kern-Hook ist nicht in den ersten 5 Sekunden sichtbar.
- Nach Login landet der User erst im Profil-Setup, dann in einem Beta-Screen ueber Credits und danach auf `Zuhause`, also Zonen-/Standort-CRUD statt Discovery.
- Der Plant Desk ist nicht als Hauptziel inszeniert.

Relevante Stellen:

- `App.js`
- `screens/ProfileCompleteScreen.js`
- `screens/BetaWelcomeScreen.js`
- `screens/HomeManager.jsx`

### 2. Plant Desk sichtbar?

Praktisch nein.

- Die Route existiert, aber ich sehe keinen normalen In-App-CTA dorthin aus dem Hauptfluss.
- In `screens/PlantListScreen.js` gibt es nur Pflanzenliste und Zuhause-Tab.
- Ein Killer-Feature, das man suchen muss, ist kein Killer-Feature.

### 3. Discovery Experience

Der Scan fuehlt sich aktuell eher wie ein Formular mit KI-Vorfuellung an.

- Nach dem Speichern wird die Entdeckung nur still geloggt.
- `Erstentdeckung` und `Freischaltung` sehen identisch aus.
- Der Moment endet bei "Pflanze gespeichert!" statt bei "Neue Art entdeckt!".

Relevante Stellen:

- `screens/AddPlantScreen.js`
- `services/discoveryService.js`

### 4. Collection- und Pokedex-Gefuehl

Der Desk ist naeher an einer Liste als an einer Sammlung.

- `screens/PlantDexScreen.js` zeigt im Kern nur Progressbar, Filter und Grid.
- `components/DexCard.js` zeigt locked/unlocked, aber ohne Slot-Nummern, Seltenheit, Saison, Region oder Set-Logik.
- Namen werden im Discovery-Layer auf lowercase normalisiert und spaeter roh gerendert. Das fuehlt sich eher nach Datenbank als nach Sammlerkarte an.

Relevante Stellen:

- `screens/PlantDexScreen.js`
- `components/DexCard.js`
- `services/discoveryService.js`
- `services/dexService.js`

### 5. Social & Community

Es gibt Ranking, aber kaum erzaehlbare Sammlung.

- Rangliste ist da.
- Kein oeffentlicher Plant Desk.
- Kein Feed.
- Kein Friend-Compare.
- Keine teilbaren Discovery-Cards.
- Erstentdecker wird nur schwach visuell markiert.

Relevante Stelle:

- `screens/LeaderboardScreen.js`

### 6. Gaertner-Brain-Check

Positiv:

- Sprache ist meist verstaendlich.
- Wetter, Aufgaben und Ben helfen echten Hobby-Gaertnern.
- Die App wirkt nicht komplett botanisch-abgehoben.

Negativ:

- Credits, Avatar, Standortmodell und Profilpflicht stehen zu frueh im Vordergrund.
- Ein Noob wird zuerst in Setup und Verwaltung geschoben statt in den Kernmoment.

### 7. Emotional Design

Nuetzlich ja, lebendig nein.

- Kein Sound.
- Keine Haptics.
- Keine Reveal-Animation.
- Kein seltener Fund, der sich selten anfuehlt.
- Nach dem Save dominiert Workflow-Text statt Sammler-Dopamin.

### 8. Performance & Mobile Reality-Check

Fuer den Outdoor-Use-Case ist das noch zu fragil.

- Der Scan haengt komplett am Netz.
- Es gibt keinen echten Offline-Scan-Flow.
- Fotos werden als Base64 verarbeitet; das ist fuer schwache Geraete und schlechtes Netz kein ideales Muster.
- Der Kernmoment ist nicht auf schlechten Empfang optimiert.

Positiv:

- Offline-Banner existiert.
- Wetter hat Caching.

Negativ:

- Kein Pending-Queue-System fuer Scans.
- Kein spaeteres Syncen.
- Keine sichtbare Kompression- oder Low-Bandwidth-Strategie fuer den Plant-Scan.

Relevante Stellen:

- `screens/AddPlantScreen.js`
- `services/uploadService.js`
- `supabase/functions/ai-plant-scan/index.ts`
- `supabase/functions/_shared/openai.ts`

### 9. GitHub-Star-Magnet

Technisch okay, aber produktseitig und Open-Source-seitig noch klar unter Referenzniveau.

Positiv:

- CI ist vorhanden.
- Commit-History ist brauchbar.
- Screenshots existieren.

Negativ:

- Kein Hero-Screenshot oder GIF ganz oben im README.
- Kein klarer Plant-Desk-Hook in Satz 1.
- Kein starker Pokedex-Vergleich im README-Lead.
- Keine Badges.
- Keine Demo-URL.
- Keine License.
- Kein `CONTRIBUTING.md`.
- Keine Issue-Templates.
- Kein PR-Template.
- Kein `.env.example`.
- README ist teilweise veraltet und listet Dateien, die in der Codebasis fehlen.

Praktisch geprueft:

- `npm test -- --runInBand` ist aktuell nicht gruen.
- `npm run lint` laeuft formal, aber mit massivem Warnungsrauschen.

## Feature Gap Analyse

| Fehlendes Feature                                    | Kritisch fuer 5 Sterne | Aufwand         | Integration                                                                                         | Verstaerkt Plant Desk?           |
| ---------------------------------------------------- | ---------------------- | --------------- | --------------------------------------------------------------------------------------------------- | -------------------------------- |
| Discovery-Reveal mit `Erstentdecker`/`Unlock`-Branch | Sehr hoch              | Mittel          | `services/discoveryService.js`, `screens/AddPlantScreen.js`, `screens/DexDetailScreen.js`           | Ja, direkt                       |
| Rarity, Saison, Region, fehlende Sets                | Sehr hoch              | Mittel bis hoch | `species` erweitern, `services/dexService.js`, `components/DexCard.js`, `screens/PlantDexScreen.js` | Ja, direkt                       |
| Saisonale Expeditionen / Challenges                  | Hoch                   | Mittel          | neue Migration + `eventService`, UI in Home/Desk                                                    | Ja                               |
| Sharebarer oeffentlicher Plant Desk                  | Hoch                   | Mittel          | `DexDetailScreen`, `LeaderboardScreen`, neue Public-Profile-Route                                   | Ja                               |
| Discovery-Feed / Neighbor-Compare / Freunde          | Hoch                   | Mittel bis hoch | auf `leaderboard_public`/neuen Views aufbauen                                                       | Ja                               |
| Wetterintelligente Care-Reminders                    | Hoch                   | Mittel          | bestehende `weatherService` + `taskService`                                                         | Eher unterstuetzend              |
| Offline-Scan-Queue                                   | Hoch                   | Hoch            | AsyncStorage-Queue + Retry-Sync + Pending-State                                                     | Ja                               |
| Schaeddings-/Krankheitsdiagnose                      | Mittel                 | Mittel          | `ai-healthcheck` ausbauen                                                                           | Unterstuetzend                   |
| Foto-Tagebuch mit Zeitverlauf / Timelapse            | Mittel                 | Mittel          | `diaryService`, `PlantGallery`, `PlantDetailScreen`                                                 | Ja, emotional                    |
| AR-Scan                                              | Niedriger als gedacht  | Hoch            | neuer Scanner-Stack                                                                                 | Eher Ablenkung, erstmal schieben |

## Action Plan "Road to 10/10"

### Sofort umsetzen - groesster Impact (Plant Desk first!)

1. Mach den Plant Desk zur Hauptbuehne.
   Umsetzung:
   - In `App.js` den Desk auf Top-Level heben oder mindestens als festen CTA in den Primarfluss ziehen.
   - In `screens/PlantListScreen.js` einen permanenten `Plant Desk`-CTA im Header oder als dritte Ansicht ergaenzen.
   - `screens/HomeManager.jsx` nicht laenger als kalten Default-Start behandeln.

2. Bau den Reveal-Moment direkt nach dem Speichern.
   Umsetzung:
   - `services/discoveryService.js` so erweitern, dass `logDiscovery()` Discovery-Metadaten zurueckgibt.
   - In `screens/AddPlantScreen.js` nach Save in `Erstentdeckung` vs. `freigeschaltet` verzweigen.
   - Einen Fullscreen-Reveal bauen mit Karte, Badge, Haptic, Share-CTA und Deep-Link in die Species-Detailseite.
   - Die vorhandenen `dex.*`-Texte aus den i18n-Dateien endlich nutzen.

3. Verwandle den Desk von Grid in Sammlung.
   Umsetzung:
   - `services/dexService.js` um `display_name`, Slot-Nummer, Rarity, Saison und Region erweitern.
   - `components/DexCard.js` um Locked-Silhouetten mit Serien-/Slot-Logik erweitern.
   - `screens/PlantDexScreen.js` mit Set-Fortschritt, Collection-Header, First-Discovery-Count und sichtbaren Luecken aufwerten.

### Naechster Sprint - macht die App komplett

1. Bau Social-Bragging statt nur Rangliste.
   Umsetzung:
   - `screens/LeaderboardScreen.js` um `Nachbarn um mich herum`, `Freunde vergleichen` und Discovery-Highlights ergaenzen.
   - `screens/DexDetailScreen.js` um Share-Button fuer Species- und Erstentdecker-Karten erweitern.

2. Liefere saisonale Expeditionen.
   Umsetzung:
   - Neue Tabellen in `supabase/migrations` fuer `seasonal_events` und `user_event_progress`.
   - Neues `services/eventService.js`.
   - Event-CTA in `screens/HomeManager.jsx` oder besser in die Discovery-Startseite und den Plant Desk.
   - Beispiel: `Fruehlings-Expedition: Finde 5 Wildblumen`.

3. Repariere den Open-Source-Eingang.
   Umsetzung:
   - README-Hero ganz oben mit GIF oder Screenshot vom Discovery-Reveal.
   - Tagline im ersten Absatz: `A real-world plant Pokedex for hobby gardeners`.
   - `LICENSE`, `CONTRIBUTING.md`, `.env.example`, `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md` ergaenzen.
   - Veraltete Dateiliste in `README.md` korrigieren.

### Langfristig - macht die App legendaer

1. Mach Spaziergaenge zur Jagd.
   Umsetzung:
   - Biome, regionale Floren, saisonale Spawn-Fenster und `nearby missing species` auf Basis von Standortdaten.
   - Species-Metadaten und Home/Desk-Hero entsprechend ausbauen.

2. Bau die Community-Schicht.
   Umsetzung:
   - Oeffentlicher Discovery-Feed.
   - Lokale Bioblitz-Wochenenden.
   - Team-Challenges.
   - Verewigung von Erstentdeckern in Species-Details.

3. Gib Pflanzen Lebensgeschichte statt nur Datensaetze.
   Umsetzung:
   - `screens/PlantDetailScreen.js`, `DiaryTimeline` und `PlantGallery` zur echten Entwicklungsreise ausbauen.
   - Wachstum, Krisen, Rettungen, Achievements und teilbare Vorher/Nachher-Karten integrieren.

## Kurzfazit

Die App kann eine starke Garten-App werden, aber noch nicht die Referenz-App, die man sofort Freunden zeigt. Das entscheidet sich fast komplett am Plant Desk. Die Datenbasis dafuer ist schon angelegt, aber die Inszenierung fehlt. Wenn der Scan in einen echten Discovery-Reveal kippt und der Desk als stolze Sammlung statt als Verwaltungsansicht funktioniert, ist der Weg von `solide` zu `star-worthy` realistisch.
