import React, { useState } from 'react';
import { View, Text, TextInput, Button, TouchableOpacity } from 'react-native';
import { colors, spacing, radius } from '../theme';
import { t } from '../i18n';

const TASK_TYPES = [
  { key: 'Gießen', i18nKey: 'watering' },
  { key: 'Düngen', i18nKey: 'fertilizing' },
  { key: 'Healthcheck', i18nKey: 'healthcheck' },
  { key: 'Sonstiges', i18nKey: 'other' },
];

export default function AddTaskDialog({ onClose, onSave }) {
  const [type, setType] = useState(TASK_TYPES[0].key);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  const today = new Date().toISOString().slice(0, 10);

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        margin: 30,
        borderRadius: radius.lg,
        padding: 18,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 10,
      }}
    >
      <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: spacing.md }}>
        {t('tasks.newTaskCreate')}
      </Text>
      <Text style={{ marginTop: spacing.sm }}>{t('tasks.typeLabel')}</Text>
      {TASK_TYPES.map((tt) => (
        <TouchableOpacity key={tt.key} onPress={() => setType(tt.key)}>
          <Text
            style={{
              color: tt.key === type ? colors.primary : colors.textPrimary,
              fontWeight: tt.key === type ? 'bold' : 'normal',
              paddingVertical: spacing.xs,
            }}
          >
            {t('tasks.taskTypes.' + tt.i18nKey)}
          </Text>
        </TouchableOpacity>
      ))}
      <Text style={{ marginTop: spacing.sm }}>{t('tasks.dateLabel')}</Text>
      <TextInput
        value={date}
        onChangeText={setDate}
        placeholder={today}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 6 }}
      />
      <Text style={{ marginTop: spacing.sm }}>{t('tasks.timeLabel')}</Text>
      <TextInput
        value={time}
        onChangeText={setTime}
        placeholder="08:00"
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 6 }}
      />
      <View style={{ flexDirection: 'row', marginTop: spacing.md, justifyContent: 'flex-end' }}>
        <Button title={t('common.cancel')} onPress={onClose} color={colors.textTertiary} />
        <View style={{ width: spacing.sm }} />
        <Button
          title={t('common.save')}
          onPress={() => {
            if (!date || !time) return alert(t('tasks.dateTimeRequired'));
            onSave(type, `${date}T${time}:00`);
          }}
          color={colors.primary}
        />
      </View>
    </View>
  );
}
