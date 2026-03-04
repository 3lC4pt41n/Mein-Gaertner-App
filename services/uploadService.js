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

  const { data: urlData, error: urlError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(fileName, 60 * 60 * 24 * 7);

  if (urlError) throw urlError;

  return urlData.signedUrl;
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

// Signed URL fuer ein Chat-Bild generieren (1 Stunde gueltig)
export async function getChatImageUrl(imagePath) {
  if (!imagePath) return null;
  const { data, error } = await supabase.storage
    .from('chat-images')
    .createSignedUrl(imagePath, 60 * 60);
  if (error) return null;
  return data?.signedUrl || null;
}
