import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { safeLaunchLibrary } from '../services/imagePickerHelper';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing } from '../theme/tokens';
import { t } from '../i18n';
import Constants from 'expo-constants';
import DSButton from '../theme/DSButton';
import DSInput from '../theme/DSInput';
import DSChipGroup from '../theme/DSChips';
import KeyboardAwareScreen from '../theme/KeyboardAwareScreen';
import { uploadFeedbackImage } from '../services/uploadService';

const CATEGORIES = [
  { key: 'bug', label: '', icon: 'bug-outline' },
  { key: 'feature', label: '', icon: 'bulb-outline' },
  { key: 'other', label: '', icon: 'chatbox-ellipses-outline' },
];

export default function FeedbackScreen({ navigation }) {
  const { userId } = useAuth();
  const [category, setCategory] = useState('bug');
  const [message, setMessage] = useState('');
  const [screenshotUri, setScreenshotUri] = useState(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Dynamic labels (need t() at render time)
  const categoryItems = CATEGORIES.map((cat) => ({
    ...cat,
    label: t(`feedback.categories.${cat.key}`),
  }));

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('common.error'), t('feedback.galleryPermission'));
      return;
    }

    const result = await safeLaunchLibrary({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setScreenshotUri(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!message.trim()) {
      Alert.alert(t('common.warning'), t('feedback.messageRequired'));
      return;
    }
    if (!userId) {
      Alert.alert(t('common.error'), t('common.notLoggedInMessage'));
      return;
    }

    setSending(true);
    try {
      let screenshotPath = null;

      // Screenshot hochladen falls vorhanden
      if (screenshotUri) {
        screenshotPath = await uploadFeedbackImage(screenshotUri, userId);
      }

      const { error } = await supabase.from('feedback').insert({
        user_id: userId,
        category,
        message: message.trim(),
        app_version: Constants.expoConfig?.version ?? null,
        screenshot_path: screenshotPath,
      });

      if (error) {
        Alert.alert(t('common.error'), error.message);
      } else {
        setSent(true);
      }
    } catch (e) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <View style={styles.successContainer}>
        <Ionicons name="checkmark-circle" size={72} color={colors.primary} />
        <Text style={styles.successTitle}>{t('feedback.thankYou')}</Text>
        <Text style={styles.successMessage}>{t('feedback.successMessage')}</Text>
        <DSButton
          variant="primary"
          onPress={() => navigation.goBack()}
          accessibilityLabel={t('common.done')}
        >
          {t('common.done')}
        </DSButton>
      </View>
    );
  }

  return (
    <KeyboardAwareScreen style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>{t('feedback.title')}</Text>
      <Text style={styles.subtitle}>{t('feedback.subtitle')}</Text>

      {/* Category Picker */}
      <Text style={styles.label}>{t('feedback.categoryLabel')}</Text>
      <DSChipGroup
        items={categoryItems}
        selected={category}
        onSelect={setCategory}
        variant="segmented"
        scrollable={false}
        style={{ marginBottom: spacing.xl }}
      />

      {/* Message */}
      <DSInput
        label={t('feedback.messageLabel')}
        placeholder={t('feedback.placeholder')}
        value={message}
        onChangeText={setMessage}
        multiline
        inputStyle={{ minHeight: 140, textAlignVertical: 'top' }}
        maxLength={2000}
      />
      <Text style={styles.charCount}>{message.length} / 2000</Text>

      {/* Screenshot */}
      {screenshotUri ? (
        <View style={styles.screenshotContainer}>
          <Image source={{ uri: screenshotUri }} style={styles.screenshotPreview} />
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => setScreenshotUri(null)}
            accessibilityLabel={t('feedback.removeScreenshot')}
          >
            <Ionicons name="close-circle" size={26} color={colors.danger} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.attachButton} onPress={handlePickImage}>
          <Ionicons name="image-outline" size={20} color={colors.primary} />
          <Text style={styles.attachText}>{t('feedback.attachScreenshot')}</Text>
        </TouchableOpacity>
      )}

      {/* Submit */}
      <DSButton
        variant="primary"
        fullWidth
        icon="send"
        loading={sending}
        onPress={handleSubmit}
        accessibilityLabel={t('feedback.submit')}
      >
        {t('feedback.submit')}
      </DSButton>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.xl, paddingBottom: 60 },
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  charCount: {
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'right',
    marginTop: -spacing.md,
    marginBottom: spacing.lg,
  },
  attachButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    borderStyle: 'dashed',
    marginBottom: spacing.xl,
  },
  attachText: {
    fontSize: 14,
    color: colors.primary,
    marginLeft: spacing.sm,
  },
  screenshotContainer: {
    position: 'relative',
    alignSelf: 'flex-start',
    marginBottom: spacing.xl,
  },
  screenshotPreview: {
    width: 120,
    height: 120,
    borderRadius: 10,
    backgroundColor: colors.surfaceSecondary,
  },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: colors.surface,
    borderRadius: 13,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.xl,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  successMessage: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
});
