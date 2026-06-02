# Codex-Auftrag: Tastatur überdeckt Eingabefelder (iOS + Android global fixen)

## Ausgangslage (warum dieser Auftrag)
Auf iOS **und** Android schiebt sich die Software-Tastatur über die Eingabefelder, sodass der User nicht sieht, was er tippt (oder das aktive Feld gar nicht erreicht). Das ist kein Einzelfehler in einem Screen — es ist ein **systemisches Lücken-Muster**: Die App hat **keine konsistente Keyboard-Avoidance-Strategie**, und die wenigen Stellen, die eine haben, machen es falsch.

Stack-Kontext (verifiziert, nicht geraten): Expo `^54.0.33`, React Native `0.81.5` (New Architecture per SDK-54-Default an), `@react-navigation/native-stack` mit sichtbaren Headern, Android **Edge-to-Edge per SDK-54-Default an**. Genau diese Kombination (RN 0.81 + Expo 54 + Edge-to-Edge) macht die native `KeyboardAvoidingView` aus `react-native` auf Android praktisch unbrauchbar — der bisher übliche `behavior={undefined}`-Trick funktioniert nicht mehr zuverlässig.

### Repo-Befund (Ist-Zustand, Datei für Datei)
Alle Text-Eingabe-Oberflächen und ihr aktuelles Keyboard-Verhalten:

