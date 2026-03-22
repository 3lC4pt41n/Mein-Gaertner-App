// Shared PlantNet API Helper für Pflanzenidentifikation
// Nutzt die PlantNet v2 REST API (https://my.plantnet.org)
// Free Tier: 500 Identifikationen/Tag

const PLANTNET_API_URL = 'https://my-api.plantnet.org/v2/identify/all';

export interface PlantNetResult {
  bestMatch: string | null;
  results: Array<{
    score: number;
    species: {
      scientificNameWithoutAuthor: string;
      scientificNameAuthorship: string;
      commonNames: string[];
      family: { scientificNameWithoutAuthor: string };
      genus: { scientificNameWithoutAuthor: string };
    };
  }>;
  remainingRequests: number;
}

/**
 * Identify a plant using PlantNet API from a base64-encoded image.
 * Returns top identification results with confidence scores.
 */
export async function identifyPlantFromBase64(
  base64: string,
  lang: string = 'de'
): Promise<PlantNetResult | null> {
  const apiKey = Deno.env.get('PLANTNET_API_KEY');
  if (!apiKey) {
    console.warn('PLANTNET_API_KEY not configured, skipping PlantNet identification');
    return null;
  }

  try {
    // Base64 zu Blob konvertieren
    const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
    const binaryString = atob(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'image/jpeg' });

    // FormData aufbauen
    const formData = new FormData();
    formData.append('images', blob, 'plant.jpg');
    formData.append('organs', 'auto');

    const url = `${PLANTNET_API_URL}?api-key=${apiKey}&lang=${lang}&include-related-images=false&no-reject=false`;

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`PlantNet API error (${response.status}): ${errorText}`);
      return null;
    }

    const json = await response.json();

    return {
      bestMatch: json.bestMatch || null,
      results: (json.results || []).slice(0, 5).map((r: any) => ({
        score: r.score || 0,
        species: {
          scientificNameWithoutAuthor: r.species?.scientificNameWithoutAuthor || '',
          scientificNameAuthorship: r.species?.scientificNameAuthorship || '',
          commonNames: r.species?.commonNames || [],
          family: {
            scientificNameWithoutAuthor: r.species?.family?.scientificNameWithoutAuthor || '',
          },
          genus: {
            scientificNameWithoutAuthor: r.species?.genus?.scientificNameWithoutAuthor || '',
          },
        },
      })),
      remainingRequests: json.remainingIdentificationRequests ?? -1,
    };
  } catch (e) {
    console.warn('PlantNet identification failed:', e);
    return null;
  }
}

/**
 * Identify a plant using PlantNet API from an image URL.
 * Downloads the image first, then sends to PlantNet.
 */
export async function identifyPlantFromUrl(
  imageUrl: string,
  lang: string = 'de'
): Promise<PlantNetResult | null> {
  const apiKey = Deno.env.get('PLANTNET_API_KEY');
  if (!apiKey) {
    console.warn('PLANTNET_API_KEY not configured, skipping PlantNet identification');
    return null;
  }

  try {
    // Bild herunterladen
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) {
      console.warn(`Failed to download image from URL: ${imgResponse.status}`);
      return null;
    }
    const imgBlob = await imgResponse.blob();

    // FormData aufbauen
    const formData = new FormData();
    formData.append('images', imgBlob, 'plant.jpg');
    formData.append('organs', 'auto');

    const url = `${PLANTNET_API_URL}?api-key=${apiKey}&lang=${lang}&include-related-images=false&no-reject=false`;

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`PlantNet API error (${response.status}): ${errorText}`);
      return null;
    }

    const json = await response.json();

    return {
      bestMatch: json.bestMatch || null,
      results: (json.results || []).slice(0, 5).map((r: any) => ({
        score: r.score || 0,
        species: {
          scientificNameWithoutAuthor: r.species?.scientificNameWithoutAuthor || '',
          scientificNameAuthorship: r.species?.scientificNameAuthorship || '',
          commonNames: r.species?.commonNames || [],
          family: {
            scientificNameWithoutAuthor: r.species?.family?.scientificNameWithoutAuthor || '',
          },
          genus: {
            scientificNameWithoutAuthor: r.species?.genus?.scientificNameWithoutAuthor || '',
          },
        },
      })),
      remainingRequests: json.remainingIdentificationRequests ?? -1,
    };
  } catch (e) {
    console.warn('PlantNet identification from URL failed:', e);
    return null;
  }
}

/**
 * Format PlantNet results into a concise context string for GPT.
 * Returns null if no results or identification failed.
 */
export function formatPlantNetContext(result: PlantNetResult | null): string | null {
  if (!result || !result.results || result.results.length === 0) {
    return null;
  }

  const top = result.results[0];
  const confidence = (top.score * 100).toFixed(1);
  const commonNames = top.species.commonNames.slice(0, 3).join(', ');
  const scientificName = top.species.scientificNameWithoutAuthor;
  const family = top.species.family.scientificNameWithoutAuthor;

  let context = `PLANT IDENTIFICATION (PlantNet AI, ${confidence}% confidence):\n`;
  context += `- Scientific name: ${scientificName}\n`;
  if (commonNames) context += `- Common names: ${commonNames}\n`;
  if (family) context += `- Family: ${family}\n`;

  // Alternativen hinzufügen wenn Top-Ergebnis unsicher
  if (top.score < 0.5 && result.results.length > 1) {
    context += '- Other possibilities:\n';
    for (const alt of result.results.slice(1, 3)) {
      const altConf = (alt.score * 100).toFixed(1);
      const altNames = alt.species.commonNames.slice(0, 2).join(', ');
      context += `  · ${alt.species.scientificNameWithoutAuthor}`;
      if (altNames) context += ` (${altNames})`;
      context += ` — ${altConf}%\n`;
    }
  }

  return context;
}
