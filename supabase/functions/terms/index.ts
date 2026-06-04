import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const HTML = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nutzungsbedingungen – FloraPilot</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.7; color: #1d1d1f; background: #f5f5f7; padding: 2rem 1rem;
      }
      .container {
        max-width: 680px; margin: 0 auto; background: #fff; padding: 2.5rem;
        border-radius: 14px; border: 1px solid #e5e5ea;
      }
      h1 { font-size: 26px; letter-spacing: -0.02em; margin-bottom: 0.5rem; }
      .subtitle { color: #6e6e73; font-size: 14px; margin-bottom: 2rem; }
      h2 { font-size: 18px; margin-top: 1.8rem; margin-bottom: 0.6rem; letter-spacing: -0.01em; }
      p, li { margin-bottom: 0.6rem; font-size: 15px; }
      ul { padding-left: 1.5rem; margin-bottom: 0.8rem; }
      a { color: #2e7d32; text-decoration: none; }
      .footer {
        margin-top: 2rem; padding-top: 1.2rem; border-top: 1px solid #e5e5ea;
        color: #9b9ba0; font-size: 12px; text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Nutzungsbedingungen</h1>
      <p class="subtitle">FloraPilot – Dein smarter Pflanzenbegleiter</p>

      <h2>1. Geltungsbereich</h2>
      <p>Diese Nutzungsbedingungen gelten für die Nutzung der App „FloraPilot" (im Folgenden „App") von Tim Mergenthaler (im Folgenden „Anbieter"). Mit der Registrierung und Nutzung der App akzeptierst du diese Bedingungen.</p>

      <h2>2. Leistungsbeschreibung</h2>
      <p>Die App bietet Funktionen zur Pflanzenverwaltung, KI-gestützten Pflanzenerkennung, Pflegeplanung, ein Gamification-System und einen KI-Chat-Assistenten. Einige Funktionen erfordern Credits, die über In-App-Käufe erworben werden können.</p>

      <h2>3. Registrierung und Konto</h2>
      <p>Für die Nutzung ist ein Benutzerkonto erforderlich. Du bist für die Sicherheit deiner Zugangsdaten verantwortlich. Jede Person darf nur ein Konto erstellen.</p>

      <h2>4. Credits und In-App-Käufe</h2>
      <ul>
        <li>Credits werden für KI-gestützte Funktionen (Scans, Healthchecks, Chat) benötigt.</li>
        <li>Gekaufte Credits verfallen nicht und sind nicht erstattungsfähig, sofern nicht gesetzlich vorgeschrieben.</li>
        <li>Abonnements verlängern sich automatisch, sofern sie nicht vor Ablauf der aktuellen Periode gekündigt werden.</li>
        <li>Käufe werden über den Apple App Store bzw. Google Play Store abgewickelt. Es gelten die jeweiligen Store-Bedingungen.</li>
      </ul>

      <h2>5. KI-Funktionen</h2>
      <p>Die KI-gestützten Funktionen (Pflanzenerkennung, Healthcheck, Chat) nutzen maschinelles Lernen und liefern Einschätzungen, keine garantiert korrekten Ergebnisse. Die App ersetzt keine professionelle botanische oder landwirtschaftliche Beratung.</p>

      <h2>6. Nutzungspflichten</h2>
      <p>Du verpflichtest dich, die App nur für ihren bestimmungsgemäßen Zweck zu nutzen. Insbesondere ist es untersagt:</p>
      <ul>
        <li>Die App oder ihre Inhalte für kommerzielle Zwecke ohne Genehmigung zu nutzen</li>
        <li>Automatisierte Zugriffe (Scraping, Bots) auf die App durchzuführen</li>
        <li>Inhalte hochzuladen, die gegen geltendes Recht verstoßen</li>
      </ul>

      <h2>7. Haftungsbeschränkung</h2>
      <p>Der Anbieter haftet nicht für Schäden, die durch die Nutzung der App oder die Befolgung von KI-Empfehlungen entstehen. Die Nutzung der App erfolgt auf eigenes Risiko. Pflanzenpflege-Empfehlungen sind unverbindlich.</p>

      <h2>8. Kontolöschung</h2>
      <p>Du kannst dein Konto jederzeit in den App-Einstellungen löschen. Nach der Löschung werden alle personenbezogenen Daten innerhalb von 30 Tagen entfernt. Aktive Abonnements müssen separat im jeweiligen App Store gekündigt werden.</p>

      <h2>9. Änderungen</h2>
      <p>Der Anbieter behält sich vor, diese Nutzungsbedingungen zu aktualisieren. Wesentliche Änderungen werden innerhalb der App mitgeteilt. Die weitere Nutzung nach Inkrafttreten gilt als Zustimmung.</p>

      <h2>10. Anwendbares Recht</h2>
      <p>Es gilt das Recht der Bundesrepublik Deutschland. Gerichtsstand ist der Wohnsitz des Anbieters, soweit gesetzlich zulässig.</p>

      <h2>11. Kontakt</h2>
      <p>Bei Fragen zu diesen Nutzungsbedingungen: <a href="mailto:tim.mergenthaler@florapilot.app">tim.mergenthaler@florapilot.app</a></p>

      <div class="footer">Stand: März 2026 · © FloraPilot – Tim Mergenthaler</div>
    </div>
  </body>
</html>`;

serve((req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    });
  }

  return new Response(HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400',
    },
  });
});
