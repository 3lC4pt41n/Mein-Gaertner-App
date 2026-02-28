import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../theme/tokens';
import { t } from '../i18n';
import useNetworkStatus from '../hooks/useNetworkStatus';

/**
 * Shows a banner at the top of the screen when offline.
 * Auto-hides when connectivity is restored.
 */
export default function OfflineBanner() {
  const { isConnected } = useNetworkStatus();

  if (isConnected) return null;

  return (
    <View style={styles.banner}>
      <Ionicons name="cloud-offline-outline" size={18} color={colors.surface} />
      <Text style={styles.text}>{t('common.networkError')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  text: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
});
