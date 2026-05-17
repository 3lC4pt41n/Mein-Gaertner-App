# Mein Gärtner App — Umsetzungs-Check + Aktualisierte Launch-Roadmap

Stand: 05.03.2026

## Kurzbewertung

- `npm run lint` und `npm test` laufen lokal grün.
- Dein ursprünglicher Plan ist **teilweise umgesetzt** (ca. 60%): wichtige Grundlagen sind da, aber mehrere Launch-kritische Punkte sind nur halb fertig.
- Aktueller Reifegrad für Store-Launch: **7.4/10**.

## 1) Umsetzung gegen den letzten Plan

### Tier 1 (Launch-Blocker)

| Punkt                       | Status       | Evidenz                                                                                             | Bewertung                                                                         |
| --------------------------- | ------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| In-App Account Deletion     | ⚠️ Teilweise | `screens/SettingsScreen.js`, `supabase/functions/delete-account/index.ts`                           | Flow ist vorhanden, Datenlöschung ist bei Storage nicht vollständig korrekt.      |
| Privacy + Terms sichtbar    | ✅ Erledigt  | `services/featureFlags.js`, `screens/AuthScreen.js`, `screens/SettingsScreen.js`, `docs/terms.html` | Compliance-Basis deutlich besser.                                                 |
| RLS/Security-Härtung        | ⚠️ Teilweise | `supabase/migrations/20260319_security_hardening_sprint1.sql`                                       | Gute Fixes, aber Verifikation ist auskommentiert, Fehler werden teils geschluckt. |
| Migrations-Baseline         | ❌ Offen     | `supabase/migrations/20250101_baseline_schema.sql` (untracked)                                      | Datei existiert lokal, ist aber nicht committet/deployt.                          |
| Crash-Monitoring            | ⚠️ Teilweise | `sentry.config.js`, `App.js`, `app.json`                                                            | SDK integriert, aber DSN-Zuführung nicht robust verdrahtet.                       |
| Netzwerk-Resilience Layer   | ❌ Offen     | `services/aiService.js`, `services/weatherService.js`                                               | Kein zentraler Timeout/Retry/Abort-Standard.                                      |
| RevenueCat Identity Härtung | ⚠️ Teilweise | `contexts/AuthContext.js`, `services/purchaseService.js`                                            | Login/Logout verbessert, Preisdarstellung weiter statisch.                        |
| Harte CI Release-Gates      | ✅ Erledigt  | `.github/workflows/ci.yml`, `.github/workflows/eas-build-submit.yml`                                | Lint/Test sind jetzt echte Gates.                                                 |

### Tier 2 (Launch-Qualität)

| Punkt                         | Status       | Evidenz                                                                                  | Bewertung                                                |
| ----------------------------- | ------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Onboarding-Flow               | ⚠️ Teilweise | `screens/OnboardingScreen.js`                                                            | Flow da, aber i18n nur DE/EN.                            |
| Deep Linking Kernziele        | ❌ Offen     | `App.js`, `services/notificationService.js`                                              | Notification führt in Task-Liste, nicht auf Task-Detail. |
| Empty/Error/Offline States    | ⚠️ Teilweise | `components/EmptyState.js`, `components/ErrorState.js`, `components/OfflineState.js`     | Komponenten gebaut, in Kernscreens kaum integriert.      |
| Domänenwerte lokalisieren     | ❌ Offen     | `screens/TaskListScreen.js`, `screens/TaskDetailScreen.js`, `services/scoringHelpers.js` | Task-Typen hängen an deutschen String-Konstanten.        |
| Storepreise live aus RC       | ❌ Offen     | `screens/StoreScreen.js`, `services/purchaseService.js`                                  | UI nutzt hardcodierte Preise statt `priceString`.        |
| Listen-Performance/Pagination | ❌ Offen     | `screens/PlantListScreen.js`, `services/taskService.js`                                  | Noch keine belastbare Pagination-Strategie.              |

## 2) Kritische Findings mit Nachbesserung + Best Practice

### P0 — Account Deletion löscht Storage nicht zuverlässig

