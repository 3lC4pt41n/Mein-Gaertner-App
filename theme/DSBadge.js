import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import { colors, spacing, radius } from './tokens';

const VARIANT_STYLES = {
  success: { bg: colors.primarySurface, text: colors.primary, icon: colors.primary },
  warning: { bg: colors.warningSurface, text: colors.warning, icon: colors.warning },
  danger: { bg: colors.dangerSurface, text: colors.danger, icon: colors.danger },
  info: { bg: colors.infoSurface, text: colors.info, icon: colors.info },
  neutral: { bg: colors.surfaceSecondary, text: colors.textSecondary, icon: colors.textTertiary },
};

const SIZE_STYLES = {
  sm: { fontSize: 12, paddingV: 2, paddingH: 8, iconSize: 12 },
  md: { fontSize: 14, paddingV: 4, paddingH: 10, iconSize: 16 },
};

export default function DSBadge({ label, variant = 'neutral', icon, size = 'md', style }) {
  const v = VARIANT_STYLES[variant] || VARIANT_STYLES.neutral;
  const s = SIZE_STYLES[size] || SIZE_STYLES.md;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.base,
        {
          backgroundColor: v.bg,
          paddingVertical: s.paddingV,
          paddingHorizontal: s.paddingH,
        },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={s.iconSize} color={v.icon} style={styles.icon} />}
      <Text style={[styles.label, { fontSize: s.fontSize, color: v.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    alignSelf: 'flex-start',
  },
  icon: {
    marginRight: spacing.xs,
  },
  label: {
    fontWeight: '600',
  },
});

DSBadge.propTypes = {
  label: PropTypes.string.isRequired,
  variant: PropTypes.oneOf(['success', 'warning', 'danger', 'info', 'neutral']),
  icon: PropTypes.string,
  size: PropTypes.oneOf(['sm', 'md']),
  style: PropTypes.object,
};

DSBadge.defaultProps = {
  variant: 'neutral',
};
