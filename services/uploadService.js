import { supabase } from '../supabase';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

// *** Hilfsfunktion: Upload einer Datei in einen Supabase Bucket ***
async function uploadImageToBucket(bucket, uri, user_id, prefix = '') {
  const fileExt = uri.split('.').pop().split('?')[0];
  const fileName = `${prefix}${user_id}_${Date.now()}.${fileExt || 'jpg'}`;
  let fileData, contentType = 'image/jpeg';

  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    fileData = await res.blob();
    contentType = fileData.type || 'image/jpeg';
  } else {
    // KEIN "file://" ergänzen!
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) throw new Error('File does not exist: ' + uri);
    fileData = await (await fetch(uri)).blob();
    contentType = fileData.type || 'image/jpeg';
  }

  // Upload
  const { error } = await supabase
    .storage
    .from(bucket)
    .upload(fileName, fileData, { contentType, upsert: true });
  if (error) throw error;

  // Signed URL für den Zugriff (7 Tage gültig)
  const { data: urlData, error: urlError } = await supabase
    .storage
    .from(bucket)
    .createSignedUrl(fileName, 60 * 60 * 24 * 7);
  if (urlError) throw urlError;

  return urlData.signedUrl;
}

// *** Pflanze: plant-images ***
export async function uploadPlantImage(uri, user_id) {
  return uploadImageToBucket('plant-images', uri, user_id, 'plant_');
}

// *** Chat: chat-images ***
export async function uploadChatImage(uri, user_id) {
  return uploadImageToBucket('chat-images', uri, user_id, 'chat_');
}
