import { supabase, SUPABASE_URL } from '../supabase';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer'; // npm install buffer

const PLANT_BUCKET = 'plant-images';

// ── In-Memory Signed-URL Cache (50 Min TTL, URLs sind 60 Min gültig) ──
const SIGNED_URL_TTL_MS = 50 * 60 * 1000;
const signedUrlCache = new Map(); // key: storagePath → { url, expiresAt }

function getCachedSignedUrl(storagePath) {
  const entry = signedUrlCache.get(storagePath);
  if (entry && Date.now() < entry.expiresAt) return entry.url;
  if (entry) signedUrlCache.delete(storagePath); // abgelaufen
  return null;
}

function setCachedSignedUrl(storagePath, url) {
  signedUrlCache.set(storagePath, { url, expiresAt: Date.now() + SIGNED_URL_TTL_MS });

  // Housekeeping: max 500 Einträge, älteste raus
  if (signedUrlCache.size > 500) {
    const oldest = signedUrlCache.keys().next().value;
    signedUrlCache.delete(oldest);
  }
}

function stripLeadingSlash(value) {
  if (!value) return '';
  return value.startsWith('/') ? value.slice(1) : value;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isWebImageUrl(value) {
  return (
    typeof value === 'string' &&
    (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:image/'))
  );
}

/**
 * Extract storage object path for `plant-images` from either:
 * - raw storage path (preferred),
 * - signed/public/authenticated Supabase storage URL.
 * Returns null for non-storage/external URLs.
 */
function extractPlantStoragePath(pathOrUrl) {
  if (!pathOrUrl || typeof pathOrUrl !== 'string') return null;

  if (!pathOrUrl.startsWith('http://') && !pathOrUrl.startsWith('https://')) {
    return stripLeadingSlash(pathOrUrl);
  }

  try {
    const url = new URL(pathOrUrl);
    const supabaseHost = new URL(SUPABASE_URL).host;
    if (url.host !== supabaseHost) return null;

    const signedPrefix = `/storage/v1/object/sign/${PLANT_BUCKET}/`;
    const publicPrefix = `/storage/v1/object/public/${PLANT_BUCKET}/`;
    const authenticatedPrefix = `/storage/v1/object/authenticated/${PLANT_BUCKET}/`;
    const pathname = url.pathname || '';

    let rawPath = null;
    if (pathname.startsWith(signedPrefix)) rawPath = pathname.slice(signedPrefix.length);
    else if (pathname.startsWith(publicPrefix)) rawPath = pathname.slice(publicPrefix.length);
    else if (pathname.startsWith(authenticatedPrefix)) {
      rawPath = pathname.slice(authenticatedPrefix.length);
    }

    if (!rawPath) return null;
    return stripLeadingSlash(safeDecode(rawPath));
  } catch {
    return null;
  }
}

// Pflanzenbild hochladen (Bucket: plant-images)
export async function uploadPlantImage(uri, user_id) {
  const bucket = PLANT_BUCKET;
  const fileExt = uri.split('.').pop().split('?')[0];
  const fileName = `plant_${user_id}_${Date.now()}.${fileExt || 'jpg'}`;
  let fileData,
    contentType = 'image/jpeg';

  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    fileData = await res.blob();
    contentType = fileData.type || 'image/jpeg';
  } else {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    fileData = Buffer.from(base64, 'base64');
    contentType = 'image/jpeg';
  }

  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileName, fileData, { contentType, upsert: true });

  if (error) throw error;

  return fileName; // Stabiler Pfad, Signed URL wird on-demand generiert
}

// Chatbild hochladen (Bucket: chat-images)
// Gibt den Dateinamen (Pfad) zurueck, NICHT eine Signed URL
export async function uploadChatImage(uri, user_id) {
  const bucket = 'chat-images';
  const fileExt = uri.split('.').pop().split('?')[0];
  const fileName = `chat_${user_id}_${Date.now()}.${fileExt || 'jpg'}`;
  let fileData,
    contentType = 'image/jpeg';

  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    fileData = await res.blob();
    contentType = fileData.type || 'image/jpeg';
  } else {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    fileData = Buffer.from(base64, 'base64');
    contentType = 'image/jpeg';
  }

  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileName, fileData, { contentType, upsert: true });

  if (error) throw error;

  return fileName; // Stabiler Pfad, Signed URL wird on-demand generiert
}

