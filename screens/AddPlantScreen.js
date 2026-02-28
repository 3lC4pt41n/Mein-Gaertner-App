import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Image, ActivityIndicator, Alert, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
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
import { colors, spacing, radius } from '../theme/tokens';
import DSButton from '../theme/DSButton';

export default function AddPlantScreen() {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const [base64Image, setBase64Image] = useState(null);
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState(null);
  const [language, setLanguage] = useState('de');
  const navigation = useNavigation();
  const { userId } = useAuth();

  useEffect(() => {
    (async () => {
      try {
        const bal = await fetchBalance();
        setBalance(bal);
      } catch {}
      try {
        const userLanguage = await fetchCurrentUserLanguage();
        setLanguage(userLanguage);
      } catch {}
    })();
  }, []);

  // Insufficent Credits Error Handler
  const handleCreditError = (e) => {
    if (e.code === 'INSUFFICIENT_CREDITS') {
      Alert.alert(
        t('common.insufficientCredits'),
        t('common.insufficientCreditsMessage', { balance: e.balance, required: e.required }),
        [{ text: 'OK' }]
      );
      return true;
    }
    return false;
  };

  // Foto aufnehmen & Pflanze erkennen
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
        // Edge Function aufrufen statt direkt OpenAI
        const data = await recognizePlant(base64, language);
        setName(data.name || t('plants.noNameRecognized'));
        setNote(data.note || t('plants.noNoteAvailable'));
        if (typeof data.balance === 'number') setBalance(data.balance);
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

  // Details, Healthcheck holen + speichern + zur Detailansicht navigieren
  const handleSaveAndDetails = async () => {
    if (!userId || !imageUri || !name) {
      Alert.alert(t('common.error'), t('plants.photoUserNameCheck'));
      return;
    }
    setLoading(true);

    // Erst Bild in Supabase hochladen und signed URL holen
    let uploadedUrl = null;
    try {
      uploadedUrl = await uploadPlantImage(imageUri, userId);
    } catch (e) {
      Alert.alert(t('plants.uploadError'), e.message);
      setLoading(false);
      return;
    }

    // 1. Details über Edge Function holen
    let details = null;
    try {
      const detailsData = await generatePlantDetails(name, note, language);
      details = detailsData.details;
      if (typeof detailsData.balance === 'number') setBalance(detailsData.balance);
    } catch (e) {
      if (handleCreditError(e)) {
        setLoading(false);
        return;
      }
      details = null;
      Alert.alert(t('common.warning'), t('plants.detailsWarning'));
    }

    // 2. Healthcheck über Edge Function holen
    let healthcheck = null;
    try {
      const hcData = await performHealthcheck(uploadedUrl, name, language);
      healthcheck = hcData.healthcheck;
      if (typeof hcData.balance === 'number') setBalance(hcData.balance);
    } catch (e) {
      if (handleCreditError(e)) {
        setLoading(false);
        return;
      }
      healthcheck = null;
      Alert.alert(t('common.warning'), t('plants.healthcheckWarning'));
    }

    // 3. Pflanze speichern
    try {
      const plant = await savePlantToSupabase({
        name,
        note,
        image: uploadedUrl,
        user_id: userId,
        details,
      });

      // 4. Healthcheck (falls vorhanden) direkt speichern
      if (plant?.id && healthcheck) {
        await saveHealthcheck({
          plant_id: plant.id,
          user_id: userId,
          healthscore: healthcheck.healthscore,
          summary: healthcheck.summary,
          table_json: healthcheck.table,
          recommendation: healthcheck.recommendation,
        });
      }

      // 5. Discovery-Event loggen (Score-Tracking)
      try {
        await logDiscovery(userId, name, plant?.id);
      } catch (e) {
        console.warn('Discovery log error:', e.message);
      }

      // 6. plant_added Gardening-Event loggen
      try {
        await supabase.from('gardening_events').insert({
          user_id: userId,
          event_type: 'plant_added',
          plant_id: plant?.id,
          points: 1.0,
          meta: { plant_name: name },
        });
      } catch (e) {
        console.warn('plant_added event error:', e.message);
      }

      setName('');
      setNote('');
      setImageUri(null);
      setBase64Image(null);

      // 7. Direkt zum Detail
      navigation.navigate('MeinePflanzenTab', {
        screen: 'PlantDetail',
        params: { plant },
      });
    } catch (err) {
      Alert.alert(t('common.error'), t('plants.saveFailedMessage', { message: err.message }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={{ padding: spacing.xl }}>
      {/* Credit-Anzeige */}
      {balance !== null && (
        <View
          style={{
            backgroundColor: balance > 20 ? colors.primarySurface : colors.warningSurface,
            padding: spacing.md,
            borderRadius: radius.sm,
            marginBottom: spacing.md,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontWeight: 'bold', color: colors.textPrimary }}>
            {t('common.credits')}
          </Text>
          <Text
            style={{
              fontWeight: 'bold',
              fontSize: 16,
              color: balance > 20 ? colors.primaryLight : colors.warning,
            }}
          >
            {balance}
          </Text>
        </View>
      )}

      <DSButton onPress={takePhotoAndRecognize} fullWidth>
        {t('plants.scanButton')}
      </DSButton>
      {imageUri && (
        <Image
          source={{ uri: imageUri }}
          style={{
            width: '100%',
            height: 200,
            marginVertical: spacing.md,
            borderRadius: radius.sm,
          }}
        />
      )}
      <Text style={{ fontWeight: 'bold', marginTop: spacing.md }}>{t('plants.nameLabel')}</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t('plants.namePlaceholder')}
        style={{ borderWidth: 1, padding: spacing.sm, marginBottom: spacing.md }}
      />
      <Text style={{ fontWeight: 'bold' }}>{t('plants.noteLabel')}</Text>
      <TextInput
        multiline
        value={note}
        onChangeText={setNote}
        placeholder={t('plants.notePlaceholder')}
        style={{ borderWidth: 1, padding: spacing.sm, minHeight: 80 }}
      />
      <DSButton onPress={handleSaveAndDetails} disabled={!name || loading} fullWidth>
        {t('plants.saveAndDetails')}
      </DSButton>
      {loading && (
        <ActivityIndicator
          size="large"
          color={colors.primaryLight}
          style={{ marginVertical: spacing.xl }}
        />
      )}
    </ScrollView>
  );
}
