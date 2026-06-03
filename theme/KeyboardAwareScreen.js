import React, { forwardRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { spacing } from './tokens';

// Zentraler Tastatur-Wrapper fuer scrollbare Screens und Modal-Inhalte.
// OTA-sicher: nutzt nur React-Native-Core, damit installierte Binaries ohne
// react-native-keyboard-controller-Native-Modul nicht beim Start crashen.
const KeyboardAwareScreen = forwardRef(function KeyboardAwareScreen(
  {
    children,
    style,
    contentContainerStyle,
    bottomOffset = spacing.xxl,
    extraKeyboardSpace = spacing.lg,
    keyboardShouldPersistTaps = 'handled',
    showsVerticalScrollIndicator = false,
    fill = true,
    ...props
  },
  ref
) {
  return (
    <KeyboardAvoidingView
      style={[fill && styles.screen, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={bottomOffset + extraKeyboardSpace}
    >
      <ScrollView
        ref={ref}
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        {...props}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
});

export function KeyboardAwareModalContent({
  children,
  style,
  contentContainerStyle,
  bottomOffset = spacing.xxl,
  extraKeyboardSpace = spacing.xl,
  ...props
}) {
  return (
    <KeyboardAwareScreen
      style={style}
      contentContainerStyle={[styles.modalContent, contentContainerStyle]}
      bottomOffset={bottomOffset}
      extraKeyboardSpace={extraKeyboardSpace}
      fill={false}
      {...props}
    >
      {children}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  modalContent: {
    paddingBottom: spacing.xl,
  },
});

export default KeyboardAwareScreen;
