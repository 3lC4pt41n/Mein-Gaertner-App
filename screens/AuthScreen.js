// screens/AuthScreen.js
import React, { useState } from 'react';
import { View, TextInput, Button, Text, Alert, Platform } from 'react-native';
import { supabase } from '../supabase';

export default function AuthScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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
    try {
      console.log("Registrierung versucht für:", email);
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        Alert.alert("Fehler", error.message);
        console.error(error);
      } else {
        Alert.alert("Bestätigungslink verschickt", "Bitte prüfe deine Email und bestätige sie.");
        if (Platform.OS === "web") {
          alert("Bestätigungslink verschickt!"); // fallback für Web
        }
      }
    } catch (err) {
      Alert.alert("Fehler", err.message);
      console.error(err);
    }
  };

  // Login per Email
  const handleLogin = async () => {
    try {
      console.log("Login versucht für:", email);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        Alert.alert("Fehler", error.message);
        console.error(error);
      } else {
        Alert.alert("Erfolg", "Erfolgreich eingeloggt.");
        // navigation.replace('Home'); // ggf. Ziel anpassen (bei BottomTabs meist nicht nötig)
      }
    } catch (err) {
      Alert.alert("Fehler", err.message);
      console.error(err);
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <Text>Email</Text>
      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={{ borderWidth: 1, marginBottom: 10, padding: 8 }}
      />
      <Text>Passwort</Text>
      <TextInput
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={{ borderWidth: 1, marginBottom: 10, padding: 8 }}
      />
      <Button title="Registrieren" onPress={handleSignup} />
      <View style={{ height: 8 }} />
      <Button title="Einloggen" onPress={handleLogin} />
    </View>
  );
}
