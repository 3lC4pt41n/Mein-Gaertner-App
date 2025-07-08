import { supabase } from '../supabase';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Buffer } from 'buffer'; // npm install buffer

// Pflanzenbild hochladen (Bucket: plant-images)
export async function uploadPlantImage(uri, user_id) {
  const bucket = 'plant-images';
  const fileExt = uri.split('.').pop().split('?')[0];
  const fileName = `plant_${user_id}_${Date.now()}.${fileExt || 'jpg'}`;
  let fileData, contentType = 'image/jpeg';

  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    fileData = await res.blob();
    contentType = fileData.type || 'image/jpeg';
  } else {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    fileData = Buffer.from(base64, 'base64');
    contentType = 'image/jpeg';
  }

  const { error } = await supabase
    .storage
    .from(bucket)
    .upload(fileName, fileData, { contentType, upsert: true });

  if (error) throw error;

  const { data: urlData, error: urlError } = await supabase
    .storage
    .from(bucket)
    .createSignedUrl(fileName, 60 * 60 * 24 * 7);

  if (urlError) throw urlError;

  return urlData.signedUrl;
}

// Chatbild hochladen (Bucket: chat-images)
export async function uploadChatImage(uri, user_id) {
  const bucket = 'chat-images';
  const fileExt = uri.split('.').pop().split('?')[0];
  const fileName = `chat_${user_id}_${Date.now()}.${fileExt || 'jpg'}`;
  let fileData, contentType = 'image/jpeg';

  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    fileData = await res.blob();
    contentType = fileData.type || 'image/jpeg';
  } else {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    fileData = Buffer.from(base64, 'base64');
    contentType = 'image/jpeg';
  }

  const { error } = await supabase
    .storage
    .from(bucket)
    .upload(fileName, fileData, { contentType, upsert: true });

  if (error) throw error;

  const { data: urlData, error: urlError } = await supabase
    .storage
    .from(bucket)
    .createSignedUrl(fileName, 60 * 60 * 24 * 7);

  if (urlError) throw urlError;

  return urlData.signedUrl;
}
