// Edge Function: Pflanzen-Details generieren (Name → Detail-JSON)
// POST Body: { name: string, note?: string, language?: string, species_id?: string }
//
// Phase 2: Cache-first mit species_details-Tabelle
// - Bei Cache-Hit: sofort zurückgeben, 0 Credits
// - Bei Cache-Miss: LLM-Call + Write-Through in species_details
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

// ── Detail-Schema pro Sprache (inkl. Russisch) ─────────────────────────

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
  ru: `{
  "overview": {
    "Народное название": "...",
    "Ботаническое название": "...",
    "Семейство": "...",
    "Происхождение": "...",
    "Жизненная форма": "...",
    "Размер": "...",
    "Период цветения": "...",
    "Продолжительность жизни": "...",
    "Особенность": "..."
  },
  "care": {
    "Свет": "...",
    "Температурный диапазон": "...",
    "Влажность воздуха": "...",
    "Субстрат / Почва": "...",
    "Полив": "...",
    "Удобрение": "...",
    "Обрезка": "...",
    "Пересадка": "...",
    "Опора": "...",
    "Особые указания": "..."
  },
  "extras": {
    "Декоративная / Практическая ценность": "...",
    "Токсичность": "...",
    "Размножение": "...",
    "Типичные вредители": "...",
    "Болезни": "...",
    "Интересный факт": "..."
  }
}`,
};

// ── Helpers ──────────────────────────────────────────────────────────────