- **Problem:** Delete-Function listet `bucket.list(userId)` und entfernt `${userId}/...`, aber Uploads liegen meist nicht unter diesem Prefix.
- **Risiko:** DSGVO-Löschversprechen wird faktisch nicht eingehalten (orphaned Bilder).
- **Betroffene Stellen:** `supabase/functions/delete-account/index.ts`, `services/uploadService.js`, `supabase/functions/ai-gardener-avatar/index.ts`.
- **Nachbesserung:** Einheitliches Storage-Schema (`<userId>/...`) + rekursives/paginiertes Löschen pro Prefix + E2E-Test.
- **Best Practice:** Destruktive Flows nur mit deterministischem Keyspace und verifizierbarer Lösch-Assertion ausrollen.

### P0 — Baseline-Migration ist nicht im Git-Verlauf

- **Problem:** `20250101_baseline_schema.sql` ist aktuell untracked.
- **Risiko:** Frische Environments sind nicht reproduzierbar, Audit/Recovery bleibt fragil.
- **Betroffene Stellen:** `supabase/migrations/20250101_baseline_schema.sql`, CI/Supabase Deploy.
- **Nachbesserung:** Datei committen, `supabase db reset` in CI-Staging laufen lassen, Ergebnis dokumentieren.
- **Best Practice:** Jede produktive Schema-Änderung muss versioniert, replaybar und CI-validiert sein.

### P1 — Sentry technisch integriert, operativ noch nicht “live”

- **Problem:** DSN kommt aus `extra.sentryDsn` oder `process.env.SENTRY_DSN`, aber `app.json`/`.env.example` sind nicht konsistent aufgesetzt.
- **Risiko:** “False sense of safety” bei Crashes ohne echte Events.
- **Betroffene Stellen:** `sentry.config.js`, `app.json`, `.env.example`.
- **Nachbesserung:** DSN über `app.config.js` + EAS Secrets injizieren, Release-Health-Test in Preview-Build.
- **Best Practice:** Observability gilt erst als erledigt, wenn ein Test-Crash im Dashboard inkl. Release sichtbar ist.

### P1 — Netzwerkresilienz fehlt weiterhin

- **Problem:** Kritische Calls haben keinen einheitlichen Timeout/Retry/Abort.
- **Risiko:** Hänger, doppelte Actions, schlechte UX bei schlechtem Netz.
- **Betroffene Stellen:** `services/aiService.js`, `services/weatherService.js`, Store-Flows.
- **Nachbesserung:** Shared `requestWithPolicy` (timeout + exponential backoff + abort) und Adoption in Top-5 Kernflows.
- **Best Practice:** Resilience als Infrastruktur-Layer bauen, nicht pro Screen “ad hoc” lösen.

### P1 — Storepreise weiterhin hardcodiert

- **Problem:** UI zeigt feste Euro-Strings statt Store-lokalisierter Preise aus RevenueCat Products.
- **Risiko:** Preisabweichungen/Trust-Verlust, vor allem international.
- **Betroffene Stellen:** `services/purchaseService.js`, `screens/StoreScreen.js`.
- **Nachbesserung:** Offerings mappen auf Product `priceString`, harte Preise nur als Fallback.
- **Best Practice:** Store-/Abo-UI immer aus Server/Store-Metadaten rendern, nicht aus statischen Konstanten.

### P1 — Healthcheck-ID kann auf älteren Schemas brechen

- **Problem:** Client setzt `id: crypto.randomUUID()` beim Insert, obwohl Schema laut Migration in manchen Umgebungen auch `bigint` sein kann.
- **Risiko:** Insert-Fehler in bestimmten DB-Ständen trotz "Fix"-Migration.
- **Betroffene Stellen:** `services/plantService.js`, `supabase/migrations/20260318_fix_healthcheck_id_default.sql`.
- **Nachbesserung:** `id` im Client nicht mehr setzen; DB-Default erzwingen und Smoke-Test gegen beide Schema-Varianten.
- **Best Practice:** Primärschlüssel immer serverseitig vergeben, nie im Mobile-Client erzwingen.

### P2 — Deep Link endet nicht im Detailkontext

- **Problem:** Notification-Tap navigiert auf `Mehr > TasksMain`, `taskId` wird nicht bis Detail genutzt.
- **Risiko:** Extra-Friktion bei Core-Flow.
- **Betroffene Stellen:** `App.js`, `services/notificationService.js`.
- **Nachbesserung:** Callback mit `taskId` bis Navigation durchreichen und direkt `TaskDetail` öffnen.
- **Best Practice:** Jeder Push/Link braucht eine eindeutige Zielroute mit Parametern und Fallback.

