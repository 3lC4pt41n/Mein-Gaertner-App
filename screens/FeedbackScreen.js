import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing } from '../theme/tokens';
import { t } from '../i18n';
import Constants from 'expo-constants';
import DSButton from '../theme/DSButton';
import DSInput from '../theme/DSInput';
import DSChipGroup from '../theme/DSChips';

const CATEGORIES = [
  { key: 'bug', label: '', icon: 'bug-outline' },
  { key: 'feature', label: '', icon: 'bulb-outline' },
  { key: 'other', label: '', icon: 'chatbox-ellipses-outline' },
];

export default function FeedbackScreen({ navigation }) {
  const { userId } = useAuth();
  const [category, setCategory] = useState('bug');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Dynamic labels (need t() at render time)
  const categoryItems = CATEGORIES.map((cat) => ({
    ...cat,
    label: t(`feedback.categories.${cat.key}`),
  }));

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
          inputStyle={{ minHeight: 140 }}
          maxLength={2000}
        />
        <Text style={styles.charCount}>{message.length} / 2000</Text>

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
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  charCount: {
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'right',
    marginTop: -spacing.md,
    marginBottom: spacing.xl,
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
