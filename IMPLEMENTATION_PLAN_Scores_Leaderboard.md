# Implementation Plan: Scores & Leaderboard

**Basis:** Deep-Research-Report, Balanced-Plan
**Start:** 02.03.2026 | **Dauer:** ~5 Wochen | **Aufwand:** 22–35 Person-Days
**Ansatz:** Event-basiertes Scoring, DSGVO-Opt-in, SQL-Views

---

## Phase 1 – Datenmodell & Migrationen (Woche 1)

### 1.1 Neue Tabelle: `species`
Zentrale Referenztabelle für Pflanzenarten (Deduplizierung der KI-Erkennung).

```sql
CREATE TABLE public.species (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text UNIQUE NOT NULL,
  first_discovered_by uuid REFERENCES auth.users(id),
  first_discovered_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```

**Kontext:** Aktuell speichert `AddPlantScreen` Pflanzennamen als Freitext via `aiService.js`. Die Species-Tabelle normalisiert diese Daten und ermöglicht "First Discovery"-Tracking.

### 1.2 Neue Tabelle: `discovery_events`
Append-only Event-Log für jede Pflanzenentdeckung.

```sql
CREATE TABLE public.discovery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  species_id uuid NOT NULL REFERENCES public.species(id),
  plant_id uuid,
  is_first boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
-- Unique Constraint für Dedupe (max 1 Discovery pro Species/User/Tag)
CREATE UNIQUE INDEX idx_discovery_user_species_day
  ON public.discovery_events (user_id, species_id, date(created_at));
```

### 1.3 Neue Tabelle: `gardening_events`
Append-only Event-Log für alle Pflegeaktionen.

```sql
CREATE TABLE public.gardening_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  event_type text NOT NULL CHECK (event_type IN (
    'task_completed_on_time', 'task_completed_late',
    'task_skipped', 'healthcheck_logged', 'plant_added'
  )),
  plant_id uuid,
  task_id uuid,
  points numeric NOT NULL,
  meta jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_gardening_user_created ON public.gardening_events (user_id, created_at);
```

### 1.4 Erweiterung: `profiles`-Tabelle
Neue Felder für Leaderboard-Opt-in (bestehende Tabelle erweitern).

```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS leaderboard_opt_in boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_display_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS leaderboard_visibility text DEFAULT 'private'
  CHECK (leaderboard_visibility IN ('global', 'friends', 'private'));
```

**Privacy-by-Default:** `leaderboard_opt_in = false` und `visibility = 'private'` als Standard (Art. 25 DSGVO).

### 1.5 RLS-Policies
```sql
-- discovery_events: User sieht nur eigene
ALTER TABLE public.discovery_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own discoveries" ON public.discovery_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own discoveries" ON public.discovery_events
  FOR SELECT USING (auth.uid() = user_id);

-- gardening_events: User sieht nur eigene
ALTER TABLE public.gardening_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own events" ON public.gardening_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own events" ON public.gardening_events
  FOR SELECT USING (auth.uid() = user_id);
```

### 1.6 Leaderboard-View (nur Opt-in-User, aggregiert)

```sql
CREATE OR REPLACE VIEW public.leaderboard_public AS
SELECT
  p.id as user_id,
  COALESCE(p.public_display_name, p.username) as display_name,
  p.gardener_avatar_path as avatar_url,
  -- Gardener Score (7 Tage)
  COALESCE(SUM(g.points) FILTER (WHERE g.created_at > now() - interval '7 days'), 0) as gardener_score_week,
  -- Gardener Score (30 Tage)
  COALESCE(SUM(g.points) FILTER (WHERE g.created_at > now() - interval '30 days'), 0) as gardener_score_month,
  -- Gardener Score (All-time)
  COALESCE(SUM(g.points), 0) as gardener_score_all,
  -- Discovery Points (7 Tage)
  COUNT(d.id) FILTER (WHERE d.created_at > now() - interval '7 days')
    + 5 * COUNT(d.id) FILTER (WHERE d.is_first AND d.created_at > now() - interval '7 days') as discovery_points_week,
  -- Discovery Points (30 Tage)
  COUNT(d.id) FILTER (WHERE d.created_at > now() - interval '30 days')
    + 5 * COUNT(d.id) FILTER (WHERE d.is_first AND d.created_at > now() - interval '30 days') as discovery_points_month,
  -- Discovery Points (All-time)
  COUNT(d.id) + 5 * COUNT(d.id) FILTER (WHERE d.is_first) as discovery_points_all
FROM public.profiles p
LEFT JOIN public.gardening_events g ON g.user_id = p.id
LEFT JOIN public.discovery_events d ON d.user_id = p.id
WHERE p.leaderboard_opt_in = true
GROUP BY p.id, p.public_display_name, p.username, p.gardener_avatar_path;
```

### 1.7 Migrationsdatei
Erstellen als: `supabase/migrations/20260302_scores_and_leaderboard.sql`
Enthält alle obigen Statements in einer Transaktion.

