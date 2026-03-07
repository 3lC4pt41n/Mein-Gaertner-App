import { supabase } from '../supabase';
import { requestWithPolicy } from './networkPolicy';

// Helper: Edge Function aufrufen über den Supabase Client
// Der Client setzt apikey + Authorization Header automatisch korrekt
// Wrapped with requestWithPolicy for timeout + retry on transient failures.
async function callEdgeFunction(functionName, body) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Nicht eingeloggt');

  // AI calls get a generous timeout (image uploads can be large) and 1 retry
  const { data, error } = await requestWithPolicy(
    () => supabase.functions.invoke(functionName, { body }),
    { timeout: 45000, retries: 1, label: `ai.${functionName}` }
  );

  if (error) {
    // Supabase FunctionsHttpError: error.context kann ein Response-Objekt,
    // ein String oder bereits ein Objekt sein (je nach SDK-Version).
    let parsed;
    let contextText = '';
    try {
      if (error.context && typeof error.context.json === 'function') {
        // Response-Objekt (Supabase JS v2) – Body robust lesen (JSON oder Text)
        const cloned = typeof error.context.clone === 'function' ? error.context.clone() : null;
        if (cloned && typeof cloned.json === 'function') {
          try {
            parsed = await cloned.json();
          } catch {
            contextText = (await cloned.text()) || '';
            try {
              parsed = JSON.parse(contextText);
            } catch {
              parsed = null;
            }
          }
        } else {
          parsed = await error.context.json();
        }
      } else if (typeof error.context === 'string') {
        contextText = error.context;
        parsed = JSON.parse(error.context);
      } else {
        parsed = error.context;
      }
    } catch {
      parsed = null;
    }

    const firstDetail =
      Array.isArray(parsed?.details) && parsed.details.length > 0
        ? parsed.details.find((d) => d?.message)?.message || null
        : null;

    // Spezialbehandlung: Nicht genug Credits (HTTP 402)
    if (parsed?.code === 'INSUFFICIENT_CREDITS' || error.message?.includes('402')) {
      const err = new Error(parsed?.error || 'Nicht genügend Credits');
      err.code = 'INSUFFICIENT_CREDITS';
      err.balance = parsed?.balance;
      err.required = parsed?.required;
      throw err;
    }

    // Spezialbehandlung: Rate Limit (HTTP 429)
    if (parsed?.code === 'RATE_LIMIT_EXCEEDED' || error.message?.includes('429')) {
      const err = new Error(parsed?.error || 'Zu viele Anfragen. Bitte warte etwas.');
      err.code = 'RATE_LIMIT_EXCEEDED';
      err.retryAfter = parsed?.retry_after_seconds;
      throw err;
    }

    // Benutzerfreundliche Fallback-Meldung statt rohem SDK-Text
    const parsedMessage =
      parsed?.error && firstDetail
        ? `${parsed.error}: ${firstDetail}`
        : parsed?.error || firstDetail;

    const userMsg =
      parsedMessage ||
      contextText ||
      (error.message && !error.message.includes('non-2xx')
        ? error.message
        : `Fehler bei ${functionName} – bitte versuche es erneut.`);

    const err = new Error(userMsg);
    err.code = parsed?.code || error?.code;
    err.status = parsed?.status || error?.status || error?.context?.status;
    throw err;
  }

  return data;
}

// Pflanze erkennen (Foto → Name + Note)
export async function recognizePlant(base64Image, language) {
  return callEdgeFunction('ai-plant-scan', {
    base64: base64Image,
    language,
  });
}

// Pflanzen-Details generieren (Name → Details JSON)
export async function generatePlantDetails(name, note, language) {
  return callEdgeFunction('ai-plant-details', { name, note, language });
}

// Healthcheck durchführen (Bild-URL → Healthcheck JSON)
export async function performHealthcheck(imageUrl, plantName, language) {
  return callEdgeFunction('ai-healthcheck', {
    image_url: imageUrl,
    plant_name: plantName,
    language,
  });
}

// Chat-Nachricht an Ben senden
// History wird server-seitig geladen, nicht mehr vom Client gesendet
export async function chatWithBen(text, imageUrl, language) {
  return callEdgeFunction('ai-chat', {
    text: text || undefined,
    image_url: imageUrl || undefined,
    language,
  });
}

// User-Foto -> personalisierter Gaertner-Avatar
export async function generateGardenerAvatar(base64Image, language) {
  return callEdgeFunction('ai-gardener-avatar', {
    base64: base64Image,
    language,
  });
}
