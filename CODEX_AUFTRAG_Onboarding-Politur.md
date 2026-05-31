# Codex-Auftrag: Onboarding formvollenden (Abbrüche & Store-Blocker schließen)

## Ausgangslage (warum dieser Auftrag)
Der Onboarding-Flow ist `AuthScreen → ProfileCompleteScreen (Username + Sprache) → OnboardingScreen → App`. Die hinteren Schritte sind sauber (Onboarding skippbar, Avatar optional, Draft-Cache). Im **Auth-Schritt** stecken aber zwei echte Trichter-Lecks — eines ist ein iOS-Store-Blocker:

1. **E-Mail-Bestätigung ohne „erneut senden"** → Sackgasse, wenn Mail fehlt/abläuft (`screens/AuthScreen.js:227`).
2. **Kein Sign in with Apple**, obwohl Google-OAuth angeboten wird → Apple Guideline 4.8 = sichere Review-Ablehnung; zusätzlich iOS-Friktion.
3. Username-Eindeutigkeit nicht inline geprüft → roher DB-Fehler im Alert.
4. Kein AGB/Datenschutz-Link am Auth-Screen.

Dieser Auftrag schließt das in **zwei Pflichtteilen (A, B)** und **zwei Politur-Teilen (C, D)**.

## Regeln
- Code-Kommentare und UI-Texte auf **Deutsch**; alle neuen Strings in **alle** `i18n/locales/*.json` (de, tr, ru, … — vollständig, kein Hardcoding).
- React Native + Expo, Supabase Auth. **Reduce, reduce, reduce.** Keine Mock-Daten.
- **Backward-compatible**: bestehende Login-/Signup-Pfade dürfen nicht brechen.
- Betroffene Datei primär: `screens/AuthScreen.js`. Apple braucht zusätzlich App-Config + Supabase-Provider.

---

## Teilauftrag A — Resend-Confirmation (größtes Abbruch-Leck)
**Problem:** Nach `signUp` zeigt `handleSignup` (`AuthScreen.js:207`) nur `auth.confirmSentMessage`. Kommt die Mail nicht an oder läuft der Link ab, ist der Nutzer ohne Ausweg.

### A1. State + UI
- Nach erfolgreichem `signUp` einen Zustand `awaitingConfirmation = true` (+ gemerkte `email`) setzen, statt nur einen Alert zu zeigen.
- In diesem Zustand einen Hinweis-Block rendern: „Bestätigungsmail an {email} gesendet" + **Button „Mail erneut senden"** + Link „E-Mail-Adresse ändern" (zurück zum Formular).

### A2. Resend-Logik
- Button ruft `supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: oauthRedirectTo } })`.
- **Rate-Limit-Schutz im UI**: nach Klick 60 s Cooldown (Countdown im Button-Label), damit kein Doppel-Spam / Supabase-429.
- Fehler über das bestehende `isNetworkError`-Muster + Alert behandeln; Erfolg: kurze Bestätigung.

### Akzeptanzkriterien A (Abnahme)
- [ ] Nach Signup erscheint ein „Mail erneut senden"-Button statt nur eines Alerts.
- [ ] Resend triggert nachweislich eine neue Mail; Button ist 60 s gesperrt (Countdown sichtbar).
- [ ] „E-Mail ändern" führt sauber zurück ins Formular, kein State-Leak.
- [ ] Funktioniert auf iOS, Android **und** Web.

---

## Teilauftrag B — Sign in with Apple (iOS-Store-Blocker)
**Problem:** Nur `handleGoogleLogin` (`AuthScreen.js:261`) existiert. Apple verlangt bei Drittanbieter-Login zwingend auch Apple-Login.

### B1. Implementierung
- `handleAppleLogin` analog zu `handleGoogleLogin` bauen: bevorzugt natives `expo-apple-authentication` (`AppleAuthentication.signInAsync`) und das Identity-Token an `supabase.auth.signInWithIdToken({ provider: 'apple', token })` geben. Fallback (Android/Web): `supabase.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: oauthRedirectTo, skipBrowserRedirect: !isWeb } })`.
- **Apple-Button nur auf iOS rendern** (`Platform.OS === 'ios'`), gemäß Apple-HIG-Style (schwarzer Button, Apple-Logo), platziert direkt beim Google-Button.
- Fehler-/Netzwerk-Handling über das vorhandene Muster.

### B2. Konfiguration (im Brief mitliefern, Codex setzt um soweit Code)
- `app.config.js`: `expo-apple-authentication` Plugin + `usesAppleSignIn: true` (iOS).
- Supabase Dashboard: Apple-Provider aktivieren (Service ID, Key) — **manueller Schritt**, im PR-Text als To-do für Tim dokumentieren.

### Akzeptanzkriterien B (Abnahme)
- [ ] Auf iOS erscheint ein „Sign in with Apple"-Button; Login erzeugt eine gültige Supabase-Session.
- [ ] Button erscheint **nicht** auf Android.
- [ ] `app.config.js` enthält Plugin + `usesAppleSignIn`; PR dokumentiert die nötige Supabase-Provider-Konfiguration.
- [ ] Apple-Review-Anforderung 4.8 erfüllt (Apple gleichwertig zu Google platziert).

---

## Teilauftrag C — Username-Konflikt sauber abfangen (Politur)
**Problem:** `handleSave` in `screens/ProfileCompleteScreen.js:204` zeigt bei Unique-Verletzung den rohen DB-Fehler.

- Vor dem Insert/Update optional gegen `profiles` prüfen, **mindestens** aber den Postgres-Fehlercode `23505` (unique_violation) abfangen und in eine freundliche Meldung übersetzen: „Dieser Name ist schon vergeben — bitte einen anderen wählen."
- Keine sonstige Logikänderung.

### Akzeptanzkriterien C
- [ ] Vergebener Username → klare deutsche Meldung, kein roher DB-Text, kein Crash.

---

## Teilauftrag D — AGB/Datenschutz-Link am Auth-Screen (Politur/DSGVO)
- Unter den Auth-Buttons eine dezente Zeile: „Mit der Anmeldung akzeptierst du AGB und Datenschutz" mit zwei Links.
- Links auf die bestehenden Edge-Function-Seiten `terms` und `privacy-policy` (siehe `supabase/functions/`) bzw. die Live-URLs; per `Linking.openURL` öffnen.
- Strings in alle Locales.

### Akzeptanzkriterien D
- [ ] AGB- und Datenschutz-Link am Auth-Screen sichtbar und funktionierend (alle Plattformen).

---

## Reihenfolge der Umsetzung
1. **A** (Resend) — reiner Client, sofortiger Funnel-Gewinn.
2. **C** + **D** (kleine Politur, geringes Risiko).
3. **B** (Apple) — höchster Aufwand wegen Config/Provider, aber Launch-kritisch für iOS.

## Nicht im Scope (als Folge-Tickets)
- Magic-Link / passwortloser Login.
- Gast-Modus.
- Onboarding-A/B-Test / Analytics-Events auf Funnel-Schritten.

## Abnahme
Abnahme durch Claude je Teilauftrag gegen die obigen Kriterien. Client-Verhalten wird über Code-Review + Plattform-Verhalten geprüft; der Apple-Provider-Schritt (Supabase Dashboard) bleibt als manuelle Bestätigung bei Tim. Ein Teilauftrag gilt erst als abgenommen, wenn **alle** seine Kriterien grün sind.
