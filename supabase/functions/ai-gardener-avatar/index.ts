// Edge Function: User-Foto -> persoenlicher Gaertner-Avatar
// 2-Step Pipeline: GPT-4o Vision describes the person, DALL-E 3 generates the avatar
// POST Body: { base64: string, language?: string }
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { corsHeaders, getUserIdFromAuth, logUsage } from '../_shared/credits.ts';
import { getLanguagePromptName, getUserLanguage } from '../_shared/language.ts';
import { callOpenAI, callOpenAIImageGenerate } from '../_shared/openai.ts';
import { validateBase64, validateLanguage, validationErrorResponse } from '../_shared/validate.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Nicht authentifiziert' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = getServiceClient();
    const userId = await getUserIdFromAuth(serviceClient, authHeader);
    const { base64, language: requestedLanguage } = await req.json();

    // Input-Validierung
    const vErr = validationErrorResponse([validateBase64(base64, 10_000_000)]);
    if (vErr) return vErr;

    if (!base64) {
      return new Response(JSON.stringify({ error: 'base64 Bild fehlt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const language = validateLanguage(requestedLanguage);

    // Rate Limiting
    const rateLimitResp = await checkRateLimit(serviceClient, userId, 'avatar');
    if (rateLimitResp) return rateLimitResp;

    const resolvedLanguage = await getUserLanguage(serviceClient, userId, language);
    const languagePromptName = getLanguagePromptName(resolvedLanguage);

    // ----- Step 1: GPT-4o Vision — describe the person -----
    const normalizedBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
    const visionResult = await callOpenAI({
      model: 'gpt-4o',
      max_tokens: 500,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: `You are a portrait description assistant. Describe the person in the photo in vivid detail for an illustrator. Focus on: approximate age range, gender presentation, skin tone, hair color/style/length, facial hair, eye color, face shape, glasses, distinctive features (freckles, dimples, etc.), and expression. Be specific and visual. Output ONLY the description, no preamble.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${normalizedBase64}`, detail: 'low' },
            },
            { type: 'text', text: 'Describe this person for an illustrator.' },
          ],
        },
      ],
    });

    const personDescription = visionResult.content;

    // ----- Step 2: DALL-E 3 — generate illustrated gardener avatar -----
    const imageResult = await callOpenAIImageGenerate({
      model: 'dall-e-3',
      size: '1024x1024',
      quality: 'standard',
      style: 'natural',
      prompt: `Create a warm, friendly illustrated avatar portrait of a gardener with the following appearance:

${personDescription}

Style rules:
- Clean digital illustration style, slightly stylized but recognizable.
- Portrait composition: head and shoulders, centered, soft neutral or garden-themed background.
- The person is wearing casual gardening attire (e.g. sun hat, apron, gloves, or holding a small plant).
- Warm, inviting expression. Friendly and app-appropriate.
- No text, no logo, no watermark, no extra people.
- Visual language and cultural details should feel natural for ${languagePromptName}.
- Output one polished avatar illustration.`,
    });

    const bucket = 'chat-images';
    const avatarPath = `avatars/gardener_${userId}_${Date.now()}.png`;

    const { error: uploadError } = await serviceClient.storage
      .from(bucket)
      .upload(avatarPath, imageResult.image_bytes, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: urlData, error: urlError } = await serviceClient.storage
      .from(bucket)
      .createSignedUrl(avatarPath, 60 * 60 * 24 * 7);

    if (urlError) throw urlError;

    await logUsage(serviceClient, {
      user_id: userId,
      action: 'avatar',
      prompt_tokens: visionResult.prompt_tokens,
      completion_tokens: visionResult.completion_tokens,
      total_tokens: visionResult.total_tokens,
      cost_credits: 0,
      openai_cost_usd: visionResult.cost_usd,
      model: `${visionResult.model}+${imageResult.model}`,
      metadata: { language: resolvedLanguage },
    });

    return new Response(
      JSON.stringify({
        avatar_path: avatarPath,
        avatar_url: urlData.signedUrl,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Unbekannter Fehler' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
