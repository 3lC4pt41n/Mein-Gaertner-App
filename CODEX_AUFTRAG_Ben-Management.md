# Codex-Auftrag: Ben als echter Pflanzen- & Zuhause-Verwalter

## Ausgangslage (warum dieser Auftrag)
Ben (`supabase/functions/ai-chat/index.ts`) ist **lese-stark, aber handlungs-schwach**:
- Er liest Pflanzen, letzten Healthcheck und offene Tasks, aber kann **nur Tasks anlegen** (`create_task`, `create_recurring_task`). Abhaken, verschieben, löschen kann er nicht.
- Die **`locations`-Ebene (Zuhause/Adresse) liest er gar nicht**. Zonen sieht er nur als Label am Pflanzeneintrag.
- **93 % der Pflanzen (317 von 339) haben keine Zone** — und Ben hat kein Werkzeug, um beim Einsortieren zu helfen.
- `plant.note` wird geladen, aber **nicht in den Prompt geschrieben**; Task-Fälligkeitsdaten und das `details`-JSON (Art-/Pflegedaten) fehlen Ben komplett.

Dieser Auftrag schließt diese Lücken in **drei eigenständigen, nacheinander abnehmbaren Teilaufträgen (A, B, C)**.

## Regeln
- Code-Kommentare und UI-Texte auf **Deutsch**.
- React Native + Expo, Supabase Edge Functions (Deno), Postgres.
- **Reduce, reduce, reduce. Keep it simple.** Keine Mock-Daten.
- **Backward-compatible**: Alte App-Versionen ohne neue Tools/Felder müssen weiter funktionieren.
- Alle drei Teilaufträge betreffen primär **eine Datei**: `supabase/functions/ai-chat/index.ts`. Nach Deploy: `supabase functions deploy ai-chat`.

---

## Teilauftrag A — Standort-Bewusstsein + Zonenzuweisung
**Problem:** Ben kennt die `locations`-Ebene nicht und kann Pflanzen keiner Zone zuordnen — obwohl 93 % unsortiert sind.

### A1. ÄNDERN: `loadGardenContext()` in `supabase/functions/ai-chat/index.ts`
- Pflanzen-Query um die **Location-Ebene** erweitern: `zones` joinen wir bereits (`zoneMap`), zusätzlich über `zones.location_id` die `locations` (Felder `name`, `label`, `locality`) laden und je Zone das Zuhause ergänzen.
- Im Kontext-Text das Label erweitern von `[Zone (Typ)]` auf `[Zuhause › Zone (Typ)]`, z. B. `[Wohnung Berlin › Wohnzimmer (room)]`.
- **Unsortierte Pflanzen** (`zone_id IS NULL`) explizit gruppieren: am Ende des Garden-Kontexts eine Zeile `OHNE ZONE (n Pflanzen): name1, name2, …`, damit Ben aktiv anbieten kann, sie einzusortieren.

### A2. NEU: Tool `assign_plant_to_zone` in `buildTools()`
```
name: 'assign_plant_to_zone'
description: 'Assign one of the user's plants to a zone (room/balcony/garden/greenhouse).'
parameters:
  plant_name (string, required)  — must match an existing plant
  zone_name  (string, required)  — must match an existing zone of the user
```

### A3. NEU: Handler in `handleToolCall()`
- Pflanze über `userPlants` per case-insensitive Teilstring finden (wie bei `create_task`).
- Zone laden: alle Zonen des Users (über `zones` JOIN `locations` auf `user_id`) und per Name matchen. Bei Mehrdeutigkeit: Fehler-JSON mit Auswahl-Liste (`Available zones: …`) zurückgeben.
- Update: `plants.update({ zone_id }).eq('id', plant.id).eq('user_id', userId)` — spiegelt `assignPlantToZone` in `screens/HomeManager.jsx:191`.
- Erfolg/Fehler als JSON zurückgeben (gleiches Muster wie bestehende Handler).

> **Scope-Grenze:** Zonen/Locations **anlegen/umbenennen/löschen** ist NICHT Teil von A (bleibt im `HomeManager`-Screen). Ben ordnet nur **bestehenden** Zonen zu.

