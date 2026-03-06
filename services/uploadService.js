import { supabase } from '../supabase';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer'; // npm install buffer

// Pflanzenbild hochladen (Bucket: plant-images)
export async function uploadPlantImage(uri, user_id) {
  const bucket = 'plant-images';
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
  const bucket = 'plant-images';
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
 * Legacy-URLs (http/https) werden direkt durchgereicht.
 */
export async function getPlantImageUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith('http')) return pathOrUrl; // Legacy Signed URL
  const { data, error } = await supabase.storage
    .from('plant-images')
    .createSignedUrl(pathOrUrl, 60 * 60);
  if (error) return null;
  return data?.signedUrl || null;
}

/**
 * Batch-Resolve: Mehrere Pflanzenbilder auf einmal (1 API-Call).
 * Gibt Array mit Signed URLs zurueck (gleiche Reihenfolge wie Input).
 * Legacy-URLs werden direkt durchgereicht.
 */
export async function getPlantImageUrls(pathsOrUrls) {
  if (!pathsOrUrls?.length) return [];

  const result = new Array(pathsOrUrls.length).fill(null);
  const pathIndices = [];
  const paths = [];

  for (let i = 0; i < pathsOrUrls.length; i++) {
    const val = pathsOrUrls[i];
    if (!val) {
      result[i] = null;
    } else if (val.startsWith('http')) {
      result[i] = val; // Legacy URL passthrough
    } else {
      pathIndices.push(i);
      paths.push(val);
    }
  }

  if (paths.length > 0) {
    const { data, error } = await supabase.storage
      .from('plant-images')
      .createSignedUrls(paths, 60 * 60);

    if (!error && data) {
      for (let j = 0; j < pathIndices.length; j++) {
        result[pathIndices[j]] = data[j]?.signedUrl || null;
      }
    }
  }

  return result;
}
