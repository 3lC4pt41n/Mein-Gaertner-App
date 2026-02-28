import React, { useEffect, useState } from 'react';
import {
  View,
  TextInput,
  Button,
  Alert,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../supabase';
import {
  LANGUAGE_OPTIONS,
  getLanguageLabel,
  normalizeLanguage,
} from '../services/languageService';
import { generateGardenerAvatar } from '../services/aiService';
import { colors, spacing, radius } from '../theme';

async function createAvatarSignedUrl(path) {
  const { data, error } = await supabase
    .storage
    .from('chat-images')
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  if (error) throw error;
  return data?.signedUrl || null;
}

export default function ProfileCompleteScreen({ user, profile, onDone, showSkip }) {
  const [username, setUsername] = useState(profile?.username ?? '');
  const [firstName, setFirstName] = useState(profile?.first_name ?? '');
  const [lastName, setLastName] = useState(profile?.last_name ?? '');
  const [country, setCountry] = useState(profile?.country ?? '');
  const [language, setLanguage] = useState(normalizeLanguage(profile?.language));
  const [languageOpen, setLanguageOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingAvatar, setGeneratingAvatar] = useState(false);
  const [avatarPath, setAvatarPath] = useState(
    user?.user_metadata?.gardener_avatar_path || ''
  );
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(null);

  useEffect(() => {
    if (!avatarPath) return;
    createAvatarSignedUrl(avatarPath)
      .then(setAvatarPreviewUrl)
      .catch(() => setAvatarPreviewUrl(null));
  }, [avatarPath]);

  const handleCaptureAndGenerateAvatar = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Fehler", "Kamerazugriff wird für den Avatar benötigt.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled) return;

    const asset = result.assets?.[0];
    if (!asset?.base64) {
      Alert.alert("Fehler", "Konnte das Foto nicht lesen.");
      return;
    }

    setGeneratingAvatar(true);
    try {
      const avatarData = await generateGardenerAvatar(asset.base64, language);
      if (!avatarData?.avatar_path) {
        throw new Error("Avatar konnte nicht erstellt werden.");
      }

      const { error: updateError } = await supabase.auth.updateUser({
        data: { gardener_avatar_path: avatarData.avatar_path },
      });
      if (updateError) throw updateError;

      setAvatarPath(avatarData.avatar_path);
      setAvatarPreviewUrl(avatarData.avatar_url || null);
      Alert.alert("Erfolg", "Dein Gärtner-Avatar wurde erstellt.");
    } catch (error) {
      Alert.alert("Fehler", error.message || "Avatar-Generierung fehlgeschlagen.");
    } finally {
      setGeneratingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id) {
      Alert.alert("Fehler", "Kein User ID gefunden.");
      return;
    }

    if (!avatarPath) {
      Alert.alert(
        "Avatar fehlt",
        "Bitte nimm ein Foto auf und generiere deinen Gärtner-Avatar."
      );
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          username,
          first_name: firstName,
          last_name: lastName,
          country,
          language,
        })
        .eq('id', user.id);

      if (error) {
        Alert.alert("Fehler beim Speichern", error.message);
        return;
      }

      Alert.alert("Erfolg", "Profil gespeichert!");
      onDone && onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
      <Text>Benutzername</Text>
      <TextInput value={username} onChangeText={setUsername} style={{ borderWidth: 1, marginBottom: spacing.md }} />

      <Text>Vorname</Text>
      <TextInput value={firstName} onChangeText={setFirstName} style={{ borderWidth: 1, marginBottom: spacing.md }} />

      <Text>Nachname</Text>
      <TextInput value={lastName} onChangeText={setLastName} style={{ borderWidth: 1, marginBottom: spacing.md }} />

      <Text>Land</Text>
      <TextInput value={country} onChangeText={setCountry} style={{ borderWidth: 1, marginBottom: spacing.md }} />

      <Text>Sprache</Text>
      <TouchableOpacity
        onPress={() => setLanguageOpen((prev) => !prev)}
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          marginBottom: spacing.sm,
          padding: spacing.md,
          borderRadius: radius.sm,
          backgroundColor: colors.surface,
        }}
      >
        <Text>{getLanguageLabel(language)}</Text>
      </TouchableOpacity>

      {languageOpen && (
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, marginBottom: spacing.md }}>
          {LANGUAGE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.code}
              onPress={() => {
                setLanguage(option.code);
                setLanguageOpen(false);
              }}
              style={{
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.md,
                backgroundColor: language === option.code ? colors.primarySurface : colors.surface,
                borderBottomWidth: option.code === LANGUAGE_OPTIONS[LANGUAGE_OPTIONS.length - 1].code ? 0 : 1,
                borderBottomColor: colors.borderLight,
              }}
            >
              <Text>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={{ fontWeight: 'bold', marginTop: spacing.sm, marginBottom: spacing.sm }}>
        Letzter Schritt: Foto aufnehmen & Avatar erstellen
      </Text>
      <Button
        title="📷 Foto aufnehmen & Gärtner-Avatar generieren"
        onPress={handleCaptureAndGenerateAvatar}
        disabled={saving || generatingAvatar}
      />

      {generatingAvatar ? (
        <ActivityIndicator size="small" color={colors.primaryLight} style={{ marginTop: spacing.md }} />
      ) : null}

      {avatarPreviewUrl ? (
        <Image
          source={{ uri: avatarPreviewUrl }}
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            alignSelf: 'center',
            marginVertical: spacing.lg,
            borderWidth: 2,
            borderColor: colors.primaryLight,
          }}
        />
      ) : (
        <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.md }}>
          Noch kein Avatar erstellt.
        </Text>
      )}

      <Button title="Profil speichern" onPress={handleSave} disabled={saving || generatingAvatar} />

      {showSkip && (
        <View style={{ marginTop: spacing.lg }}>
          <Button title="Überspringen" color="gray" onPress={onDone} disabled={saving || generatingAvatar} />
        </View>
      )}
    </ScrollView>
  );
}
