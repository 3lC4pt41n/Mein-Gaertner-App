// Edge Function: Chat mit Ben (Pflanzen-Coach)
// POST Body: { history: ChatMessage[], text?: string, image_url?: string, language?: string }
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
import {
  getLanguagePromptName,
  getUserLanguage,
} from "../_shared/language.ts";

function buildSystemPrompt(languagePromptName: string) {
  return `You are "Ben", a smart, witty and charming plant coach.
You are an expert in plants and gardening. You may be playful, but always respectful, friendly and encouraging.
If the user sends an image, react specifically to what is visible in that image.
Respond in chat style (like WhatsApp), concise (max 5 sentences), and strictly in ${languagePromptName}.
Use exactly one language only.`;
}

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
    const cost = CREDIT_COSTS.chat;
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

    // Body: Chat-History + neue Nachricht
    const { history = [], text, image_url, language: requestedLanguage } = await req.json();
    const language = await getUserLanguage(serviceClient, userId, requestedLanguage);
    const languagePromptName = getLanguagePromptName(language);
    const systemPrompt = buildSystemPrompt(languagePromptName);

    // Chat-Nachrichten aufbauen
    const chatMessages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    // Letzte 10 Nachrichten aus History
    for (const msg of history.slice(-10)) {
      if (msg.image_url) {
        chatMessages.push({
          role: msg.sender === "user" ? "user" : "assistant",
          content: [
            ...(msg.content && msg.content !== "[Bild]"
              ? [{ type: "text", text: msg.content }]
              : []),
            { type: "image_url", image_url: { url: msg.image_url } },
          ],
        });
      } else {
        chatMessages.push({
          role: msg.sender === "user" ? "user" : "assistant",
          content: msg.content,
        });
      }
    }

    // Neue Nachricht (Text und/oder Bild)
    if (image_url) {
      chatMessages.push({
        role: "user",
        content: [
          { type: "text", text: text || "Was ist das auf dem Bild?" },
          { type: "image_url", image_url: { url: image_url } },
        ],
      });
    } else if (text) {
      chatMessages.push({ role: "user", content: text });
    }

    // OpenAI Call
    const result = await callOpenAI({
      messages: chatMessages,
      temperature: 0.7,
      max_tokens: 500,
    });

    // Credits abziehen
    const newBalance = await deductCredits(serviceClient, userId, cost);

    // Usage loggen
    await logUsage(serviceClient, {
      user_id: userId,
      action: "chat",
      prompt_tokens: result.prompt_tokens,
      completion_tokens: result.completion_tokens,
      total_tokens: result.total_tokens,
      cost_credits: cost,
      openai_cost_usd: result.cost_usd,
      model: result.model,
      metadata: { language },
    });

    return new Response(
      JSON.stringify({
        content: result.content,
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
