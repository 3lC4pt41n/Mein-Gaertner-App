import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Alert,
  Modal,
  TouchableOpacity,
  SectionList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { supabase } from '../supabase';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import { t } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import { getDexProgress } from '../services/dexService';
import { normalizeLanguage } from '../services/languageService';
import {
  getLocalizedContextText,
  getLocalizedSeasonName,
  getLocalizedTimeOfDayName,
} from '../utils/contextLocalization';
import DSButton from '../theme/DSButton';
import DSCard from '../theme/DSCard';
import DSInput from '../theme/DSInput';
import DSChipGroup from '../theme/DSChips';

function ContextSummary({ context, language }) {
  const season = context?.season;
  const time = context?.time;
  const weather = context?.weather;
  const city = context?.location?.city || weather?.city;
  const temperature = weather?.temperature ?? weather?.temp;
  const weatherText =
    weather?.weatherText ||
    weather?.description ||
    getLocalizedContextText('weatherFallback', language);

  if (!season && !time && !weather) return null;

  return (
    <View style={styles.contextCard}>
      <View style={styles.contextHeader}>
        <Ionicons name="compass-outline" size={18} color={colors.primary} />
        <Text style={styles.contextTitle}>{getLocalizedContextText('homeTitle', language)}</Text>
      </View>
      <View style={styles.contextPills}>
        {season && (
          <View style={styles.contextPill}>
            <Text style={styles.contextPillText}>
              {season.icon} {getLocalizedSeasonName(season, language)}
            </Text>
          </View>
        )}
        {time && (
          <View style={styles.contextPill}>
            <Text style={styles.contextPillText}>
              {time.icon} {getLocalizedTimeOfDayName(time, language)}
            </Text>
          </View>
        )}
        {weather && (
          <View style={styles.contextPill}>
            <Text style={styles.contextPillText}>
              🌦️ {weatherText}
              {temperature !== null && temperature !== undefined ? ` · ${temperature}°C` : ''}
              {city ? ` · ${city}` : ''}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const getZoneTypes = () => [
  { key: 'room', label: t('home.zoneTypes.room'), icon: 'home-outline' },
  { key: 'balcony', label: t('home.zoneTypes.balcony'), icon: 'sunny-outline' },
  { key: 'garden', label: t('home.zoneTypes.garden'), icon: 'leaf-outline' },
  { key: 'greenhouse', label: t('home.zoneTypes.greenhouse'), icon: 'flower-outline' },
];

export default function HomeManager({ context }) {
  const [locations, setLocations] = useState([]);
  const [unassignedPlants, setUnassignedPlants] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', address: '', type: 'room' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dexProgress, setDexProgress] = useState({ total: 0, discovered: 0, firstDiscoveries: 0 });

  // Zone picker for assigning unassigned plants
  const [zonePickerVisible, setZonePickerVisible] = useState(false);
  const [zonePickerPlant, setZonePickerPlant] = useState(null);
  const [zoneSections, setZoneSections] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [savingZone, setSavingZone] = useState(false);

  const { userId, profile } = useAuth();
  const currentLanguage = normalizeLanguage(profile?.language);
  const navigation = useNavigation();

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [userId])
  );

  const reload = async () => {
    if (!userId) {
      Alert.alert(t('common.notLoggedIn'), t('common.notLoggedInMessage'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: locs, error: locErr } = await supabase
        .from('locations')
        .select('id, name, address')
        .eq('user_id', userId)
        .order('created_at');
      if (locErr) throw locErr;

      const locIds = (locs || []).map((l) => l.id);
      let zonesMap = {};
      if (locIds.length > 0) {
        const { data: allZones, error: zoneErr } = await supabase
          .from('zones')
          .select('id, name, type, location_id')
          .in('location_id', locIds);
        if (!zoneErr && allZones) {
          allZones.forEach((z) => {
            if (!zonesMap[z.location_id]) zonesMap[z.location_id] = [];
            zonesMap[z.location_id].push(z);
          });
        }
      }

      setLocations((locs || []).map((l) => ({ ...l, zones: zonesMap[l.id] || [] })));

      // Fetch plants without a zone assignment
      const { data: noZonePlants } = await supabase
        .from('plants')
        .select('id, name, image_url')
        .eq('user_id', userId)
        .is('zone_id', null)
        .order('created_at', { ascending: false });
      setUnassignedPlants(noZonePlants || []);

      // Fetch Dex progress
      const dexData = await getDexProgress(userId);
      setDexProgress(dexData);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  // ── Zone Picker for Unassigned Plants ──────────────
  const openZonePicker = async (plant) => {
    setZonePickerPlant(plant);
    setZonePickerVisible(true);
    setZonesLoading(true);
    try {
      const { data: locs } = await supabase
        .from('locations')
        .select('id, name')
        .eq('user_id', userId);
      const locIds = (locs || []).map((l) => l.id);
      if (!locIds.length) {
        setZoneSections([]);
        setZonesLoading(false);
        return;
      }
      const { data: zones } = await supabase
        .from('zones')
        .select('id, name, type, location_id')
        .in('location_id', locIds)
        .order('name');
      const grouped = (locs || [])
        .map((location) => ({
          title: location.name,
          data: (zones || []).filter((z) => z.location_id === location.id),
        }))
        .filter((section) => section.data.length > 0);
      setZoneSections(grouped);
    } catch (err) {
      Alert.alert(t('common.error'), err.message);
      setZoneSections([]);
    }
    setZonesLoading(false);
  };

  const assignPlantToZone = async (zone) => {
    if (!zonePickerPlant) return;
    setSavingZone(true);
    try {
      const { error } = await supabase
        .from('plants')
        .update({ zone_id: zone.id })
        .eq('id', zonePickerPlant.id);
      if (error) throw error;
      Alert.alert(t('common.success'), t('plants.zoneAssigned', { zone: zone.name }));
      setZonePickerVisible(false);
      setZonePickerPlant(null);
      reload();
    } catch (e) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setSavingZone(false);
    }
  };

  // ── Modals ──────────────────────────────────────────
  const openLocationModal = (loc) => {
    setEditing({ type: 'location', locationId: loc?.id });
    setForm({ name: loc?.name || '', address: loc?.address || '' });
    setDialogVisible(true);
  };

  const openZoneModal = (locationId, zone) => {
    setEditing({ type: 'zone', locationId, zone });
    setForm({ name: zone?.name || '', type: zone?.type || 'room' });
    setDialogVisible(true);
  };

  const closeModal = () => {
    setDialogVisible(false);
    setEditing(null);
    setForm({ name: '', address: '', type: 'room' });
  };

  // ── CRUD ────────────────────────────────────────────
  const saveLocation = async () => {
    if (!userId) return;
    if (!form.name.trim()) {
      Alert.alert(t('common.error'), t('common.nameRequired'));
      return;
    }
    try {
      if (editing?.locationId) {
        const { error } = await supabase
          .from('locations')
          .update({ name: form.name, address: form.address })
          .eq('id', editing.locationId)
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('locations')
          .insert([{ name: form.name, address: form.address, user_id: userId }]);
        if (error) throw error;
      }
      closeModal();
      reload();
    } catch (err) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  const saveZone = async () => {
    if (!form.name.trim()) {
      Alert.alert(t('common.error'), t('common.nameRequired'));
      return;
    }
    try {
      if (editing?.zone) {
        const { error } = await supabase
          .from('zones')
          .update({ name: form.name, type: form.type })
          .eq('id', editing.zone.id)
          .eq('location_id', editing.locationId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('zones')
          .insert([{ location_id: editing.locationId, name: form.name, type: form.type }]);
        if (error) throw error;
      }
      closeModal();
      reload();
    } catch (err) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  const deleteLocation = (locationId) => {
    Alert.alert(t('home.deleteHomeTitle'), t('home.deleteHomeMessage'), [
      { text: t('common.cancel') },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('locations')
              .delete()
              .eq('id', locationId)
              .eq('user_id', userId);
            if (error) throw error;
            reload();
          } catch (err) {
            Alert.alert(t('common.error'), err.message);
          }
        },
      },
    ]);
  };

  const deleteZone = (zoneId) => {
    Alert.alert(t('home.deleteZoneTitle'), t('home.deleteZoneMessage'), [
      { text: t('common.cancel') },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('zones').delete().eq('id', zoneId);
            if (error) throw error;
            reload();
          } catch (err) {
            Alert.alert(t('common.error'), err.message);
          }
        },
      },
    ]);
  };

  const ZONE_TYPES = getZoneTypes();

  // ── Zone Row ────────────────────────────────────────
  const ZoneRow = ({ item, locationId }) => (
    <View style={styles.zoneRow}>
      <View style={styles.zoneInfo}>
        <Ionicons
          name={ZONE_TYPES.find((z) => z.key === item.type)?.icon || 'cube-outline'}
          size={18}
          color={colors.primary}
        />
        <Text style={styles.zoneText}>{item.name}</Text>
        <Text style={styles.zoneType}>({item.type})</Text>
      </View>
      <View style={styles.zoneActions}>
        <DSButton
          variant="ghost"
          size="sm"
          icon="pencil-outline"
          onPress={() => openZoneModal(locationId, item)}
          accessibilityLabel={t('home.editZone')}
        />
        <DSButton
          variant="ghost"
          size="sm"
          icon="trash-outline"
          onPress={() => deleteZone(item.id)}
          accessibilityLabel={t('common.delete')}
        />
      </View>
    </View>
  );

  // ── Error State ─────────────────────────────────────
  if (error && locations.length === 0) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="cloud-offline-outline" size={56} color={colors.textDisabled} />
        <Text style={styles.stateTitle}>{t('home.loadError')}</Text>
        <Text style={styles.stateHint}>{error}</Text>
        <DSButton
          variant="primary"
          icon="refresh-outline"
          onPress={reload}
          style={{ marginTop: spacing.lg }}
        >
          {t('common.retry')}
        </DSButton>
      </View>
    );
  }

  return (
    <>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={locations}
        refreshing={loading}
        onRefresh={reload}
        keyExtractor={(l) => l.id}
        ListHeaderComponent={() => (
          <>
            <ContextSummary context={context} language={currentLanguage} />

            {/* Plant Dex Progress Card */}
            <TouchableOpacity
              style={styles.dexProgressCard}
              onPress={() => navigation.navigate('MeinePflanzenTab', { screen: 'PlantDex' })}
              activeOpacity={0.7}
            >
              <View style={styles.dexCardContent}>
                <View style={styles.dexIconContainer}>
                  <Ionicons name="grid-outline" size={24} color={colors.primary} />
                </View>
                <View style={styles.dexTextContainer}>
                  <Text style={styles.dexLabel}>{t('dex.title')}</Text>
                  <Text style={styles.dexProgress}>
                    {t('dex.progress', {
                      discovered: dexProgress.discovered,
                      total: dexProgress.total,
                    })}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </View>
            </TouchableOpacity>

            <DSButton
              variant="primary"
              icon="home-outline"
              fullWidth
              onPress={() => openLocationModal()}
              style={{ marginTop: spacing.md }}
            >
              {t('home.newHome')}
            </DSButton>
          </>
        )}
        ListEmptyComponent={
          !loading && (
            <View style={styles.centerState}>
              <Ionicons name="home-outline" size={56} color={colors.textDisabled} />
              <Text style={styles.stateTitle}>{t('home.noZones')}</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <DSCard
            variant="elevated"
            padding="sm"
            style={{ marginTop: spacing.md }}
            onPress={() => setExpandedId(expandedId === item.id ? null : item.id)}
          >
            {/* Location Header */}
            <View style={styles.locationHeader}>
              <View style={styles.locationIcon}>
                <Ionicons name="home" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.locationName}>{item.name}</Text>
                {item.address ? <Text style={styles.locationAddress}>{item.address}</Text> : null}
              </View>
              <Ionicons
                name={expandedId === item.id ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.textTertiary}
              />
            </View>

            {/* Expanded Content */}
            {expandedId === item.id && (
              <View style={styles.expandedContent}>
                {item.zones?.length ? (
                  item.zones.map((z) => <ZoneRow key={z.id} item={z} locationId={item.id} />)
                ) : (
                  <Text style={styles.emptyTxt}>{t('home.noZones')}</Text>
                )}
                <View style={styles.actionRow}>
                  <DSButton
                    variant="secondary"
                    size="sm"
                    icon="add-outline"
                    onPress={() => openZoneModal(item.id)}
                    style={{ flex: 1, marginRight: spacing.sm }}
                  >
                    {t('home.addZone')}
                  </DSButton>
                  <DSButton
                    variant="ghost"
                    size="sm"
                    icon="pencil-outline"
                    onPress={() => openLocationModal(item)}
                  />
                  <DSButton
                    variant="ghost"
                    size="sm"
                    icon="trash-outline"
                    onPress={() => deleteLocation(item.id)}
                    textStyle={{ color: colors.danger }}
                  />
                </View>
              </View>
            )}
          </DSCard>
        )}
        ListFooterComponent={
          unassignedPlants.length > 0 ? (
            <DSCard variant="outlined" padding="sm" style={{ marginTop: spacing.lg }}>
              <View style={styles.locationHeader}>
                <View style={[styles.locationIcon, { backgroundColor: colors.warningSurface }]}>
                  <Ionicons name="help-circle-outline" size={22} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.locationName}>{t('home.unassignedPlants')}</Text>
                  <Text style={styles.locationAddress}>
                    {t('plants.plantsCount', { count: unassignedPlants.length })}
                  </Text>
                </View>
              </View>
              {unassignedPlants.map((p) => (
                <TouchableOpacity key={p.id} onPress={() => openZonePicker(p)} activeOpacity={0.7}>
                  <View style={styles.zoneRow}>
                    <View style={styles.zoneInfo}>
                      <Ionicons name="leaf-outline" size={18} color={colors.textTertiary} />
                      <Text style={styles.zoneText}>{p.name}</Text>
                    </View>
                    <View style={styles.assignHint}>
                      <Ionicons name="arrow-forward-outline" size={16} color={colors.primary} />
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </DSCard>
          ) : null
        }
      />
      {/* ── Location/Zone Modal ──────────────────────── */}
      <Modal visible={dialogVisible} animationType="slide" transparent onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {editing?.type === 'location'
                ? editing.locationId
                  ? t('home.editHome')
                  : t('home.newHome')
                : editing?.zone
                  ? t('home.editZone')
                  : t('home.newZone')}
            </Text>

            <DSInput
              label={t('common.name')}
              placeholder={t('common.name')}
              value={form.name}
              onChangeText={(val) => setForm({ ...form, name: val })}
              icon="text-outline"
            />

            {editing?.type === 'location' && (
              <DSInput
                label={t('home.addressPlaceholder')}
                placeholder={t('home.addressPlaceholder')}
                value={form.address}
                onChangeText={(val) => setForm({ ...form, address: val })}
                icon="location-outline"
              />
            )}

            {editing?.type === 'zone' && (
              <View style={{ marginBottom: spacing.lg }}>
                <Text style={styles.chipLabel}>{t('common.type')}</Text>
                <DSChipGroup
                  items={ZONE_TYPES}
                  selected={form.type}
                  onSelect={(key) => setForm({ ...form, type: key })}
                  variant="segmented"
                  scrollable={false}
                />
              </View>
            )}

            <View style={styles.modalActions}>
              <DSButton
                variant="secondary"
                onPress={closeModal}
                style={{ flex: 1, marginRight: spacing.sm }}
              >
                {t('common.cancel')}
              </DSButton>
              <DSButton
                variant="primary"
                onPress={editing?.type === 'location' ? saveLocation : saveZone}
                style={{ flex: 1 }}
              >
                {t('common.save')}
              </DSButton>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Zone Picker Modal for Unassigned Plants ──── */}
      <Modal
        visible={zonePickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setZonePickerVisible(false);
          setZonePickerPlant(null);
        }}
      >
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPressOut={() => {
            setZonePickerVisible(false);
            setZonePickerPlant(null);
          }}
        >
          <TouchableOpacity style={styles.pickerSheet} activeOpacity={1}>
            <Text style={styles.pickerTitle}>
              {zonePickerPlant
                ? t('plants.selectZone') + ': ' + zonePickerPlant.name
                : t('plants.selectZone')}
            </Text>
            {zonesLoading ? (
              <ActivityIndicator size="large" color={colors.primaryLight} />
            ) : zoneSections.length ? (
              <SectionList
                sections={zoneSections}
                keyExtractor={(item) => item.id}
                renderSectionHeader={({ section: { title } }) => (
                  <Text style={styles.pickerSectionHeader}>{title}</Text>
                )}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.pickerZoneRow}
                    onPress={() => assignPlantToZone(item)}
                    disabled={savingZone}
                  >
                    <Ionicons
                      name="home-outline"
                      size={22}
                      color={colors.primaryLight}
                      style={{ marginRight: spacing.sm }}
                    />
                    <Text style={styles.pickerZoneName}>
                      {item.name} <Text style={styles.pickerZoneType}>({item.type})</Text>
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={{ alignItems: 'center', padding: spacing.lg }}>
                    <Text
                      style={{
                        textAlign: 'center',
                        color: colors.textSecondary,
                        marginBottom: spacing.md,
                      }}
                    >
                      {t('home.noZones')}
                    </Text>
                  </View>
                }
              />
            ) : (
              <View style={{ alignItems: 'center', padding: spacing.lg }}>
                <Text
                  style={{
                    textAlign: 'center',
                    color: colors.textSecondary,
                    marginBottom: spacing.md,
                  }}
                >
                  {t('home.noZones')}
                </Text>
              </View>
            )}
            {savingZone && (
              <ActivityIndicator
                size="large"
                color={colors.primaryLight}
                style={{ marginTop: spacing.md }}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: spacing.lg,
    paddingBottom: 40,
  },

  // Kontext
  contextCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.primarySurface,
    ...shadows.sm,
  },
  contextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  contextTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.2,
  },
  contextPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  contextPill: {
    backgroundColor: colors.primarySurface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  contextPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  // Dex Progress Card
  dexProgressCard: {
    backgroundColor: colors.primarySurface,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  dexCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  dexIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.1,
  },
  dexTextContainer: {
    flex: 1,
  },
  dexLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  dexProgress: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },

  // Location card
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  locationName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  locationAddress: {
    fontSize: 13,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Expanded
  expandedContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
    marginTop: spacing.xs,
    paddingTop: spacing.md,
  },

  // Zone row
  zoneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  zoneInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  zoneText: { fontSize: 14, color: colors.textPrimary, fontWeight: '500' },
  zoneType: { color: colors.textTertiary, fontSize: 12 },
  zoneActions: { flexDirection: 'row' },
  assignHint: {
    paddingHorizontal: spacing.sm,
  },

  // Actions
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },

  // Empty / error states
  centerState: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: spacing.xl,
  },
  stateTitle: {
    fontSize: 16,
    color: colors.textTertiary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  stateHint: {
    fontSize: 13,
    color: colors.textDisabled,
    marginTop: spacing.sm,
    textAlign: 'center',
  },

  emptyTxt: {
    color: colors.textTertiary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.md,
  },

  // Location/Zone Modal
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalBox: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: radius.lg,
    ...shadows.lg,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: spacing.lg,
    color: colors.textPrimary,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },

  // Zone Picker Modal
  pickerOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '60%',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: spacing.md,
    textAlign: 'center',
    color: colors.textPrimary,
  },
  pickerSectionHeader: {
    fontWeight: 'bold',
    fontSize: 14,
    backgroundColor: colors.background,
    paddingVertical: spacing.xs,
    paddingHorizontal: 2,
    marginTop: spacing.lg,
    color: colors.textSecondary,
  },
  pickerZoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pickerZoneName: { fontSize: 16, color: colors.textPrimary },
  pickerZoneType: { color: colors.textTertiary, fontSize: 12 },
});