function jsonResponse(
  body: Record<string, any>,
  corsHeaders: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Resolve species_id from direct input or by canonical_name lookup.
 * Returns { speciesId, canonical } or null if species not found.
 */
async function resolveSpecies(
  serviceClient: any,
  speciesIdInput: string | undefined,
  plantName: string
): Promise<{ speciesId: string; canonical: string } | null> {
  // 1. Direkt per species_id
  if (speciesIdInput) {
    const { data } = await serviceClient
      .from('species')
      .select('id, canonical_name')
      .eq('id', speciesIdInput)
      .maybeSingle();
    if (data) return { speciesId: data.id, canonical: data.canonical_name };
  }

  // 2. Fallback: canonical_name Lookup
  const canonical = plantName.trim().toLowerCase();
  if (!canonical) return null;

  const { data } = await serviceClient
    .from('species')
    .select('id, canonical_name')
    .eq('canonical_name', canonical)
    .maybeSingle();

  return data ? { speciesId: data.id, canonical: data.canonical_name } : null;
}

/**
 * Cache-Lookup in species_details.
 */
async function getCachedDetails(
  serviceClient: any,
  speciesId: string,
  language: SupportedLanguage
): Promise<any | null> {
  const { data } = await serviceClient
    .from('species_details')
    .select('details')
    .eq('species_id', speciesId)
    .eq('language', language)
    .maybeSingle();

  return data?.details ?? null;
}

/**
 * Write-Through: Upsert Details in species_details-Cache.
 * ON CONFLICT → DO NOTHING (erster Schreiber gewinnt).
 */
async function writeCacheEntry(
  serviceClient: any,
  speciesId: string,
  language: SupportedLanguage,
  details: any,
  model: string
): Promise<void> {
  const { error } = await serviceClient.from('species_details').upsert(
    {
      species_id: speciesId,
      language,
      details,
      model,
      schema_version: 1,
      generated_at: new Date().toISOString(),
      generated_by: 'ai',
    },
    { onConflict: 'species_id,language', ignoreDuplicates: true }
  );

  if (error) {
    // Non-critical: Cache-Write scheitert → nächster User generiert erneut
    console.error('species_details cache write failed:', error.message);
  }
}

// ── Main Handler ────────────────────────────────────────────────────────

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
      return jsonResponse({ error: 'Nicht authentifiziert' }, corsHeaders, 401);
    }

    const serviceClient = getServiceClient();
    const userId = await getUserIdFromAuth(serviceClient, authHeader);

    const {
      name,
      note,
      language: requestedLanguage,
      species_id: speciesIdInput,
    } = await req.json();

    // Input-Validierung (VOR Credit-Abzug)
    const vErr = validationErrorResponse(
      [validateText(name, 200, 'name'), validateText(note, 500, 'note')],
      corsHeaders
    );
    if (vErr) return vErr;

    if (!name) {
      return jsonResponse({ error: 'Pflanzenname fehlt' }, corsHeaders, 400);
    }

    const language = validateLanguage(requestedLanguage);
    const resolvedLanguage = await getUserLanguage(serviceClient, userId, language);

    // ── Step 1: Species auflösen ──────────────────────────────────────

    const species = await resolveSpecies(serviceClient, speciesIdInput, name);

    // ── Step 2: Cache-Lookup (VOR Credits, VOR Rate-Limit) ────────────

    if (species) {
      const cached = await getCachedDetails(serviceClient, species.speciesId, resolvedLanguage);
      if (cached) {
        // Cache-Hit → sofort zurück, 0 Credits
        // Balance trotzdem lesen für UI-Konsistenz
        const { data: balRow } = await serviceClient
          .from('credit_balances')
          .select('balance')
          .eq('user_id', userId)
          .maybeSingle();

        return jsonResponse({
          details: cached,
          balance: balRow?.balance ?? 0,
          credits_used: 0,
          source: 'dex_cache',
        }, corsHeaders);
      }
    }

    // ── Step 3: Cache-Miss → Rate Limit + Credits ─────────────────────

    const rateLimitResp = await checkRateLimit(
      serviceClient,
      userId,
      'plant_details',
      corsHeaders
    );
    if (rateLimitResp) return rateLimitResp;

    const cost = CREDIT_COSTS.plant_details;
    let newBalance: number;
    try {
      newBalance = await deductCreditsAtomic(serviceClient, userId, cost);
    } catch (e: any) {
      if (e.code === 'INSUFFICIENT_CREDITS') {
        return jsonResponse(
          {
            error: 'Nicht genügend Credits',
            balance: e.balance,
            required: e.required,
          },
          corsHeaders,
          402
        );
      }
      throw e;
    }

    // ── Step 4: Double-Check nach Deduct (Race-Condition-Schutz) ──────
    //
    // Zwischen Cache-Lookup und Credit-Deduct könnte ein paralleler
    // Request den Cache bereits gefüllt haben. Kurz prüfen.

    if (species) {
      const doubleCheck = await getCachedDetails(
        serviceClient,
        species.speciesId,
        resolvedLanguage
      );
      if (doubleCheck) {
        // Anderer Request hat zwischenzeitlich gecacht → Refund + Return
        await refundCredits(serviceClient, userId, cost);
        return jsonResponse({
          details: doubleCheck,
          balance: newBalance + cost,
          credits_used: 0,
          source: 'dex_cache',
        }, corsHeaders);
      }
    }

    // ── Step 5: OpenAI Call ────────────────────────────────────────────

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

    // ── Step 6: Parse + Log ───────────────────────────────────────────

    await logUsage(serviceClient, {
      user_id: userId,
      action: 'plant_details',
      prompt_tokens: result.prompt_tokens,
      completion_tokens: result.completion_tokens,
      total_tokens: result.total_tokens,
      cost_credits: cost,
      openai_cost_usd: result.cost_usd,
      model: result.model,
      metadata: {
        plant_name: name,
        language: resolvedLanguage,
        species_id: species?.speciesId ?? null,
        source: 'llm',
      },
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

    // ── Step 7: Write-Through Cache ───────────────────────────────────

    if (species && details) {
      // Async, non-blocking – Fehler hier ist nicht kritisch
      writeCacheEntry(
        serviceClient,
        species.speciesId,
        resolvedLanguage,
        details,
        result.model
      ).catch((e) =>
        console.error('Cache write-through error:', e?.message)
      );
    }

    // ── Step 8: Response ──────────────────────────────────────────────

    return jsonResponse({
      details,
      balance: newBalance,
      credits_used: cost,
      source: 'llm',
    }, corsHeaders);
  } catch (e: any) {
    const status = e?.code === 'UNAUTHORIZED' ? 401 : 500;
    return jsonResponse(
      { error: e.message || 'Unbekannter Fehler' },
      corsHeaders,
      status
    );
  }
});
