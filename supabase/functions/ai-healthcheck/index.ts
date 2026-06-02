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
import { resolveImageForVision } from '../_shared/vision-image.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { getCorsHeaders, rejectDisallowedOrigin } from '../_shared/cors.ts';

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
  ru: [
    'Цвет и текстура листьев',
    'Поражение вредителями',
    'Целостность листьев',
    'Форма роста и устойчивость',
    'Размер горшка и растения',
    'Субстрат и поверхность',
    'Общие признаки ухода',
  ],
  tr: [
    'Yaprak rengi ve dokusu',
    'Zararlı belirtisi',
    'Yaprak bütünlüğü',
    'Büyüme formu ve sağlamlık',
    'Saksı boyutu ve bitki boyutu',
    'Substrat ve yüzey',
    'Genel bakım belirtileri',
  ],
  nl: [
    'Bladkleur en -structuur',
    'Aantasting door plagen',
    'Bladintegriteit',
    'Groeivorm en stevigheid',
    'Potgrootte ten opzichte van plantgrootte',
    'Substraat en oppervlak',
    'Algemene verzorgingssignalen',
  ],
  da: [
    'Bladfarve og -struktur',
    'Skadedyrsangreb',
    'Bladintegritet',
    'Vækstform og stabilitet',
    'Pottestørrelse i forhold til plantestørrelse',
    'Substrat og overflade',
    'Samlede plejetegn',
  ],
  pl: [
    'Kolor i struktura liści',
    'Występowanie szkodników',
    'Integralność liści',
    'Pokrój i stabilność wzrostu',
    'Wielkość doniczki względem rośliny',
    'Podłoże i powierzchnia',
    'Ogólne oznaki pielęgnacji',
  ],
  uk: [
    'Колір і структура листя',
    'Ураження шкідниками',
    'Цілісність листя',
    'Форма росту й стійкість',
    'Розмір горщика відносно рослини',
    'Субстрат і поверхня',
    'Загальні ознаки догляду',
  ],
  'pt-BR': [
    'Cor e textura das folhas',
    'Infestação de pragas',
    'Integridade das folhas',
    'Forma de crescimento e estabilidade',
    'Tamanho do vaso em relação ao tamanho da planta',
    'Substrato e superfície',
    'Sinais gerais de cuidado',
  ],
  'pt-PT': [
    'Cor e textura das folhas',
    'Infestação de pragas',
    'Integridade das folhas',
    'Forma de crescimento e estabilidade',
    'Tamanho do vaso em relação ao tamanho da planta',
    'Substrato e superfície',
    'Sinais gerais de cuidado',
  ],
  hi: [
    'पत्तियों का रंग और बनावट',
    'कीट प्रकोप',
    'पत्तियों की अखंडता',
    'विकास रूप और स्थिरता',
    'गमले के आकार और पौधे के आकार का अनुपात',
    'माध्यम और सतह',
    'कुल देखभाल संकेत',
  ],
  bn: [
    'পাতার রং ও গঠন',
    'পোকামাকড়ের আক্রমণ',
    'পাতার অখণ্ডতা',
    'বৃদ্ধির ধরন ও স্থিতি',
    'টবের আকার বনাম গাছের আকার',
    'সাবস্ট্রেট ও পৃষ্ঠ',
    'সামগ্রিক যত্নের লক্ষণ',
  ],
  ja: [
    '葉の色と質感',
    '害虫の発生',
    '葉の健全性',
    '草姿と安定性',
    '鉢の大きさと株の大きさのバランス',
    '用土と表面',
    '総合的な管理サイン',
  ],
  ko: [
    '잎 색과 질감',
    '해충 발생',
    '잎의 온전함',
    '생장 형태와 지지 안정성',
    '화분 크기와 식물 크기의 균형',
    '배지와 표면',
    '전반적인 관리 징후',
  ],
  'zh-Hans': [
    '叶片颜色与质地',
    '虫害情况',
    '叶片完整性',
    '生长形态与稳固性',
    '盆器大小与植株大小的匹配',
    '基质与表面状态',
    '整体养护迹象',
  ],
  id: [
    'Warna dan tekstur daun',
    'Serangan hama',
    'Keutuhan daun',
    'Bentuk pertumbuhan dan kestabilan',
    'Ukuran pot dibanding ukuran tanaman',
    'Media tanam dan permukaan',
    'Tanda perawatan secara keseluruhan',
  ],
  ar: [
    'لون الأوراق وملمسها',
    'الإصابة بالآفات',
    'سلامة الأوراق',
    'شكل النمو والثبات',
    'حجم الأصيص مقارنة بحجم النبات',
    'وسط الزراعة والسطح',
    'مؤشرات العناية العامة',
  ],
  he: [
    'צבע העלים ומרקמם',
    'נגיעות מזיקים',
    'שלמות העלים',
    'צורת הצימוח והיציבות',
    'גודל העציץ ביחס לגודל הצמח',
    'מצע הגידול והמשטח',
    'סימני טיפול כלליים',
  ],
  fa: [
    'رنگ و بافت برگ',
    'آلودگی به آفات',
    'یکپارچگی برگ‌ها',
    'فرم رشد و پایداری',
    'اندازه گلدان نسبت به اندازه گیاه',
    'بستر کشت و سطح',
    'نشانه‌های کلی مراقبت',
  ],
  ur: [
    'پتوں کا رنگ اور ساخت',
    'کیڑوں کا حملہ',
    'پتوں کی سالمیت',
    'نشوونما کی شکل اور مضبوطی',
    'گملے کے سائز اور پودے کے سائز کا تناسب',
    'سبسٹریٹ اور سطح',
    'مجموعی دیکھ بھال کی علامات',
  ],
};

