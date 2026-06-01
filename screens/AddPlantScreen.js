import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { safeLaunchCamera } from '../services/imagePickerHelper';
import { Ionicons } from '@expo/vector-icons';
import { savePlantToSupabase, saveHealthcheck } from '../services/plantService';
import { uploadPlantImage, getPlantImageUrl } from '../services/uploadService';
import {
  recognizePlantFromImageUrl,
  generatePlantDetails,
  performHealthcheck,
} from '../services/aiService';
import { logDiscovery, getDiscoveryLocation } from '../services/discoveryService';
import { supabase } from '../supabase';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { fetchCurrentUserLanguage } from '../services/languageService';
import { t } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, radius } from '../theme/tokens';
import DSButton from '../theme/DSButton';
import DSInput from '../theme/DSInput';
import DSCard from '../theme/DSCard';
import DiscoveryRevealModal from '../components/DiscoveryRevealModal';
import { AI_COSTS } from '../services/pricingConfig';
import { friendlyError } from '../utils/errorMessages';
import { getPlantTitleParts } from '../utils/plantNameUtils';
import CreditBar from '../components/CreditBar';

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

async function linkPlantToSpecies(plantId, speciesId) {
  if (!plantId || !speciesId) return;

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await supabase
      .from('plants')
      .update({ species_id: speciesId })
      .eq('id', plantId);

    if (!error) return;
    lastError = error;

    if (attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  throw lastError;
}

/*
 * AddPlantScreen — staged onboarding flow:
 *   Step 1: Photo (camera opens immediately)
 *   Step 2: Save — choose: AI recognize (credits) or manual name (free), then name/note/zone
 *   Step 3: Optional upgrades (details, healthcheck) — extra credits, offered after save
 */
export default function AddPlantScreen() {
  const navigation = useNavigation();
  const { userId } = useAuth();

  // ── Core state ──────────────────────────────
  const [name, setName] = useState('');
  const [recognizedSpeciesName, setRecognizedSpeciesName] = useState('');
  const [nameEditedByUser, setNameEditedByUser] = useState(false);
  const [note, setNote] = useState('');
  const [plantType, setPlantType] = useState(null);
  const [imageUri, setImageUri] = useState(null);
  const [uploadedImagePath, setUploadedImagePath] = useState(null);
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState('de');

  // ── Step tracking ───────────────────────────
  // 'photo' → 'save' → 'done'
  const [step, setStep] = useState('photo');
  const [savedPlant, setSavedPlant] = useState(null);

  // ── Scan mode: 'ai' | 'manual' | null ──────
  const [scanMode, setScanMode] = useState(null);

  // ── Zone picker ─────────────────────────────
  const [selectedZone, setSelectedZone] = useState(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [sections, setSections] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(false);

  // ── Discovery reveal ──────────────────────
  const [discoveryResult, setDiscoveryResult] = useState(null);
  const [showReveal, setShowReveal] = useState(false);
  const savedPlantTitle = useMemo(
    () => (savedPlant ? getPlantTitleParts(savedPlant, language) : null),
    [savedPlant, language]
  );

  useEffect(() => {
    (async () => {
      try {
        const userLanguage = await fetchCurrentUserLanguage();
        setLanguage(userLanguage);
      } catch (error) {
        console.warn('[AddPlant] fetchCurrentUserLanguage failed:', error?.message);
      }
    })();
  }, []);

  // Track step via ref so useFocusEffect doesn't depend on step value
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // Reset to photo step when screen gains focus (so the plus button always works)
  useFocusEffect(
    useCallback(() => {
      // Only reset if we're on the "done" step — user already saved and left
      if (stepRef.current === 'done') {
        resetAllState();
      }
      // Balance refresh handled by CreditBar component
    }, [])
  );

  const resetAllState = useCallback(() => {
    setStep('photo');
    setName('');
    setRecognizedSpeciesName('');
    setNameEditedByUser(false);
    setNote('');
    setPlantType(null);
    setImageUri(null);
    setUploadedImagePath(null);
    setSelectedZone(null);
    setSavedPlant(null);
    setScanMode(null);
    setDiscoveryResult(null);
    setShowReveal(false);
  }, []);

  // Credit error handler
  const handleCreditError = (e) => {
    if (e.code === 'INSUFFICIENT_CREDITS') {
      Alert.alert(
        t('common.insufficientCredits'),
        t('common.insufficientCreditsMessage', { balance: e.balance, required: e.required }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.buyCredits'),
            onPress: () => navigation.navigate('Mehr', { screen: 'ShopMain' }),
          },
        ]
      );
      return true;
    }
    return false;
  };

  const handleNameChange = useCallback((value) => {
    setName(value);
    setNameEditedByUser(true);
  }, []);

  // ── Step 1: Photo only (no AI) ──────────────
  const takePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      alert(t('common.cameraRequired'));
      return;
    }
    const result = await safeLaunchCamera({
      allowsEditing: true,
      quality: 0.6,
    });

    if (result.canceled) return;

    const uri = result.assets[0].uri;
    if (!uri) {
      Alert.alert(t('common.error'), t('dialog.imagePickerError'));
      return;
    }

    setImageUri(uri);
    setUploadedImagePath(null);
    setStep('save');
  }, []);

  // Auto-open camera when entering photo step
  const cameraLaunched = useRef(false);
  useEffect(() => {
    if (step === 'photo' && !cameraLaunched.current) {
      cameraLaunched.current = true;
      takePhoto();
    }
    if (step !== 'photo') {
      cameraLaunched.current = false;
    }
  }, [step, takePhoto]);

  // ── Step 2: AI recognition (costs credits) ─
  const handleRecognize = async () => {
    if (!imageUri || !userId) return;
    setLoading(true);
    setScanMode('ai');
    try {
      let imagePath = uploadedImagePath;
      if (!imagePath) {
        imagePath = await uploadPlantImage(imageUri, userId);
        setUploadedImagePath(imagePath);
      }

      const imageUrl = await getPlantImageUrl(imagePath);
      if (!imageUrl) {
        throw new Error(t('plants.noImageForHealthcheck'));
      }

      const data = await recognizePlantFromImageUrl(imageUrl, language);
      const detectedName = typeof data?.name === 'string' ? data.name.trim() : '';
      setRecognizedSpeciesName(detectedName || '');
      setName(detectedName || t('plants.noNameRecognized'));
      setNameEditedByUser(false);
      setNote(data.note || t('plants.noNoteAvailable'));
      setPlantType(data.plant_type || null);
    } catch (e) {
      if (!handleCreditError(e)) {
        Alert.alert(t('common.error'), friendlyError(e));
      }
      setScanMode(null);
    }
    setLoading(false);
  };

  // ── Step 2: Manual mode (free) ─────────────
  const handleManualMode = () => {
    setScanMode('manual');
    setName('');
    setNote('');
    setRecognizedSpeciesName('');
    setNameEditedByUser(true);
  };

  // ── Zone picker helpers ─────────────────────
  const openZonePicker = async () => {
    setPickerVisible(true);
    setZonesLoading(true);
    try {
      const data = await fetchZonesGrouped(userId);
      setSections(data);
    } catch (error) {
      console.warn('[AddPlant] zone picker load failed:', error?.message);
      setSections([]);
      Alert.alert(t('common.error'), t('home.loadError'));
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

    // Upload image — returns storage path (not signed URL)
    let uploadedPath = uploadedImagePath;
    try {
      if (!uploadedPath) {
        uploadedPath = await uploadPlantImage(imageUri, userId);
        setUploadedImagePath(uploadedPath);
      }
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
        image: uploadedPath,
        user_id: userId,
        details: null,
        ...(selectedZone ? { zone_id: selectedZone.id } : {}),
      });

      // Discovery event — only for AI-recognized plants (manual = no discovery)
      let discovery = null;
      if (scanMode === 'ai') {
        try {
          const location = await getDiscoveryLocation();
          const discoverySpeciesName = nameEditedByUser
            ? name?.trim()
            : recognizedSpeciesName?.trim() || name?.trim();
          discovery = await logDiscovery(
            userId,
            discoverySpeciesName,
            plant?.id,
            location,
            plantType
          );

          // Link plant → species (für Dex-Cache Lookup bei Details-Generierung)
          if (discovery?.speciesId && plant?.id) {
            linkPlantToSpecies(plant.id, discovery.speciesId).catch((error) => {
              console.warn('[AddPlant] species link update failed:', error?.message);
            });
          }
        } catch (discoveryError) {
          if (__DEV__) {
            console.warn('[AddPlant] Discovery logging failed:', discoveryError?.message);
          }
          discovery = null;
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
      } catch (eventError) {
        console.warn('[AddPlant] plant_added event log failed:', eventError?.message);
      }

      // Generate display URL on-demand for immediate UI
      const displayUrl = await getPlantImageUrl(uploadedPath);
      setSavedPlant({
        ...plant,
        image_url: displayUrl,
        image_path: uploadedPath,
        species_id: discovery?.speciesId || null,
      });
      setStep('done');

      // Auto-generate details in the background (only for AI mode, uses cache → 0 Credits)
      if (plant?.id && scanMode === 'ai') {
        generatePlantDetails(name, note, language, discovery?.speciesId || null)
          .then((detailsData) => {
            if (detailsData?.details) {
              supabase.from('plants').update({ details: detailsData.details }).eq('id', plant.id);
              setSavedPlant((p) => ({ ...p, details: detailsData.details }));
            }
          })
          .catch((e) => {
            // Nicht kritisch – User kann Details manuell nachladen
            console.warn('[AddPlant] Auto-generate details failed:', e?.message);
          });
      }

      // Show discovery reveal for new discoveries
      if (discovery?.isNewForUser) {
        setDiscoveryResult(discovery);
        setShowReveal(true);
      }
    } catch (err) {
      Alert.alert(t('common.error'), friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Optional upgrades ───────────────
  const handleGenerateDetails = async () => {
    if (!savedPlant) return;
    setLoading(true);
    try {
      const detailsData = await generatePlantDetails(name, note, language, savedPlant.species_id);

      // Update plant with details
      await supabase
        .from('plants')
        .update({ details: detailsData.details })
        .eq('id', savedPlant.id);

      Alert.alert(t('common.success'), t('plants.detailsGenerated'));
      setSavedPlant((p) => ({ ...p, details: detailsData.details }));
    } catch (e) {
      if (!handleCreditError(e)) {
        Alert.alert(t('common.error'), friendlyError(e));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRunHealthcheck = async () => {
    if (!savedPlant) return;
    setLoading(true);
    try {
      const source = savedPlant.image_path || savedPlant.image_url;
      const healthcheckImageUrl = await getPlantImageUrl(source);
      if (!healthcheckImageUrl) {
        throw new Error(t('plants.noImageForHealthcheck'));
      }

      const hcData = await performHealthcheck(healthcheckImageUrl, name, language);

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
        Alert.alert(t('common.error'), friendlyError(e));
      }
    } finally {
      setLoading(false);
    }
  };

  const goToPlantDetail = () => {
    if (!savedPlant) return;
    // Navigate first — state resets on next focus via useFocusEffect
    navigation.navigate('MeinePflanzenTab', {
      screen: 'PlantDetail',
      params: { plant: savedPlant },
    });
  };

  // ── "Next plant" — reset + reopen camera ───
  const handleScanNext = () => {
    resetAllState();
    // Camera will auto-open via useEffect on step='photo'
  };

  // ── Render ──────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>{t('nav.addPlant')}</Text>
      </View>

      {/* Credit balance — unified component */}
      <CreditBar style={styles.creditBar} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* ── Step indicator ──────────────────── */}
        <View style={styles.stepRow}>
          {['photo', 'save', 'done'].map((s, i) => (
            <View key={s} style={styles.stepItem}>
              <View
                style={[
                  styles.stepDot,
                  step === s && styles.stepDotActive,
                  ['save', 'done'].includes(step) && i === 0 && styles.stepDotDone,
                  step === 'done' && i <= 1 && styles.stepDotDone,
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

        {/* ── STEP: Photo (camera auto-opens) ─ */}
        {step === 'photo' && (
          <DSCard>
            <View style={{ alignItems: 'center', gap: spacing.md }}>
              <Ionicons name="camera-outline" size={48} color={colors.textTertiary} />
              <Text style={styles.photoHint}>{t('plants.cameraOpening')}</Text>
              <DSButton onPress={takePhoto} fullWidth icon="camera-outline">
                {t('plants.retakePhoto')}
              </DSButton>
            </View>
          </DSCard>
        )}

        {/* ── STEP: Save ─────────────────────── */}
        {step === 'save' && (
          <DSCard>
            {imageUri && (
              <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
            )}

            {/* ── Recognize vs Manual choice ──── */}
            {!scanMode && (
              <View style={styles.modeChoice}>
                <DSButton
                  onPress={handleRecognize}
                  fullWidth
                  icon="sparkles-outline"
                  disabled={loading}
                >
                  {t('plants.recognizePlant', {
                    credits: AI_COSTS.scan,
                  })}
                </DSButton>
                <DSButton
                  variant="ghost"
                  onPress={handleManualMode}
                  fullWidth
                  icon="create-outline"
                  disabled={loading}
                >
                  {t('plants.addManually')}
                </DSButton>
                {loading && (
                  <ActivityIndicator
                    size="large"
                    color={colors.primaryLight}
                    style={{ marginTop: spacing.sm }}
                  />
                )}
              </View>
            )}

            {/* ── Mode selected: show form ───── */}
            {scanMode && (
              <>
                {scanMode === 'manual' && (
                  <Text style={styles.manualDisclaimer}>{t('plants.manualDisclaimer')}</Text>
                )}

                <DSInput
                  label={t('plants.nameLabel')}
                  value={name}
                  onChangeText={handleNameChange}
                  placeholder={
                    scanMode === 'manual'
                      ? t('plants.namePlaceholderManual')
                      : t('plants.namePlaceholder')
                  }
                  icon="leaf-outline"
                />

                <DSInput
                  label={t('plants.noteLabel')}
                  value={note}
                  onChangeText={setNote}
                  placeholder={t('plants.notePlaceholder')}
                  multiline
                />

                {/* Zone picker */}
                <Text style={styles.fieldLabel}>{t('plants.zoneOptional')}</Text>
                <TouchableOpacity style={styles.zonePicker} onPress={openZonePicker}>
                  <Ionicons
                    name="home-outline"
                    size={18}
                    color={selectedZone ? colors.primaryLight : colors.textDisabled}
                  />
                  <Text
                    style={[styles.zonePickerText, selectedZone && { color: colors.textPrimary }]}
                  >
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
                  onPress={() => {
                    resetAllState();
                    // Camera will auto-open via useEffect
                  }}
                  fullWidth
                  style={{ marginTop: spacing.xs }}
                >
                  {t('plants.retakePhoto')}
                </DSButton>

                {loading && (
                  <ActivityIndicator
                    size="large"
                    color={colors.primaryLight}
                    style={{ marginTop: spacing.lg }}
                  />
                )}
              </>
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
                <Image
                  source={{ uri: savedPlant.image_url }}
                  style={styles.previewSmall}
                  resizeMode="cover"
                />
              )}
              {savedPlantTitle?.localName ? (
                <Text style={styles.savedLocalName}>{savedPlantTitle.localName}</Text>
              ) : null}
              <Text
                style={[styles.savedName, !savedPlantTitle?.localName && styles.savedNamePrimary]}
              >
                {savedPlantTitle?.botanicalName || savedPlant.name}
              </Text>
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
                icon={savedPlant.details ? 'refresh-outline' : 'document-text-outline'}
                onPress={handleGenerateDetails}
                disabled={loading}
                fullWidth
                style={{ marginBottom: spacing.sm }}
              >
                {savedPlant.details ? t('plants.refreshDetails') : t('plants.generateDetails')}
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
                <ActivityIndicator
                  size="small"
                  color={colors.primaryLight}
                  style={{ marginBottom: spacing.sm }}
                />
              )}

              <DSButton
                onPress={goToPlantDetail}
                fullWidth
                icon="arrow-forward-outline"
                iconPosition="right"
              >
                {t('plants.viewPlant')}
              </DSButton>

              <DSButton
                variant="ghost"
                onPress={handleScanNext}
                fullWidth
                icon="camera-outline"
                style={{ marginTop: spacing.xs }}
              >
                {t('plants.scanNext')}
              </DSButton>
            </DSCard>
          </>
        )}

        {/* ── Zone Picker Modal ──────────────── */}
        <Modal
          visible={pickerVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setPickerVisible(false)}
        >
          <TouchableOpacity
            style={styles.overlay}
            activeOpacity={1}
            onPressOut={() => setPickerVisible(false)}
          >
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
                      <Ionicons
                        name="home-outline"
                        size={22}
                        color={colors.primaryLight}
                        style={{ marginRight: spacing.sm }}
                      />
                      <Text style={styles.zoneName}>
                        {item.name} <Text style={styles.zoneType}>({item.type})</Text>
                      </Text>
                      {selectedZone?.id === item.id && (
                        <Ionicons
                          name="checkmark"
                          size={20}
                          color={colors.primaryLight}
                          style={{ marginLeft: 'auto' }}
                        />
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
              )}
              <DSButton
                variant="ghost"
                onPress={() => setPickerVisible(false)}
                style={{ marginTop: spacing.sm }}
              >
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  screenHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  screenTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },
  creditBar: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 40 },

  // Steps
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    gap: spacing.xl,
  },
  stepItem: { alignItems: 'center', gap: spacing.xs },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: colors.primary },
  stepDotDone: { backgroundColor: colors.primaryLight },
  stepNum: { fontSize: 13, fontWeight: '600', color: colors.textTertiary },
  stepNumActive: { color: colors.surface },
  stepLabel: { fontSize: 12, color: colors.textTertiary },
  stepLabelActive: { color: colors.primary, fontWeight: '600' },

  // Photo step hint
  photoHint: {
    fontSize: 14,
    color: colors.textTertiary,
    textAlign: 'center',
  },

  // Mode choice (recognize vs manual)
  modeChoice: { gap: spacing.sm, marginBottom: spacing.md },
  manualDisclaimer: {
    fontSize: 13,
    color: colors.warning,
    backgroundColor: colors.warningSurface,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
    lineHeight: 18,
  },

  // Preview
  preview: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  previewSmall: { width: '100%', height: 140, borderRadius: radius.md, marginVertical: spacing.sm },

  // Zone picker
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  zonePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  zonePickerText: { flex: 1, fontSize: 14, color: colors.textDisabled },

  // Success
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  successText: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary },
  savedLocalName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
  },
  savedName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  savedNamePrimary: {
    color: colors.textPrimary,
    fontStyle: 'normal',
  },

  // Upgrades
  upgradeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  upgradeSubtitle: { fontSize: 13, color: colors.textTertiary, marginBottom: spacing.md },

  // Modal
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '60%',
  },
  sheetTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: spacing.md, textAlign: 'center' },
  sectionHeader: {
    fontWeight: 'bold',
    fontSize: 14,
    backgroundColor: colors.background,
    paddingVertical: spacing.xs,
    paddingHorizontal: 2,
    marginTop: spacing.lg,
    color: colors.textSecondary,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  zoneName: { fontSize: 16 },
  zoneType: { color: colors.textTertiary, fontSize: 12 },
});
