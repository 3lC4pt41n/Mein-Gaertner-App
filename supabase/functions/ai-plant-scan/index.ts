// Edge Function: Pflanze erkennen (Foto → Name + Hinweis)
// POST Body: { base64: string } (base64-kodiertes Bild)
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getServiceClient } from "../_shared/supabase-client.ts";
import { callOpenAI } from "../_shared/openai.ts";
import {
  CREDIT_COSTS,
  deductCreditsAtomic,
  refundCredits,
  logUsage,
  corsHeaders,
  getUserIdFromAuth,
} from "../_shared/credits.ts";
import {
  getLanguagePromptName,
  getUserLanguage,
} from "../_shared/language.ts";

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

    // Body parsen
    const { base64, language: requestedLanguage } = await req.json();

    // Credits atomar abziehen (check + deduct in einem DB-Statement)
    const cost = CREDIT_COSTS.plant_scan;
    let newBalance: number;
    try {
      newBalance = await deductCreditsAtomic(serviceClient, userId, cost);
    } catch (e: any) {
      if (e.code === "INSUFFICIENT_CREDITS") {
        return new Response(
          JSON.stringify({ error: "Nicht genügend Credits", balance: e.balance, required: e.required }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      throw e;
    }
    if (!base64) {
      return new Response(JSON.stringify({ error: "base64 Bild fehlt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const language = await getUserLanguage(serviceClient, userId, requestedLanguage);
    const languagePromptName = getLanguagePromptName(language);

    // OpenAI Call: Pflanze erkennen
    let result;
    try {
      result = await callOpenAI({
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Identify the plant in this photo and return JSON in exactly this format:
{
  "name": "Botanical name",
  "note": "One concise care tip sentence"
}
Rules:
- Write the note in ${languagePromptName}.
- Output one language only, no extra text.
- If uncertain, still provide your best estimate.`,
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
    } catch (e) {
      await refundCredits(serviceClient, userId, cost);
      throw e;
    }

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
      metadata: { language },
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
