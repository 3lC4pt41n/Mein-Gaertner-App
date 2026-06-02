import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../../theme/tokens';

export function Circle() {
  return null;
}

export function Marker() {
  return null;
}

export default function MapView({ style }) {
  return <View style={[styles.placeholder, style]} />;
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: colors.primarySurface,
  },
});
