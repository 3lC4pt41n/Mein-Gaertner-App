import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import { colors, spacing } from '../theme/tokens';
import DSButton from '../theme/DSButton';
import { t } from '../i18n';

/**
 * OfflineState – Full-screen placeholder when network is unavailable.
 *
 * Unlike OfflineBanner (a thin top-bar), this fills the content area
 * of a screen that cannot render without network data.
 *
 * Props:
 *   onRetry – Retry callback (optional)
 */
export default function OfflineState({ onRetry }) {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name="cloud-offline" size={40} color={colors.textTertiary} />
      </View>
      <Text style={styles.title}>{t('weather.unavailable')}</Text>
      <Text style={styles.message}>{t('common.networkError')}</Text>
      {!!onRetry && (
        <DSButton
          variant="secondary"
          size="md"
          icon="refresh"
          onPress={onRetry}
          style={styles.button}
        >
          {t('common.retry')}
        </DSButton>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxxl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  button: {
    minWidth: 180,
  },
});

OfflineState.propTypes = {
  onRetry: PropTypes.func,
};
