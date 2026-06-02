# Codex-Auftrag: Web-Monetarisierung (Credit-Verkauf im Web via Stripe)

## Ausgangslage (warum dieser Auftrag)

Die Web-App (siehe `docs/WEB_APP_PLAN.md`) bringt volle Feature-Parität — inklusive Shop. Im Web ist RevenueCat aber das falsche Werkzeug: Käufe im Browser laufen besser über einen eigenen Checkout. Das ist nicht nur technisch sauberer, sondern auch **wirtschaftlich** der Hebel:

- **In-App-Kauf (iOS/Android):** Store-Provision 15 % (Apple Small Business Program, < 1 Mio USD/Jahr) bis 30 %; Google ~15–20 % im 2026er-Modell.
- **Web-Kauf (Stripe):** nur PSP-Gebühr (~1,5–3 %). Apple-Guideline **3.1.3(b) „Multiplatform Services"** erlaubt ausdrücklich, dass im Web gekaufte Credits in der App verbraucht werden — sofern dieselben Credits *auch* als IAP angeboten werden.

**Was schon existiert (und wiederverwendet wird):**

- RPC `public.credit_purchase(p_user_id, p_provider_transaction_id, p_package, p_credits, p_amount_eur, p_type)` — `SECURITY DEFINER`, **idempotent** via `UNIQUE(transactions.provider_transaction_id)`, schreibt Transaktion + erhöht `credit_balances`. (Migration `20260529095500_fix_credit_purchase_idempotency.sql`.)
- Webhook `supabase/functions/revenucat-webhook/index.ts` mit der **Paket-Definition** (`PACKAGES` / `SUB_PLANS`) und dem Aufruf der RPC.
- Client: `services/creditService.js` (`fetchBalance`, Usage/Transactions), `services/purchaseService.js` (RevenueCat), `screens/StoreScreen.js`.

**Kernidee dieses Auftrags:** Ein Stripe-Checkout-Pfad fürs Web, der **dieselbe** `credit_purchase`-RPC trifft (mit `provider_transaction_id = Stripe-Session/PaymentIntent-ID`). RevenueCat bleibt für iOS/Android unverändert. Zwei Vertriebswege, ein Gutschrift-Backend.

Dieser Auftrag liefert das in **drei Pflichtteilen (A, B, C)** und **einem Politur-Teil (D)**.

## Regeln

- Code-Kommentare und UI-Texte auf **Deutsch**; alle neuen Strings in **alle** `i18n/locales/*.json` (vollständig, kein Hardcoding).
- React Native + Expo (Web via `react-native-web`), Supabase Edge Functions (Deno/TS), Stripe.
- **Backward-compatible:** Der RevenueCat-Pfad (Mobile) darf nicht brechen. Die `credit_purchase`-RPC wird **nicht** in ihrer Signatur geändert.
- **Single source of truth für Pakete:** Die Paket-/Preis-Definition wird aus dem RevenueCat-Webhook in ein geteiltes Modul extrahiert und von beiden Webhooks genutzt. Keine doppelten, divergierenden Preislisten.
- **Idempotenz ist Pflicht:** Stripe sendet Webhooks mehrfach. Jede Gutschrift muss exakt einmal erfolgen (über `provider_transaction_id`).
- **Secrets nur serverseitig:** Stripe-Secret-Key und Webhook-Signing-Secret leben ausschließlich in Edge-Function-Env (Supabase Secrets), **nie** im Web-Bundle. Im Bundle nur `EXPO_PUBLIC_*` (Publishable Key).
- Keine Mock-Daten. **Reduce, reduce, reduce.**

---

## Teilauftrag A — Pakete als geteilte Quelle + Stripe-Checkout-Function

**Problem:** Pakete sind aktuell nur im RevenueCat-Webhook hartkodiert. Der Web-Pfad braucht dieselbe Liste, inkl. EUR-Preis (den der RevenueCat-Webhook bisher nicht zwingend kennt).

### A1. NEU: `supabase/functions/_shared/creditPackages.ts`
- Exportiert eine zentrale Definition aller Kauf-Pakete. **Preise und Credit-Mengen sind verbindlich identisch zum bestehenden Mobile-Shop** (Quelle bisher: `PACKAGES`-Map im RevenueCat-Webhook für Credits + RevenueCat-Produktkonfiguration für die EUR-Preise; `services/pricingConfig.js` deckt nur die KI-Verbrauchskosten ab, nicht die Paketpreise):
  ```ts
  // One-Time-Credit-Packs (ohne Abo, nie ablaufend)
  export const CREDIT_PACKAGES = {
    credits_starter:  { credits: 150,  amountEur: 5.99,  type: 'one_time' },  // ~4.0 ct/Credit
    credits_standard: { credits: 450,  amountEur: 14.99, type: 'one_time' },  // ~3.3 ct/Credit – "Bestes Angebot"
    credits_pro:      { credits: 1000, amountEur: 29.99, type: 'one_time' },  // ~3.0 ct/Credit – "10% günstiger"
  } as const;

  // Monats-Abos (für spätere Web-Subscription-Phase, nicht in v1-Scope)
  export const SUB_PACKAGES = {
    sub_hobby:    { credits: 200,  amountEur: 3.59,  type: 'subscription' },  // 1.8 ct/Credit
    sub_gaertner: { credits: 600,  amountEur: 9.49,  type: 'subscription' },  // 1.6 ct/Credit – "Beliebt"
    sub_profi:    { credits: 1200, amountEur: 14.99, type: 'subscription' },  // 1.2 ct/Credit
  } as const;
  ```
