# Codex-Auftrag: Pflegedetails & KI-Sprachen auf alle 23 App-Sprachen weiten

## Ausgangslage (warum dieser Auftrag)
Die App (`i18n/registry.js`) unterstützt **23 Sprachen**, die KI-/Pflegedetails-Pipeline aber nur **7** (`de, en, fr, it, es, ru, tr`) — `species_details` sogar nur **6** (kein `tr`). Dadurch lassen sich für die übrigen 16 Sprachen keine Pflegedetails generieren/speichern, was u. a. lokalisierte Store-Screenshots und das Produktversprechen „in deiner Sprache" blockiert.

Die Beschränkung sitzt an **fünf** Stellen — alle müssen angefasst werden, ein einzelner Fix reicht nicht:

1. **`supabase/functions/_shared/language.ts`**
   - `type SupportedLanguage` = nur 7.
   - `LANGUAGE_ALIASES` (Eingabe→Code) = nur 7.
   - `LANGUAGE_PROMPT_NAMES` (Code→Klartext fürs LLM-Prompt) = nur 7.
   - `normalizeLanguage()` lowercased die Eingabe → **bricht bei Regions-/Skript-Codes** `pt-BR`, `pt-PT`, `zh-Hans`.
2. **`supabase/functions/_shared/validate.ts`**
   - `const ALLOWED_LANGUAGES = ['de','en','fr','it','es','ru','tr']` + `validateLanguage()` (Zeile 6/73).
3. **`supabase/functions/ai-plant-details/index.ts`**
   - `DETAILS_SCHEMA_BY_LANGUAGE: Record<SupportedLanguage, string>` (ab Zeile 29): pro Sprache ein JSON-Skelett mit **lokalisierten Feld-Labels** (z. B. `"Gießen"`, `"Licht"`, `"⚠️ Gefahren"`), das das LLM befüllt. Verwendet bei Zeile 586.
4. **DB-CHECK-Constraints**
   - `supabase/migrations/20260601161000_language_scoped_plant_details.sql` — `plant_details.language CHECK (… IN (7))` (Zeilen 29 und 34).
   - `supabase/migrations/20260322_species_details_cache.sql` — `species_details.language CHECK (… IN (6))` (Zeile 27).
5. **SQL-Normalisierungsfunktionen** (Profil-Sprache → Cache-Sprache)
   - `20260322_…:94` und `20260601161000_…:120` — `WHEN … IN ('de','deutsch',…)`-Leitern, die nur die alten Sprachen kennen.

**Kanonische Quelle der 23 Codes** (Reihenfolge & exakte Schreibweise übernehmen):
`de, en, fr, it, es, ru, tr, nl, da, pl, uk, pt-BR, pt-PT, hi, bn, ja, ko, zh-Hans, id, ar, he, fa, ur`
RTL: `ar, he, fa, ur`. Fallback aus `registry.js`: `pt-PT → pt-BR`.

## Regeln
- **Single Source of Truth:** Die 23 Codes + Prompt-Namen genau **einmal** in `_shared/language.ts` definieren; `validate.ts` und (soweit möglich) der DB-CHECK leiten sich daraus ab, statt die Liste mehrfach zu pflegen. Codes **1:1 wie `i18n/registry.js`** (inkl. Groß-/Kleinschreibung `pt-BR`, `pt-PT`, `zh-Hans`).
- **Keine holprige Maschinenübersetzung** der Pflegedetail-Labels — botanisch korrekte, natürliche Begriffe je Sprache.
- Backward-compatible: bestehende 7 Sprachen, vorhandene Cache-Einträge und API-Verträge dürfen nicht brechen.
- Deno/TS-Edge-Funktionen können `i18n/registry.js` (React Native) **nicht** importieren — die Liste in `_shared/language.ts` ist die TS-seitige Wahrheit und muss bewusst mit `registry.js` synchron gehalten werden (im PR dokumentieren).

---

## Teilauftrag A — `_shared/language.ts` erweitern
- `SupportedLanguage`-Union auf alle 23 Codes erweitern.
- `LANGUAGE_ALIASES`: für jede neue Sprache Code + gängige Aliase ergänzen (analog `registry.js`-Aliase). **Regions-/Skript-Codes robust mappen:** `pt-br→pt-BR`, `pt-pt→pt-PT`, `zh`/`zh-cn`/`zh-hans→zh-Hans`. Da `normalizeLanguage()` lowercased, die Rückgabe auf den **exakten** kanonischen Code abbilden (nicht den lowercased Input zurückgeben).
- `LANGUAGE_PROMPT_NAMES`: für alle 23 einen klaren englischen Prompt-Namen + nativen Zusatz (z. B. `ja: 'Japanese (日本語)'`, `ar: 'Arabic (العربية)'`).
- `normalizeLanguage()` so anpassen, dass Regions-Codes nicht durch `.toLowerCase()` zerschossen werden; Default bleibt `de`.

### Akzeptanzkriterien A
- [ ] `SupportedLanguage` umfasst exakt die 23 Codes aus `registry.js`.
- [ ] `normalizeLanguage('pt-BR') === 'pt-BR'`, `normalizeLanguage('zh-Hans') === 'zh-Hans'`, `normalizeLanguage('PT-pt') === 'pt-PT'`.
- [ ] `getLanguagePromptName()` liefert für jede der 23 Sprachen einen sinnvollen Namen.

---

