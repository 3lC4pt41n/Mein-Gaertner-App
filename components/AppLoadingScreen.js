import React from 'react';
import { View, ActivityIndicator, Image, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme/tokens';

export default function AppLoadingScreen() {
  return (
    <View style={styles.container}>
      <Image source={require('../assets/splash.png')} style={styles.logo} resizeMode="contain" />
      <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  logo: {
    width: 180,
    height: 180,
    marginBottom: spacing.xxl,
  },
  spinner: {
    marginTop: spacing.lg,
  },
});
