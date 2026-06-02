# Codex-Auftrag: Vollausbau auf alle 23 Sprachen (Backend, KI, E-Mail)

> **Status:** Diese Workorder **ersetzt** `CODEX_AUFTRAG_Pflegedetails-Sprachen.md` (die nur einen Teil abdeckte). Die Website wird separat in `CODEX_AUFTRAG_Landing-Sprachen.md` behandelt — hier nur als Teil H referenziert.

## Ausgangslage (warum dieser Auftrag)
Die **App-Oberfläche** ist bereits vollständig für **23 Sprachen** lokalisiert (`i18n/locales/*.json`, kanonische Liste in `i18n/registry.js`). Gekappt sind nur **KI-generierte Inhalte, Validierung und E-Mails** im Backend — aktuell **7** Sprachen (`de, en, fr, it, es, ru, tr`), an einer Stelle sogar nur **6** (ohne `tr`). Dadurch erscheinen in den übrigen 16 Sprachen zwar Menüs/Buttons korrekt, aber Pflegedetails, Healthcheck-Texte und Transaktions-E-Mails fallen auf Deutsch zurück bzw. lassen sich gar nicht erst speichern.

**Kanonische Quelle (exakte Schreibweise & Reihenfolge übernehmen) — `i18n/registry.js`:**
`de, en, fr, it, es, ru, tr, nl, da, pl, uk, pt-BR, pt-PT, hi, bn, ja, ko, zh-Hans, id, ar, he, fa, ur`
RTL: `ar, he, fa, ur`. Fallback aus `registry.js`: `pt-PT → pt-BR`.
**Zu ergänzen sind die 16:** `nl, da, pl, uk, pt-BR, pt-PT, hi, bn, ja, ko, zh-Hans, id, ar, he, fa, ur` (bei `ai-healthcheck` zusätzlich `tr`).

### Die exakten Engpässe (vollständiger Audit)
| # | Ort | Datei | Aktuell | Art |
|---|---|---|---|---|
| 1 | `SupportedLanguage`-Typ, Aliase, Prompt-Namen | `supabase/functions/_shared/language.ts` (Z. 1, 3–32, 34–42) | 7 | Code |
| 2 | `ALLOWED_LANGUAGES` / `validateLanguage()` | `supabase/functions/_shared/validate.ts` (Z. 6, 73) | 7 | Code |
| 3 | `DETAILS_SCHEMA_BY_LANGUAGE` | `supabase/functions/ai-plant-details/index.ts` (Z. 29–550) | 7 | **Inhalt (Übersetzung)** |
| 4 | `HEALTHCHECK_CRITERIA` | `supabase/functions/ai-healthcheck/index.ts` (Z. 28–~85) | **6** | **Inhalt (Übersetzung)** |
| 5 | `subjects` + `i18n` (E-Mail) | `supabase/functions/send-email/index.ts` (Z. 70, 141) | 7 | **Inhalt (Übersetzung)** |
| 6 | CHECK `plant_details.language` | `supabase/migrations/20260601161000_language_scoped_plant_details.sql` (Z. 34) | 7 | DB |
| 7 | CHECK `species_details.language` | `…20260601161000…` (Z. 29) **und** `…20260322_species_details_cache.sql` (Z. 27) | 7 / **6** | DB |
| 8 | Normalisierungs-/Backfill-Funktionen (Profil→Cache-Sprache) | beide o. g. Migrationen (Z. ~94 bzw. ~120) | 7/6 | DB |
| – | Website `TRANSLATIONS` | `index.html` | 7 | → Teil H (separate WO) |