### Akzeptanzkriterien A (Abnahme)
- [ ] Ben nennt im Gespräch das Zuhause einer Pflanze (z. B. „deine Monstera im Wohnzimmer in der Wohnung Berlin").
- [ ] Ben listet auf Nachfrage die Pflanzen ohne Zone und bietet Einsortierung an.
- [ ] „Ordne meine Basilikum dem Balkon zu" setzt `plants.zone_id` korrekt (in DB prüfbar) und Ben bestätigt freundlich.
- [ ] Nicht existierende Zone/Pflanze → freundliche Rückfrage mit verfügbaren Optionen, kein Crash.

---

## Teilauftrag B — Task-Lebenszyklus (abhaken & verschieben)
**Problem:** Ben kann Tasks nur stapeln, nicht pflegen.

### B1. ÄNDERN: `loadGardenContext()` — Task-Identität sichtbar machen
- Tasks-Query um `id` und `due_at` erweitern (bereits geladen: `plant_id, type, due_at, state, note`).
- Im Kontext je Task **Fälligkeitsdatum** ausgeben statt nur `OVERDUE`-Flag, z. B. `Gießen (fällig 02.06., OVERDUE)`. Ben braucht das Datum zum Priorisieren und Verschieben.

### B2. NEU: Tools `complete_task` und `reschedule_task` in `buildTools()`
```
complete_task:
  plant_name (string, required)
  task_type  (string enum: Gießen|Düngen|Umtopfen|Healthcheck|Sonstiges, required)
reschedule_task:
  plant_name (string, required)
  task_type  (string enum …, required)
  new_due_date (string, ISO YYYY-MM-DD, required)
```
- Tasks werden über `plant_name` + `task_type` auf den **nächsten fälligen (`state='DUE'`)** Task der Pflanze aufgelöst. Bei mehreren Treffern den frühesten `due_at` nehmen.

### B3. NEU: Handler — **Parität mit der UI ist Pflicht**
`completeTask` in `services/taskService.js:217` macht mehr als Status setzen. Der Tool-Handler **muss dieselben Seiteneffekte erzeugen**, sonst driften Punkte/Verlauf:
1. `tasks.state` → `COMPLETED`, **nur wenn vorher `DUE`** (idempotent, kein Doppel-Scoring).
2. `task_run`-Insert `{ task_id, action:'completed', user_id }`.
3. **Scoring-Event**: `gardening_event` mit Punkten — `late` (due_at < jetzt) → `0.4 * weight` & `task_completed_late`, sonst `1.0 * weight` & `task_completed_on_time`. Gewicht via `getTaskWeight(type)` (`services/scoringHelpers.js`).
4. Auto-Diary-Eintrag (Typ `task`).
5. Bei `template_id`: Recurring neu planen (`rescheduleFromTemplate`).

> **Wichtig:** Punkte/Diary/Reschedule liegen heute **client-seitig** (`services/taskService.js`, `services/scoringHelpers.js`). Codex entscheidet den saubersten Weg für Server-Parität: entweder Logik in `_shared` portieren **oder** eine Postgres-RPC `complete_task_rpc(task_id)` (SECURITY DEFINER) bauen, die alles atomar erledigt, und Tool + UI rufen dieselbe RPC. **Bevorzugt: RPC** (eine Quelle der Wahrheit). `reschedule_task` setzt nur `due_at` neu (state bleibt `DUE`).

### Akzeptanzkriterien B (Abnahme)
- [ ] „Ich hab die Orchidee gegossen" setzt den fälligen Gieß-Task auf `COMPLETED` **und** vergibt exakt dieselben Punkte wie der UI-Button (in `gardening_event` prüfbar).
- [ ] Doppeltes Abhaken vergibt **keine** zweiten Punkte (idempotent).
- [ ] „Verschieb das Umtopfen auf Montag" setzt `due_at` korrekt, Task bleibt `DUE`.
- [ ] Recurring-Task nach Complete erzeugt den Folge-Task (wie UI).

---

## Teilauftrag C — Kontext-Anreicherung (ohne neue Tools)
**Problem:** Ben hat gespeichertes Wissen, nutzt es aber nicht. Reine Prompt-/Query-Arbeit in `loadGardenContext()` + `buildSystemPrompt()`.

### C1. `plant.note` ausgeben
Wird bereits geladen (`select('id, name, note, …')`), aber nicht in den Text geschrieben. Wenn vorhanden: `| Notiz: <note>` an die Pflanzenzeile hängen (auf ~120 Zeichen kürzen).

### C2. `plants.details` (JSON) einbeziehen
Query um `details` erweitern. Falls vorhanden, die für Pflege relevanten Felder kompakt anhängen (z. B. Wasser-/Lichtbedarf, Art) — **nur 1 Zeile pro Pflanze**, nicht das ganze JSON. Leere/fehlende Felder überspringen.

### C3. Healthcheck-`summary` optional
Aktuell nur `recommendation`. Wenn `recommendation` fehlt, aber `summary` da ist, `summary` als Fallback nutzen.

### Akzeptanzkriterien C (Abnahme)
- [ ] Eine Pflanze mit Notiz → Ben bezieht die Notiz erkennbar in eine Antwort ein.
- [ ] Eine Pflanze mit `details` (z. B. „mag wenig Wasser") → Ben gibt artgerechten Tipp aus den gespeicherten Daten, nicht nur Allgemeinwissen.
- [ ] Prompt-Größe bleibt im Rahmen — Token-Budget (`historyBudget`) darf nicht negativ werden; Notizen/Details sind gekürzt.

---

## Reihenfolge der Umsetzung
1. **C** zuerst (geringes Risiko, nur Query + Prompt, keine neuen Tools) — schneller Nutzen.
2. **A** (neues Tool + Update, mittleres Risiko).
3. **B** zuletzt (Scoring-Parität, höchstes Risiko — am besten als RPC).

Jeder Teilauftrag ist eigenständig deploybar und einzeln abnehmbar.

## Nicht im Scope (bewusst, als Folge-Tickets notieren)
- Locations/Zonen per Ben **anlegen/löschen** (bleibt im HomeManager).
- Pflanzen per Ben anlegen/löschen oder Healthcheck auslösen.
- `skip_task` / `delete_task` als Ben-Tools (erst wenn complete/reschedule stehen).

## Abnahme
Die Abnahme erfolgt durch Claude gegen die obigen Kriterien — überprüfbar per Supabase-MCP (DB-State: `plants.zone_id`, `tasks.state`, `gardening_event`-Punkte) und durch Lesen der deployten `ai-chat`-Function. Pro Teilauftrag wird A/B/C einzeln freigegeben; ein Teilauftrag gilt erst als „abgenommen", wenn **alle** seine Kriterien grün sind.
