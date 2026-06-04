# Stripe-Einrichtung FloraPilot (Web-Käufe)

Stand: abgeglichen gegen die Edge Functions `stripe-create-checkout`, `stripe-webhook`,
`stripe-create-portal` und `_shared/creditPackages.ts`.

Stripe wird **nur für Web-Käufe** genutzt (app.florapilot.app). Native App = RevenueCat.

> Hinweis: Das Stripe-Dashboard lässt sich nicht per Automatisierung bedienen
> (Sicherheitssperre für Zahlungsplattformen). Darum dieses Runbook + Skript zum
> Selbermachen. Secrets niemals committen.

---

## Was der Code erwartet (Single Source of Truth)

Beträge & Credits stehen im Code (`_shared/creditPackages.ts`). Die **Credits werden
serverseitig aus dem Code vergeben**, nicht aus Stripe — die Stripe-Preise bestimmen nur,
was der Kunde **zahlt**. Beträge müssen daher übereinstimmen.

| Package          | Typ       | Betrag  | Credits | Env-Variable (Price-ID)         |
| ---------------- | --------- | ------- | ------- | ------------------------------- |
| credits_starter  | Einmalig  | 5,99 €  | 150     | `STRIPE_PRICE_CREDITS_STARTER`  |
| credits_standard | Einmalig  | 14,99 € | 450     | `STRIPE_PRICE_CREDITS_STANDARD` |
| credits_pro      | Einmalig  | 29,99 € | 1000    | `STRIPE_PRICE_CREDITS_PRO`      |
| sub_hobby        | Abo/Monat | 3,59 €  | 200     | `STRIPE_PRICE_SUB_HOBBY`        |
| sub_gaertner     | Abo/Monat | 9,49 €  | 600     | `STRIPE_PRICE_SUB_GAERTNER`     |
| sub_profi        | Abo/Monat | 14,99 € | 1200    | `STRIPE_PRICE_SUB_PROFI`        |

Wichtig:

- **Alle 6 brauchen echte Price-IDs.** Der Checkout setzt `managed_payments[enabled]=true`
  (Preview-API `2026-03-04.preview`); dadurch wird auch für Einmal-Credits eine Price-ID
  erzwungen. Falls dein Stripe-Account „Managed Payments" nicht hat und der Checkout
  fehlschlägt: Supabase-Secret `STRIPE_MANAGED_PAYMENTS_ENABLED=false` setzen → klassischer
  Checkout mit denselben Price-IDs.
- `metadata[package]` wird vom Checkout selbst auf Session/Subscription/PaymentIntent gesetzt
  (nicht aus dem Stripe-Produkt gelesen). Produkt-Metadaten sind also optional, nur zur
  Übersicht im Dashboard.

---

## 1. Branding (Dashboard)

Stripe-Dashboard → **Settings**:

- **Business → Public details**: Public business name = `FloraPilot`,
  Support-E-Mail = `tim.mergenthaler@florapilot.app`, Support-URL/Website = `https://florapilot.app`.