**Auto-erweiternd** (keine Änderung nötig, sobald #1/#2 stehen): `ai-chat`, `ai-plant-scan`, `ai-gardener-avatar` nutzen nur `getLanguagePromptName`/`getUserLanguage`/`validateLanguage`.

## Regeln
- **Single Source of Truth:** die 23 Codes + Prompt-Namen genau **einmal** in `_shared/language.ts` definieren; `validate.ts` leitet daraus ab. Codes **1:1 wie `registry.js`** (inkl. `pt-BR`, `pt-PT`, `zh-Hans`).
- **Casing-Bug beheben:** `normalizeLanguage()` (und etwaige `normalizeAlias`) lowercased Eingaben → `zh-Hans`/`pt-BR`/`pt-PT` zerbrechen. Eingabe case-insensitiv matchen, aber **immer den exakten kanonischen Code** zurückgeben.
- **Übersetzungsqualität:** botanisch/rechtlich korrekte, natürliche Begriffe je Sprache — keine wörtliche Maschinenübersetzung. Eigennamen „FloraScout"/„Ben"/„Rose" nicht übersetzen.
- **Vollständigkeit erzwingen:** wo der Typ `Record<SupportedLanguage, …>` ist (#3 `DETAILS_SCHEMA_BY_LANGUAGE`, #5 `subjects`/`i18n`), erzwingt TypeScript nach Typ-Erweiterung alle 23 Keys — fehlende verursachen Build-Fehler (gewollt). **Achtung #4:** `HEALTHCHECK_CRITERIA` ist `Record<string, string[]>` — **nicht** typ-erzwungen; hier müssen alle 23 manuell vollständig sein, sonst stiller `|| ['de']`-Fallback.
- **Migrationen:** bestehende Migrationen **nicht** editieren — eine **neue, additive, idempotente** Migration. RTL-Codes nur als Daten — kein Sonder-Handling im Backend nötig.
- Backward-compatible: bestehende 7 Sprachen, vorhandene Cache-Einträge und API-Verträge dürfen nicht brechen.

---

## Teil A — `_shared/language.ts`
- `SupportedLanguage`-Union auf alle 23 erweitern.
- `LANGUAGE_ALIASES`: je neue Sprache Code + gängige Aliase (analog `registry.js`). Regions-/Skript-Codes robust mappen: `pt-br→pt-BR`, `pt-pt→pt-PT`, `zh`/`zh-cn`/`zh-hans→zh-Hans`. Rückgabe = **exakter** kanonischer Code.
- `LANGUAGE_PROMPT_NAMES`: für alle 23 einen englischen Namen + nativen Zusatz (z. B. `ja: 'Japanese (日本語)'`, `ar: 'Arabic (العربية)'`).
- `normalizeLanguage()` so anpassen, dass Regions-Codes nicht durch `.toLowerCase()` zerschossen werden; Default bleibt `de`.

**Abnahme A:** `normalizeLanguage('pt-BR')==='pt-BR'`, `'zh-Hans'==='zh-Hans'`, `'PT-pt'==='pt-PT'`; `getLanguagePromptName` liefert für alle 23 einen Namen.

## Teil B — `_shared/validate.ts`
- `ALLOWED_LANGUAGES` aus `language.ts` ableiten (Import), nicht erneut hartcodieren; `validateLanguage()` akzeptiert alle 23 case-/regions-korrekt.

**Abnahme B:** alle 23 akzeptiert, Unbekanntes weiter abgelehnt; keine zweite Sprachliste mehr in `validate.ts`.

## Teil C — `ai-plant-details` › `DETAILS_SCHEMA_BY_LANGUAGE` (+16)
- Für jede der 16 neuen Sprachen einen Schema-String **strukturgleich** zum `de`/`fr`-Block: gleiche Abschnitte (`overview`, `care`, `properties.dangers/benefits/compounds`), gleiche Schlüsselzahl, **lokalisierte Labels** (botanisch korrekt). Emoji-Titel (`⚠️ 🌿 🧪`) behalten, Text übersetzen.
- Nach Typ-Erweiterung (Teil A) erzwingt `Record<SupportedLanguage, string>` Vollständigkeit.

**Abnahme C:** 16 neue Blöcke, je strukturgleich zu `de`; Stichprobe je Sprache erzeugt korrekt strukturierte Details in der Zielsprache.

## Teil D — `ai-healthcheck` › `HEALTHCHECK_CRITERIA` (+17, inkl. `tr`)
- Aktuell nur `de,en,fr,it,es,ru` (6). Ergänzen: `tr` **und** die 16 — also **17** neue Einträge.
- Je Sprache exakt **7** Kriterien in **gleicher Reihenfolge** wie `de` (Blattfarbe & -struktur, Schädlingsbefall, Blattintegrität, Wuchsform & Standfestigkeit, Topf- zu Pflanzengröße, Substrat & Oberfläche, Gesamtpflege-Anzeichen).
- **Wichtig:** Typ ist `Record<string, string[]>` → **nicht** compilergeprüft. Vollständigkeit manuell sicherstellen, sonst greift der `|| HEALTHCHECK_CRITERIA['de']`-Fallback (Z. 86) und der Healthcheck erscheint deutsch.

**Abnahme D:** alle 23 Sprachen haben je 7 übersetzte Kriterien; kein Fallback auf `de` mehr für unterstützte Sprachen.

## Teil E — `send-email` › `subjects` + `i18n` (+16)
- Beide `Record<SupportedLanguage, Record<EmailActionType, …>>` (Z. 70 und 141) um die 16 Sprachen ergänzen.
- `subjects`: je Sprache **6** Betreffzeilen (eine pro `EmailActionType`: signup, recovery, invite, magiclink, email_change, reauthentication).
- `i18n`: je Sprache 6 Aktionen × die Felder der `I18nStrings`-Struktur (Z. 130; u. a. subtitle, title, desc, note, cta, fallback, footer, outside) — vollständig lokalisiert.
- Nach Typ-Erweiterung erzwingt TypeScript Vollständigkeit (Build-Fehler bei fehlenden Keys).
- RTL-Sprachen: Wenn die E-Mail-HTML-Templates (`email-templates/*.html`) Richtung unterstützen sollen, `dir="rtl"`/Textausrichtung für `ar,he,fa,ur` ergänzen (optional, aber empfohlen).

**Abnahme E:** Transaktions-E-Mails (alle 6 Typen) rendern in allen 23 Sprachen mit korrektem Betreff + Body; Build kompiliert (alle Keys vorhanden).

## Teil F — DB-Migration (neu, additiv, idempotent)
Neue Datei `supabase/migrations/<timestamp>_widen_language_support.sql`, die:
- den CHECK auf `plant_details.language` auf alle 23 weitet (alten droppen, neuen setzen) — exakte Codes inkl. `pt-BR`, `pt-PT`, `zh-Hans`.
- den CHECK auf `species_details.language` auf alle 23 weitet (**inkl. `tr`**, das in `20260322` fehlt).
- die Normalisierungs-/Backfill-Funktionen (in `20260322` ~Z. 94 und `20260601161000` ~Z. 120) so ersetzt/erweitert (`create or replace function`), dass alle 23 Profil-Sprachen korrekt auf ihren Cache-Code abgebildet werden (inkl. Fallback `pt-PT → pt-BR`, falls die Cache-Strategie das vorsieht).
- `drop constraint if exists` nutzt und mehrfach fehlerfrei läuft.

**Abnahme F:** `insert … language IN ('ja','ar','pt-BR','zh-Hans')` schlägt bei `plant_details` **und** `species_details` nicht mehr fehl; Normalisierung liefert für alle 23 den korrekten Code; Migration läuft auf frischer **und** bestehender DB durch.

## Teil G — Auto-erweiternde Funktionen verifizieren
- `ai-chat`, `ai-plant-scan`, `ai-gardener-avatar` erben über `_shared` automatisch. Nach Teil A/B kurz prüfen, dass sie für neue Sprachen (z. B. `ja`, `ar`) korrekt in der Zielsprache antworten — **keine** eigenen per-Sprache-Maps darin nachrüsten.

**Abnahme G:** Stichprobe je eine neue Sprache pro Funktion liefert Zielsprache.

## Teil H — Website (separat)
- Die Landingpage (`index.html`) wird in **`CODEX_AUFTRAG_Landing-Sprachen.md`** behandelt (TRANSLATIONS aktuell 7, plus RTL, hreflang, lokalisierte Screenshots). Diese Master-WO ändert `index.html` **nicht** — nur Hinweis, dass beide zusammen „alle 23 überall" ergeben.

---

## Betroffene Dateien
- `supabase/functions/_shared/language.ts` (primär), `supabase/functions/_shared/validate.ts`
- `supabase/functions/ai-plant-details/index.ts`, `supabase/functions/ai-healthcheck/index.ts`, `supabase/functions/send-email/index.ts`
- `supabase/migrations/<neu>_widen_language_support.sql`
- optional: `email-templates/*.html` (RTL)
- Referenz (nicht ändern): `i18n/registry.js`
- **Nicht** in dieser WO: `index.html` (→ Landing-WO)

## Definition of Done
- [ ] KI-/Backend-Sprachunterstützung == App-Sprachen (23), Codes identisch zu `registry.js`.
- [ ] Pflegedetails, Healthcheck-Texte und Transaktions-E-Mails funktionieren in allen 23 vollständig & korrekt strukturiert.
- [ ] Regions-/Skript-Codes (`pt-BR`, `pt-PT`, `zh-Hans`) durchgängig korrekt (kein Lowercasing-Bug).
- [ ] DB-CHECKs für `plant_details` **und** `species_details` decken alle 23 ab; Normalisierung vollständig.
- [ ] Sprachliste nur **einmal** gepflegt (Single Source of Truth in `language.ts`).
- [ ] `ai-chat`/`ai-plant-scan`/`ai-gardener-avatar` ohne eigene Sprachlisten verifiziert.
- [ ] Bestehende 7 Sprachen unverändert; keine bestehende Migration editiert; Edge-Functions kompilieren.

## Umsetzungsreihenfolge (empfohlen)
1. Teil A + B (Fundament, schaltet Auto-Erweiterung frei) → 2. Teil F (DB, sonst scheitern Inserts) → 3. Teil C/D/E (Inhalte; C+E werden nach A typ-erzwungen) → 4. Teil G (Verifikation). Teil H läuft parallel über die Landing-WO.
