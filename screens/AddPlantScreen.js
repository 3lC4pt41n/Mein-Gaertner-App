import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, Image, ActivityIndicator, Alert, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { savePlantToSupabase, saveHealthcheck } from "../services/plantService";
import { uploadPlantImage } from "../services/uploadService";
import { recognizePlant, generatePlantDetails, performHealthcheck } from '../services/aiService';
import { fetchBalance } from '../services/creditService';
import { supabase } from '../supabase';
import { useNavigation } from '@react-navigation/native';

export default function AddPlantScreen() {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [imageUri, setImageUri] = useState(null);
  const [base64Image, setBase64Image] = useState(null);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState(null);
  const [balance, setBalance] = useState(null);
  const navigation = useNavigation();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data?.user?.id ?? null);
      try {
        const bal = await fetchBalance();
        setBalance(bal);
      } catch {}
    })();
  }, []);

  // Insufficent Credits Error Handler
  const handleCreditError = (e) => {
    if (e.code === 'INSUFFICIENT_CREDITS') {
      Alert.alert(
        "Nicht genügend Credits",
        `Du hast ${e.balance} Credits, brauchst aber ${e.required}.\n\nGehe zum Shop, um Credits nachzuladen.`,
        [{ text: "OK" }]
      );
      return true;
    }
    return false;
  };

  // Foto aufnehmen & Pflanze erkennen
  const takePhotoAndRecognize = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      alert("Kamerazugriff wird benötigt.");
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
        const data = await recognizePlant(base64);
        setName(data.name || "Kein Name erkannt");
        setNote(data.note || "Kein Hinweis vorhanden");
        if (typeof data.balance === 'number') setBalance(data.balance);
      } catch (e) {
        if (!handleCreditError(e)) {
          Alert.alert("Fehler", e.message || "Unbekannter Fehler");
          setNote("Fehler: " + (e.message || "Verbindung fehlgeschlagen"));
          setName("");
        }
      }
      setLoading(false);
    }
  };

  // Details, Healthcheck holen + speichern + zur Detailansicht navigieren
  const handleSaveAndDetails = async () => {
    if (!userId || !imageUri || !name) {
      Alert.alert("Fehler", "Bitte Foto, Name und Nutzer prüfen!");
      return;
    }
    setLoading(true);

    // Erst Bild in Supabase hochladen und signed URL holen
    let uploadedUrl = null;
    try {
      uploadedUrl = await uploadPlantImage(imageUri, userId);
    } catch (e) {
      Alert.alert("Fehler beim Hochladen", e.message);
      setLoading(false);
      return;
    }

    // 1. Details über Edge Function holen
    let details = null;
    try {
      const detailsData = await generatePlantDetails(name, note);
      details = detailsData.details;
      if (typeof detailsData.balance === 'number') setBalance(detailsData.balance);
    } catch (e) {
      if (handleCreditError(e)) { setLoading(false); return; }
      details = null;
      Alert.alert("Warnung", "Konnte Detaildaten nicht laden.");
    }

    // 2. Healthcheck über Edge Function holen
    let healthcheck = null;
    try {
      const hcData = await performHealthcheck(uploadedUrl, name);
      healthcheck = hcData.healthcheck;
      if (typeof hcData.balance === 'number') setBalance(hcData.balance);
    } catch (e) {
      if (handleCreditError(e)) { setLoading(false); return; }
      healthcheck = null;
      Alert.alert("Warnung", "Healthcheck konnte nicht erzeugt werden.");
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
      setName(""); setNote(""); setImageUri(null); setBase64Image(null);

      // 5. Direkt zum Detail
      navigation.navigate('MeinePflanzenTab', {
        screen: 'PlantDetail',
        params: { plant }
      });
    } catch (err) {
      Alert.alert("Fehler", "Speichern fehlgeschlagen: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={{ padding: 20 }}>
      {/* Credit-Anzeige */}
      {balance !== null && (
        <View style={{
          backgroundColor: balance > 20 ? "#E8F5E9" : "#FFF3E0",
          padding: 10, borderRadius: 8, marginBottom: 12,
          flexDirection: "row", justifyContent: "space-between", alignItems: "center"
        }}>
          <Text style={{ fontWeight: "bold", color: "#333" }}>Credits</Text>
          <Text style={{
            fontWeight: "bold", fontSize: 16,
            color: balance > 20 ? "#4CAF50" : "#FF9800"
          }}>
            {balance}
          </Text>
        </View>
      )}

      <Button title="📷 Foto aufnehmen & erkennen" onPress={takePhotoAndRecognize} />
      {imageUri && (
        <Image
          source={{ uri: imageUri }}
          style={{ width: "100%", height: 200, marginVertical: 10, borderRadius: 8 }}
        />
      )}
      <Text style={{ fontWeight: "bold", marginTop: 10 }}>Name:</Text>
      <TextInput value={name} onChangeText={setName} placeholder="z. B. Monstera deliciosa" style={{ borderWidth: 1, padding: 8, marginBottom: 10 }} />
      <Text style={{ fontWeight: "bold" }}>Hinweis:</Text>
      <TextInput multiline value={note} onChangeText={setNote} placeholder="Pflegehinweis von GPT" style={{ borderWidth: 1, padding: 8, minHeight: 80 }} />
      <Button title="✅ Pflanze speichern & Details anzeigen" onPress={handleSaveAndDetails} disabled={!name || loading} />
      {loading && <ActivityIndicator size="large" color="#4CAF50" style={{ marginVertical: 20 }} />}
    </ScrollView>
  );
}
