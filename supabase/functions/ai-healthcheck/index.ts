// Edge Function: Healthcheck (Pflanzenbild → Gesundheitsbewertung)
// POST Body: { image_url: string, plant_name?: string }
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getServiceClient } from "../_shared/supabase-client.ts";
import { callOpenAI } from "../_shared/openai.ts";
import {
  CREDIT_COSTS,
  checkBalance,
  deductCredits,
  logUsage,
  corsHeaders,
  getUserIdFromAuth,
} from "../_shared/credits.ts";

const HC_PROMPT = `Analysiere das bereitgestellte Pflanzenfoto und führe einen **Pflanzengesundheits-Check** durch. Gib AUSSCHLIESSLICH das folgende JSON zurück:

{
  "healthscore": <Ganzzahl 0-100, gewichtetes Mittel der Bewertungen>,
  "table": [
    { "Kriterium": "Blattfarbe & -struktur",   "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "Schädlingsbefall",         "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "Blattintegrität",          "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "Wuchsform & Standfestigkeit", "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "Topf- zu Pflanzengröße",   "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "Substrat & Oberfläche",    "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "Gesamtpflege-Anzeichen",   "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" }
  ],
  "summary": "<2-3 Sätze zur Gesamteinschätzung>",
  "recommendation": "<max. 2 Sätze mit konkreten Pflegetipps>"
}

Bewertungsskala: 0 = kritisch, 100 = exzellent. **Nur das JSON zurückgeben, keine Kommentare, keine Erklärung, keine Formatierung.**`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Nicht authentifiziert" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = getServiceClient();
    const userId = await getUserIdFromAuth(serviceClient, authHeader);

    // Credits prüfen
    const cost = CREDIT_COSTS.healthcheck;
    const { balance, sufficient } = await checkBalance(serviceClient, userId, cost);

    if (!sufficient) {
      return new Response(
        JSON.stringify({ error: "Nicht genügend Credits", balance, required: cost }),
        {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { image_url, plant_name } = await req.json();
    if (!image_url) {
      return new Response(JSON.stringify({ error: "image_url fehlt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // OpenAI Call
    const messages: any[] = [
      { role: "user", content: HC_PROMPT },
      {
        role: "user",
        content: [
          ...(plant_name
            ? [{ type: "text", text: `Die Pflanze heißt: ${plant_name}` }]
            : []),
          { type: "image_url", image_url: { url: image_url } },
        ],
      },
    ];

    const result = await callOpenAI({
      messages,
      max_tokens: 1200,
    });

    // Credits abziehen
    const newBalance = await deductCredits(serviceClient, userId, cost);

    // Usage loggen
    await logUsage(serviceClient, {
      user_id: userId,
      action: "healthcheck",
      prompt_tokens: result.prompt_tokens,
      completion_tokens: result.completion_tokens,
      total_tokens: result.total_tokens,
      cost_credits: cost,
      openai_cost_usd: result.cost_usd,
      model: result.model,
      metadata: { plant_name },
    });

    // Antwort parsen
    let parsed;
    try {
      const cleaned = result.content
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = null;
    }

    return new Response(
      JSON.stringify({
        healthcheck: parsed,
        balance: newBalance,
        credits_used: cost,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message || "Unbekannter Fehler" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