**Backfill-Entscheidung:** Leaderboards starten "ab Stichtag" (kein Backfill historischer Daten), um Datenqualität sicherzustellen.

---

## Phase 2 – Service-Layer Integration (Woche 2–3)

### 2.1 Neuer Service: `services/discoveryService.js`

**Aufgabe:** Discovery-Events bei Pflanzenerkennung loggen.

**Integration mit bestehendem Code:**
Aktuell ruft `AddPlantScreen.js` den `aiService` auf, der Pflanzeninfos (inkl. `species`) zurückgibt. Nach erfolgreichem Plant-Save:

```
Ablauf:
1. KI erkennt Pflanze → liefert species_name
2. plantService.savePlant() speichert Pflanze (bestehend)
3. NEU: discoveryService.logDiscovery(userId, speciesName, plantId)
   → Upsert in species-Tabelle (canonical_name)
   → Insert in discovery_events
   → Atomar: is_first = true WENN first_discovered_by IS NULL
```

**Betroffene Dateien:**
- `services/discoveryService.js` (NEU)
- `screens/AddPlantScreen.js` (Aufruf nach Plant-Save ergänzen)

### 2.2 Erweiterung: `services/taskService.js`

**Aufgabe:** Bei Task-Completion automatisch `gardening_event` loggen.

**Punkteberechnung (im Service):**
- Task on time: `+1.0 × weight` (gießen=1, düngen=2, umtopfen=3)
- Task late: `+0.4 × weight`
- Task skipped: `-0.6 × weight`

**Betroffene Dateien:**
- `services/taskService.js` (bestehend, `completeTask` erweitern)

### 2.3 Erweiterung: Healthcheck-Events

**Aufgabe:** Bei jedem Healthcheck-Log ein `gardening_event` mit:
- Basispunkte: `+0.2` pro Check
- Bonus: `+0.05 × max(0, deltaHealthscore)`

**Betroffene Dateien:**
- `services/plantService.js` (bestehend, Healthcheck-Funktion erweitern)
- Alternativ: Edge Function `ai-healthcheck/index.ts` (serverseitig)

### 2.4 Neuer Service: `services/leaderboardService.js`

**Aufgabe:** Leaderboard-Daten abfragen.

```
Funktionen:
- getLeaderboard(timeWindow, type, limit) → Top-N aus leaderboard_public View
- getMyRank(userId, timeWindow, type) → eigene Position
- getMyNeighbors(userId, timeWindow, type, range) → ±N Plätze um eigenen Rang
- getMyStats(userId) → eigene Scores/Streaks (ohne Opt-in nötig)
```

**Betroffene Dateien:**
- `services/leaderboardService.js` (NEU)

### 2.5 Erweiterung: Profil-Settings für Opt-in

**Aufgabe:** Profil um Leaderboard-Felder ergänzen.

**Betroffene Dateien:**
- `screens/DrawerProfileScreen.js` (Toggle "Im Ranking anzeigen" + Display-Name)
- `screens/ProfileCompleteScreen.js` (optional: Opt-in bei Ersteinrichtung anbieten)

---

## Phase 3 – UI: Leaderboard Screen (Woche 3–4)

### 3.1 Neuer Screen: `screens/LeaderboardScreen.js`

**Layout-Konzept:**
```
┌─────────────────────────────────┐
│  🏆  Rangliste                  │
│  [Woche] [Monat] [Gesamt]      │  ← Zeitfenster-Tabs
│  [Gärtner] [Entdecker]         │  ← Score-Typ Tabs
├─────────────────────────────────┤
│  🥇 GartenFan42    1.240 Pkt   │
│  🥈 PlantLover     1.180 Pkt   │
│  🥉 GreenThumb       980 Pkt   │
│  4. BotanikPro        920 Pkt   │
│  ...                            │
├─────────────────────────────────┤
│  ╔═══════════════════════════╗  │
│  ║  📍 Dein Rang: #47       ║  │  ← "Mein Rang"-Karte
│  ║     820 Punkte  ↑12      ║  │     (immer sichtbar)
│  ╚═══════════════════════════╝  │
├─────────────────────────────────┤
│  💡 Nicht im Ranking?           │
│  In den Einstellungen           │  ← Opt-in Hinweis
│  aktivieren                     │     (wenn opt_in=false)
└─────────────────────────────────┘
```

**Features:**
- Zeitfenster-Tabs: Woche / Monat / Gesamt
- Score-Typ-Tabs: Gärtner-Score / Entdecker-Score
- Top-N Liste (z.B. Top 50)
- "Mein Rang"-Karte mit eigenem Score + Trend
- "In meiner Nähe"-Ansicht (±10 Plätze)
- Opt-in CTA wenn User noch nicht teilnimmt

### 3.2 Navigation einbinden

**Option A (empfohlen):** Eigener Tab in Bottom-Navigation
**Option B:** Erreichbar über Drawer-Menü oder Home-Screen

**Betroffene Dateien:**
- `App.js` (neuen Tab oder Stack-Screen ergänzen)
- `screens/LeaderboardScreen.js` (NEU)

