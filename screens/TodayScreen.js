
import React from 'react';
import { View, Text } from 'react-native';
import { t } from '../i18n';

export default function TodayScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>{t('minor.todayTitle')}</Text>
    </View>
  );
}