| Datei | Eingabe | Keyboard-Handling heute | Problem |
|-------|---------|-------------------------|---------|
| `screens/AuthScreen.js` | 4× rohe `TextInput` (Email/PW/PW-Reset) | **`<View style={styles.container}>` — KEIN KAV, KEIN ScrollView** (`AuthScreen.js:631`) | Untere Felder (Passwort, „Passwort bestätigen") werden von der Tastatur verdeckt. **Höchste Prio — Auth ist das Einlass-Tor.** |
| `components/AddDiaryEntryDialog.js` | `DSInput`, u.a. **`multiline` Notiz** | Bottom-`Modal` (`animationType="slide"`), **kein KAV** (`AddDiaryEntryDialog.js:86`) | Notizfeld am unteren Modal-Rand → komplett verdeckt. **Hohe Prio.** |
| `components/AddTaskDialog.js` | `DSInput` | `Modal` + `ScrollView`, **kein KAV** (`AddTaskDialog.js:145/165`) | Felder unter der Fold verdeckt. |
| `screens/AddPlantScreen.js` | `DSInput` | `SafeAreaView` + `ScrollView`, **kein KAV** (`AddPlantScreen.js:503/507`) | Untere Felder verdeckt. |
| `screens/ProfileCompleteScreen.js` | `DSInput` (Username) | nur `ScrollView`, **kein KAV** (`ProfileCompleteScreen.js:277`) | Onboarding-Schritt — Feld kann verdeckt sein. |
| `screens/SettingsScreen.js` | `DSInput` | nur `ScrollView`, **kein KAV** (`SettingsScreen.js:434`) | Untere Felder verdeckt. |
| `screens/FeedbackScreen.js` | `DSInput` (`multiline`) | KAV vorhanden, **aber `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`**, **kein `keyboardVerticalOffset`** (`FeedbackScreen.js:121-128`) | Android: `undefined` = KAV tut nichts. iOS: ohne Offset rechnet `padding` die Native-Stack-Header-Höhe nicht ein. |
| `screens/AssistantScreen.js` | `TextInput` (Chat-Eingabe) + `FlatList` | KAV vorhanden, **gleiches `behavior=undefined`-Anti-Pattern**, **kein Offset** (`AssistantScreen.js:325-334`) | Android: Eingabezeile kann verdeckt sein; iOS: Offset fehlt. |

**Globaler Root-Cause #1:** Keine projektweite, wiederverwendbare Avoidance-Lösung → jeder Screen kocht (oder vergisst) sein eigenes Süppchen.
**Globaler Root-Cause #2:** Kein `android.softwareKeyboardLayoutMode` gesetzt; mit Edge-to-Edge unter SDK 54 ist das native Resizing nicht verlässlich.

---

## Ziel
**Eine** robuste, projektweite Keyboard-Avoidance, die auf iOS und Android (inkl. Modals und Edge-to-Edge) identisch funktioniert. Kein Screen darf mehr ein Eingabefeld hinter der Tastatur verstecken.

## Empfohlener Lösungsweg (verbindlich, nicht „prüfen ob")
Wir nutzen **`react-native-keyboard-controller`** — der De-facto-Standard für genau dieses RN-0.81/Expo-54/Edge-to-Edge-Problem. Es liefert plattformgleiches Verhalten, funktioniert mit New Architecture und löst auch das Android-Resize-Problem, an dem die Core-`KeyboardAvoidingView` scheitert. Es ist ein Native-Modul → erfordert einen neuen Dev-/EAS-Build (kein OTA). Das ist ok, dieses Projekt baut ohnehin über EAS/Prebuild.

> **Wenn** du (Codex) aus triftigem Grund die Native-Dependency vermeiden willst, ist der einzige zulässige Fallback: Core-`KeyboardAvoidingView` **konsequent überall** + `expo-build-properties` mit `android.softwareKeyboardLayoutMode: "resize"`. Dann musst du aber im PR-Text begründen, warum, und das Android-Verhalten unter Edge-to-Edge explizit testen. Default bleibt `react-native-keyboard-controller`.

## Regeln
- Code-Kommentare und UI-Texte auf **Deutsch**; keine neuen hartkodierten Strings (dieser Auftrag braucht voraussichtlich keine — falls doch, in **alle** `i18n/locales/*.json`).
- React Native + Expo. **Reduce, reduce, reduce.** Eine zentrale Lösung, dann Screens darauf umstellen — kein Copy-Paste-KAV pro Screen.
- **Backward-compatible**: Layout/Scroll-Verhalten der Screens darf nicht brechen; `FlatList`-Chat in `AssistantScreen` muss invers/scrollbar bleiben.
- Web-Pfad (`platforms` enthält `web`) darf nicht crashen — `react-native-keyboard-controller` no-op-t auf Web sauber, aber verifizieren.

---

## Teilauftrag A — Dependency + Provider + zentraler Wrapper (Fundament)

### A1. Installation & Native-Setup
- `npx expo install react-native-keyboard-controller` (zieht passende Version für SDK 54).
- Sicherstellen, dass es als Expo-Plugin/Autolinking greift; falls ein Config-Plugin nötig ist, in `app.json` `plugins` ergänzen. Neuer Dev-Build erforderlich — im PR-Text als To-do für Tim vermerken (`eas build` / `expo run`).

### A2. `KeyboardProvider` an die App-Wurzel
- In `App.js` den `KeyboardProvider` **über** `NavigationContainer` legen. Aktuelle Wurzel-Verschachtelung ist `LanguageProvider → AuthProvider → … → NavigationContainer` (`App.js:454-461`, `App.js:395`). `KeyboardProvider` so weit außen wie möglich einhängen (oberhalb der Navigation, innerhalb evtl. vorhandener Safe-Area/Gesture-Roots).

### A3. Zentralen Wrapper bauen: `theme/KeyboardAwareScreen.js`
- Neue Komponente, die `KeyboardAwareScrollView` aus `react-native-keyboard-controller` kapselt, mit sinnvollen Defaults:
  - `bottomOffset` (~16–24, Tokens nutzen), `keyboardShouldPersistTaps="handled"`, `contentContainerStyle`-Passthrough, `style`-Passthrough, `extraKeyboardSpace` falls nötig.
  - Props transparent durchreichen, damit Screens nur `<ScrollView>` → `<KeyboardAwareScreen>` tauschen müssen.
- Optional zweite Export-Variante `KeyboardAwareModalContent` für die Bottom-Modals (siehe Teilauftrag C).

### Akzeptanzkriterien A
- [ ] `react-native-keyboard-controller` installiert, App startet auf iOS, Android **und** Web ohne Crash.
- [ ] `KeyboardProvider` umschließt die Navigation in `App.js`.
- [ ] `theme/KeyboardAwareScreen.js` existiert, ist dokumentiert (Kopf-Kommentar Deutsch) und wiederverwendbar.

---

## Teilauftrag B — Screens umstellen (das Kern-Fix)

### B1. `screens/AuthScreen.js` (höchste Prio)
- Den äußeren `<View style={styles.container}>` (`AuthScreen.js:631`) durch `KeyboardAwareScreen` ersetzen (bzw. Formular-Inhalt darin scrollbar machen).
- Ziel: Beim Fokus auf Email/Passwort/„Passwort bestätigen" scrollt das Feld sichtbar über die Tastatur; Submit-Button bleibt erreichbar.
- Recovery-Form (`renderRecoveryForm`) und Auth-Form (`renderAuthForm`) gleichermaßen abdecken.

### B2. `screens/AddPlantScreen.js`, `screens/ProfileCompleteScreen.js`, `screens/SettingsScreen.js`
- Jeweiligen `<ScrollView>` durch `KeyboardAwareScreen` ersetzen. `SafeAreaView`-Edges in `AddPlantScreen` (`edges={['bottom']}`) beibehalten.

### B3. `screens/FeedbackScreen.js`
- Bestehende `KeyboardAvoidingView`-Konstruktion (`121-187`) entfernen, durch `KeyboardAwareScreen` ersetzen. Das `behavior=undefined`-Anti-Pattern fliegt raus.

### B4. `screens/AssistantScreen.js` (Sonderfall Chat)
- Chat = `FlatList` + fixierte Eingabezeile am Boden. **Nicht** in eine ScrollView packen. Stattdessen: die untere Eingabe-Leiste mit `KeyboardAvoidingView` aus `react-native-keyboard-controller` (oder `useKeyboardHandler`/`KeyboardStickyView`) an die Tastatur koppeln, sodass die Eingabezeile direkt über der Tastatur klebt und die `FlatList` darüber sichtbar bleibt.
- `behavior=undefined`-Pattern (`325-327`) entfernen.

### Akzeptanzkriterien B
- [ ] In **jedem** der Screens (`AuthScreen`, `AddPlantScreen`, `ProfileCompleteScreen`, `SettingsScreen`, `FeedbackScreen`, `AssistantScreen`) ist beim Tippen das aktive Feld vollständig sichtbar — iOS **und** Android.
- [ ] In `AssistantScreen` klebt die Eingabezeile über der Tastatur; Chat-Verlauf bleibt sichtbar/scrollbar.
- [ ] Kein `behavior={... : undefined}`-Muster mehr im Repo (grep-clean).

---

## Teilauftrag C — Modals (eigene Tücke)

`Modal`-basierte Dialoge bekommen die System-Avoidance **nicht** automatisch und sind auf Android mit Edge-to-Edge zickig.

### C1. `components/AddDiaryEntryDialog.js` & `components/AddTaskDialog.js`
- Modal-Inhalt (`dialogContainer`/Content) mit `KeyboardAvoidingView` aus `react-native-keyboard-controller` umschließen **oder** die scrollbaren Inhalte auf `KeyboardAwareScrollView` umstellen.
- Auf das `multiline`-Notizfeld in `AddDiaryEntryDialog` (`128-136`) besonders achten — das ist der wahrscheinlichste konkrete Verdecker.
- Android-Caveat: RN-`Modal` braucht ggf. `statusBarTranslucent`/`navigationBarTranslucent` für korrektes Keyboard-Inset unter Edge-to-Edge. Setzen und testen.

### Akzeptanzkriterien C
- [ ] In beiden Dialogen bleibt jedes Eingabefeld — inkl. multiline-Notiz — beim Tippen sichtbar (iOS + Android).
- [ ] „Speichern"/„Abbrechen"-Buttons im Modal bleiben erreichbar, während die Tastatur offen ist.

---

## Teilauftrag D — Globale Android-Härtung
- `expo-build-properties` (falls noch nicht vorhanden, `npx expo install expo-build-properties`) und in `app.json`/`app.config.js` `android.softwareKeyboardLayoutMode: "resize"` setzen — als Sicherheitsnetz unter Edge-to-Edge.
- Verifizieren, dass das nicht mit dem Edge-to-Edge-Status-Bar-Inset kollidiert.

### Akzeptanzkriterien D
- [ ] `softwareKeyboardLayoutMode` ist gesetzt; Android-Builds verhalten sich auch ohne fokussierte Screen-Logik korrekt.

---

## Abnahme-Testmatrix (Pflicht — manuell auf echtem Gerät/Emulator)
Pro Zeile: Feld fokussieren → prüfen, dass es **über** der Tastatur sichtbar bleibt und der Submit-Button erreichbar ist.

| Oberfläche | iOS | Android |
|------------|-----|---------|
| AuthScreen – Login (Email + Passwort) | ☐ | ☐ |
| AuthScreen – Passwort-Reset (2 Felder) | ☐ | ☐ |
| ProfileCompleteScreen – Username | ☐ | ☐ |
| AddPlantScreen – untere Felder | ☐ | ☐ |
| SettingsScreen – untere Felder | ☐ | ☐ |
| FeedbackScreen – multiline | ☐ | ☐ |
| AssistantScreen – Chat-Eingabe (Sticky) | ☐ | ☐ |
| AddDiaryEntryDialog – multiline-Notiz | ☐ | ☐ |
| AddTaskDialog – Felder | ☐ | ☐ |
| Web-Build startet ohne Crash | ☐ | – |

- Zusätzlich: kleines Gerät (z.B. iPhone SE / kompakter Android) testen — dort verdeckt die Tastatur am ehesten.
- `.maestro/` existiert (`screenshots.yaml`) — optional einen Maestro-Flow ergänzen, der ein Auth-Feld fokussiert und screenshotet, um Regressionen zu fangen.

## Definition of Done
- [ ] Alle Akzeptanzkriterien A–D abgehakt.
- [ ] Komplette Testmatrix grün auf iOS + Android.
- [ ] Kein `behavior={... : undefined}` und kein KAV-ohne-Offset mehr im Repo.
- [ ] PR-Text dokumentiert: neuer Native-Build nötig (kein OTA), und ob D gesetzt wurde.
