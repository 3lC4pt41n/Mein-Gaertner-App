import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import { colors, spacing, radius } from './tokens';

export default function DSInput({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  disabled = false,
  icon,
  multiline = false,
  style,
  inputStyle,
  accessibilityLabel,
  ...rest
}) {
  const [focused, setFocused] = useState(false);

  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputWrapper,
          { borderColor },
          disabled && styles.disabled,
          multiline && styles.multiline,
        ]}
      >
        {icon && <Ionicons name={icon} size={18} color={colors.textTertiary} style={styles.icon} />}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textDisabled}
          editable={!disabled}
          multiline={multiline}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={accessibilityLabel || label || placeholder}
          style={[
            styles.input,
            icon && styles.inputWithIcon,
            multiline && styles.multilineInput,
            inputStyle,
          ]}
          {...rest}
        />
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  disabled: {
    backgroundColor: colors.surfaceSecondary,
    opacity: 0.6,
  },
  multiline: {
    alignItems: 'flex-start',
  },
  icon: {
    marginLeft: spacing.md,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    padding: spacing.md,
  },
  inputWithIcon: {
    paddingLeft: spacing.sm,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  error: {
    fontSize: 12,
    color: colors.danger,
    marginTop: spacing.xs,
  },
});

DSInput.propTypes = {
  label: PropTypes.string,
  value: PropTypes.string,
  onChangeText: PropTypes.func,
  placeholder: PropTypes.string,
  icon: PropTypes.string,
  multiline: PropTypes.bool,
  error: PropTypes.string,
  disabled: PropTypes.bool,
  secureTextEntry: PropTypes.bool,
  keyboardType: PropTypes.string,
  style: PropTypes.object,
  inputStyle: PropTypes.object,
  accessibilityLabel: PropTypes.string,
};

DSInput.defaultProps = {
  multiline: false,
  disabled: false,
  secureTextEntry: false,
};
