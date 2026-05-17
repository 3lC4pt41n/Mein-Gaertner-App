# Finale Abnahme: Action Plan 2.0

Pruefdatum: 2026-03-03

Basis dieser Abnahme:

- direkte Code-Pruefung im aktuellen Worktree
- gezielter `eslint`-Lauf auf den betroffenen Dateien
- keine Runtime-Verifikation im gestarteten App-Build

Wichtig:

- Der aktuelle Worktree ist nicht sauber.
- `services/pricingConfig.js` ist zum Pruefzeitpunkt noch untracked.
- `eslint` meldet echte Errors in `screens/SettingsScreen.js`.

## 1. Action Plan 2.0 Verifikation

### 1. Home/Zone-Modal aus `FlatList` herausziehen

Status: ✅ Erledigt und korrekt

Erwartet:

- `Modal` darf nicht als Kind von `FlatList` gerendert werden.

Tatsaechlich:

- `HomeManager` gibt jetzt ein Fragment zurueck.
- `FlatList` steht separat.
- `Modal` wird ausserhalb der Liste gerendert.

Beleg:

- `screens/HomeManager.jsx:246`
- `screens/HomeManager.jsx:248`
- `screens/HomeManager.jsx:359`

Bewertung:

- Der urspruengliche Regressionsfehler ist hier sauber behoben.

### 2. Notifications-Toggle muss App-Verhalten wirklich steuern

Status: ⚠️ Umgesetzt, aber mit Maengeln

Erwartet:

- `notifications_enabled` muss Push-Registrierung und Reminder-Planung in beide Richtungen deterministisch steuern.

Tatsaechlich:

- `App.js` respektiert die Preference bei der Registrierung.
- `TaskListScreen.js` plant Reminder nur noch bei aktivierten Notifications.
- `SettingsScreen.js` leert Reminder beim Ausschalten, plant beim Einschalten aber nicht sofort neu.

Beleg:

- `App.js:236`
- `TaskListScreen.js:70`
- `SettingsScreen.js:386`

Was fehlt:

- Nach dem Einschalten muessen Due-Tasks sofort geladen und per `rescheduleAllTaskReminders(tasks)` neu geplant werden.

### 3. Falsche Preisangaben bei Paid Upgrades entfernen

Status: ⚠️ In der Sache gefixt, aber release-seitig noch unsauber

Erwartet:

- zentrale Kostenquelle statt verstreuter Hardcodes

Tatsaechlich:

- Es gibt jetzt `services/pricingConfig.js` als zentrale Konstante.
- Die Werte werden in Add Plant, Beta Welcome und Store verwendet.
- Die Locale-Copy interpoliert die Werte korrekt.

Beleg:

- `services/pricingConfig.js:1`
- `screens/AddPlantScreen.js:423`
- `screens/BetaWelcomeScreen.js:30`
- `screens/StoreScreen.js:365`
- `i18n/locales/en.json:151`

Mangel:

- `services/pricingConfig.js` ist noch untracked und damit nicht sauber Teil eines release-faehigen Stands.

### 4. Fake Delete Account und kaputte Terms nicht live lassen

Status: 🤡 Optisch versteckt, aber technisch unsauber

Erwartet:

- Controls sauber entfernen oder ueber echte Feature-Flags verstecken

Tatsaechlich:

- Die UI wird ueber `false && (...)` versteckt.

Beleg:

- `screens/SettingsScreen.js:447`
- `screens/SettingsScreen.js:473`

Problem:

- Das erzeugt echte ESLint-Errors (`no-constant-binary-expression`).
- Also: UX-Schaden reduziert, aber Build-/Qualitaetszustand nicht sauber.

### 5. Stale Route-Namen im Store korrigieren

Status: ✅ Erledigt und korrekt

Erwartet:

- Navigation muss auf die neuen Stack-Namen zeigen.

Tatsaechlich:

- Store navigiert jetzt zu `FeedbackMain` und `AdminMain`.
- Die Ziele existieren im Navigator.

Beleg:

- `screens/StoreScreen.js:422`
- `screens/StoreScreen.js:432`
- `App.js:131`
- `App.js:142`

### 6. Plant/Home-Flow fertigziehen

Status: 🤡 Nur teilweise umgesetzt, als komplett gefixt nicht akzeptabel

Erwartet:

- CTA in beide Zone-Picker
- Unassigned-Pflanzen sichtbar
- Empty-State fuer leere Zonen erreichbar

Tatsaechlich:

- `AddPlantScreen` hat jetzt einen CTA bei fehlenden Zonen.
- `HomeManager` zeigt `unassignedPlants`.
- `PlantDetailScreen` bleibt bei fehlenden Zonen eine Sackgasse.
- `PlantListScreen` hat weiter einen unerreichbaren Empty-State, weil der ganze Block nur bei `zone.plants.length > 0` gerendert wird.

Beleg:

- `screens/AddPlantScreen.js:500`
- `screens/HomeManager.jsx:333`
- `screens/PlantDetailScreen.js:495`
- `screens/PlantListScreen.js:285`
- `screens/PlantListScreen.js:349`

Bewertung:

- Dieser Punkt ist nicht abschliessend geloest.

### 7. Sprachwahl mobil-tauglich machen

Status: ✅ Erledigt und korrekt

Erwartet:

- Keine gequetschten Segmented Controls auf Mobile.

Tatsaechlich:

- Beide Screens nutzen jetzt scrollbare Pills.

Beleg:

- `screens/ProfileCompleteScreen.js:162`
- `screens/SettingsScreen.js:373`
- `theme/DSChips.js:86`

### 8. Settings im More-Menue sichtbar machen

Status: ✅ Erledigt und korrekt

Beleg:

- `screens/MoreScreen.js:14`
- `screens/MoreScreen.js:27`
- `App.js:136`

### 9. Admin-Dashboard-Blank-State fixen

Status: ✅ Erledigt und korrekt

Beleg:

- `screens/AdminDashboardScreen.js:28`

### 10. Leaderboard-Rang nicht clientseitig voll scannen

Status: 🤡 Nicht umgesetzt

Erwartet:

- serverseitige Rank-Logik oder kein Full-Table-Scan

Tatsaechlich:

- `getMyRank` laedt weiterhin die komplette `leaderboard_public`.

Beleg:

- `services/leaderboardService.js:58`
- `services/leaderboardService.js:60`

### 11. Weather-Fallback und Location-Freshness fixen

Status: 🤡 Nicht umgesetzt

Erwartet:

- Permission-denied sauber unterscheiden
- Location-Cache nur mit Freshness/TTL verwenden

Tatsaechlich:

- Weather-Widget zeigt nur einen generischen Retry-State.
- Service liefert bei verweigerter Permission schlicht `null`.
- Gespeicherte Koordinaten werden ohne Timestamp-Pruefung wiederverwendet.

Beleg:

- `components/WeatherWidget.js:99`
- `services/weatherService.js:38`
- `services/weatherService.js:69`

### 12. Neue Zone-Typen lokalisieren

Status: ✅ Erledigt und korrekt

Beleg:

- `screens/HomeManager.jsx:14`
- `i18n/locales/en.json:102`

### 13. A11y fuer MoreScreen und Weather-Retry

Status: ✅ Erledigt und korrekt

Beleg:

- `screens/MoreScreen.js:46`
- `components/WeatherWidget.js:104`

### 14. Token-Fix sauber abschliessen

Status: 🤡 Nicht umgesetzt

Erwartet:

- Alias-Nutzung abbauen oder guardrails in CI/Lint einfuehren

Tatsaechlich:

- Alias-Tokens bleiben bestehen.
- Komponenten haengen weiter daran.
- Es gibt keine neuen Guardrails.

Beleg:

- `theme/tokens.js:44`
- `components/AddDiaryEntryDialog.js:201`
- `components/DiaryTimeline.js:196`

## 2. Pattern-Analyse

### Was Claude konsistent gut umgesetzt hat

- lokal begrenzte UI-Fixes
- Route-Namen und Menu-Verkabelung
- einfache Accessibility-Ergaenzungen
- Copy-/i18n-Nachzuege
- klar umrissene Refactors innerhalb einer Datei

### Was Claude wiederholt schlecht umgesetzt hat

- cross-screen Flows
- stateful Verhalten ueber mehrere Screens hinweg
- Edge Cases statt Happy Path
- technische Release-Hygiene
- backendnahe oder service-getriebene Probleme

### Muster

- Frontend-Happy-Path: oft okay
- End-to-End-Flow: oft unvollstaendig
- sichtbare Symptome: gefixt
- zugrunde liegende Zustandslogik: oft offen
- "versteckt" statt "sauber entfernt": wiederholt vorgekommen

## 3. Gesamtzustand des Repos

### Wuerde ich das so deployen?

Nein.

### Top 3 Risiken

1. Reminder-Verhalten ist nicht deterministisch.
   - Ausschalten wirkt sofort.
   - Einschalten stellt den Reminder-Zustand nicht sofort wieder her.

2. Pflanzen-/Zonen-Flow ist inkonsistent.
   - `AddPlant` hilft inzwischen weiter.
   - `PlantDetail` bleibt bei fehlenden Zonen stecken.
   - Leere Zonen werden in der Pflanzenliste weiter falsch behandelt.

3. Release-Integritaet ist nicht sauber.
   - dirty worktree
   - untracked `services/pricingConfig.js`
   - echte `eslint`-Errors in `SettingsScreen`

### Entstandene technische Schulden

- Workaround ueber `false &&` statt sauberer Feature-Flags
- Preise nur teilweise zentralisiert
- Token-Alias-Schulden weiter konserviert

## 4. Action Plan 3.0

Hinweis:

- Vor jedem Go-Live muss `services/pricingConfig.js` versioniert werden.

### 🔴 Showstopper

