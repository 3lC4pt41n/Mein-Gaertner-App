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
import { buildGenerationContext } from './cache-flow.js';

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
    "Typische Schädlinge": "...",
    "Krankheiten": "...",
    "Besondere Hinweise": "..."
  },
  "properties": {
    "dangers": {
      "_title": "⚠️ Gefahren",
      "Giftigkeit": "Giftigkeit für Menschen, Hunde, Katzen beschreiben",
      "Verwechslungsgefahr": "Ähnliche Arten nennen, mit denen verwechselt werden kann",
      "Wucherverhalten": "Ausbreitungsverhalten beschreiben"
    },
    "benefits": {
      "_title": "🌿 Nutzen",
      "Essbare Pflanze": "Essbare Teile und Zubereitung beschreiben, oder 'Nicht essbar'",
      "Nährstoffe": "Wichtige Vitamine und Mineralstoffe",
      "Tierfutter": "Eignung als Futter für Haustiere/Wildtiere",
      "Bodenindikator": "Was die Pflanze über den Boden verrät"
    },
    "compounds": {
      "_title": "🧪 Wirkstoffe",
      "Wirkstoff 1 (Name)": "Konzentration → Wirkung",
      "Wirkstoff 2 (Name)": "Konzentration → Wirkung",
      "Mineralstoffe": "Wichtige Mineralstoffe auflisten"
    }
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
    "Common Pests": "...",
    "Diseases": "...",
    "Special Notes": "..."
  },
  "properties": {
    "dangers": {
      "_title": "⚠️ Dangers",
      "Toxicity": "Describe toxicity for humans, dogs, cats",
      "Confusion risk": "Name similar species that can be confused with this one",
      "Invasive behavior": "Describe spreading behavior"
    },
    "benefits": {
      "_title": "🌿 Benefits",
      "Edible plant": "Describe edible parts and preparation, or 'Not edible'",
      "Nutrients": "Important vitamins and minerals",
      "Animal feed": "Suitability as feed for pets/wildlife",
      "Soil indicator": "What the plant reveals about soil conditions"
    },
    "compounds": {
      "_title": "🧪 Active compounds",
      "Compound 1 (Name)": "Concentration → Effect",
      "Compound 2 (Name)": "Concentration → Effect",
      "Minerals": "List important minerals"
    }
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
    "Taille (coupe)": "...",
    "Rempotage": "...",
    "Tuteur / Support": "...",
    "Ravageurs fréquents": "...",
    "Maladies": "...",
    "Remarques spéciales": "..."
  },
  "properties": {
    "dangers": {
      "_title": "⚠️ Dangers",
      "Toxicité": "Décrire la toxicité pour les humains, chiens, chats",
      "Risque de confusion": "Espèces similaires pouvant prêter à confusion",
      "Comportement envahissant": "Décrire le comportement de propagation"
    },
    "benefits": {
      "_title": "🌿 Bienfaits",
      "Plante comestible": "Parties comestibles et préparation, ou 'Non comestible'",
      "Nutriments": "Vitamines et minéraux importants",
      "Alimentation animale": "Aptitude comme nourriture pour animaux",
      "Indicateur de sol": "Ce que la plante révèle sur le sol"
    },
    "compounds": {
      "_title": "🧪 Principes actifs",
      "Principe actif 1 (Nom)": "Concentration → Effet",
      "Principe actif 2 (Nom)": "Concentration → Effet",
      "Minéraux": "Lister les minéraux importants"
    }
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
    "Parassiti comuni": "...",
    "Malattie": "...",
    "Note speciali": "..."
  },
  "properties": {
    "dangers": {
      "_title": "⚠️ Pericoli",
      "Tossicità": "Descrivere la tossicità per umani, cani, gatti",
      "Rischio di confusione": "Specie simili con cui può essere confusa",
      "Comportamento invasivo": "Descrivere il comportamento di diffusione"
    },
    "benefits": {
      "_title": "🌿 Benefici",
      "Pianta commestibile": "Parti commestibili e preparazione, o 'Non commestibile'",
      "Nutrienti": "Vitamine e minerali importanti",
      "Alimentazione animale": "Idoneità come mangime per animali",
      "Indicatore del suolo": "Cosa rivela la pianta sul terreno"
    },
    "compounds": {
      "_title": "🧪 Principi attivi",
      "Principio attivo 1 (Nome)": "Concentrazione → Effetto",
      "Principio attivo 2 (Nome)": "Concentrazione → Effetto",
      "Minerali": "Elencare i minerali importanti"
    }
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
    "Plagas comunes": "...",
    "Enfermedades": "...",
    "Notas especiales": "..."
  },
  "properties": {
    "dangers": {
      "_title": "⚠️ Peligros",
      "Toxicidad": "Describir toxicidad para humanos, perros, gatos",
      "Riesgo de confusión": "Especies similares con las que puede confundirse",
      "Comportamiento invasivo": "Describir el comportamiento de propagación"
    },
    "benefits": {
      "_title": "🌿 Beneficios",
      "Planta comestible": "Partes comestibles y preparación, o 'No comestible'",
      "Nutrientes": "Vitaminas y minerales importantes",
      "Alimento animal": "Aptitud como alimento para animales",
      "Indicador de suelo": "Lo que la planta revela sobre el suelo"
    },
    "compounds": {
      "_title": "🧪 Principios activos",
      "Principio activo 1 (Nombre)": "Concentración → Efecto",
      "Principio activo 2 (Nombre)": "Concentración → Efecto",
      "Minerales": "Listar minerales importantes"
    }
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
    "Типичные вредители": "...",
    "Болезни": "...",
    "Особые указания": "..."
  },
  "properties": {
    "dangers": {
      "_title": "⚠️ Опасности",
      "Токсичность": "Описать токсичность для людей, собак, кошек",
      "Риск путаницы": "Похожие виды, с которыми можно спутать",
      "Инвазивное поведение": "Описать поведение распространения"
    },
    "benefits": {
      "_title": "🌿 Польза",
      "Съедобное растение": "Съедобные части и приготовление, или 'Не съедобно'",
      "Питательные вещества": "Важные витамины и минералы",
      "Корм для животных": "Пригодность в качестве корма для животных",
      "Индикатор почвы": "Что растение говорит о почве"
    },
    "compounds": {
      "_title": "🧪 Активные вещества",
      "Вещество 1 (Название)": "Концентрация → Действие",
      "Вещество 2 (Название)": "Концентрация → Действие",
      "Минералы": "Перечислить важные минералы"
    }
  }
}`,
  tr: `{
  "overview": {
    "Yaygın Ad": "...",
    "Botanik Adı": "...",
    "Aile": "...",
    "Anavatanı": "...",
    "Büyüme Tipi": "...",
    "Boyut": "...",
    "Çiçeklenme Dönemi": "...",
    "Ömür": "...",
    "Öne Çıkan Özellik": "..."
  },
  "care": {
    "Işık": "...",
    "Sıcaklık Aralığı": "...",
    "Hava Nemi": "...",
    "Toprak / Substrat": "...",
    "Sulama": "...",
    "Gübreleme": "...",
    "Budama": "...",
    "Saksı Değişimi": "...",
    "Destek / Herek": "...",
    "Yaygın Zararlılar": "...",
    "Hastalıklar": "...",
    "Özel Notlar": "..."
  },
  "properties": {
    "dangers": {
      "_title": "⚠️ Tehlikeler",
      "Toksisite": "İnsanlar, köpekler, kediler için toksisiteyi açıklayın",
      "Karıştırma Riski": "Karıştırılabilecek benzer türleri belirtin",
      "İstilacı Davranış": "Yayılma davranışını açıklayın"
    },
    "benefits": {
      "_title": "🌿 Faydalar",
      "Yenilebilir Bitki": "Yenilebilir kısımları ve hazırlığını açıklayın veya 'Yenilemez'",
      "Besin Değerleri": "Önemli vitaminler ve mineraller",
      "Hayvan Yemi": "Evcil hayvanlar/yaban hayatı için yem olarak uygunluk",
      "Toprak Göstergesi": "Bitkinin toprak koşulları hakkında ne söylediği"
    },
    "compounds": {
      "_title": "🧪 Aktif Bileşenler",
      "Bileşen 1 (Adı)": "Konsantrasyon → Etki",
      "Bileşen 2 (Adı)": "Konsantrasyon → Etki",
      "Mineraller": "Önemli mineralleri listeleyin"
    }
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
  model: string,
  overwrite = false
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
    { onConflict: 'species_id,language', ignoreDuplicates: !overwrite }
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
      force_refresh: forceRefresh,
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
    // Skip cache when force_refresh is requested (e.g. schema migration)

    if (species && !forceRefresh) {
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

    if (species && !forceRefresh) {
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

    // Security/quality hardening:
    // If species is resolved, always generate against canonical species name
    // and ignore user note hints to avoid poisoning shared cache entries.
    const { generationName, generationHint, requestedName } = buildGenerationContext({
      requestedName: name,
      note,
      canonicalName: species?.canonical,
    });

    const prompt = `Create plant details for "${generationName}" (hint: "${generationHint}") and return ONLY one JSON object in EXACTLY this schema:

${schema}

Rules:
- Write all content strictly in ${languagePromptName}.
- Output one language only (no bilingual text, no translations).
- Keep top-level keys exactly: overview, care, properties.
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
        plant_name: generationName,
        requested_name: requestedName,
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
        result.model,
        !!forceRefresh
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
