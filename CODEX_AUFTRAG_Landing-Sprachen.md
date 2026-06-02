# Codex-Auftrag: Landingpage (florascout.app) auf alle 23 App-Sprachen bringen

## Ausgangslage (warum dieser Auftrag)
Die Landingpage `index.html` (florascout.app, self-contained, Inline-`<script>`) unterstützt aktuell nur **7 Sprachen**, die App dagegen **23** (`i18n/registry.js`). Vor dem Launch — und für lokalisierte Store-Screenshots — muss die Website mit der App gleichziehen.

Relevante Stellen in `index.html`:
- `<html lang="de">` — Zeile 2.
- `<select id="language-select">` mit 7 hartcodierten `<option>` — ab Zeile ~1275.
- `const SUPPORTED_LANGUAGES = ['de','en','fr','it','es','ru','tr'];` — Zeile ~1927.
- `const TRANSLATIONS = { de:{…}, en:{…}, … };` — ab Zeile ~1929, je Sprache ~900 Schlüssel-Zeilen, verschachtelt: `meta, language, nav[], hero, metrics[], context, product, stories[], routine, screens, download, footer[]`.
- `getDictionary(lang)` merged `…TRANSLATIONS.de` mit der Zielsprache → **fehlende Keys fallen still auf Deutsch zurück** (= sichtbare Sprachmischung, wenn unvollständig).
- `detectLanguage()` liest `?lang=`, dann `localStorage['florascout-landing-language']`, dann `navigator.language`.
- `applyTranslations(lang)` setzt nur `document.documentElement.lang = lang` — **kein `dir`/RTL**.

**Fehlende 16 Sprachen** (Codes exakt aus `registry.js`):
`nl, da, pl, uk, pt-BR, pt-PT, hi, bn, ja, ko, zh-Hans, id, ar, he, fa, ur`
Davon **RTL**: `ar, he, fa, ur`.

## Regeln
- **Keine Maschinen-Wort-für-Wort-Übersetzung abliefern, die holprig ist.** Marketing-Ton wie in den bestehenden `de`/`en`-Blöcken. Die App-Locale-Dateien (`i18n/locales/*.json`) sind **nicht** wiederverwendbar — das sind UI-Strings, keine Landing-Copy. Die Landing-Copy muss eigenständig übersetzt werden.
- **Vollständigkeit ist Pflicht:** jeder der 16 neuen `TRANSLATIONS`-Blöcke enthält **alle** Keys, die `de`/`en` haben — sonst entsteht durch den `getDictionary`-Fallback deutsche Sprachmischung. Gleiche Verschachtelung, gleiche Array-Längen (`nav`, `metrics`, `stories`, `footer`).
- Codes/Labels **1:1 aus `i18n/registry.js`** übernehmen (Single Source of Truth, damit Web == App).
- Self-contained lassen: alles inline in `index.html`, keine neuen Build-Schritte, keine externen Libs.
- Backward-compatible: bestehende 7 Sprachen, `?lang=`-Param und localStorage-Verhalten dürfen nicht brechen.

---

## Teilauftrag A — Sprachliste & Auswahl erweitern
### A1. `SUPPORTED_LANGUAGES`
Auf alle 23 Codes aus `registry.js` erweitern (inkl. Regions-/Skript-Codes `pt-BR`, `pt-PT`, `zh-Hans`).

### A2. **Casing-Bug fixen (wichtig)**
`detectLanguage()` lowercased den `?lang=`-Param und vergleicht gegen `SUPPORTED_LANGUAGES`. Mit gemischt­schreibenden Codes (`pt-BR`, `zh-Hans`) schlägt der Vergleich fehl, und `navigator.language` wird via `.split('-')[0]` auf den Basis-Code reduziert (→ `pt`, `zh` matchen nichts).
- Vergleiche case-insensitiv und code-normalisierend (an `getSupportedLanguageCode`/`normalizeLanguageCode` aus `registry.js` angelehnt).
- Browser-Erkennung so erweitern, dass `pt-br`→`pt-BR`, `pt-pt`→`pt-PT`, `zh`/`zh-cn`→`zh-Hans` etc. korrekt zugeordnet werden (Fallback-Tabelle analog `registry.js`).
- `?lang=` muss für **jeden** der 23 Codes deterministisch funktionieren (das ist die Grundlage für die lokalisierten Screenshots — siehe Teil D).

