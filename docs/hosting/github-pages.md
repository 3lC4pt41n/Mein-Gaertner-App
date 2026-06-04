# GitHub Pages fuer `florapilot.app`

Dieses Repo ist so vorbereitet, dass die Landing Page ueber GitHub Pages aus `main` deployt werden
kann. Der Workflow liegt in
[`/.github/workflows/pages.yml`](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/.github/workflows/pages.yml)
und publiziert:

- [`/index.html`](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/index.html) als Root-Entrypoint
- [`/landing-page.html`](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/landing-page.html) als
  Rueckwaerts-kompatible Weiterleitung
- [`/docs`](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/docs)
- [`/store-assets`](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/store-assets)
- [`/assets`](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/assets)

## Was du in GitHub einstellen musst

1. Repo `Settings` -> `Pages`
2. `Build and deployment`: `Source = GitHub Actions`
3. Nach dem ersten erfolgreichen Lauf optional `Custom domain = florapilot.app`
4. `Enforce HTTPS` aktivieren, sobald GitHub das Zertifikat ausgestellt hat

## Was du in Cloudflare einstellen musst

Wenn `florapilot.app` auf GitHub Pages zeigen soll, brauchst du fuer die Apex-Domain
`florapilot.app` A-Records auf die GitHub-Pages-IPs und fuer `www` einen CNAME.

Empfohlene Zielwerte laut GitHub Pages:

- `185.199.108.153`
- `185.199.109.153`
- `185.199.110.153`
- `185.199.111.153`

Und fuer `www`:

- `CNAME www -> 3lC4pt41n.github.io`

## Wichtiger Hinweis

Die Domain ist aktuell zwar an Cloudflare delegiert, loest aber noch nicht auf. Ohne die DNS-Records
geht die Seite nicht live, auch wenn der Pages-Workflow schon erfolgreich deployed.
