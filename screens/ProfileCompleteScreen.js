import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { safeLaunchCamera, safeLaunchLibrary } from '../services/imagePickerHelper';
import { supabase } from '../supabase';
import { LANGUAGE_OPTIONS, normalizeLanguage } from '../services/languageService';
import { generateGardenerAvatar } from '../services/aiService';
import { colors, radius, spacing } from '../theme/tokens';
import DSButton from '../theme/DSButton';
import DSInput from '../theme/DSInput';
import DSCard from '../theme/DSCard';
import DSChipGroup from '../theme/DSChips';
import { t } from '../i18n';

const DRAFT_KEY = 'profile_draft';

// In-memory cache survives auth-state remounts while avatar generation updates
// user metadata. Keep it intentionally small: onboarding only needs two fields.
let formCache = null;

async function createAvatarSignedUrl(path) {
  const { data, error } = await supabase.storage
    .from('chat-images')
    .createSignedUrl(path, 60 * 60 * 24 * 30);
  if (error) throw error;
  return data?.signedUrl || null;
}

function AvatarOption({ icon, title, subtitle, onPress, disabled }) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={[styles.avatarOption, disabled && styles.avatarOptionDisabled]}
    >
      <View style={styles.avatarOptionIcon}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={styles.avatarOptionCopy}>
        <Text style={styles.avatarOptionTitle}>{title}</Text>
        <Text style={styles.avatarOptionSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

export default function ProfileCompleteScreen({ user, profile, onDone }) {
  const [username, setUsername] = useState(() => formCache?.username ?? profile?.username ?? '');
  const [language, setLanguage] = useState(
    () => formCache?.language ?? normalizeLanguage(profile?.language)
  );
  const [saving, setSaving] = useState(false);
  const [generatingAvatar, setGeneratingAvatar] = useState(false);
  const [avatarPath, setAvatarPath] = useState(user?.user_metadata?.gardener_avatar_path || '');
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(null);
  const draftLoaded = useRef(false);

  useEffect(() => {
    formCache = { username, language };
  }, [username, language]);

  useEffect(() => {
    if (draftLoaded.current) return;
    draftLoaded.current = true;
    if (formCache?.username) return;

    AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
      if (!raw) return;
      try {
        const draft = JSON.parse(raw);
        if (draft.username) setUsername(draft.username);
        if (draft.language) setLanguage(normalizeLanguage(draft.language));
      } catch (_e) {
        // Ignore stale or malformed local drafts.
      }
    });
  }, []);

  useEffect(() => {
    if (!avatarPath) {
      setAvatarPreviewUrl(null);
      return;
    }

    createAvatarSignedUrl(avatarPath)
      .then(setAvatarPreviewUrl)
      .catch(() => setAvatarPreviewUrl(null));
  }, [avatarPath]);

  const processAvatarGeneration = async (base64, isGeneric = false) => {
    setGeneratingAvatar(true);
    try {
      await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ username, language }));

      const avatarData = await generateGardenerAvatar(base64, language, isGeneric);
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

  const handlePickFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('common.error'), t('profile.cameraRequired'));
      return;
    }

    const result = await safeLaunchCamera({
      mediaTypes: ['images'],
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

    await processAvatarGeneration(asset.base64);
  };

  const handlePickFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('common.error'), t('profile.libraryRequired'));
      return;
    }

    const result = await safeLaunchLibrary({
      mediaTypes: ['images'],
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

    await processAvatarGeneration(asset.base64);
  };

  const handleGenerateGenericAvatar = async () => {
    await processAvatarGeneration(null, true);
  };

  const handleSave = async () => {
    if (!user?.id) {
      Alert.alert(t('common.error'), t('profile.noUserId'));
      return;
    }

    const missing = [];
    if (!username.trim()) missing.push(t('profile.username'));
    if (!language) missing.push(t('profile.language'));

    if (missing.length > 0) {
      Alert.alert(
        t('common.validation') || 'Validation',
        `${t('profile.missingFields') || 'Please fill in'}:\n${missing.join(', ')}`
      );
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          username: username.trim(),
          language,
          profile_setup_skipped: false,
        })
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

  const busy = saving || generatingAvatar;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <DSCard variant="elevated" padding="lg">
        <Text style={styles.heading}>{t('profile.completeProfile')}</Text>
        <Text style={styles.intro}>{t('profile.profileIntro')}</Text>

        <DSInput
          label={t('profile.username')}
          icon="at"
          value={username}
          onChangeText={setUsername}
          placeholder={t('profile.usernamePlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.fieldLabel}>{t('profile.language')}</Text>
        <DSChipGroup
          items={langChips}
          selected={language}
          onSelect={setLanguage}
          variant="pills"
          scrollable
          style={styles.languageChips}
        />
      </DSCard>

      <DSCard variant="elevated" padding="lg">
        <Text style={styles.subheading}>{t('profile.avatarStep')}</Text>
        <Text style={styles.avatarHint}>{t('profile.avatarOptionalHint')}</Text>

        <View style={styles.avatarContainer}>
          <View style={styles.avatarPreview}>
            {avatarPreviewUrl ? (
              <Image source={{ uri: avatarPreviewUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={48} color={colors.textTertiary} />
              </View>
            )}

            {generatingAvatar && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator size="small" color={colors.surface} />
              </View>
            )}
          </View>
        </View>

        <View style={styles.avatarActions}>
          <AvatarOption
            icon="sparkles-outline"
            title={t('profile.avatarGeneric')}
            subtitle={t('profile.avatarGenericHint')}
            onPress={handleGenerateGenericAvatar}
            disabled={busy}
          />
          <AvatarOption
            icon="camera-outline"
            title={t('profile.avatarFromCamera')}
            subtitle={t('profile.avatarCameraHint')}
            onPress={handlePickFromCamera}
            disabled={busy}
          />
          <AvatarOption
            icon="images-outline"
            title={t('profile.avatarFromGallery')}
            subtitle={t('profile.avatarGalleryHint')}
            onPress={handlePickFromGallery}
            disabled={busy}
          />
        </View>
      </DSCard>

      <DSButton
        onPress={handleSave}
        disabled={busy}
        fullWidth
        loading={saving}
        icon="checkmark-circle-outline"
        style={styles.saveButton}
      >
        {t('profile.saveProfile')}
      </DSButton>

      <View style={styles.bottomSpacer} />
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
    marginBottom: spacing.sm,
  },
  intro: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  subheading: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  languageChips: {
    marginBottom: spacing.sm,
  },
  avatarHint: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  avatarPreview: {
    position: 'relative',
  },
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
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
  avatarActions: {
    gap: spacing.sm,
  },
  avatarOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 72,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  avatarOptionDisabled: {
    opacity: 0.55,
  },
  avatarOptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOptionCopy: {
    flex: 1,
  },
  avatarOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  avatarOptionSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  saveButton: {
    marginTop: spacing.sm,
  },
  bottomSpacer: {
    height: spacing.xxxl,
  },
});
