import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Datenschutzerklärung – Digitaler Gärtner</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1d1d1f; background: #f5f5f7; line-height: 1.7; padding: 32px 16px;
    }
    .container { max-width: 680px; margin: 0 auto; background: #fff; border-radius: 14px;
      border: 1px solid #e5e5ea; padding: 36px 32px; }
    h1 { font-size: 26px; letter-spacing: -0.02em; margin-bottom: 8px; }
    .subtitle { color: #6e6e73; font-size: 14px; margin-bottom: 28px; }
    h2 { font-size: 18px; margin: 24px 0 8px; letter-spacing: -0.01em; }
    p, li { font-size: 15px; color: #1d1d1f; margin-bottom: 12px; }
    ul { padding-left: 20px; }
    a { color: #2E7D32; text-decoration: none; }
    .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e5ea;
      color: #9b9ba0; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🌱 Datenschutzerklärung</h1>
    <p class="subtitle">Digitaler Gärtner – Dein smarter Pflanzenbegleiter</p>

    <h2>1. Verantwortlicher</h2>
    <p>Tim Ergenthaler<br />E-Mail: timergenthaler@gmail.com</p>

    <h2>2. Welche Daten wir erheben</h2>
    <p>Wenn du „Digitaler Gärtner" nutzt, verarbeiten wir folgende Daten:</p>
    <ul>
      <li><strong>Kontodaten:</strong> E-Mail-Adresse und Passwort (verschlüsselt gespeichert) bei der Registrierung.</li>
      <li><strong>Profildaten:</strong> Name, bevorzugte Sprache und optionales Profilbild.</li>
      <li><strong>Pflanzendaten:</strong> Informationen zu deinen Pflanzen (Name, Standort, Fotos, Pflegehinweise).</li>
      <li><strong>Kamerabilder:</strong> Fotos, die du zur KI-Pflanzenerkennung aufnimmst. Diese werden zur Analyse an OpenAI übermittelt und nicht dauerhaft gespeichert.</li>
      <li><strong>Chat-Verlauf:</strong> Nachrichten mit dem KI-Assistenten werden zur Verbesserung des Gesprächskontexts gespeichert.</li>
      <li><strong>Push-Token:</strong> Geräte-Token für Benachrichtigungen (z. B. Pflege-Erinnerungen).</li>
      <li><strong>Kaufdaten:</strong> In-App-Käufe werden über RevenueCat verarbeitet. Wir speichern keine Zahlungsinformationen.</li>
    </ul>

    <h2>3. Zweck der Verarbeitung</h2>
    <ul>
      <li>Bereitstellung der App-Funktionen (Pflanzenverwaltung, KI-Erkennung, Aufgaben)</li>
      <li>Authentifizierung und Kontosicherheit</li>
      <li>Versand von Pflege-Erinnerungen per Push-Benachrichtigung</li>
      <li>Verwaltung von Abonnements und Käufen</li>
    </ul>

    <h2>4. Dienste Dritter</h2>
    <ul>
      <li><strong>Supabase</strong> (EU/US) – Datenbank, Authentifizierung und Dateispeicher. <a href="https://supabase.com/privacy">Datenschutz</a></li>
      <li><strong>OpenAI</strong> (US) – KI-Pflanzenerkennung und Chat-Assistent. Bilder und Texte werden über eine API verarbeitet. <a href="https://openai.com/privacy">Datenschutz</a></li>
      <li><strong>RevenueCat</strong> (US) – Verwaltung von In-App-Käufen und Abonnements. <a href="https://www.revenuecat.com/privacy">Datenschutz</a></li>
      <li><strong>Expo / EAS</strong> (US) – App-Distribution und Over-the-Air-Updates. <a href="https://expo.dev/privacy">Datenschutz</a></li>
    </ul>

    <h2>5. Speicherdauer</h2>
    <p>Deine Daten werden gespeichert, solange du ein aktives Konto hast. Nach Löschung deines Kontos werden alle personenbezogenen Daten innerhalb von 30 Tagen entfernt.</p>

    <h2>6. Deine Rechte</h2>
    <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung und Datenübertragbarkeit. Kontaktiere uns unter <a href="mailto:timergenthaler@gmail.com">timergenthaler@gmail.com</a>.</p>

    <h2>7. Kinder</h2>
    <p>Die App richtet sich nicht an Kinder unter 16 Jahren. Wir erheben wissentlich keine Daten von Minderjährigen.</p>

    <h2>8. Änderungen</h2>
    <p>Wir können diese Datenschutzerklärung aktualisieren. Die aktuelle Version ist immer unter dieser URL abrufbar.</p>

    <div class="footer">
      Stand: März 2026 · © Digitaler Gärtner
    </div>
  </div>
</body>
</html>`;

serve((req: Request) => {
  // Support CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  }

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400",
    },
  });
});
