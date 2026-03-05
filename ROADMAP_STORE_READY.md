# Mein Gärtner App — Production Roadmap (MVP -> Store-Ready)

## Phase 1: Analyse-Ergebnis (Ist-Stand)

| Bereich | Status | Kurzfazit |
|---|---|---|
| Technisch production-ready | ❌ | Kernflows laufen, aber Resilienz/Observability/Security-Härtung sind noch nicht release-tauglich. |
| Store-ready | ❌ | Account-Deletion in-app fehlt, Rechtstexte/Verlinkung sind inkonsistent. |
| User-ready | ⚠️ | Gute Basis, aber es gibt stille Fehlerzustände, Sprach-/Deep-Link-Lücken und wenig geführtes Onboarding. |
| Infrastruktur production-ready | ❌ | CI ist da, aber Monitoring/Analytics/Backup-Drills/Scale-Absicherung fehlen. |

Schnellantwort auf Leitfragen:

- Crashes/Error States: ⚠️ Risiko vorhanden (u.a. `crypto`-Lint/Runtimethema in `services/plantService.js`).
- API-Resilienz (Timeout/Retry/Fallback): ❌ Nicht durchgängig (z.B. `services/chatService.js`, `supabase/functions/ai-chat/index.ts`).
- Fehlerbehandlung: ⚠️ Teilweise still geschluckt statt sichtbar geführt.
- RLS/DB-Sicherheit: ⚠️ Verbesserungen vorhanden, aber mögliche Regressionen in späteren Migrationen (`20260305_security_advisor_fixes.sql`, `20260317_discovery_credit_rewards.sql`).
- Race Conditions/State: ⚠️ Bei parallelen Fetches/Refreshes möglich, vor allem ohne einheitliches Request-Management.
- Secrets/Keys: ✅ Keine offensichtlichen Secret-Leaks im Repo; Härtung über Env/Release-Prozess trotzdem Pflicht.
- Offline/Schlechtes Netz: ⚠️ Offline-Banner vorhanden, aber kaum Queueing/Retry für Kernaktionen.
- Skalierung (100 Pflanzen / 10k User): ⚠️ Ohne Pagination/Caching und mit aggregierenden Views riskant.
- Apple/Google Policy: ❌ Hauptblocker ist in-app Account-Deletion (Google), plus Rechts-/Policy-Konsistenz.
- IAP/RevenueCat: ⚠️ Restore ist da, aber Identitäts-/Preis-Darstellung braucht Härtung.
- i18n (6 Sprachen): ✅ Key/Placeholder-Parität passt, aber Domänenwerte sind teils nicht lokalisiert.
- Monitoring/Analytics/Backup: ❌ Crash-Monitoring, Product-Analytics und Backup-Drill fehlen.

