import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
  TouchableOpacity,
  SectionList,
  Modal,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { savePlantToSupabase, saveHealthcheck } from '../services/plantService';
import { uploadPlantImage } from '../services/uploadService';
import { recognizePlant, generatePlantDetails, performHealthcheck } from '../services/aiService';
import { fetchBalance } from '../services/creditService';
import { logDiscovery } from '../services/discoveryService';
import { supabase } from '../supabase';
import { useNavigation } from '@react-navigation/native';
import { fetchCurrentUserLanguage } from '../services/languageService';
import { t } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import DSButton from '../theme/DSButton';
import DSInput from '../theme/DSInput';
import DSCard from '../theme/DSCard';
import DiscoveryRevealModal from '../components/DiscoveryRevealModal';
import { AI_COSTS } from '../services/pricingConfig';

// Fetch zones grouped by location for the picker
async function fetchZonesGrouped(userId) {
  const { data: locations, error: locErr } = await supabase
    .from('locations')
    .select('id, name')
    .eq('user_id', userId);
  if (locErr) throw locErr;
  const locIds = (locations || []).map((l) => l.id);
  if (!locIds.length) return [];
  const { data: zones, error: zErr } = await supabase
    .from('zones')
    .select('id, name, type, location_id')
    .in('location_id', locIds)
    .order('name');
  if (zErr) throw zErr;
  return locations
    .map((loc) => ({
      title: loc.name,
      data: (zones || []).filter((z) => z.location_id === loc.id),
    }))
    .filter((s) => s.data.length > 0);
}

/*
 * AddPlantScreen — staged onboarding flow:
 *   Step 1: Scan (photo + AI recognition) — 1 credit
 *   Step 2: Save (name, note, zone) — free
 *   Step 3: Optional upgrades (details, healthcheck) — extra credits, offered after save
 */
