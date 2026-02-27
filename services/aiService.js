import { supabase } from '../supabase';

// Helper: Edge Function aufrufen über den Supabase Client
// Der Client setzt apikey + Authorization Header automatisch korrekt
async function callEdgeFunction(functionName, body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Nicht eingeloggt");

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  });

  if (error) {
    // Supabase FunctionsHttpError enthält den Response
    let parsed;
    try {
      parsed = typeof error.context === 'string' ? JSON.parse(error.context) : error.context;
    } catch { parsed = null; }

    // Spezialbehandlung: Nicht genug Credits (HTTP 402)
    if (parsed?.code === 'INSUFFICIENT_CREDITS' || error.message?.includes('402')) {
      const err = new Error(parsed?.error || 'Nicht genügend Credits');
      err.code = 'INSUFFICIENT_CREDITS';
      err.balance = parsed?.balance;
      err.required = parsed?.required;
      throw err;
    }
    throw new Error(parsed?.error || error.message || `Fehler bei ${functionName}`);
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
export async function chatWithBen(history, text, imageUrl, language) {
  return callEdgeFunction('ai-chat', {
    history,
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
