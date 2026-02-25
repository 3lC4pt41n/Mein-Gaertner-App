import React, { useEffect, useRef, useState } from 'react';
import { View, TextInput, Button, Text, FlatList, KeyboardAvoidingView, Platform, Image, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../supabase';
import { fetchMessages, saveMessage } from '../services/chatService';
import { uploadChatImage } from '../services/uploadService';
import { chatWithBen } from '../services/aiService';
import { fetchBalance } from '../services/creditService';

const GARDENER_NAME = "Ben";

export default function AssistantScreen() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [user_id, setUserId] = useState(null);
  const [balance, setBalance] = useState(null);
  const flatListRef = useRef();

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

  useEffect(() => {
    if (!user_id) return;
    fetchMessages(user_id).then(setMessages).catch(console.error);
  }, [user_id]);

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // Credit-Error Handler
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
        const uploadedUrl = await uploadChatImage(result.assets[0].uri, user_id);
        if (!uploadedUrl) throw new Error("Upload fehlgeschlagen");
        const msg = { user_id, sender: "user", content: "[Bild]", image_url: uploadedUrl };
        await saveMessage(msg);
        setMessages((m) => [...m, { ...msg, created_at: new Date().toISOString() }]);
        await getBenAnswer("", uploadedUrl);
      } catch (e) {
        if (!handleCreditError(e)) {
          Alert.alert("Fehler", e.message);
        }
      } finally {
        setLoading(false);
      }
    }
  };

  // GPT-Antwort über Edge Function
  const getBenAnswer = async (text = "", image_url = null) => {
    try {
      const data = await chatWithBen(messages.slice(-10), text, image_url);
      const content = data.content || "🤔 Keine Antwort.";
      if (typeof data.balance === 'number') setBalance(data.balance);

      const msg = { user_id, sender: GARDENER_NAME, content };
      await saveMessage(msg);
      setMessages(m => [...m, { ...msg, created_at: new Date().toISOString() }]);
    } catch (e) {
      if (!handleCreditError(e)) {
        Alert.alert("Fehler", e.message);
      }
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
      {/* Credit-Leiste */}
      {balance !== null && (
        <View style={{
          backgroundColor: balance > 10 ? "#E8F5E9" : "#FFF3E0",
          padding: 8, flexDirection: "row", justifyContent: "space-between",
          alignItems: "center", paddingHorizontal: 16,
        }}>
          <Text style={{ color: "#666", fontSize: 13 }}>Credits</Text>
          <Text style={{
            fontWeight: "bold",
            color: balance > 10 ? "#4CAF50" : "#FF9800"
          }}>
            {balance}
          </Text>
        </View>
      )}

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
