# Codex-Auftrag: Web-App auf Cloudflare Pages ausliefern

## Ausgangslage (warum dieser Auftrag)

Die Web-App ist **code-seitig fertig**: Expo-Web läuft über `react-native-web`, der Discovery-Ausschluss und der Stripe-Web-Checkout sind umgesetzt und getestet (siehe `docs/WEB_APP_PLAN.md`, `CODEX_AUFTRAG_Web-Monetarisierung.md`). Was fehlt, ist die **Auslieferung in Produktion**:

- `npm run export:web` (`expo export --platform web`) erzeugt das Bundle in `dist/`.
- `app.json` hat bereits `web: { bundler: 'metro', output: 'single', favicon }` → SPA-Output.
- `public/_redirects` mit `/* /index.html 200` existiert (SPA-Fallback für Cloudflare).
- **Aber:** Die einzige Pages-Pipeline `.github/workflows/pages.yml` deployt nur die **Landing-/Rechtsseiten** (`index.html`, `impressum`, `privacy-policy`, `terms`, …) nach **GitHub Pages**. Sie baut **nicht** die Expo-Web-App und liefert sie **nicht** nach Cloudflare.
- Es gibt **keine** Cloudflare-Konfiguration im Repo (kein `wrangler.toml`).

Dieser Auftrag schließt das in **drei Pflichtteilen (A, B, C)** und **einem Politur-Teil (D)**.

> **Namens-/Kollisions-Warnung:** Die bestehende `pages.yml` (GitHub Pages, Landing) **nicht** umbauen oder überschreiben — sie bleibt für die Marketing-/Rechtsseiten zuständig. Dieser Auftrag legt eine **separate** Cloudflare-Pipeline an. Doppelte Auslieferung derselben Domain vermeiden (Domain-Strategie in D klären).

## Regeln

- Expo SDK 54 / RN 0.81 / `react-native-web`. **Reduce, reduce, reduce.** Keine Mock-Daten.
- **Secrets nie ins Bundle**: nur `EXPO_PUBLIC_*` landet im Web-Build. Stripe-Secret-/Service-Keys bleiben in Edge Functions.
- Build muss **reproduzierbar in CI** sein (Node-Version pinnen, `npm ci`).
- Bestehende Mobile-/EAS-Pipelines (`eas-build-submit.yml`, `eas-update.yml`) und die Supabase-Deploy-Pipeline dürfen nicht berührt werden.
- Keine Änderung an `pages.yml` (Landing bleibt wie sie ist).

---

## Teilauftrag A — Reproduzierbarer Web-Build

**Problem:** Es gibt zwar `export:web`, aber keinen CI-tauglichen, deterministischen Build-Pfad inkl. Env-Injektion.

### A1. Build verifizieren
- Sicherstellen, dass `npm ci && npm run export:web` lokal ein vollständiges `dist/` erzeugt (inkl. `index.html`, Assets, kopiertem `_redirects` aus `public/`).
- Falls `_redirects` nicht automatisch in `dist/` landet: im Build-Step explizit `cp public/_redirects dist/_redirects` ergänzen.
- `dist/` in `.gitignore` (Build-Artefakt, nicht committen) — prüfen/ergänzen.

### A2. Env-Variablen dokumentieren
- Benötigte Build-Time-Vars (alle `EXPO_PUBLIC_*`, müssen in Cloudflare gesetzt sein):
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `EXPO_PUBLIC_WEB_APP_URL` (z. B. `https://app.florascout.app`) — wird u. a. von `services/webPurchaseSteering.js` genutzt.
- Falls weitere `EXPO_PUBLIC_*` im Code referenziert werden: per Grep (`EXPO_PUBLIC_`) vollständig auflisten und im PR-Text als Cloudflare-Env-Checkliste dokumentieren.

### Akzeptanzkriterien A
- [ ] `npm ci && npm run export:web` erzeugt deterministisch ein lauffähiges `dist/` inkl. `_redirects`.
- [ ] Vollständige Liste der nötigen `EXPO_PUBLIC_*`-Vars im PR-Text.
- [ ] `dist/` ist gitignored.

---

## Teilauftrag B — Cloudflare Pages Deployment (CI)

**Ziel:** Push auf `main`, der App-Code ändert → automatischer Build + Deploy nach Cloudflare Pages.