- [ ] Lint-roten Settings-Hotfix durch echte Feature-Flags ersetzen  
      Datei: `screens/SettingsScreen.js`

```js
const SHOW_ACCOUNT_DELETION = false;
const SHOW_TERMS_LINK = false;
```

```jsx
{
  SHOW_ACCOUNT_DELETION ? (
    <DSButton variant="danger" fullWidth icon="trash-outline" onPress={handleDeleteAccount}>
      {t('settings.deleteAccount')}
    </DSButton>
  ) : null;
}
```

```jsx
{
  SHOW_TERMS_LINK ? (
    <LinkRow
      icon="reader-outline"
      label={t('settings.termsOfService')}
      onPress={() => Linking.openURL('https://3lc4pt41n.github.io/Mein-Gaertner-App/terms.html')}
    />
  ) : null;
}
```

### 🟡 Vor Go-Live fixen

- [ ] Notifications beim Einschalten sofort neu planen  
      Datei: `screens/SettingsScreen.js`

```js
import { fetchTasks } from '../services/taskService';
```

```jsx
<ToggleRow
  label={t('settings.notifications')}
  hint={t('settings.notificationsHint')}
  value={notificationsEnabled}
  onValueChange={async (val) => {
    setNotificationsEnabled(val);
    try {
      await updateProfile({ notifications_enabled: val });

      if (!user?.id) return;

      if (val) {
        const tasks = await fetchTasks(user.id);
        await rescheduleAllTaskReminders(tasks ?? []);
      } else {
        await rescheduleAllTaskReminders([]);
      }
    } catch {
      setNotificationsEnabled(!val);
    }
  }}
/>
```

- [ ] `PlantDetail` darf bei fehlenden Zonen keine Sackgasse bleiben  
      Datei: `screens/PlantDetailScreen.js`

```js
import DSButton from '../theme/DSButton';
```

```jsx
) : (
  <View style={{ alignItems: 'center', padding: spacing.lg }}>
    <Text
      style={{
        textAlign: 'center',
        color: colors.textSecondary,
        marginBottom: spacing.md,
      }}
    >
      {t('home.noZones')}
    </Text>
    <DSButton
      variant="secondary"
      size="sm"
      icon="home-outline"
      onPress={() => {
        setPickerVisible(false);
        navigation.navigate('Zuhause');
      }}
    >
      {t('home.newHome')}
    </DSButton>
  </View>
)}
```

- [ ] Leere Zonen in der Pflanzenliste wirklich rendern  
      Datei: `screens/PlantListScreen.js`

```jsx
{
  expandedZones[zone.id] && (
    <View style={{ marginLeft: spacing.md }}>
      {zone.plants.length > 0 ? (
        zone.plants.map((plant) => (
          <TouchableOpacity
            key={plant.id}
            onPress={() => navigation.navigate('PlantDetail', { plant })}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: spacing.sm,
                borderBottomWidth: 1,
                borderColor: colors.borderLight,
              }}
            >
              {plant.image_url ? (
                <Image
                  source={{ uri: plant.image_url }}
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: radius.sm,
                    marginRight: spacing.md,
                    backgroundColor: colors.border,
                  }}
                />
              ) : (
                <View
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: radius.sm,
                    marginRight: spacing.md,
                    backgroundColor: colors.textDisabled,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text>🌱</Text>
                </View>
              )}
              <View>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: 'bold',
                    color: colors.textPrimary,
                  }}
                >
                  {plant.name}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>{plant.note}</Text>
                {plant.healthscore !== null && (
                  <Text style={{ fontSize: 12, color: colors.primary }}>
                    {t('plants.healthscoreValue', { score: plant.healthscore })}
                  </Text>
                )}
              </View>
            </View>
          </TouchableOpacity>
        ))
      ) : (
        <Text
          style={{
            color: colors.textTertiary,
            marginLeft: spacing.sm,
            marginBottom: spacing.md,
          }}
        >
          {t('plants.noZonePlants')}
        </Text>
      )}
    </View>
  );
}
```

### 🟢 Backlog nach Launch

- [ ] `getMyRank` serverseitig loesen; aktueller Full-Table-Scan skaliert schlecht.
- [ ] Weather permission-aware machen und Location-Cache mit TTL/Freshness versehen.
- [ ] Token-Alias-Schulden abbauen und CI-Regel gegen unbekannte Tokens einfuehren.

## 5. Abschlussbewertung

- Gesamtnote nach Action Plan 2.0: **6/10**
- Vergleich zu Runde 1: **besser**
- Live gehen: **nein**

Damit beim naechsten Mal Schluss ist, muessen vier Dinge gleichzeitig stimmen:

1. `eslint` auf den geaenderten Dateien ohne Errors
2. alle neuen Dateien wirklich versioniert
3. Pflanzen-/Zonen-Flow in `AddPlant`, `PlantDetail` und `PlantList` konsistent geschlossen
4. Notifications-Toggle stellt in beide Richtungen sofort denselben Systemzustand her
