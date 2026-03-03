import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import { t } from '../i18n';
import { useAuth } from '../contexts/AuthContext';

const MENU_ITEMS = [
  { key: 'assistant', icon: 'chatbox-ellipses-outline', screen: 'AssistantMain' },
  { key: 'shop', icon: 'flash-outline', screen: 'ShopMain' },
  { key: 'leaderboard', icon: 'trophy-outline', screen: 'LeaderboardMain' },
  { key: 'calendar', icon: 'calendar-outline', screen: 'CalendarMain' },
  { key: 'feedback', icon: 'chatbubble-outline', screen: 'FeedbackMain' },
  { key: 'settings', icon: 'settings-outline', screen: 'Settings' },
];

export default function MoreScreen({ navigation }) {
  const { isAdmin } = useAuth();

  const getLabel = (key) => {
    const labels = {
      assistant: t('nav.assistant'),
      shop: t('nav.shop'),
      leaderboard: t('nav.leaderboard'),
      calendar: t('nav.calendar'),
      feedback: t('feedback.title'),
      settings: t('settings.title'),
      admin: t('nav.adminTitle'),
    };
    return labels[key] || key;
  };

  const items = [...MENU_ITEMS];
  if (isAdmin) {
    items.push({ key: 'admin', icon: 'settings-outline', screen: 'AdminMain' });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {items.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={styles.menuItem}
          activeOpacity={0.6}
          onPress={() => navigation.navigate(item.screen)}
          accessibilityRole="button"
          accessibilityLabel={getLabel(item.key)}
        >
          <View style={styles.menuIconContainer}>
            <Ionicons name={item.icon} size={22} color={colors.primary} />
          </View>
          <Text style={styles.menuLabel}>{getLabel(item.key)}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
