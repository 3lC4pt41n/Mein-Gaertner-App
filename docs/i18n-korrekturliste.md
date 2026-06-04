# i18n Korrekturliste — neue Locales (FloraPilot)

**Stand:** 2026-06-02 · **Betrifft:** die 16 neuen Sprachen aus Commit `459e972` / `f91551a`
**Quelle:** Audit der `i18n/locales/*.json`. Key-Coverage ist vollständig (0 fehlend), die Fehler sind **inhaltlich** (rohe Maschinenübersetzung).

Drei Fehlerklassen:

- **Teil A — Garten-Glossar:** Fachbegriffe falsch übersetzt (Pflanze→Fabrik, gießen→ausgießen, umtopfen→engl./„Ruf wiederherstellen"). Muss manuell ersetzt werden.
- **Teil B — Platzhalter-Spacing:** Leerzeichen um `{{…}}` systematisch entfernt. Deterministisch, per Skript fixbar.
- **Teil C — optionale Konsistenz:** Verb- vs. Nomen-Form, kleinere Politur.

Priorität: **A und B vor Live-Schaltung**, C danach.

> Konfidenz: Korrekturen für `de-/EU-Sprachen, pt, ja, ko, zh` sind hoch. Für `ar, he, fa, ur, hi, bn` ist die *Richtung* sicher (die Ist-Werte sind nachweislich falsch — z. B. „Ruf wiederherstellen"), die vorgeschlagene Schreibung bitte **muttersprachlich gegenlesen**.

---

## Teil A — Garten-Glossar (Prio 1)

Pfad in jeder Datei: `tasks.taskTypes.*` bzw. `tasks.plantLabel`.

### A1 · `watering` (gießen) — in **15 von 16** falsch

Fast überall wurde „pour/ausschütten/verschütten" statt „Pflanzen gießen" gewählt.

| Lang | Ist (falsch) | Soll | Bedeutung des Ist-Werts |
|------|--------------|------|--------------------------|
| nl | `Gieten` | `Gieten` | ✅ korrekt — keine Änderung |
| da | `Hældning` | `Vanding` | „Neigung/Eingießen" |
| pl | `Wylewanie` | `Podlewanie` | „Ausgießen" |
| uk | `Розлив` | `Полив` | „Abfüllung" |
| pt-BR | `Derramando` | `Regar` (oder `Rega`) | „Verschütten" |
| pt-PT | `Derramando` | `Regar` (oder `Rega`) | „Verschütten" |
| hi | `डालना` | `पानी देना` | „hineingeben" |
| bn | `ঢালাও` | `জল দেওয়া` | „gießen/casten" |
| ja | `注ぐ` | `水やり` | „eingießen" (Getränk) |
| ko | `붓는 것` | `물 주기` | „das Eingießen" |
| zh-Hans | `浇注` | `浇水` | „gießen/casten" (industriell) |
| id | `Menuangkan` | `Menyiram` | „eingießen" |
| ar | `صب` | `الري` (oder `سقي`) | „gießen/casten" |
| he | `מזיגה` | `השקיה` | „eingießen" (Getränk) |
| fa | `ریختن` | `آبیاری` | „verschütten" |
| ur | `ڈالنا` | `پانی دینا` | „hineingeben" |

### A2 · `plantLabel` (Pflanze:) — in **4** falsch (Pflanze→Fabrik)

| Lang | Ist (falsch) | Soll | Bedeutung des Ist-Werts |
|------|--------------|------|--------------------------|
| nl | `Installatie:` | `Plant:` | „Anlage/Installation" |
| uk | `завод:` | `Рослина:` | „Fabrik" |
| ja | `工場:` | `植物:` | „Fabrik" |
| zh-Hans | `工厂：` | `植物：` | „Fabrik" |
| ur | `پلانٹ:` | `پودا:` | engl. „plant" transliteriert (mehrdeutig) |

### A3 · `repotting` (umtopfen) — in **8** falsch/untranslated

| Lang | Ist (falsch) | Soll | Bedeutung des Ist-Werts |
|------|--------------|------|--------------------------|
| pt-BR | `Repotting` | `Replantio` (oder `Transplante`) | **englisch belassen** |
| pt-PT | `Repotting` | `Transplante` (oder `Replantação`) | **englisch belassen** |
| bn | `রিপোটিং` | `টব পরিবর্তন` (oder `পুনঃরোপণ`) | „repotting" transliteriert |
| id | `Merepoting` | `Ganti pot` (oder `Pindah pot`) | Kunstwort aus „repotting" |
| ar | `إعادة السمعة` | `تغيير الأصيص` | **„Ruf wiederherstellen"** ❗ |
| he | `ריפוד מחדש` | `החלפת עציץ` | **„neu polstern"** ❗ |
| fa | `گلدان مجدد` | `تعویض گلدان` | „Topf erneut" (gebrochen) |
| ur | `ریپوٹنگ` | `گملا بدلنا` | „repotting" transliteriert |
| hi | `दोबारा लगाना` | `गमला बदलना` (optional) | „neu einpflanzen" (vertretbar, ungenau) |

### A4 · `fertilizing` (düngen) — Bedeutungsfehler in **2**, Formfehler in **3**

| Lang | Ist | Soll | Hinweis |
|------|-----|------|---------|
| bn | `নিষিক্ত করা` | `সার দেওয়া` | Ist = **biologische Befruchtung** ❗ |
| he | `להפרות` | `דישון` | Ist = „befruchten/schwängern" (mehrdeutig) |
| da | `Gød` | `Gødning` (oder `Gødskning`) | abgeschnitten |
| id | `Pupuk` | `Pemupukan` | Ist = „Dünger" (Substantiv statt Tätigkeit) |
| fa | `کود دهی کنید` | `کوددهی` | Ist = Imperativ „dünge!" (inkonsistente Form) |

> `healthcheck` und die `intervals.*` wurden geprüft — überall korrekt, **kein** Handlungsbedarf.

---

## Teil B — Platzhalter-Spacing (Prio 1, skriptbar)

Die Maschinenübersetzung hat die Leerzeichen um `{{…}}` entfernt, z. B.
`"Over{{count}}dagen"` statt `"Over {{count}} dagen"`, `"Status:{{state}}"` statt `"Status: {{state}}"`.

**Betroffen: dieselben 23 Keys** in jeder dieser 9 Sprachen — `nl, da, pl, uk, pt-BR, pt-PT, id, hi, bn`:

```
common.insufficientCreditsMessage      plants.plantsCount            tasks.inDays
auth.confirmationSentTo                plants.recognizePlant         tasks.completedDiary
auth.resendConfirmationCooldown        plants.upgradeHint            tasks.everyNDays
assistant.placeholder                  store.purchaseSuccessMessage  leaderboard.streakValue
leaderboard.plantCount                 leaderboard.avgHealth         profile.avatarSourceMessage
notifications.taskDueBody              heatmap.yourStats             dex.progress
dex.discoveredBy                       dex.heatmapDiscoveries        dex.heatmapRegions
ben.taskCreatedMessage                 ben.recurringTaskCreatedMessage
```

**RTL-Ausnahmen** — nur je **1** Key betroffen (`ar, he, fa, ur`): `auth.resendConfirmationCooldown`.

**CJK** (`ja, ko, zh-Hans`): bewusst **ausgenommen** — diese Schriften setzen keine Leerzeichen um Platzhalter, der „geglubte" Zustand ist dort korrekt.

**Fix-Regel (deterministisch):** Für die obigen Keys die Leerzeichen so setzen, wie sie in `en.json` / `de.json` um den jeweiligen Platzhalter stehen (Quelle als Referenz nehmen, nicht raten). Da Quelle und Position bekannt sind, lässt sich das vollständig skripten — ich kann ein `scripts/fix-i18n-spacing.js` schreiben, das alle 9 Sprachen in einem Lauf korrigiert und per Diff zur Review zeigt.

---

## Teil C — optionale Konsistenz (Prio 3)

Kein Fehler, aber uneinheitlich: einige `taskTypes` stehen als Verb-Infinitiv statt als Label-Nomen.
Betrifft u. a. `fertilizing` in `pl` (`Nawozić`), `uk` (`Удобрювати`), `pt` (`Fertilizar`). Funktioniert, aber `Nawożenie` / `Удобрення` / `Adubação` (pt-BR) wären als Menü-Labels natürlicher. Erst angehen, wenn A+B durch sind.

---

## Empfohlenes Vorgehen

1. **Teil B per Skript** fixen (`scripts/fix-i18n-spacing.js`, Referenz = `en.json`) → 1 Commit, gut reviewbar per Diff.
2. **Teil A manuell** einsetzen (überschaubar: 4 Begriffe × betroffene Sprachen). Für `ar, he, fa, ur, hi, bn` vor Merge muttersprachlich gegenlesen.
3. **Teil C** optional in einer späteren Politur-Runde.
4. Danach `npx jest` + `eas update` (kein Store-Release nötig, da reine JSON-Änderung).

> Hinweis: Der eigentliche **Code** (Loader, Registry, RTL, Context) ist sauber und braucht keine Korrektur — dies betrifft ausschließlich die Übersetzungs-Inhalte.