// Feedback-Screenshot hochladen (Bucket: plant-images, Prefix: feedback/)
// Gibt den Storage-Pfad zurueck (Signed URL wird bei Bedarf generiert)
export async function uploadFeedbackImage(uri, user_id) {
  const bucket = PLANT_BUCKET;
  const fileExt = uri.split('.').pop().split('?')[0];
  const fileName = `feedback/fb_${user_id}_${Date.now()}.${fileExt || 'jpg'}`;
  let fileData,
    contentType = 'image/jpeg';

  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    fileData = await res.blob();
    contentType = fileData.type || 'image/jpeg';
  } else {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    fileData = Buffer.from(base64, 'base64');
    contentType = 'image/jpeg';
  }

  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileName, fileData, { contentType, upsert: true });

  if (error) throw error;

  return fileName;
}

// Signed URL fuer ein Chat-Bild generieren (1 Stunde gueltig)
export async function getChatImageUrl(imagePath) {
  if (!imagePath) return null;
  const { data, error } = await supabase.storage
    .from('chat-images')
    .createSignedUrl(imagePath, 60 * 60);
  if (error) return null;
  return data?.signedUrl || null;
}

/**
 * On-demand Signed URL fuer ein Pflanzenbild generieren (1 Stunde gueltig).
 * Legacy Signed-URLs vom eigenen Supabase-Projekt werden frisch neu signiert.
 */
export async function getPlantImageUrl(pathOrUrl) {
  if (!pathOrUrl) return null;

  const storagePath = extractPlantStoragePath(pathOrUrl);
  if (!storagePath) {
    return isWebImageUrl(pathOrUrl) ? pathOrUrl : null;
  }

  // Cache-Hit?
  const cached = getCachedSignedUrl(storagePath);
  if (cached) return cached;

  const { data, error } = await supabase.storage
    .from(PLANT_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);
  if (!error && data?.signedUrl) {
    setCachedSignedUrl(storagePath, data.signedUrl);
    return data.signedUrl;
  }

  // Fallback: if original value is already a web URL, keep it.
  return isWebImageUrl(pathOrUrl) ? pathOrUrl : null;
}

/**
 * Batch-Resolve: Mehrere Pflanzenbilder auf einmal (1 API-Call).
 * Gibt Array mit Signed URLs zurueck (gleiche Reihenfolge wie Input).
 * Legacy Signed-URLs vom eigenen Supabase-Projekt werden frisch neu signiert.
 */
export async function getPlantImageUrls(pathsOrUrls) {
  if (!pathsOrUrls?.length) return [];

  const result = new Array(pathsOrUrls.length).fill(null);
  const toSign = [];

  for (let i = 0; i < pathsOrUrls.length; i++) {
    const val = pathsOrUrls[i];
    if (!val) {
      result[i] = null;
      continue;
    }

    const storagePath = extractPlantStoragePath(val);
    if (storagePath) {
      // Cache-Hit? → direkt nutzen, kein API-Call nötig
      const cached = getCachedSignedUrl(storagePath);
      if (cached) {
        result[i] = cached;
        continue;
      }
      toSign.push({
        index: i,
        path: storagePath,
        fallback: isWebImageUrl(val) ? val : null,
      });
      continue;
    }

    result[i] = isWebImageUrl(val) ? val : null;
  }

  if (toSign.length > 0) {
    const { data, error } = await supabase.storage.from(PLANT_BUCKET).createSignedUrls(
      toSign.map((entry) => entry.path),
      60 * 60
    );

    for (let i = 0; i < toSign.length; i++) {
      const entry = toSign[i];
      if (!error && data?.[i]?.signedUrl) {
        result[entry.index] = data[i].signedUrl;
        setCachedSignedUrl(entry.path, data[i].signedUrl);
      } else {
        result[entry.index] = entry.fallback;
      }
    }
  }

  return result;
}