function buildHealthcheckPrompt(language: SupportedLanguage, languagePromptName: string) {
  const c = HEALTHCHECK_CRITERIA[language] || HEALTHCHECK_CRITERIA['de'];
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

    const { image_url, plant_name, language: requestedLanguage } = await req.json();

    // Input-Validierung (VOR Credit-Abzug)
    const vErr = validationErrorResponse(
      [validateImageUrl(image_url), validateText(plant_name, 200, 'plant_name')],
      corsHeaders
    );
    if (vErr) return vErr;

    if (!image_url) {
      return new Response(JSON.stringify({ error: 'image_url fehlt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const language = validateLanguage(requestedLanguage);

    // Rate Limiting (vor Credit-Abzug)
    const rateLimitResp = await checkRateLimit(serviceClient, userId, 'healthcheck', corsHeaders);
    if (rateLimitResp) return rateLimitResp;

    let imageForVision: string;
    try {
      // Resolve Supabase signed URLs server-side. iOS must not depend on OpenAI
      // being able to fetch short-lived storage URLs directly.
      imageForVision = await resolveImageForVision(image_url);
    } catch (e: any) {
      return new Response(
        JSON.stringify({ error: e.message || 'Bild konnte nicht geladen werden' }),
        {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

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

    // OpenAI Call — prompt enforces JSON; parser below guards invalid output.
    const messages: any[] = [
      {
        role: 'system',
        content: 'You are a plant health analyst. Always respond with valid JSON only.',
      },
      { role: 'user', content: healthcheckPrompt },
      {
        role: 'user',
        content: [
          ...(plant_name ? [{ type: 'text', text: `Die Pflanze heißt: ${plant_name}` }] : []),
          { type: 'image_url', image_url: { url: imageForVision } },
        ],
      },
    ];

    let result;
    try {
      result = await callOpenAI({
        messages,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      });
    } catch (e) {
      await refundCredits(serviceClient, userId, cost);
      throw e;
    }

    // Antwort parsen — robust: strip markdown fences, extract JSON object
    let parsed;
    try {
      let cleaned = result.content
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      // Fallback: extract first JSON object if surrounded by text
      if (!cleaned.startsWith('{')) {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) cleaned = match[0];
      }
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = null;
    }

    // Coerce healthscore to number (GPT sometimes returns string "85" instead of 85)
    if (parsed && parsed.healthscore !== undefined) {
      parsed.healthscore = Number(parsed.healthscore);
    }

    // Guard: wenn Parsing fehlschlägt oder healthscore fehlt → Credits refunden + Fehler
    if (!parsed || typeof parsed.healthscore !== 'number' || isNaN(parsed.healthscore)) {
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

    // Clamp healthscore to valid range
    parsed.healthscore = Math.max(0, Math.min(100, Math.round(parsed.healthscore)));

    // Usage loggen only after a successful parse (refund-paths stay consistent)
    await logUsage(serviceClient, {
      user_id: userId,
      action: 'healthcheck',
      prompt_tokens: result.prompt_tokens,
      completion_tokens: result.completion_tokens,
      total_tokens: result.total_tokens,
      cost_credits: cost,
      openai_cost_usd: result.cost_usd,
      model: result.model,
      metadata: { plant_name, language: resolvedLanguage, image_input: 'server_resolved_data_url' },
    });

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
    const status = e?.code === 'UNAUTHORIZED' ? 401 : 500;
    return new Response(JSON.stringify({ error: e.message || 'Unbekannter Fehler' }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
