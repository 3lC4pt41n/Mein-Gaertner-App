// Edge Function: User-Foto -> persoenlicher Gaertner-Avatar
// 2-Step Pipeline: GPT-4o Vision describes the person, DALL-E 3 generates the avatar
// POST Body: { base64: string, language?: string }
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import {
  getUserIdFromAuth,
  logUsage,
  CREDIT_COSTS,
  deductCreditsAtomic,
  refundCredits,
} from '../_shared/credits.ts';
import { getLanguagePromptName, getUserLanguage } from '../_shared/language.ts';
import { callOpenAI, callOpenAIImageGenerate } from '../_shared/openai.ts';
import { validateBase64, validateLanguage, validationErrorResponse } from '../_shared/validate.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { getCorsHeaders, rejectDisallowedOrigin } from '../_shared/cors.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, 'POST, OPTIONS');
  const blockedOrigin = rejectDisallowedOrigin(req, corsHeaders);
  if (blockedOrigin) return blockedOrigin;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let serviceClient: any;
  let userId: string | undefined;
  let creditsDeducted = false;
  const cost = CREDIT_COSTS.avatar;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Nicht authentifiziert' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    serviceClient = getServiceClient();
    userId = await getUserIdFromAuth(serviceClient, authHeader);
    const { base64, language: requestedLanguage } = await req.json();

    // Input-Validierung
    const vErr = validationErrorResponse([validateBase64(base64, 10_000_000)], corsHeaders);
    if (vErr) return vErr;

    if (!base64) {
      return new Response(JSON.stringify({ error: 'base64 Bild fehlt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const language = validateLanguage(requestedLanguage);

    // Rate Limiting
    const rateLimitResp = await checkRateLimit(serviceClient, userId, 'avatar', corsHeaders);
    if (rateLimitResp) return rateLimitResp;

    // Credits atomar abziehen (check + deduct in einem DB-Statement)
    let newBalance: number;
    try {
      newBalance = await deductCreditsAtomic(serviceClient, userId, cost);
      creditsDeducted = true;
    } catch (e: any) {
      if (e.code === 'INSUFFICIENT_CREDITS') {
        return new Response(
          JSON.stringify({
            error: 'Nicht genügend Credits',
            balance: e.balance,
            required: e.required,
          }),
          {
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      throw e;
    }

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
          content: `You are a portrait description assistant. Describe ONLY the person's face and head for an illustrator. Focus strictly on: approximate age, gender, skin tone, hair color and style, facial hair if any, eye color, face shape, glasses if worn, and distinctive facial features (freckles, dimples, scars, etc.). Do NOT describe clothing, pose, background, or mood. Be concise and specific. Output ONLY the description, no preamble.`,
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
      prompt: `Illustrated avatar portrait of a gardener. The person looks like this:

${personDescription}

MANDATORY outfit and props — always include ALL of these:
- A worn, earth-toned gardening apron over a simple shirt.
- Sturdy gardening gloves (one hand holding a small terracotta pot with a green seedling).
- A classic wide-brim straw sun hat.

Composition and style — follow exactly:
- Head-and-shoulders portrait, centered, looking at the viewer with a warm smile.
- Background: a lush green garden with soft bokeh (blurred leaves, flowers, sunlight).
- Art style: clean digital illustration, Pixar-inspired, slightly stylized but the face must be clearly recognizable from the description above.
- Warm golden-hour lighting from the left side.
- No text, no logo, no watermark, no extra people, no speech bubbles.
- Square 1:1 format, suitable as a round app avatar.`,
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
      .createSignedUrl(avatarPath, 60 * 60 * 24 * 30);

    if (urlError) throw urlError;

    await logUsage(serviceClient, {
      user_id: userId,
      action: 'avatar',
      prompt_tokens: visionResult.prompt_tokens,
      completion_tokens: visionResult.completion_tokens,
      total_tokens: visionResult.total_tokens,
      cost_credits: cost,
      openai_cost_usd: visionResult.cost_usd,
      model: `${visionResult.model}+${imageResult.model}`,
      metadata: { language: resolvedLanguage },
    });

    return new Response(
      JSON.stringify({
        avatar_path: avatarPath,
        avatar_url: urlData.signedUrl,
        new_balance: newBalance,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (e: any) {
    // Refund bei fehlgeschlagenem API-Call (Credits wurden bereits abgezogen)
    if (creditsDeducted && serviceClient && userId) {
      await refundCredits(serviceClient, userId, cost);
    }
    const status = e?.code === 'UNAUTHORIZED' ? 401 : 500;
    return new Response(JSON.stringify({ error: e.message || 'Unbekannter Fehler' }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
