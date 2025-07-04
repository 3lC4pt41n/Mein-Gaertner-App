import { supabase } from '../supabase';
import { decode } from 'base-64'; // <-- Ergänze das Paket!
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

// Funktion zum Umwandeln von Base64 zu Blob (React Native kompatibel!)
function base64ToBlob(base64Data, contentType) {
  const byteCharacters = decode(base64Data);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  return new Blob(byteArrays, { type: contentType });
}

// NEUE Upload-Funktion speziell für Chat mit Base64
export async function uploadChatImageBase64(base64, user_id) {
  const fileName = `chat_${user_id}_${Date.now()}.jpg`;
  const blob = base64ToBlob(base64, 'image/jpeg');

  const { error } = await supabase.storage
    .from('chat-images')
    .upload(fileName, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) throw error;

  const { data: urlData, error: urlError } = await supabase.storage
    .from('chat-images')
    .createSignedUrl(fileName, 60 * 60 * 24 * 7);

  if (urlError) throw urlError;

  return urlData.signedUrl;
}

// Deine bisherigen Upload-Funktionen (Pflanzenbilder)
export async function uploadPlantImage(uri, user_id) {
  const fileName = `plant_${user_id}_${Date.now()}.jpg`;
  let fileData, contentType = 'image/jpeg';

  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    fileData = await res.blob();
    contentType = fileData.type || 'image/jpeg';
  } else {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) throw new Error('File does not exist: ' + uri);
    const base64Data = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    fileData = base64ToBlob(base64Data, 'image/jpeg');
  }

  const { error } = await supabase
    .storage
    .from('plant-images')
    .upload(fileName, fileData, { contentType, upsert: true });

  if (error) throw error;

  const { data: urlData, error: urlError } = await supabase
    .storage
    .from('plant-images')
    .createSignedUrl(fileName, 60 * 60 * 24 * 7);

  if (urlError) throw urlError;

  return urlData.signedUrl;
}

export async function uploadChatImage(uri, user_id) {
  const fileName = `chat_${user_id}_${Date.now()}.jpg`;
  let fileData, contentType = 'image/jpeg';

  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    fileData = await res.blob();
    contentType = fileData.type || 'image/jpeg';
  } else {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) throw new Error('File does not exist: ' + uri);
    const base64Data = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    fileData = base64ToBlob(base64Data, 'image/jpeg');
  }

  const { error } = await supabase
    .storage
    .from('chat-images')
    .upload(fileName, fileData, { contentType, upsert: true });

  if (error) throw error;

  const { data: urlData, error: urlError } = await supabase
    .storage
    .from('chat-images')
    .createSignedUrl(fileName, 60 * 60 * 24 * 7);

  if (urlError) throw urlError;

  return urlData.signedUrl;
}