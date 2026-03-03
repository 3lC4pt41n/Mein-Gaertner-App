import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from './tokens';

const VARIANT_STYLES = {
  primary: {
    bg: colors.primary,
    text: '#FFFFFF',
    border: null,
    disabledBg: colors.primarySurface,
    disabledText: colors.textDisabled,
  },
  secondary: {
    bg: 'transparent',
    text: colors.primary,
    border: colors.primary,
    disabledBg: 'transparent',
    disabledText: colors.textDisabled,
    disabledBorder: colors.border,
  },
  ghost: {
    bg: 'transparent',
    text: colors.primary,
    border: null,
    disabledBg: 'transparent',
    disabledText: colors.textDisabled,
  },
  danger: {
    bg: colors.danger,
    text: '#FFFFFF',
    border: null,
    disabledBg: colors.dangerSurface,
    disabledText: colors.textDisabled,
  },
};

const SIZE_STYLES = {
  sm: { paddingVertical: 6, paddingHorizontal: 12, fontSize: 14, iconSize: 16 },
  md: { paddingVertical: 10, paddingHorizontal: 18, fontSize: 16, iconSize: 20 },
  lg: { paddingVertical: 14, paddingHorizontal: 24, fontSize: 18, iconSize: 22 },
};

export default function DSButton({
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  fullWidth = false,
  onPress,
  children,
  style,
  textStyle,
  accessibilityLabel,
}) {
  const v = VARIANT_STYLES[variant] || VARIANT_STYLES.primary;
  const s = SIZE_STYLES[size] || SIZE_STYLES.md;
  const isDisabled = disabled || loading;

  const bgColor = isDisabled ? v.disabledBg : v.bg;
  const txtColor = isDisabled ? v.disabledText : v.text;
  const borderColor = isDisabled ? (v.disabledBorder || null) : v.border;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || (typeof children === 'string' ? children : undefined)}
      accessibilityState={{ disabled: isDisabled }}
      style={[
        styles.base,
        {
          backgroundColor: bgColor,
          paddingVertical: s.paddingVertical,
          paddingHorizontal: s.paddingHorizontal,
          borderWidth: borderColor ? 1.5 : 0,
          borderColor: borderColor || 'transparent',
          minHeight: 44,
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={txtColor} />
      ) : (
        <View style={styles.content}>
          {icon && iconPosition === 'left' && (
            <Ionicons name={icon} size={s.iconSize} color={txtColor} style={styles.iconLeft} />
          )}
          <Text style={[styles.label, { fontSize: s.fontSize, color: txtColor }, textStyle]}>
            {children}
          </Text>
          {icon && iconPosition === 'right' && (
            <Ionicons name={icon} size={s.iconSize} color={txtColor} style={styles.iconRight} />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: '600',
  },
  iconLeft: {
    marginRight: spacing.sm,
  },
  iconRight: {
    marginLeft: spacing.sm,
  },
});
