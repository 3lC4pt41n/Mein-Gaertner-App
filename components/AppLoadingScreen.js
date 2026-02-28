import React from 'react';
import { View, ActivityIndicator, Image, StyleSheet } from 'react-native';
import { colors } from '../theme';

export default function AppLoadingScreen() {
  return (
    <View style={styles.container}>
      <Image source={require('../assets/splash.png')} style={styles.logo} resizeMode="contain" />
      <ActivityIndicator size="large" color={colors?.primary || '#2E7D32'} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors?.background || '#FFFFFF',
  },
  logo: {
    width: 180,
    height: 180,
    marginBottom: 24,
  },
  spinner: {
    marginTop: 16,
  },
});
