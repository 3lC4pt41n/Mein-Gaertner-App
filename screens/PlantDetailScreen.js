// screens/PlantDetailScreen.js
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Modal,
  SectionList,
  Alert,
} from 'react-native';
import PropTypes from 'prop-types';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../supabase';
import { fetchLatestHealthcheck, saveHealthcheck } from '../services/plantService';
import { addDiaryEntry, fetchGallery } from '../services/diaryService';
import DiaryTimeline from '../components/DiaryTimeline';
import PlantGallery from '../components/PlantGallery';
import PlantTasksList from '../components/PlantTasksList';
import AddDiaryEntryDialog from '../components/AddDiaryEntryDialog';
import { useNavigation } from '@react-navigation/native';
import { t } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import DSButton from '../theme/DSButton';
import { generatePlantDetails, performHealthcheck } from '../services/aiService';
import { uploadPlantImage, getPlantImageUrl } from '../services/uploadService';

// Helper zum Gruppieren Locations > Zonen
async function fetchZonesWithLocationsGrouped() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(t('common.notLoggedIn'));
  const { data: locations, error: locError } = await supabase
    .from('locations')
    .select('id, name')
    .eq('user_id', user.id);
  if (locError) throw locError;
  const locationIds = (locations || []).map((l) => l.id);
  if (!locationIds.length) return [];
  const { data: zones, error: zonesError } = await supabase
    .from('zones')
    .select('id, name, type, location_id')
    .in('location_id', locationIds)
    .order('name');
  if (zonesError) throw zonesError;
  // Group zones by location
  const grouped = locations
    .map((location) => ({
      title: location.name,
      data: zones.filter((z) => z.location_id === location.id),
    }))
    .filter((section) => section.data.length > 0);
  return grouped;
}

function ScoreCircle({ score = 0, label = 'Health' }) {
  let color = colors.borderLight;
  if (score >= 90) color = colors.primary;
  else if (score >= 75) color = colors.healthGood;
  else if (score >= 60) color = colors.warning;
  else if (score >= 40) color = colors.warning;
  else color = colors.danger;
  return (
    <View
      style={{
        width: 76,
        height: 76,
        borderRadius: 38,
        backgroundColor: color + '22',
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: spacing.sm,
        alignSelf: 'center',
        borderWidth: 4,
        borderColor: color,
        shadowColor: color,
        shadowOpacity: 0.25,
        shadowRadius: 10,
      }}
    >
      <Text style={{ fontSize: 28, fontWeight: 'bold', color }}>{score}</Text>
      <Text style={{ fontSize: 14, color: colors.textTertiary, marginTop: -2 }}>{label}</Text>
    </View>
  );
}

