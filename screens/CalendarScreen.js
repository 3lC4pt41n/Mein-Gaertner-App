
import React from 'react';
import { View, Text } from 'react-native';
import { t } from '../i18n';

export default function CalendarScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>{t('minor.calendarSoon')}</Text>
    </View>
  );
}
