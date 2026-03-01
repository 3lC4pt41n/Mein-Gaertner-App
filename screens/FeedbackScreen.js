import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, radius } from '../theme/tokens';
import { t } from '../i18n';
import Constants from 'expo-constants';

const CATEGORIES = [
  { key: 'bug', icon: 'bug-outline' },
  { key: 'feature', icon: 'bulb-outline' },
  { key: 'other', icon: 'chatbox-ellipses-outline' },
];

export default function FeedbackScreen({ navigation }) {
  const { userId } = useAuth();
  const [category, setCategory] = useState('bug');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

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
    const { error } = await supabase.from('feedback').insert({
      user_id: userId,
      category,
      message: message.trim(),
      app_version: Constants.expoConfig?.version ?? null,
    });
    setSending(false);

    if (error) {
      Alert.alert(t('common.error'), error.message);
    } else {
      setSent(true);
    }
  };

  if (sent) {
    return (
      <View style={styles.successContainer}>
        <Ionicons name="checkmark-circle" size={72} color={colors.primary} />
        <Text style={styles.successTitle}>{t('feedback.thankYou')}</Text>
        <Text style={styles.successMessage}>{t('feedback.successMessage')}</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>{t('common.done')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>{t('feedback.title')}</Text>
        <Text style={styles.subtitle}>{t('feedback.subtitle')}</Text>

        {/* Category Picker */}
        <Text style={styles.label}>{t('feedback.categoryLabel')}</Text>
        <View style={styles.categoryRow}>
          {CATEGORIES.map((cat) => {
            const active = category === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => setCategory(cat.key)}
              >
                <Ionicons
                  name={cat.icon}
                  size={20}
                  color={active ? colors.surface : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.categoryText,
                    active && styles.categoryTextActive,
                  ]}
                >
                  {t(`feedback.categories.${cat.key}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Message */}
        <Text style={styles.label}>{t('feedback.messageLabel')}</Text>
        <TextInput
          style={styles.textArea}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          placeholder={t('feedback.placeholder')}
          placeholderTextColor={colors.textTertiary}
          value={message}
          onChangeText={setMessage}
          maxLength={2000}
        />
        <Text style={styles.charCount}>{message.length} / 2000</Text>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, sending && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={sending}
        >
          <Ionicons name="send" size={18} color={colors.surface} />
          <Text style={styles.submitText}>
            {sending ? t('common.loading') : t('feedback.submit')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
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
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  categoryChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  categoryTextActive: {
    color: colors.surface,
  },
  textArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    minHeight: 140,
  },
  charCount: {
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: spacing.xl,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  submitText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },

  // Success state
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
  backButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  backButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
});
