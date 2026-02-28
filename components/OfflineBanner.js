import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../theme';
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
      <Ionicons name="cloud-offline-outline" size={18} color="#fff" />
      <Text style={styles.text}>{t('common.networkError')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors?.error || '#D32F2F',
    paddingVertical: spacing?.sm || 8,
    paddingHorizontal: spacing?.md || 16,
    gap: 8,
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
});