- **Branding** (Settings → Branding): Logo/Icon + Akzentfarbe; wird im Checkout & Portal genutzt.
- Produkt-Namen prüfen (siehe unten, beginnen mit „FloraPilot …").
- Sandbox/Test-Konto ggf. umbenennen → `FloraPilot Sandbox`.
- Sicherstellen: nirgends mehr „FloraPilot" sichtbar.

---

## 2. Produkte & Prices anlegen — CLI-Skript

Voraussetzung: [Stripe CLI](https://stripe.com/docs/stripe-cli) installiert, dann `stripe login`.
Das Skript läuft im **Live-Mode** (`--live`). Für Test-Mode `--live` überall entfernen.

```bash
#!/usr/bin/env bash
set -euo pipefail
LIVE="--live"   # für Test-Mode: LIVE=""

# package | name | unit_amount(cents) | interval(month|"" für einmalig)
ROWS=(
  "credits_starter|FloraPilot Starter Credits|599|"
  "credits_standard|FloraPilot Standard Credits|1499|"
  "credits_pro|FloraPilot Pro Credits|2999|"
  "sub_hobby|FloraPilot Hobby Abo|359|month"
  "sub_gaertner|FloraPilot Gärtner Abo|949|month"
  "sub_profi|FloraPilot Profi Abo|1499|month"
)

declare -A ENV_NAME=(
  [credits_starter]=STRIPE_PRICE_CREDITS_STARTER
  [credits_standard]=STRIPE_PRICE_CREDITS_STANDARD
  [credits_pro]=STRIPE_PRICE_CREDITS_PRO
  [sub_hobby]=STRIPE_PRICE_SUB_HOBBY
  [sub_gaertner]=STRIPE_PRICE_SUB_GAERTNER
  [sub_profi]=STRIPE_PRICE_SUB_PROFI
)

echo "# ---- Price-IDs (in Supabase Secrets eintragen) ----"
for row in "${ROWS[@]}"; do
  IFS='|' read -r pkg name amount interval <<< "$row"

  product_id=$(stripe products create $LIVE \
    --name "$name" \
    -d "metadata[package]=$pkg" \
    | grep -o '"id": *"[^"]*"' | head -1 | sed 's/.*"\(prod_[^"]*\)".*/\1/')

  if [ -n "$interval" ]; then
    price_id=$(stripe prices create $LIVE \
      --product "$product_id" --currency eur --unit-amount "$amount" \
      -d "recurring[interval]=$interval" \
      -d "metadata[package]=$pkg" \
      | grep -o '"id": *"price_[^"]*"' | head -1 | sed 's/.*"\(price_[^"]*\)".*/\1/')
  else
    price_id=$(stripe prices create $LIVE \
      --product "$product_id" --currency eur --unit-amount "$amount" \
      -d "metadata[package]=$pkg" \
      | grep -o '"id": *"price_[^"]*"' | head -1 | sed 's/.*"\(price_[^"]*\)".*/\1/')
  fi

  echo "${ENV_NAME[$pkg]}=$price_id"
done
```

Das Skript gibt am Ende einen fertigen Block mit allen 6 `STRIPE_PRICE_*`-Werten aus.
Wenn `jq` installiert ist, kannst du statt der `grep|sed`-Zeilen sauberer
`... | jq -r '.id'` verwenden.

---

## 3. Webhook anlegen

Endpoint-URL (Live-Projekt `mein-gaertner-app`):

```
https://tsllrwaixvhuadrfsskt.supabase.co/functions/v1/stripe-webhook
```

Events (genau diese 8, vom Code ausgewertet):

```
checkout.session.completed
checkout.session.async_payment_succeeded
invoice.payment_succeeded
invoice.paid
payment_intent.succeeded
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

Per CLI (gibt das Signing Secret `whsec_...` zurück):

```bash
stripe webhook_endpoints create --live \
  --url "https://tsllrwaixvhuadrfsskt.supabase.co/functions/v1/stripe-webhook" \
  --enabled-events checkout.session.completed \
  --enabled-events checkout.session.async_payment_succeeded \
  --enabled-events invoice.payment_succeeded \
  --enabled-events invoice.paid \
  --enabled-events payment_intent.succeeded \
  --enabled-events customer.subscription.created \
  --enabled-events customer.subscription.updated \
  --enabled-events customer.subscription.deleted
```

Das ausgegebene `whsec_...` → Supabase-Secret `STRIPE_WEBHOOK_SECRET`.
(Der Webhook ist erreichbar: `verify_jwt=false` ist gesetzt, das Gateway blockt Stripe nicht.)

---

## 4. Supabase Secrets setzen

Edge-Function-Secrets im **Live-Projekt** `tsllrwaixvhuadrfsskt`:

```bash
supabase secrets set --project-ref tsllrwaixvhuadrfsskt \
  STRIPE_SECRET_KEY=sk_live_xxx \
  STRIPE_WEBHOOK_SECRET=whsec_xxx \
  STRIPE_PRICE_CREDITS_STARTER=price_xxx \
  STRIPE_PRICE_CREDITS_STANDARD=price_xxx \
  STRIPE_PRICE_CREDITS_PRO=price_xxx \
  STRIPE_PRICE_SUB_HOBBY=price_xxx \
  STRIPE_PRICE_SUB_GAERTNER=price_xxx \
  STRIPE_PRICE_SUB_PROFI=price_xxx \
  WEB_APP_URL=https://app.florapilot.app
```

Optional:

- `STRIPE_API_VERSION=2026-03-04.preview` (Default ist bereits dieser Wert)
- `STRIPE_MANAGED_PAYMENTS_ENABLED=false` (nur falls Managed Payments im Account fehlt)
- `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` (sonst sinnvolle Defaults auf app.florapilot.app)

Alternativ im Dashboard: Supabase → Edge Functions → **Secrets**.
**Secrets nie ins Repo committen.** Test- und Live-Keys strikt getrennt halten.

---

## 5. Customer Portal aktivieren (Dashboard)

Stripe → **Settings → Billing → Customer portal**, im Live-Mode aktivieren:

- Zahlungsmethode aktualisieren: **an**
- Abo kündigen: **an**
- Rechnungs-/Zahlungshistorie: **an**
- Default-Return-URL: `https://app.florapilot.app`

(`stripe-create-portal` erstellt Portal-Sessions; ohne aktivierte Portal-Konfiguration
liefert Stripe einen Fehler.)

---

## 6. End-to-End-Test

> Im Live-Mode ist das eine echte Zahlung — danach in Stripe erstattbar.
> Sauberer wäre derselbe Durchlauf vorab im Test-Mode mit Testkarte `4242…`.

1. In der Web-App (app.florapilot.app) einloggen.
2. Einmal-Credits kaufen → Credits steigen, in `transactions`/`credit_*` ein Eintrag,
   Idempotenz via `provider_transaction_id`.
3. Monatsabo kaufen → Zeile in `subscriptions` mit
   `plan/status/stripe_customer_id/stripe_subscription_id`, Credits gutgeschrieben.
4. Settings → „Abonnement verwalten" → Stripe-Portal öffnet (Return-URL app.florapilot.app).
5. Im Portal kündigen → Webhook (`customer.subscription.deleted`) setzt `status=cancelled`.

Beobachten: Logs der Function `stripe-webhook` (Supabase → Edge Functions → Logs).
Hauptaugenmerk: Abo-**Erstgutschrift** kommt über `invoice.payment_succeeded` und hängt
an `subscription_details.metadata` — falls Credits beim ersten Abo-Kauf nicht erscheinen,
hier ansetzen.

---

## 7. Go-Live-Check

- [ ] Live-Produkte/Prices vorhanden, Beträge korrekt (siehe Tabelle)
- [ ] Live-Secrets in Supabase gesetzt (Secret-Key, Webhook-Secret, 6 Price-IDs, WEB_APP_URL)
- [ ] Live-Webhook aktiv, alle 8 Events, Signing-Secret gesetzt
- [ ] Customer Portal im Live-Mode aktiv, Return-URL gesetzt
- [ ] Eine echte Mini-Transaktion getestet + ggf. erstattet
- [ ] Branding final: kein „FloraPilot" mehr sichtbar (Business-Name, Checkout, Portal, Mails)

---

## Im Code geprüft / angepasst

- `creditPackages.ts`, `stripe-create-checkout`, `stripe-webhook`: Beträge/Credits/Events/
  Mapping stimmen mit dieser Spezifikation überein.
- DB: RPC `credit_purchase(...)` und Tabelle `subscriptions` (inkl. Stripe-Spalten,
  `UNIQUE(user_id)`) vorhanden und passend.
- **Fix:** `stripe-create-portal` cachte die Stripe-Customer-ID per Upsert ohne `plan`
  (NOT NULL) → bei reinen Credits-Käufern hätte „Abo verwalten" gefehlschlagen. Jetzt
  UPDATE-only. Wird beim nächsten Function-Deploy aktiv.