- `revenucat-webhook/index.ts` so umbauen, dass es `CREDIT_PACKAGES` (und `SUB_PACKAGES`/`SUB_PLANS`) aus `_shared` importiert statt eigener Konstanten. **Verhalten und Credit-Mengen bleiben identisch.**
- **Konsistenz-Check:** Die hier definierten `credits`/`amountEur` müssen mit `services/pricingConfig.js` und der bestehenden `PACKAGES`-Map im RevenueCat-Webhook übereinstimmen. Web und Mobile zeigen denselben Preis für dasselbe Paket.

### A2. NEU: `supabase/functions/stripe-create-checkout/index.ts`
- Authentifizierte Function (JWT des eingeloggten Users wird geprüft → `user_id`).
- Input: `{ package: 'credits_starter' | ... }`.
- Erzeugt eine **Stripe Checkout Session** (`mode: 'payment'`) mit:
  - `line_items` aus `CREDIT_PACKAGES[package]` (Preis in Cent, EUR).
  - `client_reference_id = user_id` und `metadata = { user_id, package }` — damit der Webhook gutschreiben kann.
  - `success_url` / `cancel_url` auf die Cloudflare-Web-Domain.
- Output: `{ url }` → Client leitet dorthin weiter.
- Stripe-Key aus `Deno.env.get('STRIPE_SECRET_KEY')`.

### Akzeptanzkriterien A (Abnahme)
- [ ] `revenucat-webhook` nutzt die geteilte `CREDIT_PACKAGES` und verhält sich unverändert (Mobile-Kauf schreibt weiter korrekt gut).
- [ ] `stripe-create-checkout` liefert für ein gültiges Paket eine Checkout-URL; ungültiges Paket → 400.
- [ ] Ohne gültiges JWT → 401. `user_id` landet in `client_reference_id` **und** `metadata`.

---

## Teilauftrag B — Stripe-Webhook → bestehende `credit_purchase`-RPC

**Problem:** Nach erfolgreicher Zahlung müssen Credits gutgeschrieben werden — idempotent, ohne den Mobile-Pfad zu duplizieren.

### B1. NEU: `supabase/functions/stripe-webhook/index.ts`
- Verifiziert die **Stripe-Signatur** (`Stripe-Signature`-Header + `STRIPE_WEBHOOK_SECRET`). Ungültige Signatur → 400, **keine** Gutschrift.
- Reagiert auf `checkout.session.completed` (und defensiv `payment_intent.succeeded`).
- Liest `user_id` + `package` aus `metadata`, ermittelt `credits`/`amountEur`/`type` aus `CREDIT_PACKAGES`.
- Ruft mit dem **Service-Role-Client** die bestehende RPC:
  ```ts
  await serviceClient.rpc('credit_purchase', {
    p_user_id: userId,
    p_provider_transaction_id: `stripe_${session.id}`, // dedupe-key
    p_package: pkg,
    p_credits: credits,
    p_amount_eur: amountEur,
    p_type: type,
  });
  ```
- **Idempotenz:** Doppelte Webhooks werden über `UNIQUE(provider_transaction_id)` in `credit_purchase` automatisch verworfen → loggen, 200 zurückgeben.

### B2. Provider-Kennzeichnung (optional, empfohlen)
- Damit Stripe- und RevenueCat-Transaktionen unterscheidbar sind: entweder Präfix im `provider_transaction_id` (`stripe_…` vs. RevenueCat-IDs) **oder** Migration, die `transactions.provider TEXT` ergänzt. Variante mit Präfix ist minimal-invasiv und bevorzugt; falls `provider`-Spalte gewünscht, separate, additive Migration.

### Akzeptanzkriterien B (Abnahme)
- [ ] Testzahlung (Stripe Test-Mode) schreibt **exakt** die paketgemäße Credit-Menge gut; `credit_balances` und `transactions` korrekt.
- [ ] Webhook ohne/mit falscher Signatur schreibt **nichts** gut (400).
- [ ] Doppelter Webhook für dieselbe Session → **keine** doppelte Gutschrift (idempotent), 200.
- [ ] RevenueCat-Mobile-Käufe weiterhin unbeeinflusst.

---

## Teilauftrag C — Web-Shop-UI (StoreScreen Web-Split)

**Problem:** `StoreScreen.js` nutzt RevenueCat (`purchaseService`). Im Web gibt es kein RevenueCat-Produktangebot.

