// Shared helpers for OpenAI Vision image inputs.
// Edge functions should resolve short-lived Supabase signed URLs themselves
// instead of asking OpenAI to fetch them directly.

const DEFAULT_MAX_IMAGE_BYTES = 10_000_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...Array.from(chunk));
  }
  return btoa(binary);
}

export function base64ToVisionDataUrl(base64: string, contentType = 'image/jpeg'): string {
  if (base64.startsWith('data:image/')) return base64;
  return `data:${contentType};base64,${base64.includes(',') ? base64.split(',')[1] : base64}`;
}

export async function resolveImageForVision(
  imageUrl: string,
  maxBytes = DEFAULT_MAX_IMAGE_BYTES
): Promise<string> {
  if (imageUrl.startsWith('data:image/')) return imageUrl;

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Bild konnte nicht geladen werden (${response.status})`);
  }

  const contentTypeHeader = response.headers.get('content-type') || 'image/jpeg';
  const contentType = contentTypeHeader.split(';')[0].trim().toLowerCase();
  const safeContentType = contentType.startsWith('image/') ? contentType : 'image/jpeg';
  const bytes = new Uint8Array(await response.arrayBuffer());

  if (bytes.length === 0) {
    throw new Error('Bild konnte nicht geladen werden');
  }

  if (bytes.length > maxBytes) {
    throw new Error('Bild darf maximal 10 MB gross sein');
  }

  return `data:${safeContentType};base64,${bytesToBase64(bytes)}`;
}
