// screens/MenuHomeScreen.js
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing } from '../theme/tokens';
import { t } from '../i18n';

export default function MenuHomeScreen() {
  const navigation = useNavigation();

  useEffect(() => {
    // Automatisch Drawer öffnen
    navigation.openDrawer && navigation.openDrawer();
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{t('minor.menuOverview')}</Text>
      <Text style={styles.subtitle}>{t('minor.menuSubtitle')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heading: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