### C1. Plattform-Split im Kauf-Pfad
- `purchaseService` um eine Web-Implementierung erweitern (oder `purchaseService.web.js`): Statt RevenueCat-Purchase ruft die Web-Variante `stripe-create-checkout` auf und macht `window.location.href = url` (bzw. `Linking.openURL`).
- `StoreScreen` rendert plattformneutral; Paketliste kommt aus derselben Quelle (Anzeigepreise aus `CREDIT_PACKAGES` bzw. i18n).
- Nach Rückkehr von Stripe (`success_url`) lädt der Screen das Guthaben neu (`fetchBalance`) — Hinweis: Gutschrift ist webhook-getrieben, kann minimal verzögert sein → kurzer „wird verbucht…"-Zustand + Re-Fetch/Polling für wenige Sekunden.

### C2. Mobile unverändert
- Auf iOS/Android bleibt der RevenueCat-Pfad exakt wie bisher. Keine Stripe-Buttons im nativen Build.

### Akzeptanzkriterien C (Abnahme)
- [ ] Im Web führt „Credits kaufen" zum Stripe-Checkout; nach Zahlung erscheint das erhöhte Guthaben (nach Re-Fetch/kurzes Polling).
- [ ] Auf iOS/Android erscheint **kein** Stripe-Pfad; RevenueCat unverändert.
- [ ] Paketpreise/-namen kommen aus einer Quelle (keine divergierenden Listen Web vs. Mobile).

---

## Teilauftrag D — Region-gated Steering-Hinweis in der App (Politur)

**Problem:** Der wirtschaftliche Vorteil entsteht erst, wenn Mobile-User vom günstigeren Web-Kauf erfahren — aber Apple/Google erlauben den Hinweis/Link nur in bestimmten Regionen (US nach Epic-Urteil, EU unter DMA). Falsch platziert = Review-Ablehnung.

### D1. Feature-Flag + Region-Gate
- Über das bestehende `featureFlags`-Muster ein Flag `webPurchaseSteering` einführen, **default aus**.
- Nur wenn aktiv **und** Region erlaubt (US/EU — Quelle: Store-Region/Locale, konservativ), im `StoreScreen` einen dezenten Hinweis „Credits auch im Web günstiger erhältlich" mit Link zur Web-Domain rendern.
- Kein Hinweis, wenn unklar → im Zweifel **nicht** anzeigen (Review-Sicherheit vor Umsatz).

### Akzeptanzkriterien D (Abnahme)
- [ ] Steering-Hinweis erscheint nur bei aktivem Flag **und** erlaubter Region; sonst nie.
- [ ] Default-Zustand (Flag aus) = identisches Verhalten wie heute, kein Review-Risiko.

---

## Reihenfolge der Umsetzung

1. **A1** Pakete extrahieren (`_shared/creditPackages.ts`) — Fundament, RC-Webhook umstellen.
2. **A2 + B1** Stripe-Checkout + Webhook → `credit_purchase`. Im Stripe-Test-Mode end-to-end grün bekommen.
3. **C** Web-Shop-UI an den Checkout anbinden.
4. **D** Steering-Hinweis (zuletzt, defensiv, flag-gated).

## Manuelle Schritte für Tim (im PR-Text dokumentieren)

- Stripe-Account + Produkte/Preise (oder Inline-Preise) anlegen; **Test- und Live-Keys**.
- Supabase Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Web-Bundle: `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (falls Stripe.js genutzt wird; bei reinem Checkout-Redirect nicht nötig).
- Stripe-Webhook-Endpoint auf die `stripe-webhook`-Function-URL zeigen lassen.
- Stripe-Produkte/-Preise exakt zu `CREDIT_PACKAGES` anlegen: Starter 5,99 € / Standard 14,99 € / Pro 29,99 € (Beträge in Cent: 599 / 1499 / 2999, Währung EUR).
- Apple Small Business Program prüfen/anmelden (15 % statt 30 %), falls noch nicht geschehen.

## Nicht im Scope (bewusst, als Folge-Tickets)

- Abos im Web (nur One-Time-Credit-Packs in v1; `SUB_PLANS`/Stripe-Subscriptions später).
- Rechnungs-/USt-Handling, Stripe Tax, Kleinunternehmer-Logik — separat klären.
- Refund-/Chargeback-Rückbuchung von Credits (Folge-Ticket).
- Endgültige rechtliche Bewertung der Steering-Regeln pro Region (Anwalt; Rechtslage 2025/2026 in Bewegung).

## Abnahme

- [ ] Stripe-Test-Kauf im Web schreibt korrekt + idempotent Credits gut; Mobile/RevenueCat unverändert.
- [ ] Eine geteilte Paketquelle; keine doppelten Preislisten.
- [ ] Secrets nur serverseitig; Signatur-Verifikation greift.
- [ ] Steering-Hinweis standardmäßig aus, region-gated.
- [ ] Neue Strings in allen `i18n/locales/*.json`.
