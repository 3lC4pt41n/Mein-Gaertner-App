import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import { colors, spacing } from '../theme/tokens';
import DSButton from '../theme/DSButton';

/**
 * EmptyState – Shown when a list or screen has no content yet.
 *
 * Props:
 *   icon       – Ionicons name (default: 'leaf-outline')
 *   title      – Main heading
 *   message    – Explanatory text (optional)
 *   actionLabel – Button text (optional, shows CTA when provided)
 *   onAction   – Button callback
 *   actionIcon – Ionicons name for the button (optional)
 */
export default function EmptyState({ icon, title, message, actionLabel, onAction, actionIcon }) {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={40} color={colors.primaryLight} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {!!message && <Text style={styles.message}>{message}</Text>}
      {!!actionLabel && !!onAction && (
        <DSButton
          variant="primary"
          size="md"
          icon={actionIcon}
          onPress={onAction}
          style={styles.button}
        >
          {actionLabel}
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
    backgroundColor: colors.primarySurface,
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

EmptyState.propTypes = {
  icon: PropTypes.string,
  title: PropTypes.string.isRequired,
  message: PropTypes.string,
  actionLabel: PropTypes.string,
  onAction: PropTypes.func,
  actionIcon: PropTypes.string,
};

EmptyState.defaultProps = {
  icon: 'leaf-outline',
};
