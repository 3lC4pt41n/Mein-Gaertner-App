import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  Modal,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { colors, spacing, radius, shadows } from '../theme';
import DSButton from '../theme/DSButton';
import DSInput from '../theme/DSInput';
import { t } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';

let NativeDateTimePicker = null;
try {
  if (Platform.OS !== 'web') {
    NativeDateTimePicker = require('@react-native-community/datetimepicker').default;
  }
} catch {
  /* Web / Expo Go ohne Picker */
}

// Task types now use language-neutral codes (stored in DB)
const TASK_TYPES = [
  { key: 'watering', i18nKey: 'watering', icon: 'water-outline', color: '#2196f3' },
  { key: 'fertilizing', i18nKey: 'fertilizing', icon: 'leaf-outline', color: '#8BC34A' },
  { key: 'healthcheck', i18nKey: 'healthcheck', icon: 'pulse-outline', color: '#FF9800' },
  { key: 'repotting', i18nKey: 'repotting', icon: 'flower-outline', color: '#9C27B0' },
  { key: 'other', i18nKey: 'other', icon: 'calendar-outline', color: '#607D8B' },
];

const INTERVAL_PRESETS = [
  { i18nKey: 'daily', days: 1 },
  { i18nKey: 'every3days', days: 3 },
  { i18nKey: 'every5days', days: 5 },
  { i18nKey: 'weekly', days: 7 },
  { i18nKey: 'biweekly', days: 14 },
  { i18nKey: 'monthly', days: 30 },
];