## Teilauftrag B — `_shared/validate.ts` angleichen
- `ALLOWED_LANGUAGES` aus der kanonischen Liste in `language.ts` ableiten (Import), nicht erneut hartcodieren.
- `validateLanguage()` muss alle 23 Codes (inkl. `pt-BR`, `zh-Hans`) case-/regions-korrekt akzeptieren.

### Akzeptanzkriterien B
- [ ] `validateLanguage` akzeptiert alle 23 Codes, lehnt Unbekanntes weiterhin ab.
- [ ] Keine doppelte Sprachliste mehr in `validate.ts` (Quelle = `language.ts`).
- [ ] `ai-chat`, `ai-healthcheck`, `ai-plant-scan`, `ai-gardener-avatar` (nutzen `validateLanguage`/`normalizeLanguage`) funktionieren ohne weitere Änderung für die neuen Sprachen — im PR kurz verifizieren.

---

## Teilauftrag C — `DETAILS_SCHEMA_BY_LANGUAGE` für 16 Sprachen
- Für jede neue Sprache einen Schema-String **strukturgleich** zum `de`/`fr`-Block anlegen: dieselben Abschnitte (`overview`, `care`, `properties.dangers/benefits/compounds`), dieselbe Schlüsselzahl, mit **lokalisierten Labels** (botanisch korrekt).
- Emoji-Titel (`⚠️`, `🌿`, `🧪`) beibehalten, Text dahinter übersetzen.
- RTL-Sprachen (`ar, he, fa, ur`): Labels in der jeweiligen Schrift; JSON-Struktur bleibt unverändert (kein Mischen von LTR/RTL in Keys nötig).
- Sicherstellen, dass `DETAILS_SCHEMA_BY_LANGUAGE[resolvedLanguage]` (Zeile 586) für jede der 23 Sprachen definiert ist — sonst Laufzeitfehler.

### Akzeptanzkriterien C
- [ ] 16 neue Schema-Blöcke, je strukturgleich zu `de` (gleiche Abschnitte & Key-Anzahl).
- [ ] Kein `undefined`-Schema mehr möglich: `Record<SupportedLanguage, string>` ist für alle 23 vollständig (TypeScript erzwingt das nach Teil A).
- [ ] Stichprobe je Sprache: generierte Pflegedetails erscheinen in der Zielsprache, korrekt strukturiert.

---

## Teilauftrag D — DB-Migration (neue Migration, nicht bestehende editieren)
Eine **neue** Migration `supabase/migrations/<timestamp>_widen_language_support.sql` anlegen, die:
- den CHECK auf `plant_details.language` auf alle 23 Codes weitet (alten CHECK droppen, neuen setzen) — exakte Codes inkl. `pt-BR`, `pt-PT`, `zh-Hans`.
- den CHECK auf `species_details.language` ebenfalls auf 23 weitet (**inkl. `tr`**, das dort bislang fehlt).
- die Normalisierungsfunktionen (`20260322_…:94`, `20260601161000_…:120`) so ersetzt/erweitert, dass alle 23 Profil-Sprachen korrekt auf ihren Cache-Code abgebildet werden (inkl. Fallback `pt-PT → pt-BR`, falls die Cache-Strategie das vorsieht).
- idempotent ist (`drop constraint if exists` / `create or replace function`).

> Hinweis: bestehende Migrationen **nicht** rückwirkend ändern — nur additive Migration, damit deployte Umgebungen sauber durchlaufen.

### Akzeptanzkriterien D
- [ ] `insert into plant_details (… language='ja' …)` und `='ar'`, `='pt-BR'`, `='zh-Hans'` schlagen **nicht** mehr am CHECK fehl.
- [ ] `species_details` akzeptiert ebenfalls alle 23 (inkl. `tr`).
- [ ] Normalisierungsfunktion liefert für jede der 23 Profil-Sprachen den korrekten Cache-Code.
- [ ] Migration läuft auf einer frischen DB und auf der bestehenden (idempotent) fehlerfrei durch.

---

## Betroffene Dateien
- `supabase/functions/_shared/language.ts` (primär)
- `supabase/functions/_shared/validate.ts`
- `supabase/functions/ai-plant-details/index.ts` (Schema-Blöcke)
- `supabase/migrations/<neu>_widen_language_support.sql`
- Referenz (nicht ändern): `i18n/registry.js` — kanonische Codes/Labels/RTL/Fallbacks.

## Definition of Done
- [ ] KI-Sprachunterstützung == App-Sprachen (23), Codes identisch zu `registry.js`.
- [ ] Pflegedetails (`ai-plant-details`) generieren in allen 23 Sprachen vollständig & korrekt strukturiert.
- [ ] Regions-/Skript-Codes (`pt-BR`, `pt-PT`, `zh-Hans`) durchgängig korrekt (kein Lowercasing-Bug).
- [ ] DB-CHECKs für `plant_details` **und** `species_details` decken alle 23 ab.
- [ ] Sprachliste nur **einmal** gepflegt (Single Source of Truth in `language.ts`).
- [ ] Bestehende 7 Sprachen unverändert funktionsfähig; keine bestehende Migration editiert.

## Anschluss
Mit diesem Auftrag funktioniert dann auch das Seed-Skript `scripts/seed-screenshot-demo.js` für die übrigen 16 Sprachen ohne CHECK-Warnung — Fixtures dafür müssen in `scripts/screenshot-fixtures.json` noch ergänzt werden (separater, kleiner Schritt). Parallel passt dazu der Auftrag `CODEX_AUFTRAG_Landing-Sprachen.md` (Website ebenfalls auf 23).