### A3. `<select id="language-select">`
16 `<option>` ergänzen, `value` = exakter Code, Beschriftung = natives `label` aus `registry.js` (z. B. `<option value="pt-PT">Português (PT)</option>`, `<option value="zh-Hans">简体中文</option>`, `<option value="ar">العربية</option>`). Reihenfolge wie in `registry.js`.

### Akzeptanzkriterien A
- [ ] `SUPPORTED_LANGUAGES` enthält alle 23 Codes exakt wie in `registry.js`.
- [ ] `?lang=pt-PT`, `?lang=zh-Hans`, `?lang=ar` (und alle übrigen) setzen die Seite korrekt um.
- [ ] Select zeigt 23 Optionen mit nativen Labels; Auswahl persistiert in localStorage.

---

## Teilauftrag B — Übersetzungen ergänzen
Für jede der 16 fehlenden Sprachen einen vollständigen `TRANSLATIONS`-Block anlegen, strukturgleich zu `de`/`en`.
- Quelle für Bedeutung/Ton: bestehender `en`-Block (bzw. `de`).
- Alle Sub-Objekte und Arrays vollständig befüllen; **keine** Keys auslassen.
- `meta.title`/`meta.description`/`ogDescription` je Sprache sinnvoll lokalisieren (SEO).
- Eigennamen „FloraScout" und „Ben" **nicht** übersetzen.

### Akzeptanzkriterien B
- [ ] 16 neue, vollständige `TRANSLATIONS`-Blöcke; Diff zeigt für jede Sprache dieselbe Key-Menge wie `de`.
- [ ] Beim Durchschalten **keiner** Sprache erscheint deutscher Resttext (Fallback greift nirgends sichtbar).
- [ ] Array-Längen (`nav`, `metrics`, `stories`, `footer`) stimmen mit `de` überein.

---

## Teilauftrag C — RTL-Unterstützung (ar, he, fa, ur)
Aktuell gibt es **kein** `dir`-Handling. Für die vier RTL-Sprachen:
- In `applyTranslations(lang)` zusätzlich `document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr'` setzen (RTL-Flag aus `registry.js`-Logik ableiten oder lokale Liste `['ar','he','fa','ur']`).
- CSS so anpassen, dass das Layout im RTL-Modus nicht bricht: logische Properties (`margin-inline`, `padding-inline`, `inset-inline`) statt fixer `left/right`, gespiegelte Richtungs-Icons/Pfeile, korrekte Text-Ausrichtung. Header, Hero, Karten-/Story-Sektionen und Footer prüfen.
- Sprach-Select und Buttons müssen in RTL bedienbar und sauber positioniert bleiben.

### Akzeptanzkriterien C
- [ ] Bei `ar/he/fa/ur` steht `<html dir="rtl">`; Layout ist gespiegelt und nicht zerschossen.
- [ ] Wechsel von RTL zurück auf LTR setzt `dir` korrekt zurück (kein Hängenbleiben).
- [ ] Visuell geprüft an je einem RTL-Screenshot (z. B. `?lang=ar`).

---

## Teilauftrag D — SEO & Screenshot-Tauglichkeit
- `hreflang`-`<link>`-Alternates für alle 23 Sprachen im `<head>` ergänzen (`?lang=<code>` als href), plus `x-default`.
- Sicherstellen, dass `?lang=<code>` ohne JS-Flackern initial die richtige Sprache rendert (für saubere automatisierte Screenshots je Sprache).

### Akzeptanzkriterien D
- [ ] `<head>` enthält `hreflang`-Alternates für alle 23 Codes + `x-default`.
- [ ] Direktaufruf `florascout.app/?lang=<code>` zeigt sofort die Zielsprache (Title, Meta, sichtbarer Text).

---

