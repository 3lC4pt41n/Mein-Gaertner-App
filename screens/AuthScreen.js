// screens/AuthScreen.js
import React, { useState } from 'react';
import { View, TextInput, Button, Text, Alert, Platform, ActivityIndicator } from 'react-native';
import { supabase } from '../supabase';

const NETWORK_ERROR_MSG =
  "Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung und versuche es erneut.";

function isNetworkError(err) {
  const msg = err?.message || '';
  return (
    msg.includes('Network request failed') ||
    msg.includes('fetch failed') ||
    err?.name === 'AuthRetryableFetchError'
  );
}

export default function AuthScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Registrierung per Email
  const handleSignup = async () => {
    if (!email || !password) {
      Alert.alert("Fehler", "E-Mail und Passwort dürfen nicht leer sein.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Fehler", "Das Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        const msg = isNetworkError(error) ? NETWORK_ERROR_MSG : error.message;
        Alert.alert("Fehler", msg);
      } else {
        Alert.alert("Bestätigungslink verschickt", "Bitte prüfe deine Email und bestätige sie.");
        if (Platform.OS === "web") {
          alert("Bestätigungslink verschickt!");
        }
      }
    } catch (err) {
      const msg = isNetworkError(err) ? NETWORK_ERROR_MSG : err.message;
      Alert.alert("Fehler", msg);
    } finally {
      setLoading(false);
    }
  };

  // Login per Email
  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Fehler", "E-Mail und Passwort dürfen nicht leer sein.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const msg = isNetworkError(error) ? NETWORK_ERROR_MSG : error.message;
        Alert.alert("Fehler", msg);
      }
    } catch (err) {
      const msg = isNetworkError(err) ? NETWORK_ERROR_MSG : err.message;
      Alert.alert("Fehler", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' }}>
        Digitaler Gärtner
      </Text>
      <Text>Email</Text>
      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 6, marginBottom: 12, padding: 10 }}
        editable={!loading}
      />
      <Text>Passwort</Text>
      <TextInput
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 6, marginBottom: 16, padding: 10 }}
        editable={!loading}
      />
      {loading ? (
        <ActivityIndicator size="large" color="#4CAF50" />
      ) : (
        <>
          <Button title="Einloggen" onPress={handleLogin} color="#4CAF50" />
          <View style={{ height: 10 }} />
          <Button title="Registrieren" onPress={handleSignup} />
        </>
      )}
    </View>
  );
}