### 3.3 Persönliche Statistiken (kein Opt-in nötig)

Auch ohne Leaderboard-Opt-in sieht jede:r User eigene Stats:
- Gesamtpunkte (Gärtner + Entdecker)
- Aktuelle Streak (aufeinanderfolgende Tage mit Aktivität)
- Aufgabenquote (on-time / gesamt)
- Entdeckte Pflanzenarten

---

## Phase 4 – Qualitätssicherung (Woche 4–5)

### 4.1 Unit Tests

**Score-Berechnung (pure functions):**
- `calculateGardeningPoints(eventType, taskWeight)` → erwartete Punkte
- `calculateDiscoveryPoints(discovered, discoveredFirst, beta)` → erwartete Punkte
- Edge Cases: leere Daten, negative Scores, Überlauf

**Betroffene Dateien:**
- `__tests__/scoreCalculation.test.js` (NEU)
- `__tests__/discoveryService.test.js` (NEU)
- `__tests__/leaderboardService.test.js` (NEU)

### 4.2 DB/RLS Integration Tests

- First-Discovery Atomik: Zwei gleichzeitige Discoveries → nur eine ist `is_first=true`
- RLS: User A kann Events von User B NICHT sehen
- Leaderboard View: Nur `opt_in=true` User erscheinen
- Performance: EXPLAIN ANALYZE auf Leaderboard-View mit 2.000 simulierten Usern

### 4.3 Manuelles Testing / QA

- Happy Path: Registrieren → Pflanze scannen → Task erledigen → Leaderboard sehen
- Opt-in/Opt-out Flow: Toggle → sofort aus Ranking verschwinden
- Edge Cases: Neuer User (0 Punkte), User ohne Pflanzen, Offline-Verhalten

---

## Phase 5 – Beta-Rollout & Monitoring (Woche 5)

### 5.1 Staged Rollout
1. Intern testen (Team)
2. Migration auf Supabase Production deployen
3. Edge Functions deployen (falls Score-Logik serverseitig)
4. App-Update über TestFlight/Internal Testing
5. Monitoring aktivieren

### 5.2 Monitoring
- DB: Query-Latenzen der Leaderboard-View (Index-Checks)
- App: Error Boundary um LeaderboardScreen
- Abuse: Rate-Limit auf Discovery-Events (max 1 pro Species/Tag)
- Alerts: Ungewöhnliche Score-Spikes (> 3σ vom Durchschnitt)

### 5.3 Kill-Switch
Feature-Flag in `configService.js` oder Supabase-Config:
- `leaderboard_enabled: boolean` → UI zeigt/versteckt den Tab
- Ermöglicht schnelles Abschalten bei Problemen

---

## Zusammenfassung: Betroffene Dateien

| Datei | Aktion | Phase |
|-------|--------|-------|
| `supabase/migrations/20260302_scores_and_leaderboard.sql` | NEU | 1 |
| `services/discoveryService.js` | NEU | 2 |
| `services/leaderboardService.js` | NEU | 2 |
| `services/taskService.js` | ERWEITERN | 2 |
| `services/plantService.js` | ERWEITERN | 2 |
| `screens/LeaderboardScreen.js` | NEU | 3 |
| `screens/DrawerProfileScreen.js` | ERWEITERN | 2 |
| `screens/AddPlantScreen.js` | ERWEITERN | 2 |
| `App.js` | ERWEITERN (Navigation) | 3 |
| `services/languageService.js` | ERWEITERN (i18n-Keys) | 3 |
| `__tests__/scoreCalculation.test.js` | NEU | 4 |
| `__tests__/discoveryService.test.js` | NEU | 4 |
| `__tests__/leaderboardService.test.js` | NEU | 4 |

---

## Score-Formeln (Referenz)

### Discovery Points
```
DiscoveryPoints(user, window) = discovered(user, window) + β × discovered_first(user, window)
β = 5 (jede Erstentdeckung bringt 5 Bonuspunkte)
```

### Gardener Score
```
Task on time:    +1.0 × task_weight
Task late:       +0.4 × task_weight
Task skipped:    −0.6 × task_weight
Healthcheck:     +0.2 (Basis) + 0.05 × max(0, Δhealthscore)

Task-Gewichte: gießen=1, düngen=2, umtopfen=3
```

### Zeitfenster
- **Woche:** Rolling 7 Tage
- **Monat:** Rolling 30 Tage
- **Gesamt:** All-time

---

## Datenschutz-Checkliste

- [ ] Opt-in default = false (Privacy-by-Default, Art. 25 DSGVO)
- [ ] Display-Name frei wählbar (kein Realname-Zwang)
- [ ] Keine E-Mail/Standort/Profilbild im öffentlichen Ranking
- [ ] Opt-out entfernt User sofort aus leaderboard_public
- [ ] RLS: User sehen nur eigene Events
- [ ] Leaderboard-View zeigt nur aggregierte Daten von Opt-in-Usern
- [ ] "Lösch mich"-Flow dokumentiert
