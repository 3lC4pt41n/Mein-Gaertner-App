// Edge Function: User-Foto -> persoenlicher Gaertner-Avatar
// POST Body: { base64: string, language?: string }
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getServiceClient } from "../_shared/supabase-client.ts";
import {
  corsHeaders,
  getUserIdFromAuth,
  logUsage,
} from "../_shared/credits.ts";
import {
  getLanguagePromptName,
  getUserLanguage,
} from "../_shared/language.ts";
import { callOpenAIImageEdit } from "../_shared/openai.ts";

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
    const { base64, language: requestedLanguage } = await req.json();

    if (!base64) {
      return new Response(JSON.stringify({ error: "base64 Bild fehlt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const language = await getUserLanguage(serviceClient, userId, requestedLanguage);
    const languagePromptName = getLanguagePromptName(language);

    const imageResult = await callOpenAIImageEdit({
      image_base64: base64,
      size: "1024x1024",
      prompt: `Create a clean illustrated avatar of this person as a friendly modern gardener.
Style rules:
- Portrait, head and shoulders, centered, neutral background.
- Keep facial identity and key traits recognizable.
- Make it friendly, warm and app-appropriate.
- No text, no logo, no watermark, no extra people.
- Output one final polished avatar image only.
- Visual language and details should feel natural for ${languagePromptName}.`,
    });

    const bucket = "chat-images";
    const avatarPath = `avatars/gardener_${userId}_${Date.now()}.png`;

    const { error: uploadError } = await serviceClient.storage
      .from(bucket)
      .upload(avatarPath, imageResult.image_bytes, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: urlData, error: urlError } = await serviceClient.storage
      .from(bucket)
      .createSignedUrl(avatarPath, 60 * 60 * 24 * 7);

    if (urlError) throw urlError;

    await logUsage(serviceClient, {
      user_id: userId,
      action: "avatar",
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost_credits: 0,
      openai_cost_usd: 0,
      model: imageResult.model,
      metadata: { language },
    });

    return new Response(
      JSON.stringify({
        avatar_path: avatarPath,
        avatar_url: urlData.signedUrl,
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
