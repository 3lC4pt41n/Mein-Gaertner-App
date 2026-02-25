// Edge Function: Pflanze erkennen (Foto → Name + Hinweis)
// POST Body: { base64: string } (base64-kodiertes Bild)
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

serve(async (req) => {
  // CORS Preflight
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
    const cost = CREDIT_COSTS.plant_scan;
    const { balance, sufficient } = await checkBalance(serviceClient, userId, cost);

    if (!sufficient) {
      return new Response(
        JSON.stringify({
          error: "Nicht genügend Credits",
          balance,
          required: cost,
        }),
        {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Body parsen
    const { base64 } = await req.json();
    if (!base64) {
      return new Response(JSON.stringify({ error: "base64 Bild fehlt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // OpenAI Call: Pflanze erkennen
    const result = await callOpenAI({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Erkenne die Pflanze auf diesem Foto und gib die Antwort im folgenden JSON-Format zurück:
{
  "name": "Botanischer Name",
  "note": "Pflegehinweis in einem Satz"
}
Sprich auf Deutsch. Wenn du unsicher bist, gib trotzdem die beste Schätzung.`,
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${base64}` },
            },
          ],
        },
      ],
      max_tokens: 600,
    });

    // Credits abziehen
    const newBalance = await deductCredits(serviceClient, userId, cost);

    // Usage loggen
    await logUsage(serviceClient, {
      user_id: userId,
      action: "plant_scan",
      prompt_tokens: result.prompt_tokens,
      completion_tokens: result.completion_tokens,
      total_tokens: result.total_tokens,
      cost_credits: cost,
      openai_cost_usd: result.cost_usd,
      model: result.model,
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
      parsed = { name: "Nicht erkannt", note: result.content };
    }

    return new Response(
      JSON.stringify({
        ...parsed,
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
