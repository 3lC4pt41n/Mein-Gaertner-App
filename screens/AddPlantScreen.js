import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, Image, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { savePlantToSupabase } from "../services/plantService";
import { getConfigValue } from '../services/configService';
import { supabase } from '../supabase';

let OPENAI_API_KEY;

export default function AddPlantScreen() {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [imageUri, setImageUri] = useState(null);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (data?.user?.id) {
        setUserId(data.user.id);
      }
    };
    fetchUser();
  }, []);

  const takePhotoAndRecognize = async () => {
    if (!OPENAI_API_KEY) {
      try {
        OPENAI_API_KEY = await getConfigValue("OPENAI_API_KEY");
      } catch (e) {
        Alert.alert("Fehler beim Laden des API-Keys", e.message);
        return;
      }
    }

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
      setLoading(true);

      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Erkenne die Pflanze auf diesem Foto und gib die Antwort im folgenden JSON-Format zurück:

{
  "name": "Botanischer Name",
  "note": "Pflegehinweis in einem Satz"
}

Sprich auf Deutsch. Wenn du unsicher bist, gib trotzdem die beste Schätzung.`,
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:image/jpeg;base64,${base64}`,
                    },
                  },
                ],
              },
            ],
            max_tokens: 500,
          }),
        });

        const data = await response.json();
        if (data.error) {
          Alert.alert("Fehler bei GPT", data.error.message || "Unbekannter Fehler");
          setNote("Fehler: " + data.error.message);
          setName("");
        } else {
          const content = data.choices?.[0]?.message?.content || "";
          try {
            const cleaned = content
              .replace(/```json/g, '')
              .replace(/```/g, '')
              .trim();
            const parsed = JSON.parse(cleaned);
            setName(parsed.name || "Kein Name erkannt");
            setNote(parsed.note || "Kein Hinweis vorhanden");
          } catch {
            setName("Antwort nicht im JSON-Format");
            setNote(content);
          }
        }
      } catch (e) {
        Alert.alert("Verbindungsfehler", e.message || "Unbekannter Fehler");
        setNote("Fehler: Verbindung fehlgeschlagen");
        setName("");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSave = async () => {
    if (!userId) {
      Alert.alert("Fehler", "Kein Benutzer erkannt – bitte einloggen.");
      return;
    }
    try {
      await savePlantToSupabase({
        name,
        note,
        image: imageUri,
        user_id: userId,
      });
      Alert.alert("Gespeichert", `✅ ${name} wurde gespeichert.\nHinweis: ${note}`);
      setName("");
      setNote("");
      setImageUri(null);
    } catch (err) {
      Alert.alert("Fehler", "Speichern fehlgeschlagen: " + err.message);
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <Button title="📷 Foto aufnehmen & erkennen" onPress={takePhotoAndRecognize} />
      {loading && <ActivityIndicator size="large" color="#4CAF50" style={{ marginVertical: 20 }} />}
      {imageUri && <Image source={{ uri: imageUri }} style={{ width: "100%", height: 200, marginVertical: 10 }} />}
      <Text style={{ fontWeight: "bold", marginTop: 10 }}>Name:</Text>
      <TextInput value={name} onChangeText={setName} placeholder="z. B. Monstera deliciosa" style={{ borderWidth: 1, padding: 8, marginBottom: 10 }} />
      <Text style={{ fontWeight: "bold" }}>Hinweis:</Text>
      <TextInput multiline value={note} onChangeText={setNote} placeholder="Pflegehinweis von GPT" style={{ borderWidth: 1, padding: 8, minHeight: 80 }} />
      <Button title="✅ Pflanze speichern" onPress={handleSave} disabled={!name} />
    </View>
  );
}