## Teilauftrag E — Lokalisierte Screenshots auf der Landingpage
**Problem:** Die 10 Screenshots liegen unter `store-assets/landing/*.jpg` und sind in `index.html` **fest verdrahtet** (`src="store-assets/landing/<name>.jpg"`). Sie stehen nicht im `TRANSLATIONS`-Objekt, und `applyTranslations()` fasst die Bild-`src` nicht an → in **jeder** Sprache erscheinen dieselben (deutschen) Screenshots. Im Code steht das sogar als Notiz („The screenshots on this page remain in German for now."). Die Capture-Pipeline produziert lokalisierte Screenshots, die hier ankommen müssen.

### E1. Ordnerkonvention (festschreiben)
- Sprachspezifische Screenshots unter `store-assets/landing/<lang>/<name>.jpg` (z. B. `store-assets/landing/fr/plant-dex.jpg`).
- Die **bestehenden** 10 Dateien direkt unter `store-assets/landing/*.jpg` bleiben als **Default-/Fallback-Set** (de) liegen.
- Kanonische 10 Shot-Namen (unverändert, exakt so): `home-zones, plants-by-room, plants-overview, plant-dex, details-health, details-properties, tasks, assistant-chat, shop-credits, leaderboard`.

### E2. LP umbauen (data-shot + Sprach-Swap)
- Jedes Screenshot-`<img>` mit `data-shot="<name>"` auszeichnen (statt sich auf den hartcodierten Pfad zu verlassen). Den initialen `src` auf das Default-Set zeigen lassen, damit ohne JS nichts bricht.
- In `applyTranslations(lang)` über alle `img[data-shot]` iterieren und die `src` auf `store-assets/landing/<lang>/<shot>.jpg` setzen.
- **Fallback je Bild:** existiert die sprachspezifische Datei nicht, auf das Default-Set `store-assets/landing/<shot>.jpg` zurückfallen (per `img.onerror`-Handler, der einmalig auf den Default-Pfad wechselt). So zeigt jede Sprache, für die noch keine Shots existieren, sauber die Default-Bilder statt Broken Images.
- `og:image` (`<head>`) auf dem Default-Set belassen.

### E3. Notiz entfernen
- Den Platzhalter-Satz „… screenshots … remain in German for now" / „… restano per ora in tedesco" aus **allen** `TRANSLATIONS`-Blöcken entfernen, sobald der Swap steht.

### E4. Capture-Pipeline-Vertrag
- Der Screenshot-Lauf (Maestro/Fastlane) muss **exakt** in `store-assets/landing/<lang>/` mit **exakt** diesen 10 Dateinamen exportieren, damit die LP sie ohne weitere Anpassung aufnimmt. (Pipeline ist separat; hier nur den Vertrag dokumentieren.)

### Akzeptanzkriterien E
- [ ] Jedes Screenshot-`<img>` trägt `data-shot` und wird beim Sprachwechsel umgeschaltet.
- [ ] `?lang=fr` zeigt FR-Screenshots, sobald `store-assets/landing/fr/*.jpg` existiert; fehlt ein Bild, erscheint sauber das Default-Bild (kein Broken Image).
- [ ] Default-/Fallback-Set bleibt funktionsfähig; `og:image` unverändert.
- [ ] Die „in German for now"-Notiz ist aus allen Sprachblöcken entfernt.

---

## Betroffene Dateien
- **Primär:** `index.html` (Landingpage).
- **Assets:** `store-assets/landing/` (Default-Set) + neue Unterordner `store-assets/landing/<lang>/`.
- **Referenz (nicht ändern):** `i18n/registry.js` — Codes, Labels, RTL-Flags, Fallbacks.
- Falls vorhanden, gespiegelte Kopie unter `dist/index.html` nach dem Build mit aktualisieren bzw. neu erzeugen.

## Definition of Done
- [ ] Website-Sprachen == App-Sprachen (23), Codes identisch zu `registry.js`.
- [ ] Jede Sprache vollständig übersetzt, kein deutscher Resttext.
- [ ] `?lang=`-Param für alle 23 Codes deterministisch (Casing-Bug behoben).
- [ ] RTL für ar/he/fa/ur korrekt.
- [ ] `hreflang`-Alternates vorhanden.
- [ ] Screenshots pro Sprache austauschbar (`data-shot` + Sprachordner + Fallback); „in German for now"-Notiz entfernt.
- [ ] Bestehende 7 Sprachen unverändert funktionsfähig; keine neuen Build-Abhängigkeiten.
