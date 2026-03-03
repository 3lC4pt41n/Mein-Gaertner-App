import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import PropTypes from 'prop-types';
import { colors, spacing, radius, shadows } from './tokens';

const PADDING_MAP = {
  sm: spacing.md,
  md: spacing.lg,
  lg: spacing.xl,
};

export default function DSCard({
  variant = 'elevated',
  padding = 'md',
  onPress,
  children,
  style,
}) {
  const pad = typeof padding === 'number' ? padding : (PADDING_MAP[padding] || PADDING_MAP.md);

  const cardStyle = [
    styles.base,
    { padding: pad },
    variant === 'elevated' && styles.elevated,
    variant === 'outlined' && styles.outlined,
    variant === 'flat' && styles.flat,
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" style={cardStyle}>
        {children}
      </TouchableOpacity>
    );
  }

  return <View accessible accessibilityRole="summary" style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    marginBottom: spacing.md,
  },
  elevated: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  outlined: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  flat: {
    backgroundColor: colors.surfaceSecondary,
  },
});

DSCard.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['elevated', 'outlined', 'flat']),
  padding: PropTypes.oneOf(['none', 'sm', 'md', 'lg']),
  onPress: PropTypes.func,
  style: PropTypes.object,
};

DSCard.defaultProps = {
  variant: 'elevated',
  padding: 'md',
};
