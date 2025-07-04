import React, { useEffect, useRef, useState } from 'react';
import { View, TextInput, Button, Text, FlatList, KeyboardAvoidingView, Platform, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../supabase';
import { fetchMessages, saveMessage } from '../services/chatService';
import { uploadChatImage } from '../services/uploadService';

const GARDENER_NAME = "Ben";
const DEBUG = false; // true = Log für dev

export default function AssistantScreen() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [user_id, setUserId] = useState(null);
  const flatListRef = useRef();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data?.user?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    if (!user_id) return;
    fetchMessages(user_id).then(setMessages).catch(console.error);
  }, [user_id]);

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // Foto aufnehmen & senden
  const takeAndSendPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      alert("Kamerazugriff wird benötigt.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      base64: false,
      allowsEditing: false,
      quality: 0.7,
    });

    if (!result.canceled) {
      setLoading(true);
      try {
        // Upload Bild zu Supabase (unterschiedlich je Plattform handled der Service)
        const url = await uploadChatImage(result.assets[0].uri, user_id);
        const msg = { user_id, sender: "user", content: "[Bild]", image_url: url };
        await saveMessage(msg);
        setMessages((m) => [...m, { ...msg, created_at: new Date().toISOString() }]);
        // Jetzt nach Upload auch direkt Bens Antwort triggern:
        await getBenAnswer("", url);
      } catch (e) {
        alert("Fehler beim Hochladen: " + e.message);
      } finally {
        setLoading(false);
      }
    }
  };

  // GPT-Antwort (auch für Bild-URL)
  const getBenAnswer = async (text = "", image_url = null) => {
    const contextPrompt = `
      Du bist "${GARDENER_NAME}", ein smarter, witziger, charmanter Pflanzen-Coach.
      Du bist Experte für Pflanzen & Gardening, hin und wieder etwas flirtend, machst gerne mal einen Scherz, bist immer freundlich, aufmunternd und respektvoll.
      Wenn du ein Bild geschickt bekommst, reagiere spezifisch auf dessen Inhalt und beziehe es in deine Antwort ein.
      Sprich im Chat-Stil (wie WhatsApp), auf Deutsch. Antworte kurz, max. 5 Sätze.
    `;

    // Verlauf korrekt bauen!
    const chatHistory = [
      { role: "system", content: contextPrompt },
      ...messages.slice(-10).map(msg => {
        if (msg.image_url) {
          return {
            role: msg.sender === "user" ? "user" : "assistant",
            content: [
              ...(msg.content && msg.content !== "[Bild]" ? [{ type: "text", text: msg.content }] : []),
              { type: "image_url", image_url: { url: msg.image_url } }
            ]
          }
        } else {
          return {
            role: msg.sender === "user" ? "user" : "assistant",
            content: msg.content
          }
        }
      }),
      ...(image_url ? [{
        role: "user",
        content: [
          { type: "text", text: text || "Was ist das auf dem Bild?" },
          { type: "image_url", image_url: { url: image_url } }
        ]
      }] : (text ? [{ role: "user", content: text }] : []))
    ];

    if (DEBUG) {
      console.log("Chatverlauf an OpenAI:", JSON.stringify(chatHistory, null, 2));
    }

    const { data: configData } = await supabase.from('config').select('value').eq('key', 'OPENAI_API_KEY').single();
    const OPENAI_API_KEY = configData?.value;

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: chatHistory,
          temperature: 0.7,
          stream: false
        }),
      });
      const json = await res.json();
      if (DEBUG) console.log("Antwort von OpenAI:", json);
      const content = json.choices?.[0]?.message?.content || "🤔 Keine Antwort.";
      const msg = { user_id, sender: GARDENER_NAME, content };
      await saveMessage(msg);
      setMessages(m => [...m, { ...msg, created_at: new Date().toISOString() }]);
    } catch (e) {
      alert("Fehler beim GPT-Antwort: " + e.message);
    }
  };

  // Textnachricht senden
  const sendMessage = async () => {
    if (!input.trim() || !user_id) return;
    setLoading(true);
    try {
      const userMessage = { user_id, sender: "user", content: input };
      await saveMessage(userMessage);
      setMessages((m) => [...m, { ...userMessage, created_at: new Date().toISOString() }]);
      setInput('');
      await getBenAnswer(input, null);
    } finally {
      setLoading(false);
    }
  };

  // Avatar wählen
  const getAvatar = (sender) => {
    if (sender === GARDENER_NAME)
      return require('../assets/avatars/ben.png');
    if (sender === "user")
      return require('../assets/avatars/tim.png');
    return null;
  };

  // Bubble
  const renderItem = ({ item }) => (
    <View style={{
      alignSelf: item.sender === "user" ? 'flex-end' : 'flex-start',
      backgroundColor: item.sender === "user" ? "#DCF8C6" : "#F1F0F0",
      margin: 4,
      padding: 10,
      borderRadius: 14,
      maxWidth: "80%",
      flexDirection: "row",
      alignItems: "flex-end"
    }}>
      <Image
        source={getAvatar(item.sender)}
        style={{ width: 32, height: 32, borderRadius: 16, marginRight: 8 }}
      />
      <View>
        {item.image_url &&
          <Image source={{ uri: item.image_url }} style={{ width: 150, height: 150, borderRadius: 10, marginBottom: 4 }} resizeMode="cover" />}
        <Text>{item.content}</Text>
        <Text style={{ fontSize: 10, color: "#888" }}>{item.sender === "user" ? "Du" : GARDENER_NAME}</Text>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <FlatList
        data={messages}
        ref={flatListRef}
        keyExtractor={(_, i) => i.toString()}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 10 }}
      />
      {loading && <ActivityIndicator size="large" color="#4CAF50" style={{ margin: 10 }} />}
      <View style={{ flexDirection: "row", alignItems: "center", padding: 8 }}>
        <TouchableOpacity onPress={takeAndSendPhoto}>
          <Ionicons name="camera" size={28} color="#4CAF50" style={{ marginRight: 10 }} />
        </TouchableOpacity>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Schreib Ben eine Nachricht …"
          style={{ flex: 1, borderWidth: 1, borderColor: "#ccc", borderRadius: 20, padding: 8, backgroundColor: "#fff" }}
        />
        <Button title="Senden" onPress={sendMessage} disabled={loading || !input.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}
