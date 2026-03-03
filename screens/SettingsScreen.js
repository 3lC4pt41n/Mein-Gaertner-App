// SettingsScreen.js – Profil, Einstellungen, Datenschutz, Konto, App-Info
// ---------------------------------------------------------------------
import React, { useState, useEffect, useCallback } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';
import { t } from '../i18n';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import DSButton from '../theme/DSButton';
import DSInput from '../theme/DSInput';
import DSCard from '../theme/DSCard';
import DSChipGroup from '../theme/DSChips';
import { LANGUAGE_OPTIONS, normalizeLanguage, applyLanguage } from '../services/languageService';
import { generateGardenerAvatar } from '../services/aiService';
import { openManageSubscriptions } from '../services/purchaseService';

// ---------- Helpers ---------------------------------------------------

async function createAvatarSignedUrl(path) {
  const { data, error } = await supabase.storage
    .from('chat-images')
    .createSignedUrl(path, 60 * 60 * 24 * 7);
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
        <Ionicons name={icon} size={18} color={colors.textSecondary} style={{ marginRight: spacing.md }} />
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
  const { user, profile, signOut, updateProfile, refreshProfile } = useAuth();

  // --- Profile state ---
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [generatingAvatar, setGeneratingAvatar] = useState(false);

  // --- Preferences state ---
  const [language, setLanguage] = useState('de');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  // --- Privacy state ---
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(false);
  const [publicDisplayName, setPublicDisplayName] = useState('');

  // --- UI state ---
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // --- Initialize from profile ---
  useEffect(() => {
    if (profile) {
      setUsername(profile.username ?? '');
      setFirstName(profile.first_name ?? '');
      setLastName(profile.last_name ?? '');
      setLanguage(normalizeLanguage(profile.language));
      setLeaderboardOptIn(profile.leaderboard_opt_in ?? false);
      setPublicDisplayName(profile.public_display_name ?? '');
    }
  }, [profile]);

  // --- Avatar URL ---
  useEffect(() => {
    const path = user?.user_metadata?.gardener_avatar_path;
    if (!path) { setAvatarUrl(null); return; }
    createAvatarSignedUrl(path)
      .then(setAvatarUrl)
      .catch(() => setAvatarUrl(null));
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

  const handleAvatarChange = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('common.error'), t('profile.cameraRequired'));
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
      Alert.alert(t('common.error'), t('profile.photoReadError'));
      return;
    }

    setGeneratingAvatar(true);
    try {
      const avatarData = await generateGardenerAvatar(asset.base64, language);
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
    } catch (error) {
      Alert.alert(t('common.error'), t('settings.profileSaveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleLanguageChange = async (code) => {
    setLanguage(code);
    applyLanguage(code);
    try {
      await updateProfile({ language: code });
    } catch {
      // Silently fail \u2013 language already applied locally
    }
  };

  const handleLeaderboardToggle = async (val) => {
    setLeaderboardOptIn(val);
    try {
      await updateProfile({ leaderboard_opt_in: val });
    } catch {
      setLeaderboardOptIn(!val); // Revert on error
    }
  };

  const handlePublicDisplayNameSave = async () => {
    try {
      await updateProfile({ public_display_name: publicDisplayName });
    } catch {
      Alert.alert(t('common.error'), t('settings.profileSaveError'));
    }
  };

  const handleLogout = () => {
    Alert.alert(
      t('settings.logoutConfirmTitle'),
      t('settings.logoutConfirmMessage'),
      [
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
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('settings.deleteConfirmTitle'),
      t('settings.deleteConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.deleteConfirmButton'),
          style: 'destructive',
          onPress: async () => {
            try {
              // Soft-delete: mark profile for deletion, then sign out
              await supabase
                .from('profiles')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', user.id);
              await signOut();
            } catch (error) {
              Alert.alert(t('common.error'), error.message);
            }
          },
        },
      ]
    );
  };

  const handleManageSubscription = async () => {
    try {
      await openManageSubscriptions();
    } catch {
      Alert.alert(t('common.error'), t('store.storeUnavailable'));
    }
  };

  // --- Helpers ---
  const markDirty = (setter) => (val) => { setter(val); setDirty(true); };

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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* ========== PROFILE SECTION ========== */}
      <DSCard variant="elevated" padding="lg">
        <SectionHeader icon="person-circle-outline" title={t('settings.profileSection')} />

        {/* Avatar */}
        <View style={styles.avatarContainer}>
          <TouchableOpacity onPress={handleAvatarChange} disabled={generatingAvatar} activeOpacity={0.7}>
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
                  <Ionicons name="camera" size={14} color="#FFFFFF" />
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
          variant="segmented"
          style={styles.languageChips}
        />

        <ToggleRow
          label={t('settings.notifications')}
          hint={t('settings.notificationsHint')}
          value={notificationsEnabled}
          onValueChange={setNotificationsEnabled}
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
          variant="danger"
          fullWidth
          icon="trash-outline"
          onPress={handleDeleteAccount}
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
          onPress={() => Linking.openURL('https://3lc4pt41n.github.io/Mein-Gaertner-App/privacy-policy.html')}
        />
        <LinkRow
          icon="reader-outline"
          label={t('settings.termsOfService')}
          onPress={() => Linking.openURL('https://3lc4pt41n.github.io/Mein-Gaertner-App/terms.html')}
        />
        <LinkRow
          icon="chatbubble-ellipses-outline"
          label={t('settings.feedback')}
          onPress={() => navigation.navigate('Shop', { screen: 'Feedback' })}
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
  languageChips: {
    marginBottom: spacing.lg,
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
