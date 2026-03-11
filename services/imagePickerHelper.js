/**
 * imagePickerHelper.js — Wrapper um expo-image-picker mit automatischem
 * Fallback wenn der Crop-Editor auf bestimmten Android-Geräten nicht
 * unterstützt wird (UnsupportedPlatformError / ExpoCropImageActivity).
 *
 * Statt `ImagePicker.launchCameraAsync(opts)` direkt aufzurufen,
 * nutzen alle Screens `safeLaunchCamera(opts)` bzw. `safeLaunchLibrary(opts)`.
 */
import * as ImagePicker from 'expo-image-picker';

/**
 * Prüft ob ein Error ein "method not available on this platform"-Fehler ist,
 * der vom Crop-Editor auf bestimmten Android-Geräten geworfen wird.
 */
function isCropUnsupportedError(error) {
  if (!error) return false;
  const msg = error.message || '';
  return (
    msg.includes('not available in the current platform') ||
    msg.includes('UnsupportedPlatformError') ||
    error.code === 'ERR_IMAGE_PICKER_UNSUPPORTED'
  );
}

/**
 * Startet die Kamera. Falls `allowsEditing: true` und der Crop-Editor
 * auf dem Gerät nicht funktioniert, wird automatisch ohne Editing wiederholt.
 */
export async function safeLaunchCamera(options = {}) {
  try {
    return await ImagePicker.launchCameraAsync(options);
  } catch (error) {
    if (options.allowsEditing && isCropUnsupportedError(error)) {
      // Crop wird nicht unterstützt — Fallback ohne Editor (kein Sentry-Error nötig)
      console.warn('[imagePickerHelper] Crop-Editor nicht verfügbar, Fallback ohne Editing', error.message);
      return await ImagePicker.launchCameraAsync({
        ...options,
        allowsEditing: false,
      });
    }
    throw error;
  }
}

/**
 * Öffnet die Medienbibliothek. Falls `allowsEditing: true` und der
 * Crop-Editor nicht funktioniert, wird automatisch ohne Editing wiederholt.
 */
export async function safeLaunchLibrary(options = {}) {
  try {
    return await ImagePicker.launchImageLibraryAsync(options);
  } catch (error) {
    if (options.allowsEditing && isCropUnsupportedError(error)) {
      // Crop wird nicht unterstützt — Fallback ohne Editor (kein Sentry-Error nötig)
      console.warn('[imagePickerHelper] Crop-Editor nicht verfügbar, Fallback ohne Editing', error.message);
      return await ImagePicker.launchImageLibraryAsync({
        ...options,
        allowsEditing: false,
      });
    }
    throw error;
  }
}
