// Edge Function: Pflanzen-Details generieren (Name → Detail-JSON)
// POST Body: { name: string, note: string }
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

    const cost = CREDIT_COSTS.plant_details;
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

    const { name, note } = await req.json();
    if (!name) {
      return new Response(JSON.stringify({ error: "Pflanzenname fehlt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Gib für die Pflanze "${name}" (Hinweis: "${note || ""}") eine verschachtelte JSON-Antwort im exakten Format unten zurück – alle Felder bitte möglichst vollständig befüllen (auf Deutsch):

{
  "overview": {
    "Deutscher Name": "...",
    "Botanischer Name": "...",
    "Familie": "...",
    "Herkunft": "...",
    "Lebensform": "...",
    "Größe": "...",
    "Blütezeit": "...",
    "Lebensdauer": "...",
    "Highlight": "..."
  },
  "care": {
    "Licht": "...",
    "Temperaturbereich": "...",
    "Luftfeuchte": "...",
    "Substrat / Boden": "...",
    "Gießen": "...",
    "Düngen": "...",
    "Schnitt": "...",
    "Umtopfen": "...",
    "Rankhilfe": "...",
    "Besondere Hinweise": "..."
  },
  "extras": {
    "Zier- & Nutzwert": "...",
    "Giftigkeit": "...",
    "Vermehrung": "...",
    "Typische Schädlinge": "...",
    "Krankheiten": "...",
    "Fun Fact / Kultur": "..."
  }
}
KEINE Kommentare, keine Erklärungen, KEIN sonstiger Text – nur das pure JSON-Objekt!`;

    const result = await callOpenAI({
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
    });

    const newBalance = await deductCredits(serviceClient, userId, cost);

    await logUsage(serviceClient, {
      user_id: userId,
      action: "plant_details",
      prompt_tokens: result.prompt_tokens,
      completion_tokens: result.completion_tokens,
      total_tokens: result.total_tokens,
      cost_credits: cost,
      openai_cost_usd: result.cost_usd,
      model: result.model,
      metadata: { plant_name: name },
    });

    let details;
    try {
      const cleaned = result.content
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      details = JSON.parse(cleaned);
    } catch {
      details = null;
    }

    return new Response(
      JSON.stringify({
        details,
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
