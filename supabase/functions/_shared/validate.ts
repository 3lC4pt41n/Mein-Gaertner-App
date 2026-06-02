// Input-Validierung fuer Edge Functions
// Schuetzt vor Missbrauch und ueberdimensionierten Requests
import { isSupportedLanguage, normalizeLanguage, type SupportedLanguage } from './language.ts';

const SUPABASE_STORAGE_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\//;

export interface ValidationError {
  field: string;
  message: string;
}

const DEFAULT_RESPONSE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validiert Text-Input: max Laenge, kein HTML/Script
export function validateText(
  text: string | undefined,
  maxLength: number,
  fieldName = 'text'
): ValidationError | null {
  if (!text) return null; // Optional ist ok
  if (typeof text !== 'string') {
    return { field: fieldName, message: `${fieldName} muss ein String sein` };
  }
  if (text.length > maxLength) {
    return {
      field: fieldName,
      message: `${fieldName} darf maximal ${maxLength} Zeichen lang sein (ist ${text.length})`,
    };
  }
  return null;
}

// Validiert Bild-URL: muss Supabase Storage oder data:image sein
export function validateImageUrl(url: string | undefined): ValidationError | null {
  if (!url) return null;
  if (typeof url !== 'string') {
    return { field: 'image_url', message: 'image_url muss ein String sein' };
  }
  // Supabase Storage URLs oder data:image/... erlauben
  if (!SUPABASE_STORAGE_PATTERN.test(url) && !url.startsWith('data:image/')) {
    return {
      field: 'image_url',
      message: 'image_url muss eine Supabase-Storage-URL sein',
    };
  }
  // Max 10 MB fuer data URLs
  if (url.startsWith('data:image/') && url.length > 10_000_000) {
    return { field: 'image_url', message: 'Bild darf maximal 10 MB gross sein' };
  }
  return null;
}

// Validiert Base64-Image: max Groesse
export function validateBase64(
  base64: string | undefined,
  maxBytes = 10_000_000
): ValidationError | null {
  if (!base64) return null;
  if (typeof base64 !== 'string') {
    return { field: 'base64', message: 'base64 muss ein String sein' };
  }
  if (base64.length > maxBytes) {
    return { field: 'base64', message: 'Bild darf maximal 10 MB gross sein' };
  }
  return null;
}

// Validiert Sprache: muss in erlaubter Liste sein
export function validateLanguage(lang: string | undefined): SupportedLanguage {
  if (!isSupportedLanguage(lang)) return 'de';
  return normalizeLanguage(lang);
}

// Sammelt alle Validierungsfehler und gibt 400 Response zurueck
export function validationErrorResponse(
  errors: (ValidationError | null)[],
  responseHeaders: Record<string, string> = DEFAULT_RESPONSE_HEADERS
): Response | null {
  const actual = errors.filter(Boolean) as ValidationError[];
  if (actual.length === 0) return null;

  return new Response(
    JSON.stringify({
      error: 'Ungültige Eingabe',
      details: actual,
    }),
    {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...responseHeaders,
      },
    }
  );
}
