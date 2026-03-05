import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import { colors, spacing } from '../theme/tokens';
import DSButton from '../theme/DSButton';
import { t } from '../i18n';

/**
 * ErrorState – Shown when data fetching or an operation fails.
 *
 * Props:
 *   title   – Heading (defaults to common.error)
 *   message – Error description (defaults to common.networkError)
 *   onRetry – Retry callback (optional, shows button when provided)
 */
export default function ErrorState({ title, message, onRetry }) {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name="alert-circle" size={40} color={colors.danger} />
      </View>
      <Text style={styles.title}>{title || t('common.error')}</Text>
      <Text style={styles.message}>{message || t('common.networkError')}</Text>
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
    backgroundColor: colors.dangerSurface,
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

ErrorState.propTypes = {
  title: PropTypes.string,
  message: PropTypes.string,
  onRetry: PropTypes.func,
};