### P2 — i18n- und Domainmodell-Lücke

- **Problem:** Onboarding nur DE/EN; Task-Typen basieren auf deutschen Datenstrings.
- **Risiko:** Uneinheitliche UX in ES/FR/IT/RU, spätere Migrationen werden teuer.
- **Betroffene Stellen:** `i18n/locales/*.json`, `services/scoringHelpers.js`, Task-Screens.
- **Nachbesserung:** Task-Codes (`watering`, `fertilizing`, `repotting`) + SQL-Migration + UI-Mapping über i18n.
- **Best Practice:** Persistierte Domainwerte immer sprachneutral speichern.

## 3) Aktualisierte Roadmap zum produktiven Launch

## Sprint A — Compliance & Data Integrity (Store-Blocker)

- [ ] **Account Deletion korrekt machen** -> `delete-account` rekursiv/paginiert, Prefix-Standardisieren, Logout lokal erzwingen -> **L** -> Storage-Pfad-Refactor zuerst
- [ ] **Baseline-Migration commit + resetbar machen** -> `20250101_baseline_schema.sql` versionieren, `supabase db reset` in CI -> **M** -> none
- [ ] **Healthcheck-ID vereinheitlichen** -> Client-ID entfernen, DB-Default-only, Migrations-Smoketest -> **S** -> none
- [ ] **Security-Härtung “hart” machen** -> Verifikationsblock aktivieren, `EXCEPTION WHEN OTHERS THEN NULL` reduzieren -> **M** -> Baseline stabil
- [ ] **Sentry wirklich aktivieren** -> DSN-Injektion + Test-Crash-Runbook + Alerting -> **M** -> EAS Secret Setup
- [ ] **Storepreise live aus RC** -> Product-Mapping + `priceString` im UI -> **S** -> RC Offering Audit

**Ziel:** rechtlich und technisch belastbare Einreichungsbasis.  
**Dauer:** 6-9 Tage (Solo + AI)

## Sprint B — Reliability & UX-Friction

- [ ] **Shared Netz-Layer** -> Timeout/Retry/Abort Wrapper und Einsatz in AI/Weather/Store -> **L** -> Sprint A abgeschlossen
- [ ] **Deep-Link auf Detail-Ebene** -> Notification mit `taskId` direkt nach `TaskDetail` -> **S** -> none
- [ ] **State-Komponenten integrieren** -> Empty/Error/Offline in TaskList, PlantList, Home, Calendar -> **M** -> Netz-Layer v1
- [ ] **Task-Type Domain-Refactor** -> sprachneutrale Codes + Backfill-Migration + UI-Mapping -> **M** -> QA über alle 6 Sprachen
- [ ] **Onboarding i18n komplettieren** -> FR/IT/ES/RU Texte + QA -> **S** -> none

**Ziel:** robuste User-Experience bei Netzproblemen und international konsistente UI.  
**Dauer:** 7-10 Tage (Solo + AI)

## Sprint C — Launch-Readiness Final

- [ ] **Pagination/Performance** -> große Listen in Plants/Tasks/Leaderboard schrittweise laden -> **M** -> Datenmodell stabil
- [ ] **Store Submission Checklist** -> Privacy/Terms/Data Safety/Tester-Account/Restore-Flow final verifizieren -> **M** -> Sprint A+B fertig
- [ ] **Go-Live Guardrails** -> Crash/Payment/Function-Alerts + Incident-Runbook + Rollback-Plan -> **S** -> Sentry live

**Ziel:** kontrollierter Produktionsstart mit niedriger operativer Unsicherheit.  
**Dauer:** 4-6 Tage (Solo + AI)

## 4) Go/No-Go Kriterien für Launch

- [ ] Account Deletion löscht Auth + DB + Storage nachweislich vollständig (automatisierter Test)
- [ ] Sentry Test-Crash erscheint im richtigen Environment mit Release-Tag
- [ ] Store zeigt lokalisierte Live-Preise aus RevenueCat
- [ ] Kein kritischer Screen ohne Timeout/Retry-Strategie
- [ ] 6-Sprachen-Smoke-Test bestanden (Onboarding + Tasks + Settings + Store)
