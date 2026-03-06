// Edge Function: Healthcheck (Pflanzenbild → Gesundheitsbewertung)
// POST Body: { image_url: string, plant_name?: string }
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { callOpenAI } from '../_shared/openai.ts';
import {
  CREDIT_COSTS,
  deductCreditsAtomic,
  refundCredits,
  logUsage,
  corsHeaders,
  getUserIdFromAuth,
} from '../_shared/credits.ts';
import {
  getLanguagePromptName,
  getUserLanguage,
  type SupportedLanguage,
} from '../_shared/language.ts';
import {
  validateImageUrl,
  validateText,
  validateLanguage,
  validationErrorResponse,
} from '../_shared/validate.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

const HEALTHCHECK_CRITERIA: Record<SupportedLanguage, string[]> = {
  de: [
    'Blattfarbe & -struktur',
    'Schädlingsbefall',
    'Blattintegrität',
    'Wuchsform & Standfestigkeit',
    'Topf- zu Pflanzengröße',
    'Substrat & Oberfläche',
    'Gesamtpflege-Anzeichen',
  ],
  en: [
    'Leaf color & texture',
    'Pest infestation',
    'Leaf integrity',
    'Growth form & stability',
    'Pot size vs plant size',
    'Substrate & surface',
    'Overall care indicators',
  ],
  fr: [
    'Couleur et texture des feuilles',
    'Infestation de ravageurs',
    'Intégrité des feuilles',
    'Port de la plante et stabilité',
    'Taille du pot vs taille de la plante',
    'Substrat et surface',
    "Signes globaux d'entretien",
  ],
  it: [
    'Colore e struttura delle foglie',
    'Infestazione da parassiti',
    'Integrità delle foglie',
    'Portamento e stabilità',
    'Dimensione vaso vs dimensione pianta',
    'Substrato e superficie',
    'Indicatori generali di cura',
  ],
  es: [
    'Color y textura de las hojas',
    'Plagas',
    'Integridad de las hojas',
    'Forma de crecimiento y estabilidad',
    'Tamaño de maceta vs tamaño de planta',
    'Sustrato y superficie',
    'Indicadores generales de cuidado',
  ],
};

function buildHealthcheckPrompt(language: SupportedLanguage, languagePromptName: string) {
  const c = HEALTHCHECK_CRITERIA[language];
  return `Analyze the provided plant photo and run a plant health check. Return ONLY this JSON:

{
  "healthscore": <Ganzzahl 0-100, gewichtetes Mittel der Bewertungen>,
  "table": [
    { "Kriterium": "${c[0]}", "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "${c[1]}", "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "${c[2]}", "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "${c[3]}", "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "${c[4]}", "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "${c[5]}", "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "${c[6]}", "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" }
  ],
  "summary": "<2-3 sentences total assessment>",
  "recommendation": "<max 2 sentences with specific care tips>"
}

Rules:
- Write all user-facing text values in ${languagePromptName}.
- Use only one language.
- Keep all JSON keys exactly as shown.
- Rating scale: 0 = critical, 100 = excellent.
- Return only valid JSON (no markdown, comments or explanation).`;
}

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

    const { image_url, plant_name, language: requestedLanguage } = await req.json();

    // Input-Validierung (VOR Credit-Abzug)
    const vErr = validationErrorResponse([
      validateImageUrl(image_url),
      validateText(plant_name, 200, 'plant_name'),
    ]);
    if (vErr) return vErr;

    if (!image_url) {
      return new Response(JSON.stringify({ error: 'image_url fehlt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const language = validateLanguage(requestedLanguage);

    // Rate Limiting (vor Credit-Abzug)
    const rateLimitResp = await checkRateLimit(serviceClient, userId, 'healthcheck');
    if (rateLimitResp) return rateLimitResp;

    // Credits atomar abziehen (check + deduct in einem DB-Statement)
    const cost = CREDIT_COSTS.healthcheck;
    let newBalance: number;
    try {
      newBalance = await deductCreditsAtomic(serviceClient, userId, cost);
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
    const healthcheckPrompt = buildHealthcheckPrompt(resolvedLanguage, languagePromptName);

    // OpenAI Call
    const messages: any[] = [
      { role: 'user', content: healthcheckPrompt },
      {
        role: 'user',
        content: [
          ...(plant_name ? [{ type: 'text', text: `Die Pflanze heißt: ${plant_name}` }] : []),
          { type: 'image_url', image_url: { url: image_url } },
        ],
      },
    ];

    let result;
    try {
      result = await callOpenAI({
        messages,
        max_tokens: 1200,
      });
    } catch (e) {
      await refundCredits(serviceClient, userId, cost);
      throw e;
    }

    // Usage loggen
    await logUsage(serviceClient, {
      user_id: userId,
      action: 'healthcheck',
      prompt_tokens: result.prompt_tokens,
      completion_tokens: result.completion_tokens,
      total_tokens: result.total_tokens,
      cost_credits: cost,
      openai_cost_usd: result.cost_usd,
      model: result.model,
      metadata: { plant_name, language: resolvedLanguage },
    });

    // Antwort parsen
    let parsed;
    try {
      const cleaned = result.content
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = null;
    }

    // Guard: wenn Parsing fehlschlägt oder healthscore fehlt → Credits refunden + Fehler
    if (!parsed || typeof parsed.healthscore !== 'number') {
      await refundCredits(serviceClient, userId, cost);
      return new Response(
        JSON.stringify({
          error: 'Healthcheck konnte nicht ausgewertet werden – bitte erneut versuchen.',
          balance: newBalance + cost,
          credits_used: 0,
        }),
        {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        healthcheck: parsed,
        balance: newBalance,
        credits_used: cost,
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