Policy-Referenzen:

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple Subscriptions (Restore Purchases)](https://developer.apple.com/app-store/subscriptions/)
- [Google Play Account Deletion Requirement](https://support.google.com/googleplay/android-developer/answer/13327111)

## Tier 1: 🚨 Launch-Blocker

### 1) In-App Account Deletion fehlt
- **Was:** Nutzer können Konto nicht in der App löschen (Feature-Flag deaktiviert).
- **Risiko wenn nicht gefixt:** Google-Play-Rejection, DSGVO-Beschwerden, Trust-Schaden.
- **Betroffene Dateien/Services:** `services/featureFlags.js`, `screens/SettingsScreen.js`, Supabase Auth/DB-Löschpfad.
- **Aufwand:** M
- **Abhängigkeiten:** Rechtstext final -> Delete-Endpoint/DB-Cascade validieren -> UI-Flow + Confirmations

### 2) Rechtstexte/Links inkonsistent
- **Was:** Privacy/Terms sind nicht konsistent verlinkt bzw. teils deaktiviert.
- **Risiko wenn nicht gefixt:** Store-Risiko, rechtliche Angriffsfläche bei Abo-/Datenverarbeitung.
- **Betroffene Dateien/Services:** `screens/SettingsScreen.js`, `docs/privacy-policy.html`, `supabase/functions/privacy-policy/index.ts`.
- **Aufwand:** S
- **Abhängigkeiten:** Legal-Freigabe -> einheitliche Quelle -> App/Store-Metadaten synchronisieren

### 3) RLS-/SECURITY DEFINER-Härtung potenziell regressiv
- **Was:** Spätere Migrationen könnten `search_path`/Invoker-Härtungen überschreiben.
- **Risiko wenn nicht gefixt:** Datenexposition, Privilege Escalation, Compliance-Problem.
- **Betroffene Dateien/Services:** `supabase/migrations/20260305_security_advisor_fixes.sql`, `supabase/migrations/20260311_fix_revenucat_idempotent.sql`, `supabase/migrations/20260316_leaderboard_plant_health_bonus.sql`.
- **Aufwand:** L
- **Abhängigkeiten:** Schema-Baseline ziehen -> Security-Migration bündeln -> Staging-Red-Team-Test

### 4) Migrations-Baseline unvollständig
- **Was:** Kernschema-Historie ist nicht vollständig reproduzierbar aus Repo-Stand.
- **Risiko wenn nicht gefixt:** Drift zwischen Environments, riskante Rollbacks, unzuverlässige Audits.
- **Betroffene Dateien/Services:** `supabase/migrations/*` (insb. `20260307_catchup_missing_schemas.sql`).
- **Aufwand:** L
- **Abhängigkeiten:** Prod-Schema-Snapshot -> fehlende Basismigrationen backfillen -> Clean-Reset im CI

### 5) Kein Crash-Monitoring + zu viele stille Fehler
- **Was:** Fehler werden teils geschluckt und nicht zentral beobachtet.
- **Risiko wenn nicht gefixt:** Produktionsfehler bleiben unsichtbar, schlechte Ratings ohne klare Ursache.
- **Betroffene Dateien/Services:** `components/ErrorBoundary.js`, `screens/HomeManager.jsx`, mehrere Catch-Pfade in Services.
- **Aufwand:** M
- **Abhängigkeiten:** Toolwahl (Sentry/Firebase) -> SDK + global reporter -> Alerting-Regeln

### 6) Kein einheitliches Netzwerk-Resilience-Layer
- **Was:** Timeouts, Retry mit Backoff und Cancel/Abort fehlen in Kern-Calls.
- **Risiko wenn nicht gefixt:** Hängende Screens, doppelte Requests, verlorene User-Aktionen.
- **Betroffene Dateien/Services:** `services/chatService.js`, `services/plantService.js`, `supabase/functions/weather-proxy/index.ts`.
- **Aufwand:** L
- **Abhängigkeiten:** Shared HTTP-Wrapper -> kritische Flows migrieren -> Offline/Retry UX

### 7) RevenueCat Identitätsfluss nicht vollständig gehärtet
- **Was:** Login/Logout-Kopplung und Preisquelle sind nicht vollständig robust umgesetzt.
- **Risiko wenn nicht gefixt:** Entitlement-Verwechslung bei Account-Wechseln, Support-/Refund-Aufwand.
- **Betroffene Dateien/Services:** `services/purchaseService.js`, `screens/StoreScreen.js`, `contexts/AuthContext.js`.
- **Aufwand:** M
- **Abhängigkeiten:** RC-ID-Strategie -> Auth-Hooks verdrahten -> Sandbox-Purchase-Matrix testen

### 8) Release-Gates nicht strikt genug
- **Was:** Lint bricht aktuell, aber Release-Prozess sollte harte Qualitäts-Gates erzwingen.
- **Risiko wenn nicht gefixt:** Vermeidbare Regressionen landen im Store-Build.
- **Betroffene Dateien/Services:** `services/plantService.js`, `.github/workflows/ci.yml`, `.github/workflows/eas-build-submit.yml`.
- **Aufwand:** S
- **Abhängigkeiten:** Lint-Fix -> CI Fail-on-warning/error-Policy -> Release-Branch-Regel

## Tier 2: 🎯 Launch-Qualität

### 1) Reviewer-/Onboarding-Flow stärken
- **Was:** Geführter Start mit schneller Erfolgsstrecke für Reviewer und Erstnutzer.
- **Warum es auffällt:** Ohne klaren Start wirkt die App beim ersten Öffnen unfertig.
- **Aufwand:** M
- **Betroffene Dateien/Services:** `screens/BetaWelcomeScreen.js`, `screens/AuthScreen.js`

### 2) Deep Linking für alle Kernziele komplettieren
- **Was:** Vollständiges Routing zu Task/Plant/Diary-Details via Notification/Link.
- **Warum es auffällt:** Taps landen nicht immer im richtigen Kontext.
- **Aufwand:** M
- **Betroffene Dateien/Services:** `services/notificationService.js`, `screens/HomeManager.jsx`

### 3) Leere/Error/Offline-Zustände sichtbar und handlungsfähig machen
- **Was:** Einheitliche Fehlerdarstellung mit Retry/Support-CTA.
- **Warum es auffällt:** "Nichts passiert"-Momente fühlen sich wie Bugs an.
- **Aufwand:** M
- **Betroffene Dateien/Services:** `components/OfflineBanner.js`, `screens/PlantListScreen.js`, `screens/TaskListScreen.js`

### 4) Domänenwerte vollständig lokalisieren (z.B. Task-Typen)
- **Was:** Technische Werte von UI-Strings entkoppeln und komplett i18n-fähig machen.
- **Warum es auffällt:** Gemischte Sprache wirkt unprofessionell.
- **Aufwand:** S
- **Betroffene Dateien/Services:** `services/taskService.js`, `i18n/index.js`

### 5) Store-Preise aus RevenueCat-Products anzeigen
- **Was:** Produktpreise live aus Store/RevenueCat statt lokal hartcodiert.
- **Warum es auffällt:** Feste Preise können falsch sein und Vertrauen kosten.
- **Aufwand:** S
- **Betroffene Dateien/Services:** `screens/StoreScreen.js`, `services/purchaseService.js`

### 6) Listen-Performance (Pagination/Incremental Load)
- **Was:** Datenmengen schrittweise laden statt komplette Full-Fetches.
- **Warum es auffällt:** Große Gärten werden auf Geräten mit wenig RAM zäh.
- **Aufwand:** M
- **Betroffene Dateien/Services:** `screens/PlantListScreen.js`, `services/leaderboardService.js`

### 7) Support-Kanal klar sichtbar machen
- **Was:** Direkter Einstieg zu Feedback/Support in Settings/More.
- **Warum es auffällt:** Frust endet sonst in schlechten Store-Bewertungen.
- **Aufwand:** S
- **Betroffene Dateien/Services:** `screens/FeedbackScreen.js`, `screens/SettingsScreen.js`

## Tier 3: 🚀 Post-Launch (7/10 -> 9/10), nach ROI sortiert

### 1) Shareable Plant-Progress Cards (Before/After, Monatsrecap)
- **Welchen Score-Bereich es anhebt:** Emotional Design + Growth Loop
- **Impact:** 8/10
- **Aufwand:** S
- **Abhängigkeiten:** Timeline-Daten konsistent -> Card-Renderer -> Share-Sheet
- **Solo-Dev-realistisch:** Ja

### 2) Plant Desk Daily Brief (Heute wichtig, Warum jetzt, 1-Tap-Aktion)
- **Welchen Score-Bereich es anhebt:** Core Utility (Plant Desk)
- **Impact:** 9/10
- **Aufwand:** M
- **Abhängigkeiten:** Task-Priorisierung -> Wetter/Health-Signale -> UI-Komposition
- **Solo-Dev-realistisch:** Ja mit AI-Support

### 3) Adaptive Task Engine (passt Frequenz an echte Pflege an)
- **Welchen Score-Bereich es anhebt:** Retention + Trust
- **Impact:** 8/10
- **Aufwand:** M
- **Abhängigkeiten:** Event-Qualität -> Regelwerk v1 -> Erklärbarkeit im UI
- **Solo-Dev-realistisch:** Ja mit AI-Support

### 4) Rescue Mode (Foto + Symptome + Schrittplan 72h)
- **Welchen Score-Bereich es anhebt:** Hero Feature / Differenzierung
- **Impact:** 9/10
- **Aufwand:** L
- **Abhängigkeiten:** AI-Prompting + Safety Guardrails -> Outcome-Tracking
- **Solo-Dev-realistisch:** Ja mit AI-Support

### 5) Seasonal Challenges + Friends Leaderboard
- **Welchen Score-Bereich es anhebt:** Social + Motivation
- **Impact:** 7/10
- **Aufwand:** M
- **Abhängigkeiten:** stabile Scores -> Invite/Privacy-Regeln -> Moderation light
- **Solo-Dev-realistisch:** Ja mit AI-Support

### 6) Contextual AI Coach mit Pflanzen-Gedächtnis
- **Welchen Score-Bereich es anhebt:** Perceived Intelligence
- **Impact:** 8/10
- **Aufwand:** L
- **Abhängigkeiten:** Memory-Schema -> Token-Kostenkontrolle -> Prompt-Eval
- **Solo-Dev-realistisch:** Ja mit AI-Support

### 7) Smart Weather Automations (präventive Hinweise statt reaktive Tasks)
- **Welchen Score-Bereich es anhebt:** Proaktivität + Daily Value
- **Impact:** 7/10
- **Aufwand:** M
- **Abhängigkeiten:** Wetter-Qualität -> Regel-Engine -> Notification-Tuning
- **Solo-Dev-realistisch:** Ja

### 8) Plant-Dex "Mastery Path" (Sammeln + Lernpfad pro Art)
- **Welchen Score-Bereich es anhebt:** Long-term Engagement
- **Impact:** 6/10
- **Aufwand:** M
- **Abhängigkeiten:** Dex-Datenmodell -> Progress-UI -> Rewards
- **Solo-Dev-realistisch:** Ja

## Tier 4: ⭐ Langfrist-Vision (10/10)

1. **Personal Garden Twin:** Digitaler Zwilling mit Prognosen (Wachstum, Risiko, Ertrag) pro Pflanze.
2. **Verified Expert Network:** Botaniker/Nurseries geben verifizierte Empfehlungen in-App.
3. **Sensor-Ökosystem:** Plug-in für Bodenfeuchte/Licht-Sensoren mit Auto-Task-Generierung.
4. **Community Knowledge Graph:** Krankheits- und Pflegewissen aus anonymisierten, kuratierten Fällen.
5. **Partner-Layer:** Lokale Shops, Pflege-Kits und Ersatzpflanzen direkt aus Rescue-Flows.

## Phase 3: Sprint-Plan

## Sprint 1: "Store-Ready" (Ziel: App kann eingereicht werden)

- [ ] In-App Account Deletion (UI + Confirm + Backend) -> `screens/SettingsScreen.js`, Auth/Supabase -> **M** -> Legal-Freigabe
- [ ] Privacy/Terms vereinheitlichen und sichtbar machen -> `services/featureFlags.js`, `screens/SettingsScreen.js` -> **S** -> Textfreigabe
- [ ] RLS/SECURITY DEFINER Hardening-Migration-Bundle -> `supabase/migrations` -> **L** -> Schema-Baseline
- [ ] Migration-Baseline vervollständigen + Staging Reset-Test -> `supabase/migrations` -> **L** -> Prod-Snapshot
- [ ] RevenueCat Identity Lifecycle fixen (login/logout/restore matrix) -> `services/purchaseService.js`, `contexts/AuthContext.js` -> **M** -> QA-Accounts
- [ ] Lint blocker fix + harte CI Release-Gates -> `services/plantService.js`, `.github/workflows/ci.yml` -> **S** -> none

**Geschätzter Gesamtaufwand:** **14-19 Tage**

## Sprint 2: "Launch-Polish" (Ziel: App macht beim ersten Öffnen einen guten Eindruck)

- [ ] Reviewer-/Onboarding-Flow inkl. klarer First Win -> `screens/BetaWelcomeScreen.js`, `screens/AuthScreen.js` -> **M** -> Sprint 1 fertig
- [ ] Einheitliche Error/Offline/Empty-States mit Retry-CTAs -> zentrale Screens/Services -> **M** -> Netzwerk-Layer v1
- [ ] Deep-Link-Routing für Task/Plant/Diary-Ziele -> `services/notificationService.js`, `screens/HomeManager.jsx` -> **M** -> Route-Map
- [ ] Task-Domain lokalisieren + Copy-QA für 6 Sprachen -> `services/taskService.js`, `i18n/*` -> **S** -> Translation freeze
- [ ] Store-Preisquellen auf RC Product Metadata umstellen -> `screens/StoreScreen.js` -> **S** -> RC products ready
- [ ] Support-Einstieg in Settings/More prominent machen -> `screens/SettingsScreen.js`, `screens/FeedbackScreen.js` -> **S** -> none

**Geschätzter Gesamtaufwand:** **10-14 Tage**

## Sprint 3: "First Wow" (Ziel: Plant Desk ist das Feature über das Leute reden)

- [ ] Plant Desk Daily Brief mit 1-Tap-Aktionen -> Plant Desk/Task/Weather Services -> **M** -> stabile Datenbasis
- [ ] Adaptive Task Engine v1 (Frequenz + Priorität) -> `services/taskService.js`, Supabase SQL -> **M** -> Eventqualität
- [ ] Progress Cards + Share Flow -> Diary/Dex UI + Media Pipeline -> **S** -> Timeline konsistent
- [ ] Listen-Pagination für große Gärten -> `screens/PlantListScreen.js`, Services -> **M** -> API-Query-Anpassung

**Geschätzter Gesamtaufwand:** **9-13 Tage**

## Phase 4: Risiko-Analyse

| Kategorie | Risiko | Impact | Mitigation |
|---|---|---|---|
| Technisch | RLS/Function-Härtung regressiv | Hoch | Security-Migration-Paket + Policy-Testmatrix + Staging Pen-Test |
| Technisch | Netzwerk-Timeouts fehlen | Hoch | zentraler Request-Wrapper mit Timeout/Retry/Abort |
| Technisch | Keine Crash-Transparenz | Hoch | Sentry/Crashlytics + Alerting + Release Health |
| UX | Stille Fehlerzustände | Hoch | sichtbare Error-States mit Retry/Support-Link |
| UX | Onboarding ohne klaren First Win | Mittel-Hoch | 3-Step Guided Start + Demo/Review-friendly Flow |
| UX | Sprachinkonsistenz im Produktkern | Mittel | Domainwerte i18n-fähig modellieren |
| Business | Store-Rejection wegen Account-Deletion | Hoch | in-app Delete + verlinkte Web-Löschung + Data Safety Sync |
| Business | Abo-/Entitlement-Supportfälle | Mittel-Hoch | RC Identity-Härtung + Sandbox-Matrix + Logging |
| Business | DSGVO-Unsicherheit bei Rechtsdokumenten | Hoch | juristische Freigabe + single source of truth für Policies |

## Was fehlt an Wissen (Entscheidungen von Tim)

- Juristische Freigabe finaler Privacy-/Terms-Texte inkl. Drittanbieter-Nennung.
- Ziel-Setup für Monitoring/Analytics (Sentry vs Firebase, Mixpanel vs PostHog) und Budget.
- Erwartete Launch-Last (MAU/DAU), damit Supabase-Plan + Query-Optimierung passend dimensioniert werden.
- Verbindliche Paywall-/Pricing-Strategie pro Region und Trial-Logik.
- Verfügbare Testkapazität (echte Geräte, Beta-Tester, Review-Testkonto-Strategie).

## Ehrliche Einschätzung (5 Sätze)

Die App ist funktional stark, aber heute noch nicht store-ready, weil Compliance- und Security-Themen zuerst gelöst werden müssen.  
Der realistische Abstand zur Einreichung liegt bei etwa 3 bis 5 Wochen fokussierter Arbeit als Solo-Dev mit AI-Support.  
Der kritische Pfad ist klar: Account-Deletion, Rechtskonsistenz, RLS/Migrations-Härtung und Release-Observability.  
Wenn dieser Pfad steht, sind die restlichen Launch-Polish-Themen in einem zweiten Sprint gut kontrollierbar.  
Als ersten Schritt sollte sofort das Paket "Store-Compliance + Security-Migrationsfix" parallel aufgesetzt werden, weil dort das größte Rejection- und Regressionsrisiko liegt.
