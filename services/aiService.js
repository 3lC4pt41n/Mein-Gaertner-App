import { supabase } from '../supabase';

const SUPABASE_URL = 'https://tsllrwaixvhuadrfsskt.supabase.co';

// Helper: Edge Function aufrufen mit Auth-Header
async function callEdgeFunction(functionName, body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Nicht eingeloggt");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    // Spezialbehandlung: Nicht genug Credits
    if (res.status === 402) {
      const err = new Error(data.error || 'Nicht genügend Credits');
      err.code = 'INSUFFICIENT_CREDITS';
      err.balance = data.balance;
      err.required = data.required;
      throw err;
    }
    throw new Error(data.error || `Fehler bei ${functionName}`);
  }

  return data;
}

// Pflanze erkennen (Foto → Name + Note)
export async function recognizePlant(base64Image) {
  return callEdgeFunction('ai-plant-scan', { base64: base64Image });
}

// Pflanzen-Details generieren (Name → Details JSON)
export async function generatePlantDetails(name, note) {
  return callEdgeFunction('ai-plant-details', { name, note });
}

// Healthcheck durchführen (Bild-URL → Healthcheck JSON)
export async function performHealthcheck(imageUrl, plantName) {
  return callEdgeFunction('ai-healthcheck', {
    image_url: imageUrl,
    plant_name: plantName,
  });
}

// Chat-Nachricht an Ben senden
export async function chatWithBen(history, text, imageUrl) {
  return callEdgeFunction('ai-chat', {
    history,
    text: text || undefined,
    image_url: imageUrl || undefined,
  });
}
