import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import { t } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import DSButton from '../theme/DSButton';
import DSCard from '../theme/DSCard';
import DSInput from '../theme/DSInput';
import DSChipGroup from '../theme/DSChips';

const getZoneTypes = () => [
  { key: 'room', label: t('home.zoneTypes.room'), icon: 'home-outline' },
  { key: 'balcony', label: t('home.zoneTypes.balcony'), icon: 'sunny-outline' },
  { key: 'garden', label: t('home.zoneTypes.garden'), icon: 'leaf-outline' },
  { key: 'greenhouse', label: t('home.zoneTypes.greenhouse'), icon: 'flower-outline' },
];

export default function HomeManager() {
  const [locations, setLocations] = useState([]);
  const [unassignedPlants, setUnassignedPlants] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', address: '', type: 'room' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { userId } = useAuth();

  useEffect(() => {
    reload();
  }, []);

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

      setLocations(
        (locs || []).map((l) => ({ ...l, zones: zonesMap[l.id] || [] }))
      );

      // Fetch plants without a zone assignment
      const { data: noZonePlants } = await supabase
        .from('plants')
        .select('id, name, image_url')
        .eq('user_id', userId)
        .is('zone_id', null)
        .order('created_at', { ascending: false });
      setUnassignedPlants(noZonePlants || []);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
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
        <DSButton variant="primary" icon="refresh-outline" onPress={reload} style={{ marginTop: spacing.lg }}>
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
          <DSButton
            variant="primary"
            icon="home-outline"
            fullWidth
            onPress={() => openLocationModal()}
          >
            {t('home.newHome')}
          </DSButton>
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
                {item.address ? (
                  <Text style={styles.locationAddress}>{item.address}</Text>
                ) : null}
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
                <View key={p.id} style={styles.zoneRow}>
                  <View style={styles.zoneInfo}>
                    <Ionicons name="leaf-outline" size={18} color={colors.textTertiary} />
                    <Text style={styles.zoneText}>{p.name}</Text>
                  </View>
                </View>
              ))}
            </DSCard>
          ) : null
        }
      />
      {/* ── Modal ────────────────────────────────────── */}
      <Modal
        visible={dialogVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <View style={styles.overlay}>
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
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: spacing.lg,
    paddingBottom: 40,
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

  // Modal
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
});
