import React, { useEffect, useState, useRef } from 'react';
import { View, Alert, Text, Image, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { safeLaunchCamera } from '../services/imagePickerHelper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { LANGUAGE_OPTIONS, normalizeLanguage } from '../services/languageService';
import { generateGardenerAvatar } from '../services/aiService';
import { colors, spacing } from '../theme/tokens';
import DSButton from '../theme/DSButton';
import DSInput from '../theme/DSInput';
import DSCard from '../theme/DSCard';
import DSChipGroup from '../theme/DSChips';
import { t } from '../i18n';

const DRAFT_KEY = 'profile_draft';

// In-memory cache that survives component remounts within the same app session.
// When supabase.auth.updateUser() triggers an auth state change, the component
// may unmount/remount and useState would re-initialise from stale profile props.
// This cache provides the form values synchronously on remount, before the async
// AsyncStorage draft can be loaded.
let formCache = null;

async function createAvatarSignedUrl(path) {
  const { data, error } = await supabase.storage
    .from('chat-images')
    .createSignedUrl(path, 60 * 60 * 24 * 30);
  if (error) throw error;
  return data?.signedUrl || null;
}

export default function ProfileCompleteScreen({ user, profile, onDone, showSkip }) {
  const [username, setUsername] = useState(() => formCache?.username ?? profile?.username ?? '');
  const [firstName, setFirstName] = useState(() => formCache?.firstName ?? profile?.first_name ?? '');
  const [lastName, setLastName] = useState(() => formCache?.lastName ?? profile?.last_name ?? '');
  const [country, setCountry] = useState(() => formCache?.country ?? profile?.country ?? '');
  const [language, setLanguage] = useState(() => formCache?.language ?? normalizeLanguage(profile?.language));
  const [saving, setSaving] = useState(false);
  const [generatingAvatar, setGeneratingAvatar] = useState(false);
  const [avatarPath, setAvatarPath] = useState(user?.user_metadata?.gardener_avatar_path || '');
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(null);
  const draftLoaded = useRef(false);

  // Keep in-memory cache in sync with form fields so remounts pick up latest values
  useEffect(() => {
    formCache = { username, firstName, lastName, country, language };
  }, [username, firstName, lastName, country, language]);

  // Restore draft form data from AsyncStorage as a fallback
  // (handles app restart during avatar generation where formCache is lost)
  useEffect(() => {
    if (draftLoaded.current) return;
    draftLoaded.current = true;
    // Only restore from AsyncStorage if we didn't already have values from formCache
    if (formCache && (formCache.username || formCache.firstName)) return;
    AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
      if (!raw) return;
      try {
        const d = JSON.parse(raw);
        if (d.username) setUsername(d.username);
        if (d.firstName) setFirstName(d.firstName);
        if (d.lastName) setLastName(d.lastName);
        if (d.country) setCountry(d.country);
        if (d.language) setLanguage(d.language);
      } catch (_e) {
        // ignore
      }
    });
  }, []);

  useEffect(() => {
    if (!avatarPath) return;
    createAvatarSignedUrl(avatarPath)
      .then(setAvatarPreviewUrl)
      .catch(() => setAvatarPreviewUrl(null));
  }, [avatarPath]);

  const handleCaptureAndGenerateAvatar = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('common.error'), t('profile.cameraRequired'));
      return;
    }

    const result = await safeLaunchCamera({
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled) return;

    const asset = result.assets?.[0];
    if (!asset?.base64) {
      Alert.alert(t('common.error'), t('profile.photoReadError'));
      return;
    }

    setGeneratingAvatar(true);
    try {
      // Persist form data before avatar call (auth state change may re-mount component)
      await AsyncStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ username, firstName, lastName, country, language })
      );
      const avatarData = await generateGardenerAvatar(asset.base64, language);
      if (!avatarData?.avatar_path) {
        throw new Error(t('profile.avatarCreateError'));
      }

      const { error: updateError } = await supabase.auth.updateUser({
        data: { gardener_avatar_path: avatarData.avatar_path },
      });
      if (updateError) throw updateError;

      setAvatarPath(avatarData.avatar_path);
      setAvatarPreviewUrl(avatarData.avatar_url || null);
      Alert.alert(t('common.success'), t('profile.avatarCreated'));
    } catch (error) {
      Alert.alert(t('common.error'), error.message || t('profile.avatarFailed'));
    } finally {
      setGeneratingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id) {
      Alert.alert(t('common.error'), t('profile.noUserId'));
      return;
    }

    // Validate all required fields before saving
    const missing = [];
    if (!username.trim()) missing.push(t('profile.username'));
    if (!firstName.trim()) missing.push(t('profile.firstName'));
    if (!lastName.trim()) missing.push(t('profile.lastName'));
    if (!country.trim()) missing.push(t('profile.country'));
    if (!language) missing.push(t('profile.language'));

    if (missing.length > 0) {
      Alert.alert(
        t('common.validation') || 'Pflichtfelder',
        (t('profile.missingFields') || 'Bitte fülle alle Felder aus') + ':\n' + missing.join(', ')
      );
      return;
    }

    if (!avatarPath) {
      Alert.alert(t('profile.avatarMissing'), t('profile.avatarMissingMessage'));
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ username, first_name: firstName, last_name: lastName, country, language })
        .eq('id', user.id);

      if (error) {
        Alert.alert(t('profile.saveProfileError'), error.message);
        return;
      }

      await AsyncStorage.removeItem(DRAFT_KEY);
      formCache = null;
      Alert.alert(t('common.success'), t('profile.profileSaved'));
      onDone && onDone();
    } finally {
      setSaving(false);
    }
  };

  const langChips = LANGUAGE_OPTIONS.map((opt) => ({
    key: opt.code,
    label: opt.label,
  }));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ── Profile Fields ── */}
      <DSCard variant="elevated" padding="lg">
        <Text style={styles.heading}>{t('profile.completeProfile')}</Text>

        <DSInput
          label={t('profile.username')}
          icon="at"
          value={username}
          onChangeText={setUsername}
          placeholder={t('profile.usernamePlaceholder')}
        />
        <DSInput
          label={t('profile.firstName')}
          icon="person-outline"
          value={firstName}
          onChangeText={setFirstName}
        />
        <DSInput
          label={t('profile.lastName')}
          icon="person-outline"
          value={lastName}
          onChangeText={setLastName}
        />
        <DSInput
          label={t('profile.country')}
          icon="globe-outline"
          value={country}
          onChangeText={setCountry}
        />

        <Text style={styles.fieldLabel}>{t('profile.language')}</Text>
        <DSChipGroup
          items={langChips}
          selected={language}
          onSelect={setLanguage}
          variant="pills"
          scrollable
          style={{ marginBottom: spacing.md }}
        />
      </DSCard>

      {/* ── Avatar ── */}
      <DSCard variant="elevated" padding="lg">
        <Text style={styles.subheading}>{t('profile.avatarStep')}</Text>

        <View style={styles.avatarContainer}>
          {avatarPreviewUrl ? (
            <Image source={{ uri: avatarPreviewUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={48} color={colors.textTertiary} />
            </View>
          )}
        </View>

        {generatingAvatar && (
          <ActivityIndicator
            size="small"
            color={colors.primaryLight}
            style={{ marginBottom: spacing.sm }}
          />
        )}

        <DSButton
          icon="camera-outline"
          onPress={handleCaptureAndGenerateAvatar}
          disabled={saving || generatingAvatar}
          fullWidth
        >
          {avatarPreviewUrl ? t('profile.retakeAvatar') : t('profile.avatarButton')}
        </DSButton>
      </DSCard>

      {/* ── Save ── */}
      <DSButton
        onPress={handleSave}
        disabled={saving || generatingAvatar}
        fullWidth
        loading={saving}
        icon="checkmark-circle-outline"
        style={{ marginTop: spacing.sm }}
      >
        {t('profile.saveProfile')}
      </DSButton>

      {showSkip && (
        <DSButton
          variant="ghost"
          onPress={async () => {
            try {
              await supabase
                .from('profiles')
                .update({ profile_setup_skipped: true })
                .eq('id', user.id);
              await AsyncStorage.removeItem(DRAFT_KEY);
              formCache = null;
            } catch (_e) {
              // Best-effort
            }
            onDone && onDone();
          }}
          disabled={saving || generatingAvatar}
          fullWidth
          style={{ marginTop: spacing.sm }}
        >
          {t('common.skip')}
        </DSButton>
      )}

      <View style={{ height: spacing.xxxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  heading: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  subheading: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  avatarContainer: { alignItems: 'center', marginBottom: spacing.md },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: colors.primarySurface,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
