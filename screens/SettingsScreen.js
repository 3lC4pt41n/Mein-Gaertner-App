// SettingsScreen.js – Profil, Einstellungen, Datenschutz, Konto, App-Info
// ---------------------------------------------------------------------
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  Alert,
  Linking,
  Image,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { safeLaunchCamera, safeLaunchLibrary } from '../services/imagePickerHelper';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { t } from '../i18n';
import { colors, spacing } from '../theme/tokens';
import DSButton from '../theme/DSButton';
import DSInput from '../theme/DSInput';
import DSCard from '../theme/DSCard';
import DSChipGroup from '../theme/DSChips';
import { LANGUAGE_OPTIONS, normalizeLanguage } from '../services/languageService';
import { generateGardenerAvatar } from '../services/aiService';
import { openManageSubscriptions } from '../services/purchaseService';
import { rescheduleAllTaskReminders } from '../services/notificationService';
import { fetchTasks } from '../services/taskService';
import { SHOW_TERMS_LINK } from '../services/featureFlags';
import {
  DEFAULT_GARDENER_PERSONA_KEY,
  GARDENER_PERSONAS,
  getGardenerPersona,
  loadGardenerPersonaKey,
  saveGardenerPersonaKey,
} from '../services/gardenerPersonaService';

// ---------- Helpers ---------------------------------------------------

async function createAvatarSignedUrl(path) {
  const { data, error } = await supabase.storage
    .from('chat-images')
    .createSignedUrl(path, 60 * 60 * 24 * 30);
  if (error) throw error;
  return data?.signedUrl || null;
}

// ---------- Section Header Component -----------------------------------

function SectionHeader({ icon, title }) {
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={18} color={colors.primary} style={styles.sectionIcon} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ---------- Toggle Row Component ---------------------------------------

function ToggleRow({ label, hint, value, onValueChange }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleTextContainer}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.toggleHint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.borderLight, true: colors.primaryLight }}
        thumbColor={value ? colors.primary : '#f4f3f4'}
      />
    </View>
  );
}

// ---------- Link Row Component -----------------------------------------