export default function AddTaskDialog({
  visible,
  onClose,
  onSave,
  initialPlantId,
  initialPlantName,
}) {
  const { userId } = useAuth();
  const navigation = useNavigation();
  const [type, setType] = useState(TASK_TYPES[0].key);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    return d;
  });
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [note, setNote] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [intervalDays, setIntervalDays] = useState(5);
  const [customInterval, setCustomInterval] = useState('');

  const [plants, setPlants] = useState([]);
  const [selectedPlant, setSelectedPlant] = useState(null);
  const [showPlantPicker, setShowPlantPicker] = useState(false);
  const [loadingPlants, setLoadingPlants] = useState(false);

  useEffect(() => {
    if (visible && !initialPlantId) {
      loadPlants();
    }
    if (visible && initialPlantId) {
      setSelectedPlant({ id: initialPlantId, name: initialPlantName || '?' });
    }
  }, [visible, initialPlantId]);

  useEffect(() => {
    if (!visible) {
      setType(TASK_TYPES[0].key);
      const d = new Date();
      d.setHours(8, 0, 0, 0);
      setDate(d);
      setNote('');
      setRecurring(false);
      setIntervalDays(5);
      setCustomInterval('');
      setSelectedPlant(initialPlantId ? { id: initialPlantId, name: initialPlantName } : null);
      setShowPlantPicker(false);
    }
  }, [visible]);

  const loadPlants = async () => {
    setLoadingPlants(true);
    try {
      if (!userId) return;
      const { data, error } = await supabase
        .from('plants')
        .select('id, name')
        .eq('user_id', userId)
        .order('name');
      if (!error && data) setPlants(data);
    } finally {
      setLoadingPlants(false);
    }
  };

  const formatLocalDate = (d) => `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;

  const formatLocalTime = (d) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  const handleSave = () => {
    if (!selectedPlant) {
      alert(t('tasks.selectPlantRequired'));
      return;
    }

    const dueAtIso = date.toISOString();
    const effectiveInterval = customInterval ? parseInt(customInterval, 10) : intervalDays;

    if (recurring && (!effectiveInterval || effectiveInterval < 1)) {
      alert(t('tasks.intervalRequired'));
      return;
    }

    onSave({
      type,
      due_at: dueAtIso,
      note,
      plant_id: selectedPlant.id,
      plant_name: selectedPlant.name,
      recurring,
      interval_days: recurring ? effectiveInterval : null,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.overlay,
        }}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            width: '90%',
            maxWidth: 380,
            maxHeight: '85%',
            borderRadius: radius.lg + 2,
            padding: spacing.xl,
            ...shadows.lg,
          }}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text
              style={{
                fontWeight: 'bold',
                fontSize: 20,
                marginBottom: spacing.lg,
                color: colors.textPrimary,
              }}
            >
              {t('tasks.newTask')}
            </Text>

            {/* Pflanzenwahl */}
            <Text style={{ fontWeight: '600', marginBottom: spacing.xs + 2 }}>
              {t('tasks.plantLabel')}
            </Text>
            {initialPlantId ? (
              <Text
                style={{
                  fontWeight: 'bold',
                  color: colors.info,
                  marginBottom: spacing.md,
                  fontSize: 15,
                }}
              >
                {initialPlantName || '?'}
              </Text>
            ) : (
              <TouchableOpacity
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: radius.md,
                  padding: spacing.md,
                  marginBottom: spacing.md,
                  backgroundColor: colors.surfaceSecondary,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
                onPress={() => setShowPlantPicker(!showPlantPicker)}
              >
                <Text
                  style={{
                    color: selectedPlant ? colors.textPrimary : colors.textDisabled,
                    fontSize: 15,
                  }}
                >
                  {selectedPlant ? selectedPlant.name : t('tasks.selectPlant')}
                </Text>
                <Ionicons
                  name={showPlantPicker ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.textTertiary}
                />
              </TouchableOpacity>
            )}

            {showPlantPicker && !initialPlantId && (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: radius.sm,
                  maxHeight: 150,
                  marginBottom: spacing.md,
                  backgroundColor: colors.surface,
                }}
              >
                {loadingPlants ? (
                  <ActivityIndicator style={{ padding: spacing.lg }} color={colors.primaryLight} />
                ) : plants.length === 0 ? (
                  <View style={{ padding: spacing.md, alignItems: 'center' }}>
                    <Text
                      style={{
                        color: colors.textDisabled,
                        textAlign: 'center',
                        marginBottom: spacing.sm,
                      }}
                    >
                      {t('tasks.noPlants')}
                    </Text>
                    <DSButton
                      variant="primary"
                      size="sm"
                      icon="add-circle-outline"
                      onPress={() => {
                        onClose();
                        navigation.navigate('Pflanze hinzufügen');
                      }}
                    >
                      {t('tasks.addFirstPlant')}
                    </DSButton>
                  </View>
                ) : (
                  <ScrollView nestedScrollEnabled>
                    {plants.map((p) => (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => {
                          setSelectedPlant(p);
                          setShowPlantPicker(false);
                        }}
                        style={{
                          padding: spacing.md,
                          borderBottomWidth: 1,
                          borderBottomColor: colors.divider,
                          backgroundColor:
                            selectedPlant?.id === p.id ? colors.primarySurface : 'transparent',
                        }}
                      >
                        <Text
                          style={{
                            fontWeight: selectedPlant?.id === p.id ? 'bold' : 'normal',
                            color: colors.textPrimary,
                          }}
                        >
                          {p.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {/* Aufgabentyp */}
            <Text style={{ fontWeight: '600', marginBottom: spacing.xs + 2 }}>
              {t('tasks.typeLabel')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.lg }}>
              {TASK_TYPES.map((tt) => (
                <TouchableOpacity
                  key={tt.key}
                  onPress={() => setType(tt.key)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    marginRight: 6,
                    marginBottom: 6,
                    borderRadius: radius.pill,
                    borderWidth: 1.5,
                    borderColor: tt.key === type ? tt.color : colors.border,
                    backgroundColor: tt.key === type ? tt.color + '15' : 'transparent',
                  }}
                >
                  <Ionicons
                    name={tt.icon}
                    size={16}
                    color={tt.key === type ? tt.color : colors.textDisabled}
                  />
                  <Text
                    style={{
                      marginLeft: spacing.xs,
                      fontSize: 13,
                      fontWeight: tt.key === type ? 'bold' : 'normal',
                      color: tt.key === type ? tt.color : colors.textSecondary,
                    }}
                  >
                    {t('tasks.taskTypes.' + tt.i18nKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Datum & Zeit */}
            <Text style={{ fontWeight: '600', marginBottom: spacing.xs + 2 }}>
              {t('tasks.dateTimeLabel')}
            </Text>
            {Platform.OS === 'web' || !NativeDateTimePicker ? (
              <DSInput
                value={`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${formatLocalTime(date)}`}
                onChangeText={(str) => {
                  const [datum, zeit] = str.split(' ');
                  if (!datum || !zeit) return;
                  const [year, month, day] = datum.split('-').map(Number);
                  const [hour, minute] = zeit.split(':').map(Number);
                  if (!year || !month || !day || hour === undefined || minute === undefined) return;
                  setDate(new Date(year, month - 1, day, hour, minute));
                }}
                placeholder={t('tasks.datePlaceholder')}
                style={{ marginBottom: spacing.md }}
              />
            ) : Platform.OS === 'ios' ? (
              <View style={{ marginBottom: spacing.md }}>
                <NativeDateTimePicker
                  value={date}
                  mode="date"
                  display="inline"
                  onChange={(event, selectedDate) => {
                    if (selectedDate) {
                      const nd = new Date(date);
                      nd.setFullYear(
                        selectedDate.getFullYear(),
                        selectedDate.getMonth(),
                        selectedDate.getDate()
                      );
                      setDate(nd);
                    }
                  }}
                  style={{ marginBottom: spacing.sm }}
                />
                <NativeDateTimePicker
                  value={date}
                  mode="time"
                  is24Hour={true}
                  display="default"
                  onChange={(event, selectedDate) => {
                    if (selectedDate) {
                      const nd = new Date(date);
                      nd.setHours(selectedDate.getHours(), selectedDate.getMinutes());
                      setDate(nd);
                    }
                  }}
                />
              </View>
            ) : (
              <View style={{ marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <TouchableOpacity
                    onPress={() => setShowDate(true)}
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: radius.md,
                      padding: spacing.md,
                      backgroundColor: colors.surfaceSecondary,
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      color={colors.textSecondary}
                      style={{ marginRight: spacing.sm }}
                    />
                    <Text style={{ color: colors.textPrimary, fontSize: 15 }}>
                      {formatLocalDate(date)}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowTime(true)}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: radius.md,
                      padding: spacing.md,
                      backgroundColor: colors.surfaceSecondary,
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <Ionicons
                      name="time-outline"
                      size={18}
                      color={colors.textSecondary}
                      style={{ marginRight: spacing.sm }}
                    />
                    <Text style={{ color: colors.textPrimary, fontSize: 15 }}>
                      {formatLocalTime(date)}
                    </Text>
                  </TouchableOpacity>
                </View>
                {showDate && (
                  <NativeDateTimePicker
                    value={date}
                    mode="date"
                    display="default"
                    onChange={(event, selectedDate) => {
                      setShowDate(false);
                      if (selectedDate) {
                        const nd = new Date(date);
                        nd.setFullYear(
                          selectedDate.getFullYear(),
                          selectedDate.getMonth(),
                          selectedDate.getDate()
                        );
                        setDate(nd);
                      }
                    }}
                  />
                )}
                {showTime && (
                  <NativeDateTimePicker
                    value={date}
                    mode="time"
                    is24Hour={true}
                    display="default"
                    onChange={(event, selectedDate) => {
                      setShowTime(false);
                      if (selectedDate) {
                        const nd = new Date(date);
                        nd.setHours(selectedDate.getHours(), selectedDate.getMinutes());
                        setDate(nd);
                      }
                    }}
                  />
                )}
              </View>
            )}

            {/* Wiederholen */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: recurring ? spacing.sm : spacing.lg,
                padding: spacing.md,
                borderRadius: radius.md,
                backgroundColor: recurring ? colors.primarySurface : colors.background,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons
                  name="repeat"
                  size={20}
                  color={recurring ? colors.primaryLight : colors.textDisabled}
                />
                <Text
                  style={{
                    marginLeft: spacing.sm,
                    fontWeight: '600',
                    color: recurring ? colors.primary : colors.textSecondary,
                  }}
                >
                  {t('tasks.recurring')}
                </Text>
              </View>
              <Switch
                value={recurring}
                onValueChange={setRecurring}
                trackColor={{ true: colors.primaryLight }}
                thumbColor={recurring ? '#fff' : '#f4f3f4'}
              />
            </View>

            {recurring && (
              <View style={{ marginBottom: spacing.lg }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm }}>
                  {INTERVAL_PRESETS.map((p) => {
                    const active = intervalDays === p.days && !customInterval;
                    return (
                      <TouchableOpacity
                        key={p.days}
                        onPress={() => {
                          setIntervalDays(p.days);
                          setCustomInterval('');
                        }}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          marginRight: 6,
                          marginBottom: 6,
                          borderRadius: radius.lg,
                          borderWidth: 1,
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? colors.primarySurface : 'transparent',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: active ? 'bold' : 'normal',
                            color: active ? colors.primary : colors.textSecondary,
                          }}
                        >
                          {t('tasks.intervals.' + p.i18nKey)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: colors.textSecondary, marginRight: 6 }}>
                    {t('tasks.orEvery')}
                  </Text>
                  <DSInput
                    value={customInterval}
                    onChangeText={(val) => setCustomInterval(val.replace(/[^0-9]/g, ''))}
                    placeholder={String(intervalDays)}
                    keyboardType="number-pad"
                    style={{ width: 50 }}
                  />
                  <Text style={{ color: colors.textSecondary, marginLeft: 6 }}>
                    {t('tasks.daysUnit')}
                  </Text>
                </View>
              </View>
            )}

            {/* Notiz */}
            <Text style={{ fontWeight: '600', marginBottom: spacing.xs }}>
              {t('tasks.noteOptional')}
            </Text>
            <DSInput
              value={note}
              onChangeText={setNote}
              placeholder={t('tasks.notePlaceholder')}
              style={{ marginBottom: spacing.lg, minHeight: 40 }}
              multiline
            />

            {/* Buttons */}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm }}>
              <DSButton variant="ghost" size="sm" onPress={onClose}>
                {t('common.cancel')}
              </DSButton>
              <DSButton variant="primary" size="sm" onPress={handleSave}>
                {recurring ? t('tasks.createSeries') : t('common.save')}
              </DSButton>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
