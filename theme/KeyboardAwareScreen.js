import React, { forwardRef } from 'react';
import { StyleSheet } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { spacing } from './tokens';

// Zentraler Tastatur-Wrapper fuer scrollbare Screens und Modal-Inhalte.
// Kapselt die Keyboard-Controller-Defaults, damit Eingabefelder auf iOS,
// Android Edge-to-Edge und Web konsistent sichtbar bleiben.
const KeyboardAwareScreen = forwardRef(function KeyboardAwareScreen(
  {
    children,
    style,
    contentContainerStyle,
    bottomOffset = spacing.xxl,
    extraKeyboardSpace = spacing.lg,
    keyboardShouldPersistTaps = 'handled',
    showsVerticalScrollIndicator = false,
    disableScrollOnKeyboardHide = true,
    fill = true,
    ...props
  },
  ref
) {
  return (
    <KeyboardAwareScrollView
      ref={ref}
      style={[fill && styles.screen, style]}
      contentContainerStyle={contentContainerStyle}
      bottomOffset={bottomOffset}
      extraKeyboardSpace={extraKeyboardSpace}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      disableScrollOnKeyboardHide={disableScrollOnKeyboardHide}
      {...props}
    >
      {children}
    </KeyboardAwareScrollView>
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