export default function PlantDetailScreen({ route }) {
  const { plant } = route.params;
  const navigation = useNavigation();
  const { userId } = useAuth();

  const [tab, setTab] = useState('overview');
  const [showDiaryDialog, setShowDiaryDialog] = useState(false);
  const [diaryKey, setDiaryKey] = useState(0); // to refresh diary after new entry
  const [plantDetails, setPlantDetails] = useState(plant.details || null);
  const [generatingDetails, setGeneratingDetails] = useState(false);
  const details = plantDetails || {};
  const [healthcheck, setHealthcheck] = useState(null);
  const [loading, setLoading] = useState(true);
  const [runningHealthcheck, setRunningHealthcheck] = useState(false);
  const [galleryKey, setGalleryKey] = useState(0);

  // Resolved image URL (handles both legacy URLs and storage paths)
  const [resolvedImageUrl, setResolvedImageUrl] = useState(
    plant.image_url?.startsWith('http') ? plant.image_url : null
  );

  useEffect(() => {
    if (plant.image_url && !plant.image_url.startsWith('http')) {
      getPlantImageUrl(plant.image_url).then((url) => {
        if (url) setResolvedImageUrl(url);
      });
    }
  }, [plant.image_url]);

  // --- Zone-Picker States ---
  const [sections, setSections] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [savingZone, setSavingZone] = useState(false);

  // Für Zonen-Anzeige:
  const [assignedZone, setAssignedZone] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const hc = await fetchLatestHealthcheck(plant.id);
        setHealthcheck(hc);
      } catch {
        setHealthcheck(null);
      }
      setLoading(false);
    })();
    // Hole ggf. Zone/Location falls zugewiesen:
    if (plant.zone_id) {
      fetchAssignedZone();
    }
  }, [plant.id, plant.zone_id]);

  const tabNames = [
    { key: 'overview', label: t('plants.tabOverview') },
    { key: 'tasks', label: t('plants.tabTasks') },
    { key: 'diary', label: t('plants.tabDiary') },
    { key: 'gallery', label: t('plants.tabGallery') },
    { key: 'care', label: t('plants.tabCare') },
    { key: 'health', label: t('plants.tabHealth') },
  ];

  const handleSaveDiaryEntry = async ({ title, note, imageUri }) => {
    try {
      await addDiaryEntry({ plant_id: plant.id, user_id: userId, title, note, imageUri });
      setShowDiaryDialog(false);
      setDiaryKey((prev) => prev + 1); // refresh diary
      Alert.alert(t('common.success'), t('diary.entrySaved'));
    } catch (e) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  const handleGenerateDetails = useCallback(async () => {
    setGeneratingDetails(true);
    try {
      const result = await generatePlantDetails(plant.name, plant.note);
      if (result?.details) {
        await supabase.from('plants').update({ details: result.details }).eq('id', plant.id);
        setPlantDetails(result.details);
        Alert.alert(t('common.success'), t('plants.detailsGenerated'));
      }
    } catch (e) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setGeneratingDetails(false);
    }
  }, [plant.id, plant.name, plant.note]);

  // Healthcheck mit Foto-Auswahl: letztes Galerie-Foto oder neues Foto
  const handleStartHealthcheck = useCallback(async () => {
    // Neuestes Galerie-Foto suchen
    let latestImageUrl = null;
    try {
      const photos = await fetchGallery(plant.id);
      if (photos.length > 0) latestImageUrl = photos[0].image_url;
    } catch {
      /* ignore */
    }
    // Fallback: Original-Pflanzenfoto (resolve on-demand if path)
    if (!latestImageUrl) {
      latestImageUrl =
        (await getPlantImageUrl(plant.image_url)) || (await getPlantImageUrl(resolvedImageUrl));
    }

    const runWithPhoto = async (imageUrl) => {
      if (!imageUrl) {
        Alert.alert(t('common.error'), t('plants.noImageForHealthcheck'));
        return;
      }
      setRunningHealthcheck(true);
      try {
        const result = await performHealthcheck(imageUrl, plant.name);
        if (result) {
          // Save healthcheck to database (not just React state)
          const hc = result.healthcheck || result;
          if (hc && typeof hc.healthscore === 'number' && hc.healthscore >= 0) {
            await saveHealthcheck({
              plant_id: plant.id,
              user_id: userId,
              healthscore: hc.healthscore,
              summary: hc.summary,
              table_json: hc.table,
              recommendation: hc.recommendation,
            });
            setHealthcheck(hc);
            Alert.alert(t('common.success'), t('plants.healthcheckDone'));
          } else {
            Alert.alert(
              t('common.error'),
              t('plants.healthcheckParseError') ||
                'Der Healthcheck konnte nicht ausgewertet werden. Bitte versuche es erneut.'
            );
          }
        }
      } catch (e) {
        Alert.alert(t('common.error'), e.message);
      } finally {
        setRunningHealthcheck(false);
      }
    };

    const takeNewPhoto = async () => {
      try {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(t('common.error'), t('common.cameraRequired'));
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
        if (result.canceled) return;
        const uri = result.assets[0].uri;
        // Foto hochladen — returns storage path (not URL)
        const imagePath = await uploadPlantImage(uri, userId);
        await supabase.from('plant_diary').insert({
          plant_id: plant.id,
          user_id: userId,
          type: 'healthcheck',
          title: t('plants.healthcheckPhoto'),
          note: '',
          image_url: imagePath,
        });
        setGalleryKey((k) => k + 1);
        setDiaryKey((k) => k + 1);
        // On-demand URL fuer AI-Healthcheck
        const displayUrl = await getPlantImageUrl(imagePath);
        await runWithPhoto(displayUrl);
      } catch (e) {
        Alert.alert(t('common.error'), e.message);
      }
    };

    if (latestImageUrl) {
      Alert.alert(t('plants.healthcheckPhotoTitle'), t('plants.healthcheckPhotoMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('plants.useLatestPhoto'), onPress: () => runWithPhoto(latestImageUrl) },
        { text: t('plants.takeNewPhoto'), onPress: takeNewPhoto },
      ]);
    } else {
      // Kein Foto vorhanden — direkt neues aufnehmen
      takeNewPhoto();
    }
  }, [plant.id, plant.image_url, plant.name, resolvedImageUrl, userId]);

  // Galerie: Foto direkt hinzufügen (ohne Tagebuch-Dialog)
  const handleAddGalleryPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common.error'), t('gallery.permission'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled) return;
      const uri = result.assets[0].uri;
      const today = new Date().toLocaleDateString('de-DE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      await addDiaryEntry({
        plant_id: plant.id,
        user_id: userId,
        title: `${plant.name} – ${today}`,
        note: '',
        imageUri: uri,
      });
      setGalleryKey((k) => k + 1);
      setDiaryKey((k) => k + 1);
      Alert.alert(t('common.success'), t('gallery.photoAdded'));
    } catch (e) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  // Aktuelle Zone inkl. Location-Namen laden (ohne PostgREST-Join)
  async function fetchAssignedZone() {
    const { data: zone } = await supabase
      .from('zones')
      .select('id, name, type, location_id')
      .eq('id', plant.zone_id)
      .maybeSingle();
    if (zone && zone.location_id) {
      const { data: loc } = await supabase
        .from('locations')
        .select('name')
        .eq('id', zone.location_id)
        .maybeSingle();
      zone.location = loc || null;
    }
    setAssignedZone(zone || null);
  }

  // Zonen (gruppiert) laden beim Öffnen des Modals
  const loadZones = async () => {
    if (zonesLoading) return;
    setZonesLoading(true);
    try {
      const data = await fetchZonesWithLocationsGrouped();
      setSections(data);
    } catch (err) {
      Alert.alert(t('common.error'), err.message);
      setSections([]);
    }
    setZonesLoading(false);
  };

  // Pflanze einer Zone zuweisen
  const assignZone = async (zone) => {
    setSavingZone(true);
    try {
      const { error } = await supabase
        .from('plants')
        .update({ zone_id: zone.id })
        .eq('id', plant.id);
      if (error) throw error;
      Alert.alert(t('common.success'), t('plants.zoneAssigned', { zone: zone.name }));
      setPickerVisible(false);
      setAssignedZone(zone);
    } catch (e) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setSavingZone(false);
    }
  };

  // Pflanze aus Zone entfernen (Austreten)
  const removeZone = async () => {
    Alert.alert(t('plants.removeZoneTitle'), t('plants.removeZoneMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('plants')
              .update({ zone_id: null })
              .eq('id', plant.id);
            if (error) throw error;
            setAssignedZone(null);
            Alert.alert(t('common.success'), t('plants.removeZoneSuccess'));
          } catch (e) {
            Alert.alert(t('common.error'), e.message);
          }
        },
      },
    ]);
  };

  // --- Memoized tab content to prevent re-renders when switching tabs ---
  const healthTabContent = useMemo(() => {
    if (loading) return <ActivityIndicator color={colors.primaryLight} />;
    if (healthcheck) {
      return (
        <View>
          <ScoreCircle score={healthcheck.healthscore} label={t('plants.healthLabel')} />
          <Text
            style={{
              textAlign: 'center',
              fontSize: 18,
              marginBottom: spacing.sm,
              color: colors.textSecondary,
            }}
          >
            {healthcheck.summary}
          </Text>
          <View style={{ marginBottom: spacing.lg }}>
            {Array.isArray(healthcheck.table_json) &&
              healthcheck.table_json.map((row, idx) => (
                <View
                  key={idx}
                  style={{
                    borderBottomWidth: idx === healthcheck.table_json.length - 1 ? 0 : 1,
                    borderBottomColor: colors.border,
                    paddingVertical: spacing.sm,
                  }}
                >
                  <Text style={{ fontWeight: 'bold', color: colors.textPrimary }}>
                    {row.Kriterium}{' '}
                    <Text style={{ color: colors.primary }}>{row.Bewertung}/100</Text>
                  </Text>
                  <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                    Beobachtung:{' '}
                    <Text style={{ color: colors.textPrimary }}>{row.Beobachtung}</Text>
                  </Text>
                  {row.Begründung && (
                    <Text style={{ fontSize: 12, color: colors.textTertiary }}>
                      Grund: {row.Begründung}
                    </Text>
                  )}
                </View>
              ))}
          </View>
          <Text
            style={{
              fontStyle: 'italic',
              color: colors.info,
              fontWeight: 'bold',
              fontSize: 14,
              textAlign: 'center',
            }}
          >
            {healthcheck.recommendation}
          </Text>
        </View>
      );
    }
    return (
      <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
        <Text style={{ color: colors.textDisabled, marginBottom: spacing.md }}>
          {t('plants.noHealthcheck')}
        </Text>
        <DSButton
          variant="primary"
          icon="fitness-outline"
          onPress={handleStartHealthcheck}
          disabled={runningHealthcheck}
          size="sm"
        >
          {runningHealthcheck ? t('common.loading') : t('plants.startHealthcheck')}
        </DSButton>
      </View>
    );
  }, [loading, healthcheck, runningHealthcheck, handleStartHealthcheck]);

  const detailsTabContent = useCallback(
    (tabKey) => {
      if (details[tabKey]) {
        return (
          <View>
            {Object.entries(details[tabKey]).map(([k, v]) => (
              <View key={k} style={{ marginBottom: spacing.md }}>
                <Text style={{ fontWeight: 'bold', color: colors.textPrimary, fontSize: 14 }}>
                  {k}
                </Text>
                <Text style={{ marginLeft: spacing.xs, color: colors.textSecondary }}>{v}</Text>
              </View>
            ))}
          </View>
        );
      }
      return (
        <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
          <Text style={{ color: colors.textDisabled, marginBottom: spacing.md }}>
            {t('plants.noDetails')}
          </Text>
          {!plantDetails && (
            <DSButton
              variant="secondary"
              icon="document-text-outline"
              onPress={handleGenerateDetails}
              disabled={generatingDetails}
              size="sm"
            >
              {generatingDetails ? t('common.loading') : t('plants.generateDetails')}
            </DSButton>
          )}
        </View>
      );
    },
    [details, plantDetails, generatingDetails, handleGenerateDetails]
  );

  const width = Math.min(Dimensions.get('window').width, 500) - 40;
  const isVirtualizedTab = tab === 'diary' || tab === 'gallery';

  const plantHeaderCard = (
    <View style={styles.card}>
      {resolvedImageUrl && (
        <Image
          source={{ uri: resolvedImageUrl }}
          style={{
            width: width,
            height: (width * 2) / 3,
            borderRadius: radius.lg,
            alignSelf: 'center',
            marginBottom: spacing.sm,
            backgroundColor: colors.border,
          }}
          resizeMode="cover"
        />
      )}
      <Text style={styles.title}>{plant.name}</Text>
      <Text style={styles.subtitle}>{plant.note}</Text>
      {healthcheck && typeof healthcheck.healthscore === 'number' && (
        <ScoreCircle score={healthcheck.healthscore} label={t('plants.healthLabel')} />
      )}

      {/* Zugewiesene Zone */}
      {assignedZone ? (
        <View style={{ alignItems: 'center', marginVertical: spacing.sm }}>
          <Ionicons name="home-outline" size={18} color={colors.primaryLight} />
          <Text style={{ color: colors.textPrimary, fontWeight: 'bold', fontSize: 16 }}>
            {t('plants.assignedTo', { zone: assignedZone.name })}
            {assignedZone.location?.name ? ` (${assignedZone.location.name})` : ''}
          </Text>
          <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
            <TouchableOpacity
              style={[
                styles.zoneBtn,
                { backgroundColor: colors.textTertiary, marginRight: spacing.sm },
              ]}
              onPress={() => {
                setPickerVisible(true);
                loadZones();
              }}
            >
              <Ionicons
                name="swap-horizontal"
                size={18}
                color={colors.surface}
                style={{ marginRight: spacing.sm }}
              />
              <Text style={{ color: colors.surface, fontWeight: 'bold' }}>
                {t('plants.changeZone')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.zoneBtn, { backgroundColor: colors.danger }]}
              onPress={removeZone}
            >
              <Ionicons
                name="close"
                size={18}
                color={colors.surface}
                style={{ marginRight: spacing.sm }}
              />
              <Text style={{ color: colors.surface, fontWeight: 'bold' }}>
                {t('plants.removeZone')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.zoneBtn}
          onPress={() => {
            setPickerVisible(true);
            loadZones();
          }}
        >
          <Ionicons
            name="home-outline"
            size={18}
            color={colors.surface}
            style={{ marginRight: spacing.sm }}
          />
          <Text style={{ color: colors.surface, fontWeight: 'bold' }}>
            {t('plants.assignZone')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const tabBar = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabBar}
      style={styles.tabBarWrapper}
    >
      {tabNames.map((item) => (
        <TouchableOpacity
          key={item.key}
          onPress={() => setTab(item.key)}
          style={[styles.tabChip, tab === item.key && styles.tabChipActive]}
        >
          <Text style={[styles.tabChipText, tab === item.key && styles.tabChipTextActive]}>
            {item.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  return (
    <>
      {isVirtualizedTab ? (
        <View style={styles.screen}>
          {tab === 'diary' ? (
            <DiaryTimeline
              key={diaryKey}
              plantId={plant.id}
              ListHeaderComponent={
                <View style={styles.listTabHeader}>
                  {plantHeaderCard}
                  {tabBar}
                  <TouchableOpacity
                    style={[styles.zoneBtn, { alignSelf: 'center', marginBottom: spacing.md }]}
                    onPress={() => setShowDiaryDialog(true)}
                  >
                    <Ionicons
                      name="add"
                      size={18}
                      color={colors.surface}
                      style={{ marginRight: spacing.xs }}
                    />
                    <Text style={{ color: colors.surface, fontWeight: 'bold' }}>
                      {t('diary.addEntry')}
                    </Text>
                  </TouchableOpacity>
                </View>
              }
            />
          ) : (
            <PlantGallery
              key={galleryKey}
              plantId={plant.id}
              plantImageUrl={plant.image_url}
              onAddPhoto={handleAddGalleryPhoto}
              ListHeaderComponent={
                <View style={styles.listTabHeader}>
                  {plantHeaderCard}
                  {tabBar}
                </View>
              }
            />
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          {plantHeaderCard}
          {tabBar}

          {tab === 'tasks' && (
            <PlantTasksList plantId={plant.id} plantName={plant.name} userId={userId} />
          )}

          {/* Tab Content (care, health, overview) — memoized for performance */}
          {tab !== 'tasks' && (
            <View style={styles.card}>
              {tab === 'health' ? healthTabContent : detailsTabContent(tab)}
            </View>
          )}
        </ScrollView>
      )}

      <AddDiaryEntryDialog
        visible={showDiaryDialog}
        onClose={() => setShowDiaryDialog(false)}
        onSave={handleSaveDiaryEntry}
        plantId={plant.id}
      />

      {/* --------- Zone Picker Modal: SectionList mit Locations als Header --------- */}
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
                    onPress={() => assignZone(item)}
                    disabled={savingZone}
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

PlantDetailScreen.propTypes = {
  route: PropTypes.shape({
    params: PropTypes.shape({
      plant: PropTypes.shape({
        id: PropTypes.string.isRequired,
        name: PropTypes.string,
        note: PropTypes.string,
        image_url: PropTypes.string,
        zone_id: PropTypes.string,
        details: PropTypes.object,
      }).isRequired,
    }).isRequired,
  }).isRequired,
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContainer: {
    padding: spacing.xl,
    backgroundColor: colors.background,
    minHeight: '100%',
  },
  listTabHeader: {
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    ...shadows.sm,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 500,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 2,
    textAlign: 'center',
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },
  subtitle: {
    color: colors.textTertiary,
    marginBottom: 7,
    textAlign: 'center',
  },
  zoneBtn: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '60%',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
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
  locationTxt: { color: colors.textTertiary, fontSize: 12 },

  /* Tabs */
  tabBarWrapper: {
    marginVertical: spacing.lg,
    flexGrow: 0,
    flexShrink: 0,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xs,
    gap: spacing.xs,
  },
  tabChip: {
    backgroundColor: colors.borderLight,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  tabChipActive: {
    backgroundColor: colors.primary,
  },
  tabChipText: {
    color: colors.textPrimary,
    fontWeight: 'bold',
    fontSize: 15,
  },
  tabChipTextActive: {
    color: colors.surface,
  },
});