function LinkRow({ icon, label, onPress }) {
  return (
    <TouchableOpacity style={styles.linkRow} onPress={onPress} activeOpacity={0.6}>
      <View style={styles.linkRowLeft}>
        <Ionicons
          name={icon}
          size={18}
          color={colors.textSecondary}
          style={{ marginRight: spacing.md }}
        />
        <Text style={styles.linkLabel}>{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

// =====================================================================
// MAIN COMPONENT
// =====================================================================

export default function SettingsScreen({ navigation }) {
  const { user, profile, signOut, deleteAccount, updateProfile, refreshProfile } = useAuth();
  const { setLanguage: setAppLanguage } = useLanguage();

  // --- Profile state ---
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [generatingAvatar, setGeneratingAvatar] = useState(false);

  // --- Preferences state ---
  const [language, setLanguageState] = useState('de');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [gardenerPersonaKey, setGardenerPersonaKey] = useState(DEFAULT_GARDENER_PERSONA_KEY);

  // --- Privacy state ---
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(false);
  const [heatmapOptIn, setHeatmapOptIn] = useState(false);
  const [publicDisplayName, setPublicDisplayName] = useState('');

  // --- UI state ---
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // --- Auto-save public display name on screen leave ---
  const displayNameRef = useRef(publicDisplayName);
  const initialDisplayNameRef = useRef('');
  useEffect(() => {
    displayNameRef.current = publicDisplayName;
  }, [publicDisplayName]);
  useEffect(() => {
    if (profile) initialDisplayNameRef.current = profile.public_display_name ?? '';
  }, [profile]);
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      if (displayNameRef.current !== initialDisplayNameRef.current) {
        updateProfile({ public_display_name: displayNameRef.current }).catch((err) => {
          console.warn('Auto-save display name failed:', err?.message);
          // Show non-blocking alert so the user knows the save failed
          Alert.alert(
            t('common.error'),
            t('settings.displayNameSaveError') || t('settings.profileSaveError')
          );
        });
      }
    });
    return unsubscribe;
  }, [navigation, updateProfile]);

  // --- Initialize from profile ---
  useEffect(() => {
    if (profile) {
      setUsername(profile.username ?? '');
      setFirstName(profile.first_name ?? '');
      setLastName(profile.last_name ?? '');
      setLanguageState(normalizeLanguage(profile.language));
      setNotificationsEnabled(profile.notifications_enabled ?? true);
      setLeaderboardOptIn(profile.leaderboard_opt_in ?? false);
      setHeatmapOptIn(profile.heatmap_opt_in ?? false);
      setPublicDisplayName(profile.public_display_name ?? '');
    }
  }, [profile]);

  useEffect(() => {
    let mounted = true;
    loadGardenerPersonaKey(user?.id).then((key) => {
      if (mounted) setGardenerPersonaKey(key);
    });
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  // --- Avatar URL ---
  useEffect(() => {
    const path = user?.user_metadata?.gardener_avatar_path;
    if (!path) {
      setAvatarUrl(null);
      return;
    }
    createAvatarSignedUrl(path)
      .then(setAvatarUrl)
      .catch((error) => {
        if (__DEV__) {
          console.warn('[SettingsScreen] createAvatarSignedUrl failed:', error?.message);
        }
        setAvatarUrl(null);
      });
  }, [user?.user_metadata?.gardener_avatar_path]);

  // --- Pull to refresh ---
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  }, [refreshProfile]);

  // =====================================================================
  // HANDLERS
  // =====================================================================

  const processAvatarGeneration = async (base64, isGeneric = false) => {
    setGeneratingAvatar(true);
    try {
      const avatarData = await generateGardenerAvatar(base64, language, isGeneric);
      if (!avatarData?.avatar_path) throw new Error(t('profile.avatarCreateError'));

      await supabase.auth.updateUser({
        data: { gardener_avatar_path: avatarData.avatar_path },
      });
      setAvatarUrl(avatarData.avatar_url || null);
      Alert.alert(t('common.success'), t('profile.avatarCreated'));
    } catch (error) {
      Alert.alert(t('common.error'), error.message || t('profile.avatarFailed'));
    } finally {
      setGeneratingAvatar(false);
    }
  };

  const handlePickFromCamera = async () => {
    try {
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
    } catch (error) {
      Alert.alert(t('common.error'), error.message || t('profile.photoReadError'));
    }
  };

  const handlePickFromGallery = async () => {
    try {
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
    } catch (error) {
      Alert.alert(t('common.error'), error.message || t('profile.photoReadError'));
    }
  };

  const handleGenerateGenericAvatar = async () => {
    await processAvatarGeneration(null, true);
  };

  const handleAvatarChange = () => {
    Alert.alert(t('profile.avatarSourceTitle'), t('profile.avatarSourceMessage', { credits: 20 }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.avatarFromCamera'), onPress: handlePickFromCamera },
      { text: t('profile.avatarFromGallery'), onPress: handlePickFromGallery },
      { text: t('profile.avatarGeneric'), onPress: handleGenerateGenericAvatar },
    ]);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateProfile({
        username,
        first_name: firstName,
        last_name: lastName,
      });
      setDirty(false);
      Alert.alert(t('common.success'), t('settings.profileSaved'));
    } catch (_error) {
      Alert.alert(t('common.error'), t('settings.profileSaveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleLanguageChange = async (code) => {
    const previousLanguage = language;
    setLanguageState(code);
    try {
      const appliedLanguage = await setAppLanguage(code);
      setLanguageState(appliedLanguage);
      await updateProfile({ language: appliedLanguage });
    } catch (error) {
      setLanguageState(previousLanguage);
      await setAppLanguage(previousLanguage);
      Alert.alert(t('common.error'), error?.message || t('settings.profileSaveError'));
    }
  };

  const handleGardenerPersonaChange = async (personaKey) => {
    setGardenerPersonaKey(personaKey);
    try {
      await saveGardenerPersonaKey(user?.id, personaKey);
    } catch (error) {
      if (__DEV__) {
        console.warn('[SettingsScreen] save gardener persona failed:', error?.message);
      }
    }
  };

  const handleLeaderboardToggle = async (val) => {
    setLeaderboardOptIn(val);
    try {
      await updateProfile({ leaderboard_opt_in: val });
    } catch (error) {
      setLeaderboardOptIn(!val); // Revert on error
      Alert.alert(t('common.error'), error?.message || t('settings.profileSaveError'));
    }
  };

  const handleHeatmapToggle = async (val) => {
    setHeatmapOptIn(val);
    try {
      await updateProfile({ heatmap_opt_in: val });
    } catch (error) {
      setHeatmapOptIn(!val); // Revert on error
      Alert.alert(t('common.error'), error?.message || t('settings.profileSaveError'));
    }
  };

  const handlePublicDisplayNameSave = async () => {
    try {
      await updateProfile({ public_display_name: publicDisplayName });
    } catch (error) {
      Alert.alert(t('common.error'), error?.message || t('settings.profileSaveError'));
    }
  };

  const handleLogout = () => {
    Alert.alert(t('settings.logoutConfirmTitle'), t('settings.logoutConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.logout'),
        onPress: async () => {
          try {
            await signOut();
          } catch (error) {
            Alert.alert(t('common.error'), error.message);
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(t('settings.deleteConfirmTitle'), t('settings.deleteConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.deleteConfirmButton'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAccount();
          } catch (error) {
            Alert.alert(t('common.error'), error.message);
          }
        },
      },
    ]);
  };

  const handleManageSubscription = async () => {
    try {
      await openManageSubscriptions();
    } catch (error) {
      Alert.alert(t('common.error'), error?.message || t('store.storeUnavailable'));
    }
  };

  // --- Helpers ---
  const markDirty = (setter) => (val) => {
    setter(val);
    setDirty(true);
  };

  const langChips = LANGUAGE_OPTIONS.map((opt) => ({
    key: opt.code,
    label: opt.label,
  }));

  const appVersion = Constants.expoConfig?.version ?? '?';

  // =====================================================================
  // RENDER
  // =====================================================================

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {/* ========== PROFILE SECTION ========== */}
      <DSCard variant="elevated" padding="lg">
        <SectionHeader icon="person-circle-outline" title={t('settings.profileSection')} />

        {/* Avatar */}
        <View style={styles.avatarContainer}>
          <TouchableOpacity
            onPress={handleAvatarChange}
            disabled={generatingAvatar}
            activeOpacity={0.7}
          >
            <View style={styles.avatarWrapper}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={48} color={colors.textTertiary} />
                </View>
              )}
              {generatingAvatar ? (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              ) : (
                <View style={styles.avatarBadge}>
                  <Ionicons name="brush" size={14} color="#FFFFFF" />
                </View>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleAvatarChange} disabled={generatingAvatar}>
            <Text style={styles.changeAvatarText}>
              {generatingAvatar ? t('settings.avatarUpdating') : t('settings.changeAvatar')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Profile fields */}
        <DSInput
          label={t('profile.username')}
          icon="at"
          value={username}
          onChangeText={markDirty(setUsername)}
        />
        <DSInput
          label={t('profile.firstName')}
          icon="person-outline"
          value={firstName}
          onChangeText={markDirty(setFirstName)}
        />
        <DSInput
          label={t('profile.lastName')}
          icon="person-outline"
          value={lastName}
          onChangeText={markDirty(setLastName)}
        />

        {dirty && (
          <DSButton
            variant="primary"
            fullWidth
            loading={saving}
            onPress={handleSaveProfile}
            icon="checkmark-circle-outline"
          >
            {t('profile.saveProfile')}
          </DSButton>
        )}
      </DSCard>

      {/* ========== PREFERENCES SECTION ========== */}
      <DSCard variant="elevated" padding="lg">
        <SectionHeader icon="options-outline" title={t('settings.preferencesSection')} />

        <Text style={styles.fieldLabel}>{t('settings.language')}</Text>
        <DSChipGroup
          items={langChips}
          selected={language}
          onSelect={handleLanguageChange}
          variant="pills"
          scrollable
          style={styles.languageChips}
        />

        <Text style={styles.fieldLabel}>{t('settings.gardenerPersona')}</Text>
        <Text style={styles.fieldHint}>{t('settings.gardenerPersonaHint')}</Text>
        <View style={styles.personaOptions}>
          {GARDENER_PERSONAS.map((persona) => {
            const resolvedPersona = getGardenerPersona(persona.key);
            const active = resolvedPersona.key === gardenerPersonaKey;
            return (
              <TouchableOpacity
                key={resolvedPersona.key}
                onPress={() => handleGardenerPersonaChange(resolvedPersona.key)}
                accessibilityRole="button"
                accessibilityLabel={resolvedPersona.name}
                style={[styles.personaOption, active && styles.personaOptionActive]}
              >
                <ExpoImage
                  source={resolvedPersona.avatar}
                  contentFit="cover"
                  style={styles.personaAvatar}
                />
                <Text style={[styles.personaName, active && styles.personaNameActive]}>
                  {resolvedPersona.name}
                </Text>
                {active ? (
                  <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <ToggleRow
          label={t('settings.notifications')}
          hint={t('settings.notificationsHint')}
          value={notificationsEnabled}
          onValueChange={async (val) => {
            setNotificationsEnabled(val);
            try {
              await updateProfile({ notifications_enabled: val });

              if (!user?.id) return;

              if (val) {
                // Re-schedule reminders for all due tasks when notifications enabled
                const result = await fetchTasks(user.id);
                const tasks = result?.data ?? result ?? [];
                await rescheduleAllTaskReminders(tasks);
              } else {
                // Cancel all scheduled reminders when notifications disabled
                await rescheduleAllTaskReminders([]);
              }
            } catch {
              setNotificationsEnabled(!val); // Revert on error
            }
          }}
        />
      </DSCard>

      {/* ========== PRIVACY SECTION ========== */}
      <DSCard variant="elevated" padding="lg">
        <SectionHeader icon="shield-checkmark-outline" title={t('settings.privacySection')} />

        <ToggleRow
          label={t('settings.showInLeaderboard')}
          hint={t('settings.showInLeaderboardHint')}
          value={leaderboardOptIn}
          onValueChange={handleLeaderboardToggle}
        />

        <ToggleRow
          label={t('settings.showOnHeatmap')}
          hint={t('settings.showOnHeatmapHint')}
          value={heatmapOptIn}
          onValueChange={handleHeatmapToggle}
        />

        <DSInput
          label={t('settings.publicDisplayName')}
          icon="eye-outline"
          value={publicDisplayName}
          onChangeText={setPublicDisplayName}
          onBlur={handlePublicDisplayNameSave}
          placeholder={t('settings.publicDisplayNameHint')}
        />
      </DSCard>

      {/* ========== ACCOUNT SECTION ========== */}
      <DSCard variant="elevated" padding="lg">
        <SectionHeader icon="key-outline" title={t('settings.accountSection')} />

        <DSButton
          variant="secondary"
          fullWidth
          icon="card-outline"
          onPress={handleManageSubscription}
          style={styles.accountButton}
        >
          {t('settings.manageSubscription')}
        </DSButton>

        <DSButton
          variant="ghost"
          fullWidth
          icon="log-out-outline"
          onPress={handleLogout}
          style={styles.accountButton}
        >
          {t('settings.logout')}
        </DSButton>

        <DSButton
          variant="ghost"
          fullWidth
          icon="trash-outline"
          onPress={handleDeleteAccount}
          style={[styles.accountButton, styles.deleteButton]}
        >
          {t('settings.deleteAccount')}
        </DSButton>
      </DSCard>

      {/* ========== INFO SECTION ========== */}
      <DSCard variant="outlined" padding="lg">
        <SectionHeader icon="information-circle-outline" title={t('settings.infoSection')} />

        <Text style={styles.versionText}>
          {t('settings.version')} {appVersion}
        </Text>

        <LinkRow
          icon="document-text-outline"
          label={t('settings.privacyPolicy')}
          onPress={async () => {
            const url = 'https://florascout.app/privacy-policy.html';
            try {
              const supported = await Linking.canOpenURL(url);
              if (supported) {
                await Linking.openURL(url);
              } else {
                Alert.alert(
                  t('common.error'),
                  t('settings.linkUnavailable') || 'Der Link konnte nicht geöffnet werden.'
                );
              }
            } catch {
              Alert.alert(
                t('common.error'),
                t('settings.linkUnavailable') || 'Der Link konnte nicht geöffnet werden.'
              );
            }
          }}
        />
        {SHOW_TERMS_LINK ? (
          <LinkRow
            icon="reader-outline"
            label={t('settings.termsOfService')}
            onPress={async () => {
              const url = 'https://florascout.app/terms.html';
              try {
                const supported = await Linking.canOpenURL(url);
                if (supported) {
                  await Linking.openURL(url);
                } else {
                  Alert.alert(
                    t('common.error'),
                    t('settings.linkUnavailable') || 'Der Link konnte nicht geöffnet werden.'
                  );
                }
              } catch {
                Alert.alert(
                  t('common.error'),
                  t('settings.linkUnavailable') || 'Der Link konnte nicht geöffnet werden.'
                );
              }
            }}
          />
        ) : null}
        <LinkRow
          icon="chatbubble-ellipses-outline"
          label={t('settings.feedback')}
          onPress={() => navigation.navigate('Mehr', { screen: 'FeedbackMain' })}
        />
      </DSCard>

      <View style={styles.footer} />
    </ScrollView>
  );
}

// =====================================================================
// STYLES
// =====================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  sectionIcon: {
    marginRight: spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  // Avatar
  avatarContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatarWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: colors.primarySurface,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  changeAvatarText: {
    marginTop: spacing.sm,
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },

  // Fields
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  fieldHint: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
  },
  languageChips: {
    marginBottom: spacing.lg,
  },
  personaOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  personaOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: spacing.sm,
    backgroundColor: colors.surface,
  },
  personaOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface,
  },
  personaAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  personaName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  personaNameActive: {
    color: colors.primary,
  },

  // Toggle rows
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  toggleTextContainer: {
    flex: 1,
    marginRight: spacing.md,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  toggleHint: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Link rows
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  linkRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkLabel: {
    fontSize: 15,
    color: colors.textPrimary,
  },

  // Account buttons
  accountButton: {
    marginBottom: spacing.sm,
  },
  deleteButton: {
    marginTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.md,
  },

  // Info
  versionText: {
    fontSize: 13,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },

  // Footer spacing
  footer: {
    height: spacing.xl,
  },
});
