# Cloudflare Pages fuer die Web-App

Die Marketing- und Rechtsseiten bleiben auf GitHub Pages. Die Expo-Web-App wird separat ueber Cloudflare Pages ausgeliefert.

## Domain-Strategie

- Landing: `https://florapilot.app` und optional `https://www.florapilot.app`
- Web-App: `https://app.florapilot.app`
- Cloudflare Pages Preview/Default: `https://florascout-web.pages.dev`

Diese Trennung vermeidet Routing-Konflikte zwischen statischer Landingpage und der Expo-SPA.

## GitHub Actions Deployment

Der Workflow `.github/workflows/cloudflare-web.yml` baut bei App-Aenderungen die Expo-Web-App und deployt `dist/` nach Cloudflare Pages.

Cloudflare Pages Projekt:

- Project name: `florascout-web`
- Production branch: `main`
- Build command: `npm run export:web`
- Output directory: `dist`
- Node version: `24.13.0`

Benoetigte GitHub Secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_WEB_APP_URL=https://app.florapilot.app`

Optionaler Legacy-Fallback im Code:

- `EXPO_PUBLIC_SUPABASE_ANON_KEY` wird nur als Fallback gelesen, falls `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` fehlt. Fuer neue Deployments nicht setzen, sondern den Publishable Key verwenden.

## Alternative: Cloudflare Git Integration

Falls Cloudflare Pages direkt mit GitHub verbunden wird statt ueber GitHub Actions:

- Build command: `npm run export:web`
- Output directory: `dist`
- Node version: `24.13.0`
- Environment variables: dieselben `EXPO_PUBLIC_*` Werte wie oben

Die GitHub-Action ist bevorzugt, weil der Build- und Deploy-Pfad versioniert im Repo liegt.

## Supabase und Stripe

Supabase Auth URL Configuration:

- Site URL: `https://app.florapilot.app`
- Redirect URLs:
  - `https://app.florapilot.app`
  - `https://app.florapilot.app/*`
  - `https://florascout-web.pages.dev`
  - `https://florascout-web.pages.dev/*`

Supabase Edge Function Secrets:

- `WEB_APP_URL=https://app.florapilot.app`
- `ALLOWED_WEB_ORIGINS=http://localhost:19006,http://localhost:8081,http://localhost:3000,https://3lc4pt41n.github.io,https://florapilot.app,https://www.florapilot.app,https://app.florapilot.app,https://florascout.app,https://www.florascout.app,https://app.florascout.app,https://florascout-web.pages.dev`

Stripe:

- In Test und Live muessen `success_url` und `cancel_url` ueber `WEB_APP_URL` auf die Web-App zurueckfuehren.
- Live-Betrieb braucht eigene Live-Produkte/Prices, Live-Keys und einen Live-Webhook.

## Smoke-Test

Auf `https://app.florapilot.app` pruefen:

- Login per E-Mail und OAuth.
- Reload/Deep-Link auf einer App-Unterseite fuehrt nicht zu 404.
- Foto hochladen, KI-Erkennung starten, Pflanze erscheint im Garten und im Dex.
- Keine Discovery-Reveal-/Credit-/Heatmap-Nebenwirkungen bei normaler Erkennung.
- Stripe Test-Mode: Credit-Kauf starten, Checkout abschliessen, Rueckkehr in die App, Guthaben aktualisiert sich.
- Web-Abo Test-Mode: Abo starten, erste Gutschrift und `subscriptions.plan/status` pruefen.
