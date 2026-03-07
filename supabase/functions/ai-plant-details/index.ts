// Edge Function: Pflanzen-Details generieren (Name → Detail-JSON)
// POST Body: { name: string, note: string }
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { callOpenAI } from '../_shared/openai.ts';
import {
  CREDIT_COSTS,
  deductCreditsAtomic,
  refundCredits,
  logUsage,
  getUserIdFromAuth,
} from '../_shared/credits.ts';
import {
  getLanguagePromptName,
  getUserLanguage,
  type SupportedLanguage,
} from '../_shared/language.ts';
import { validateText, validateLanguage, validationErrorResponse } from '../_shared/validate.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { getCorsHeaders, rejectDisallowedOrigin } from '../_shared/cors.ts';

const DETAILS_SCHEMA_BY_LANGUAGE: Record<SupportedLanguage, string> = {
  de: `{
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
}`,
  en: `{
  "overview": {
    "Common Name": "...",
    "Botanical Name": "...",
    "Family": "...",
    "Origin": "...",
    "Growth Type": "...",
    "Size": "...",
    "Blooming Season": "...",
    "Lifespan": "...",
    "Highlight": "..."
  },
  "care": {
    "Light": "...",
    "Temperature Range": "...",
    "Humidity": "...",
    "Soil / Substrate": "...",
    "Watering": "...",
    "Fertilizing": "...",
    "Pruning": "...",
    "Repotting": "...",
    "Support / Trellis": "...",
    "Special Notes": "..."
  },
  "extras": {
    "Ornamental / Practical Value": "...",
    "Toxicity": "...",
    "Propagation": "...",
    "Common Pests": "...",
    "Diseases": "...",
    "Fun Fact / Culture": "..."
  }
}`,
  fr: `{
  "overview": {
    "Nom commun": "...",
    "Nom botanique": "...",
    "Famille": "...",
    "Origine": "...",
    "Type de croissance": "...",
    "Taille": "...",
    "Période de floraison": "...",
    "Durée de vie": "...",
    "Atout principal": "..."
  },
  "care": {
    "Lumière": "...",
    "Plage de température": "...",
    "Humidité": "...",
    "Substrat / Sol": "...",
    "Arrosage": "...",
    "Fertilisation": "...",
    "Taille": "...",
    "Rempotage": "...",
    "Tuteur / Support": "...",
    "Remarques spéciales": "..."
  },
  "extras": {
    "Valeur ornementale / utilitaire": "...",
    "Toxicité": "...",
    "Multiplication": "...",
    "Ravageurs fréquents": "...",
    "Maladies": "...",
    "Info intéressante / culture": "..."
  }
}`,
  it: `{
  "overview": {
    "Nome comune": "...",
    "Nome botanico": "...",
    "Famiglia": "...",
    "Origine": "...",
    "Tipo di crescita": "...",
    "Dimensioni": "...",
    "Periodo di fioritura": "...",
    "Durata di vita": "...",
    "Punto forte": "..."
  },
  "care": {
    "Luce": "...",
    "Intervallo di temperatura": "...",
    "Umidità": "...",
    "Substrato / Terreno": "...",
    "Irrigazione": "...",
    "Concimazione": "...",
    "Potatura": "...",
    "Rinvaso": "...",
    "Sostegno / Tutore": "...",
    "Note speciali": "..."
  },
  "extras": {
    "Valore ornamentale / pratico": "...",
    "Tossicità": "...",
    "Propagazione": "...",
    "Parassiti comuni": "...",
    "Malattie": "...",
    "Curiosità / cultura": "..."
  }
}`,
  es: `{
  "overview": {
    "Nombre común": "...",
    "Nombre botánico": "...",
    "Familia": "...",
    "Origen": "...",
    "Tipo de crecimiento": "...",
    "Tamaño": "...",
    "Época de floración": "...",
    "Vida útil": "...",
    "Punto destacado": "..."
  },
  "care": {
    "Luz": "...",
    "Rango de temperatura": "...",
    "Humedad": "...",
    "Sustrato / Suelo": "...",
    "Riego": "...",
    "Fertilización": "...",
    "Poda": "...",
    "Trasplante": "...",
    "Soporte / Tutor": "...",
    "Notas especiales": "..."
  },
  "extras": {
    "Valor ornamental / práctico": "...",
    "Toxicidad": "...",
    "Propagación": "...",
    "Plagas comunes": "...",
    "Enfermedades": "...",
    "Dato curioso / cultura": "..."
  }
}`,
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, 'POST, OPTIONS');
  const blockedOrigin = rejectDisallowedOrigin(req, corsHeaders);
  if (blockedOrigin) return blockedOrigin;

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

    const { name, note, language: requestedLanguage } = await req.json();

    // Input-Validierung (VOR Credit-Abzug)
    const vErr = validationErrorResponse(
      [validateText(name, 200, 'name'), validateText(note, 500, 'note')],
      corsHeaders
    );
    if (vErr) return vErr;

    if (!name) {
      return new Response(JSON.stringify({ error: 'Pflanzenname fehlt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const language = validateLanguage(requestedLanguage);

    // Rate Limiting (vor Credit-Abzug)
    const rateLimitResp = await checkRateLimit(
      serviceClient,
      userId,
      'plant_details',
      corsHeaders
    );
    if (rateLimitResp) return rateLimitResp;

    // Credits atomar abziehen (check + deduct in einem DB-Statement)
    const cost = CREDIT_COSTS.plant_details;
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
    const schema = DETAILS_SCHEMA_BY_LANGUAGE[resolvedLanguage];

    const prompt = `Create plant details for "${name}" (hint: "${note || ''}") and return ONLY one JSON object in EXACTLY this schema:

${schema}

Rules:
- Write all content strictly in ${languagePromptName}.
- Output one language only (no bilingual text, no translations).
- Keep top-level keys exactly: overview, care, extras.
- No markdown, no comments, no explanations.`;

    let result;
    try {
      result = await callOpenAI({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
      });
    } catch (e) {
      await refundCredits(serviceClient, userId, cost);
      throw e;
    }

    await logUsage(serviceClient, {
      user_id: userId,
      action: 'plant_details',
      prompt_tokens: result.prompt_tokens,
      completion_tokens: result.completion_tokens,
      total_tokens: result.total_tokens,
      cost_credits: cost,
      openai_cost_usd: result.cost_usd,
      model: result.model,
      metadata: { plant_name: name, language: resolvedLanguage },
    });

    let details;
    try {
      const cleaned = result.content
        .replace(/```json/g, '')
        .replace(/```/g, '')
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (e: any) {
    const status = e?.code === 'UNAUTHORIZED' ? 401 : 500;
    return new Response(JSON.stringify({ error: e.message || 'Unbekannter Fehler' }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
