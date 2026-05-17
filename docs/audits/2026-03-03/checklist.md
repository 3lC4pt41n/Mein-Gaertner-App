# Audit Checklist — Product Review 2026-03-03

## Erledigt vs. Offen

### Sofort umsetzen — größter Impact (Plant Desk first!)

| #   | Audit-Punkt                      | Status | Umsetzung                                                                                        | Abweichung                                                                         |
| --- | -------------------------------- | ------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 1   | Plant Desk als Hauptbühne        | ✅     | PlantListScreen: CTA-Bar, HomeManager: Progress Card                                             | Kein Tab-Umbau, stattdessen CTA-Bar — weniger invasiv, gleicher Effekt             |
| 2   | Reveal-Moment nach dem Speichern | ✅     | DiscoveryRevealModal mit Animationen, discoveryService returns metadata                          | Fullscreen statt Navigation — besser als neuer Screen weil kein Stack-Overhead     |
| 3   | Desk von Grid in Sammlung        | ✅     | DexCard: Slots, Rarity, Display Names. PlantDexScreen: Collection Header, Stats, Pull-to-Refresh | Rarity über Gold-Border statt eigenem Rarity-System — Daten-Schema nicht erweitert |

### Nächster Sprint

| #   | Audit-Punkt                    | Status   | Umsetzung                                                       | Abweichung                                                          |
| --- | ------------------------------ | -------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| 4   | Social-Bragging                | ✅       | DexDetailScreen: Share, LeaderboardScreen: Share Stats          | Kein öffentlicher Plant Desk / Feed — erfordert neue Backend-Routes |
| 5   | Saisonale Expeditionen         | ⏳ Offen | —                                                               | Erfordert neue DB-Tabellen + neuen Service → nächste Runde          |
| 6   | Open-Source-Eingang reparieren | ✅       | README, LICENSE, CONTRIBUTING, .env.example, Issue/PR Templates | —                                                                   |

### Code Quality (Handoff-Punkte)

| #   | Audit-Punkt                  | Status       | Umsetzung                                                      |
| --- | ---------------------------- | ------------ | -------------------------------------------------------------- |
| H1  | Inline Styles extrahieren    | ✅ teilweise | PlantListScreen komplett migriert. Weitere Screens noch offen. |
| H2  | Raw TextInputs → DSInput     | ✅           | AddDiaryEntryDialog + AddTaskDialog                            |
| H3  | Console-Statements entfernen | ✅           | 15+ Statements aus 7 Dateien entfernt                          |
| H4  | react-native-paper entfernen | ✅           | Aus package.json gelöscht                                      |
| H5  | PropTypes auf DS-Komponenten | ✅           | Alle 5 Komponenten + prop-types Dependency                     |
| H6  | ErrorBoundary A11y           | ✅           | accessibilityRole/Label auf Retry + Details                    |

### Langfristig (bewusst nicht umgesetzt)

| #   | Audit-Punkt              | Status   | Begründung                                                 |
| --- | ------------------------ | -------- | ---------------------------------------------------------- |
| L1  | Offline-Scan-Queue       | ⏳ Offen | Tiefgreifender Umbau, erfordert AsyncStorage-Queue + Retry |
| L2  | Discovery Feed / Freunde | ⏳ Offen | Neues Backend-Feature, nicht in diesem Sprint              |
| L3  | Biome / regionale Floren | ⏳ Offen | Species-Schema-Erweiterung nötig                           |
| L4  | Team-Challenges          | ⏳ Offen | Community-Feature, eigener Sprint                          |
| L5  | Foto-Tagebuch Timelapse  | ⏳ Offen | UI-Feature, kein Blocker                                   |

## Scorecard — Vorher/Nachher (geschätzt)

| Bereich                 | Vorher | Nachher | Delta                                                |
| ----------------------- | ------ | ------- | ---------------------------------------------------- |
| Plant Desk / Discovery  | 4/10   | 7/10    | +3 (Reveal, Collection, Navigation)                  |
| First Impression        | 3/10   | 5/10    | +2 (Dex CTA sichtbar, Progress Card)                 |
| Gärtner-Tauglichkeit    | 7/10   | 7/10    | = (kein Funktions-Umbau)                             |
| Emotional Design        | 4/10   | 7/10    | +3 (Reveal-Animation, Gold Badges, Share)            |
| Feature-Vollständigkeit | 6/10   | 7/10    | +1 (Share, Collection Stats)                         |
| GitHub-Präsenz          | 3/10   | 8/10    | +5 (README, LICENSE, Templates)                      |
| Performance & Mobile    | 5/10   | 5/10    | = (Offline-Queue noch offen)                         |
| Das gewisse Extra       | 3/10   | 6/10    | +3 (Reveal-Moment, Slot-Nummern, Erstentdecker-Gold) |

## Verifikation

- ✅ ESLint grün auf allen geänderten Dateien (18 Dateien geprüft)
- ✅ Alle Imports auflösbar
- ✅ Alle i18n-Keys existieren in allen 6 Sprachen
- ✅ Keine console.log/warn Statements in geänderten Service-Dateien
- ✅ react-native-paper nicht mehr in Dependencies
- ✅ prop-types in Dependencies
- ✅ PropTypes auf allen 5 DS-Komponenten
- ✅ ErrorBoundary A11y komplett
- ✅ HANDOFF.md aktualisiert