export default function AddPlantScreen() {
  const navigation = useNavigation();
  const { userId } = useAuth();

  // ── Core state ──────────────────────────────
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const [base64Image, setBase64Image] = useState(null);
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState(null);
  const [language, setLanguage] = useState('de');

  // ── Step tracking ───────────────────────────
  // 'scan' → 'save' → 'done'
  const [step, setStep] = useState('scan');
  const [savedPlant, setSavedPlant] = useState(null);

  // ── Zone picker ─────────────────────────────
  const [selectedZone, setSelectedZone] = useState(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [sections, setSections] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(false);

  // ── Discovery reveal ──────────────────────
  const [discoveryResult, setDiscoveryResult] = useState(null);
  const [showReveal, setShowReveal] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const bal = await fetchBalance();
        setBalance(bal);
      } catch (e) {
        // Balance fetch failed silently
      }
      try {
        const userLanguage = await fetchCurrentUserLanguage();
        setLanguage(userLanguage);
      } catch (e) {
        // Language fetch failed silently
      }
    })();
  }, []);

  // Credit error handler
  const handleCreditError = (e) => {
    if (e.code === 'INSUFFICIENT_CREDITS') {
      Alert.alert(
        t('common.insufficientCredits'),
        t('common.insufficientCreditsMessage', { balance: e.balance, required: e.required }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.buyCredits'), onPress: () => navigation.navigate('Mehr', { screen: 'ShopMain' }) },
        ]
      );
      return true;
    }
    return false;
  };

  // ── Step 1: Scan ────────────────────────────
  const takePhotoAndRecognize = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      alert(t('common.cameraRequired'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      const base64 = result.assets[0].base64;
      const uri = result.assets[0].uri;
      setImageUri(uri);
      setBase64Image(base64);
      setLoading(true);

      try {
        const data = await recognizePlant(base64, language);
        setName(data.name || t('plants.noNameRecognized'));
        setNote(data.note || t('plants.noNoteAvailable'));
        if (typeof data.balance === 'number') setBalance(data.balance);
        setStep('save');
      } catch (e) {
        if (!handleCreditError(e)) {
          Alert.alert(t('common.error'), e.message || t('plants.unknownError'));
          setNote(t('common.error') + ': ' + (e.message || t('plants.scanError')));
          setName('');
        }
      }
      setLoading(false);
    }
  };

  // ── Zone picker helpers ─────────────────────
  const openZonePicker = async () => {
    setPickerVisible(true);
    setZonesLoading(true);
    try {
      const data = await fetchZonesGrouped(userId);
      setSections(data);
    } catch (err) {
      setSections([]);
    }
    setZonesLoading(false);
  };

  // ── Step 2: Save (free) ─────────────────────
  const handleSave = async () => {
    if (!userId || !imageUri || !name) {
      Alert.alert(t('common.error'), t('plants.photoUserNameCheck'));
      return;
    }
    setLoading(true);

    // Upload image
    let uploadedUrl = null;
    try {
      uploadedUrl = await uploadPlantImage(imageUri, userId);
    } catch (e) {
      Alert.alert(t('plants.uploadError'), e.message);
      setLoading(false);
      return;
    }

    // Save plant (no AI calls — free)
    try {
      const plant = await savePlantToSupabase({
        name,
        note,
        image: uploadedUrl,
        user_id: userId,
        details: null,
        ...(selectedZone ? { zone_id: selectedZone.id } : {}),
      });

      // Discovery event — capture result for reveal
      let discovery = null;
      try {
        discovery = await logDiscovery(userId, name, plant?.id);
      } catch (discoveryError) {
        // Discovery logging is non-critical — plant is saved, reveal just won't show.
        // Error is intentionally not surfaced to user but logged for diagnostics.
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn('[AddPlant] Discovery logging failed:', discoveryError?.message);
        }
      }

      // Gardening event
      try {
        await supabase.from('gardening_events').insert({
          user_id: userId,
          event_type: 'plant_added',
          plant_id: plant?.id,
          points: 1.0,
          meta: { plant_name: name },
        });
      } catch {
        // Non-critical — continue silently
      }

      setSavedPlant({ ...plant, image_url: uploadedUrl });
      setStep('done');

      // Show discovery reveal for new discoveries
      if (discovery?.isNewForUser) {
        setDiscoveryResult(discovery);
        setShowReveal(true);
      }
    } catch (err) {
      Alert.alert(t('common.error'), t('plants.saveFailedMessage', { message: err.message }));
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Optional upgrades ───────────────
  const handleGenerateDetails = async () => {
    if (!savedPlant) return;
    setLoading(true);
    try {
      const detailsData = await generatePlantDetails(name, note, language);
      if (typeof detailsData.balance === 'number') setBalance(detailsData.balance);

      // Update plant with details
      await supabase
        .from('plants')
        .update({ details: detailsData.details })
        .eq('id', savedPlant.id);

      Alert.alert(t('common.success'), t('plants.detailsGenerated'));
      setSavedPlant((p) => ({ ...p, details: detailsData.details }));
    } catch (e) {
      if (!handleCreditError(e)) {
        Alert.alert(t('common.error'), e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRunHealthcheck = async () => {
    if (!savedPlant) return;
    setLoading(true);
    try {
      const hcData = await performHealthcheck(savedPlant.image_url, name, language);
      if (typeof hcData.balance === 'number') setBalance(hcData.balance);

      // Save healthcheck
      await saveHealthcheck({
        plant_id: savedPlant.id,
        user_id: userId,
        healthscore: hcData.healthcheck.healthscore,
        summary: hcData.healthcheck.summary,
        table_json: hcData.healthcheck.table,
        recommendation: hcData.healthcheck.recommendation,
      });

      Alert.alert(t('common.success'), t('plants.healthcheckGenerated'));
    } catch (e) {
      if (!handleCreditError(e)) {
        Alert.alert(t('common.error'), e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const goToPlantDetail = () => {
    if (!savedPlant) return;
    setName('');
    setNote('');
    setImageUri(null);
    setBase64Image(null);
    setSelectedZone(null);
    setStep('scan');
    setSavedPlant(null);
    setDiscoveryResult(null);
    setShowReveal(false);
    navigation.navigate('MeinePflanzenTab', {
      screen: 'PlantDetail',
      params: { plant: savedPlant },
    });
  };

  // ── Render ──────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Credit balance */}
      {balance !== null && (
        <DSCard variant="flat" padding="sm" style={styles.balanceCard}>
          <View style={styles.balanceRow}>
            <Ionicons name="flash" size={18} color={balance > 20 ? colors.primaryLight : colors.warning} />
            <Text style={styles.balanceLabel}>{t('common.credits')}</Text>
            <Text style={[styles.balanceValue, { color: balance > 20 ? colors.primaryLight : colors.warning }]}>
              {balance}
            </Text>
          </View>
        </DSCard>
      )}

      {/* ── Step indicator ──────────────────── */}
      <View style={styles.stepRow}>
        {['scan', 'save', 'done'].map((s, i) => (
          <View key={s} style={styles.stepItem}>
            <View
              style={[
                styles.stepDot,
                step === s && styles.stepDotActive,
                (['save', 'done'].includes(step) && i === 0) && styles.stepDotDone,
                (step === 'done' && i <= 1) && styles.stepDotDone,
              ]}
            >
              {(step === 'done' && i <= 1) || (['save', 'done'].includes(step) && i === 0) ? (
                <Ionicons name="checkmark" size={14} color={colors.surface} />
              ) : (
                <Text style={[styles.stepNum, step === s && styles.stepNumActive]}>{i + 1}</Text>
              )}
            </View>
            <Text style={[styles.stepLabel, step === s && styles.stepLabelActive]}>
              {t(`plants.step${s.charAt(0).toUpperCase() + s.slice(1)}`)}
            </Text>
          </View>
        ))}
      </View>

      {/* ── STEP: Scan ─────────────────────── */}
      {step === 'scan' && (
        <DSCard>
          <DSButton onPress={takePhotoAndRecognize} fullWidth icon="camera-outline" disabled={loading}>
            {t('plants.scanButton')}
          </DSButton>
          {loading && (
            <ActivityIndicator size="large" color={colors.primaryLight} style={{ marginTop: spacing.lg }} />
          )}
        </DSCard>
      )}

      {/* ── STEP: Save ─────────────────────── */}
      {step === 'save' && (
        <DSCard>
          {imageUri && (
            <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
          )}

          <DSInput
            label={t('plants.nameLabel')}
            value={name}
            onChangeText={setName}
            placeholder={t('plants.namePlaceholder')}
            icon="leaf-outline"
          />

          <DSInput
            label={t('plants.noteLabel')}
            value={note}
            onChangeText={setNote}
            placeholder={t('plants.notePlaceholder')}
            multiline
          />

          {/* Zone picker (3.2) */}
          <Text style={styles.fieldLabel}>{t('plants.zoneOptional')}</Text>
          <TouchableOpacity style={styles.zonePicker} onPress={openZonePicker}>
            <Ionicons name="home-outline" size={18} color={selectedZone ? colors.primaryLight : colors.textDisabled} />
            <Text style={[styles.zonePickerText, selectedZone && { color: colors.textPrimary }]}>
              {selectedZone ? selectedZone.name : t('plants.selectZoneOptional')}
            </Text>
            <Ionicons name="chevron-down" size={18} color={colors.textTertiary} />
          </TouchableOpacity>

          <DSButton
            onPress={handleSave}
            disabled={!name || loading}
            fullWidth
            icon="checkmark-circle-outline"
            style={{ marginTop: spacing.md }}
          >
            {t('plants.savePlant')}
          </DSButton>

          <DSButton
            variant="ghost"
            size="sm"
            onPress={() => { setStep('scan'); setImageUri(null); setName(''); setNote(''); }}
            fullWidth
            style={{ marginTop: spacing.xs }}
          >
            {t('plants.rescan')}
          </DSButton>

          {loading && (
            <ActivityIndicator size="large" color={colors.primaryLight} style={{ marginTop: spacing.lg }} />
          )}
        </DSCard>
      )}

      {/* ── STEP: Done (optional upgrades) ── */}
      {step === 'done' && savedPlant && (
        <>
          <DSCard>
            <View style={styles.successRow}>
              <Ionicons name="checkmark-circle" size={32} color={colors.primaryLight} />
              <Text style={styles.successText}>{t('plants.savedSuccess')}</Text>
            </View>
            {savedPlant.image_url && (
              <Image source={{ uri: savedPlant.image_url }} style={styles.previewSmall} resizeMode="cover" />
            )}
            <Text style={styles.savedName}>{savedPlant.name}</Text>
          </DSCard>

          <DSCard>
            <Text style={styles.upgradeTitle}>{t('plants.optionalUpgrades')}</Text>
            <Text style={styles.upgradeSubtitle}>
              {t('plants.upgradeHint', {
                details: AI_COSTS.details,
                healthcheck: AI_COSTS.healthcheck,
              })}
            </Text>

            <DSButton
              variant="secondary"
              icon="document-text-outline"
              onPress={handleGenerateDetails}
              disabled={loading || !!savedPlant.details}
              fullWidth
              style={{ marginBottom: spacing.sm }}
            >
              {savedPlant.details ? t('plants.detailsAlready') : t('plants.generateDetails')}
            </DSButton>

            <DSButton
              variant="secondary"
              icon="pulse-outline"
              onPress={handleRunHealthcheck}
              disabled={loading}
              fullWidth
              style={{ marginBottom: spacing.md }}
            >
              {t('plants.runHealthcheck')}
            </DSButton>

            {loading && (
              <ActivityIndicator size="small" color={colors.primaryLight} style={{ marginBottom: spacing.sm }} />
            )}

            <DSButton onPress={goToPlantDetail} fullWidth icon="arrow-forward-outline" iconPosition="right">
              {t('plants.viewPlant')}
            </DSButton>
          </DSCard>
        </>
      )}

      {/* ── Zone Picker Modal ──────────────── */}
      <Modal visible={pickerVisible} animationType="slide" transparent onRequestClose={() => setPickerVisible(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPressOut={() => setPickerVisible(false)}>
          <TouchableOpacity style={styles.sheet} activeOpacity={1}>
            <Text style={styles.sheetTitle}>{t('plants.selectZone')}</Text>
            {zonesLoading ? (
              <ActivityIndicator size="large" color={colors.primaryLight} />
            ) : sections.length ? (
              <SectionList
                sections={sections}
                keyExtractor={(item) => item.id}
                renderSectionHeader={({ section: { title } }) => (
                  <Text style={styles.sectionHeader}>{title}</Text>
                )}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.zoneRow}
                    onPress={() => {
                      setSelectedZone(item);
                      setPickerVisible(false);
                    }}
                  >
                    <Ionicons name="home-outline" size={22} color={colors.primaryLight} style={{ marginRight: spacing.sm }} />
                    <Text style={styles.zoneName}>
                      {item.name} <Text style={styles.zoneType}>({item.type})</Text>
                    </Text>
                    {selectedZone?.id === item.id && (
                      <Ionicons name="checkmark" size={20} color={colors.primaryLight} style={{ marginLeft: 'auto' }} />
                    )}
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
                    <DSButton
                      variant="secondary"
                      size="sm"
                      icon="home-outline"
                      onPress={() => {
                        setPickerVisible(false);
                        navigation.navigate('Zuhause');
                      }}
                    >
                      {t('home.newHome')}
                    </DSButton>
                  </View>
                }
              />
            ) : (
              <View style={{ alignItems: 'center', padding: spacing.lg }}>
                <Text style={{ textAlign: 'center', color: colors.textSecondary, marginBottom: spacing.md }}>
                  {t('home.noZones')}
                </Text>
                <DSButton
                  variant="secondary"
                  size="sm"
                  icon="home-outline"
                  onPress={() => {
                    setPickerVisible(false);
                    navigation.navigate('Zuhause');
                  }}
                >
                  {t('home.newHome')}
                </DSButton>
              </View>
            )}
            <DSButton variant="ghost" onPress={() => setPickerVisible(false)} style={{ marginTop: spacing.sm }}>
              {t('common.close')}
            </DSButton>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Discovery Reveal */}
      <DiscoveryRevealModal
        visible={showReveal}
        discovery={discoveryResult}
        imageUri={imageUri}
        onContinue={() => {
          setShowReveal(false);
        }}
        onViewDex={() => {
          setShowReveal(false);
          navigation.navigate('MeinePflanzenTab', { screen: 'PlantDex' });
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 40 },

  // Balance
  balanceCard: { marginBottom: spacing.md },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  balanceLabel: { flex: 1, fontWeight: '600', color: colors.textSecondary, fontSize: 14 },
  balanceValue: { fontWeight: 'bold', fontSize: 18 },

  // Steps
  stepRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.lg, gap: spacing.xl },
  stepItem: { alignItems: 'center', gap: spacing.xs },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.borderLight,
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: colors.primary },
  stepDotDone: { backgroundColor: colors.primaryLight },
  stepNum: { fontSize: 13, fontWeight: '600', color: colors.textTertiary },
  stepNumActive: { color: colors.surface },
  stepLabel: { fontSize: 12, color: colors.textTertiary },
  stepLabelActive: { color: colors.primary, fontWeight: '600' },

  // Preview
  preview: { width: '100%', height: 200, borderRadius: radius.md, marginBottom: spacing.md },
  previewSmall: { width: '100%', height: 140, borderRadius: radius.md, marginVertical: spacing.sm },

  // Zone picker
  fieldLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  zonePicker: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.md, marginBottom: spacing.md,
    backgroundColor: colors.surface, gap: spacing.sm,
  },
  zonePickerText: { flex: 1, fontSize: 14, color: colors.textDisabled },

  // Success
  successRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  successText: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary },
  savedName: { fontSize: 16, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },

  // Upgrades
  upgradeTitle: { fontSize: 16, fontWeight: 'bold', color: colors.textPrimary, marginBottom: spacing.xs },
  upgradeSubtitle: { fontSize: 13, color: colors.textTertiary, marginBottom: spacing.md },

  // Modal
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface, padding: spacing.xl,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '60%',
  },
  sheetTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: spacing.md, textAlign: 'center' },
  sectionHeader: {
    fontWeight: 'bold', fontSize: 14, backgroundColor: colors.background,
    paddingVertical: spacing.xs, paddingHorizontal: 2, marginTop: spacing.lg, color: colors.textSecondary,
  },
  zoneRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  zoneName: { fontSize: 16 },
  zoneType: { color: colors.textTertiary, fontSize: 12 },
});
