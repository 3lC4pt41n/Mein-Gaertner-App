import { supabase } from '../supabase';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

export async function uploadChatImage(uri, user_id) {
  const fileExt = uri.split('.').pop();
  const fileName = `chat_${user_id}_${Date.now()}.${fileExt || 'jpg'}`;
  const bucket = 'chat-images';

  let uploadResult;
  if (Platform.OS === "web") {
    const res = await fetch(uri);
    const blob = await res.blob();
    uploadResult = await supabase.storage.from(bucket).upload(fileName, blob, {
      contentType: blob.type,
      upsert: true,
    });
  } else {
    const file = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    uploadResult = await supabase.storage.from(bucket).upload(fileName, Buffer.from(file, 'base64'), {
      contentType: "image/jpeg",
      upsert: true,
    });
  }
  if (uploadResult.error) throw uploadResult.error;

  const { data: urlData, error: urlError } = await supabase
    .storage.from(bucket)
    .createSignedUrl(fileName, 60 * 60 * 24);
  if (urlError) throw urlError;

  return urlData?.signedUrl;
}
