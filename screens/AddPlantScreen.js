import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, Image, ActivityIndicator, Alert, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { savePlantToSupabase, saveHealthcheck } from "../services/plantService";
import { getConfigValue } from '../services/configService';
import { supabase } from '../supabase';
import { useNavigation } from '@react-navigation/native';

let OPENAI_API_KEY;

export default function AddPlantScreen() {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [imageUri, setImageUri] = useState(null);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState(null);
  const navigation = useNavigation();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data?.user?.id ?? null);
    })();
  }, []);

  // Foto aufnehmen & Pflanze erkennen
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
            max_tokens: 600,
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
            const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
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

    // 1. GPT Details holen
    let details = null;
    try {
      const prompt = `
Gib für die Pflanze "${name}" (Hinweis: "${note}") eine verschachtelte JSON-Antwort im exakten Format unten zurück – alle Felder bitte möglichst vollständig befüllen (auf Deutsch):

{
  "overview": {
    "Deutscher Name": "...",
    "Botanischer Name": "...",
    "Familie": "...",
    "Herkunft": "...",
    "Lebensform": "...",
    "Größe": "...",
    "Blütezeit": "...",
    "Lebensdauer": "...",
    "Highlight": "..."
  },
  "care": {
    "Licht": "...",
    "Temperaturbereich": "...",
    "Luftfeuchte": "...",
    "Substrat / Boden": "...",
    "Gießen": "...",
    "Düngen": "...",
    "Schnitt": "...",
    "Umtopfen": "...",
    "Rankhilfe": "...",
    "Besondere Hinweise": "..."
  },
  "extras": {
    "Zier- & Nutzwert": "...",
    "Giftigkeit": "...",
    "Vermehrung": "...",
    "Typische Schädlinge": "...",
    "Krankheiten": "...",
    "Fun Fact / Kultur": "..."
  }
}
KEINE Kommentare, keine Erklärungen, KEIN sonstiger Text – nur das pure JSON-Objekt!`;

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1500,
        }),
      });
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "";
      details = JSON.parse(content.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (e) {
      details = null;
      Alert.alert("Warnung", "Konnte Detaildaten nicht sauber parsen.");
    }

    // 2. GPT Healthcheck holen (ALLE Kriterien im Prompt, alle Felder als Zahl 0-100)
    let healthcheck = null;
    try {
      const hcPrompt = `
Analysiere das bereitgestellte Pflanzenfoto und führe einen **Pflanzengesundheits-Check** durch. Gib AUSSCHLIESSLICH das folgende JSON zurück:

{
  "healthscore": <Ganzzahl 0-100, gewichtetes Mittel der Bewertungen>,
  "table": [
    { "Kriterium": "Blattfarbe & -struktur",   "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "Schädlingsbefall",         "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "Blattintegrität",          "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "Wuchsform & Standfestigkeit", "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "Topf- zu Pflanzengröße",   "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "Substrat & Oberfläche",    "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "Gesamtpflege-Anzeichen",   "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" }
  ],
  "summary": "<2-3 Sätze zur Gesamteinschätzung>",
  "recommendation": "<max. 2 Sätze mit konkreten Pflegetipps>"
}

Bewertungsskala: 0 = kritisch, 100 = exzellent. **Nur das JSON zurückgeben, keine Kommentare, keine Erklärung, keine Formatierung.**`;

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: hcPrompt },
            ...(imageUri ? [{
              role: "user",
              content: [
                { type: "image_url", image_url: { url: imageUri } }
              ]
            }] : [])
          ],
          max_tokens: 1200,
        }),
      });
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "";
      healthcheck = JSON.parse(content.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (e) {
      healthcheck = null;
      Alert.alert("Warnung", "Healthcheck konnte nicht sauber erzeugt werden.");
    }

    // 3. Pflanze speichern
    try {
      const plant = await savePlantToSupabase({
        name,
        note,
        image: imageUri,
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
      setName(""); setNote(""); setImageUri(null);

      // 5. Direkt zum Detail
      navigation.navigate('PlantDetail', { plant });
    } catch (err) {
      Alert.alert("Fehler", "Speichern fehlgeschlagen: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={{ padding: 20 }}>
      <Button title="📷 Foto aufnehmen & erkennen" onPress={takePhotoAndRecognize} />
      {imageUri && (
        <Image
          source={{ uri: imageUri }}
          style={{ width: "100%", height: 200, marginVertical: 10, borderRadius: 8 }}
        />
      )}
      <Text style={{ fontWeight: "bold", marginTop: 10 }}>Name:</Text>
      <TextInput value={name} onChangeText={setName} placeholder="z. B. Monstera deliciosa" style={{ borderWidth: 1, padding: 8, marginBottom: 10 }} />
      <Text style={{ fontWeight: "bold" }}>Hinweis:</Text>
      <TextInput multiline value={note} onChangeText={setNote} placeholder="Pflegehinweis von GPT" style={{ borderWidth: 1, padding: 8, minHeight: 80 }} />
      <Button title="✅ Pflanze speichern & Details anzeigen" onPress={handleSaveAndDetails} disabled={!name || loading} />
      {loading && <ActivityIndicator size="large" color="#4CAF50" style={{ marginVertical: 20 }} />}
    </ScrollView>
  );
}