### B1. NEU: `.github/workflows/cloudflare-web.yml`
- Trigger: `push` auf `main` mit `paths` auf App-relevante Pfade (`App.js`, `screens/**`, `components/**`, `services/**`, `theme/**`, `i18n/**`, `app.json`, `package.json`, `public/**`, `.github/workflows/cloudflare-web.yml`). **Nicht** auf die reinen Landing-HTML-Pfade triggern (die gehören zu `pages.yml`).
- Steps: `actions/checkout` → `actions/setup-node` (Node-Version aus Projekt pinnen) → `npm ci` → `npm run export:web` (mit `EXPO_PUBLIC_*` aus GitHub-Secrets als Env) → Deploy von `dist/` via `cloudflare/wrangler-action` (`pages deploy dist --project-name=<projekt>`).
- Benötigte Repo-Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` + die `EXPO_PUBLIC_*`-Werte.

### B2. Alternative dokumentieren (für Tim)
- Falls Cloudflare-Pages-Git-Integration (statt GitHub Action) bevorzugt wird: im PR-Text Build-Command `npm run export:web`, Output-Dir `dist`, und die nötigen Env-Vars dokumentieren. CI-Variante (B1) ist die empfohlene, versionierte Lösung.

### Akzeptanzkriterien B
- [ ] Neuer, **separater** Workflow `cloudflare-web.yml`; `pages.yml` unverändert.
- [ ] Push mit App-Änderung baut und deployt die Web-App nach Cloudflare Pages.
- [ ] SPA-Deep-Links (z. B. `/store`, OAuth-Callback) liefern dank `_redirects` `index.html` statt 404.

---

## Teilauftrag C — Auth, CORS & Stripe-Redirects für die Web-Domain

**Problem:** Login und Stripe-Rückkehr funktionieren nur, wenn Supabase und die Functions die Web-Domain kennen.

### C1. Supabase Auth (manuell, im PR-Text als To-do für Tim)
- Cloudflare-Domain in Supabase → Auth → URL Configuration als **Site URL** + **Redirect URL** eintragen (Magic-Link, OAuth-Callback, Apple/Google).

### C2. CORS / Function-Origins
- Prüfen, dass `_shared/cors.ts` / `rejectDisallowedOrigin` die Cloudflare-Domain als erlaubte Origin führt (relevant für `stripe-create-checkout` und alle vom Web aufgerufenen Functions). Erlaubte-Origins-Liste ggf. um die Web-Domain ergänzen (per Env konfigurierbar halten).

### C3. Stripe-Redirect-URLs
- Sicherstellen, dass `WEB_APP_URL` (Edge-Function-Env von `stripe-create-checkout`) auf die Cloudflare-Domain zeigt, damit `success_url`/`cancel_url` korrekt zurückführen. Im PR-Text als Secret-To-do dokumentieren.

### Akzeptanzkriterien C
- [ ] Login (E-Mail + OAuth) funktioniert auf der Live-Cloudflare-Domain.
- [ ] `stripe-create-checkout` akzeptiert Requests von der Web-Domain (kein CORS-Block); Rückkehr landet auf der richtigen Domain.
- [ ] Nötige manuelle Supabase-/Secret-Schritte im PR-Text dokumentiert.

---

## Teilauftrag D — Domain-Strategie & Smoke-Test (Politur)

### D1. Domain klären
- Entscheiden: Landing (GitHub Pages) und Web-App (Cloudflare) auf **getrennten** Hosts (z. B. `florascout.app` = Landing, `app.florascout.app` = Web-App) — empfohlen, vermeidet Routing-Konflikte. Im PR-Text festhalten und `EXPO_PUBLIC_WEB_APP_URL` entsprechend setzen.

### D2. Smoke-Test-Checkliste (im PR-Text)
- Login → Foto hochladen → KI-Erkennung → Pflanze erscheint im Garten + korrekte Art im Dex, **kein** Entdeckungs-Reveal/Credits/Heatmap.
- Credit-Kauf (Stripe Test-Mode) → Rückkehr → Guthaben aktualisiert sich.
- Deep-Link / Reload auf Unterseite → kein 404.

### Akzeptanzkriterien D
- [ ] Domain-Strategie dokumentiert; kein Konflikt mit der Landing-Page-Pipeline.
- [ ] Smoke-Test-Checkliste abgehakt auf der Live-Domain.

---

## Reihenfolge der Umsetzung

1. **A** Build reproduzierbar + Env-Liste.
2. **B** Cloudflare-CI-Workflow (separat von `pages.yml`).
3. **C** Auth/CORS/Stripe-Redirects auf die Web-Domain.
4. **D** Domain-Strategie + Smoke-Test.

## Manuelle Schritte für Tim (im PR-Text dokumentieren)

- Cloudflare Pages-Projekt anlegen; `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` als GitHub-Secrets.
- `EXPO_PUBLIC_*`-Werte als GitHub-Secrets **und** in Cloudflare-Env hinterlegen.
- Supabase Auth Site-/Redirect-URLs auf die Web-Domain setzen.
- Edge-Function-Env `WEB_APP_URL` auf die Web-Domain setzen.
- DNS/Custom-Domain in Cloudflare konfigurieren.

## Nicht im Scope (bewusst, als Folge-Tickets)

- Web-Push-Notifications (aktuell No-op im Web).
- Maps-Provider-Key fürs Web (Heatmap im Web read-only; separate Klärung Google-JS-Key vs. MapLibre).
- Performance/Code-Splitting der schweren Screens (Folge-Ticket, falls Bundle zu groß).

## Abnahme

- [ ] Separater Cloudflare-Workflow; `pages.yml` unangetastet.
- [ ] Push auf `main` → Web-App live auf Cloudflare, SPA-Deep-Links funktionieren.
- [ ] Login, Foto/Erkennung (ohne Discovery), Stripe-Kauf end-to-end grün auf der Live-Domain.
- [ ] Keine Secrets im Bundle (nur `EXPO_PUBLIC_*`).
