import React, { useState } from 'react';
import { View, TextInput, Button, Alert, Text } from 'react-native';
import { supabase } from '../supabase';

export default function ProfileCompleteScreen({ user, profile, onDone, showSkip }) {
  const [username, setUsername] = useState(profile?.username ?? '');
  const [firstName, setFirstName] = useState(profile?.first_name ?? '');
  const [lastName, setLastName] = useState(profile?.last_name ?? '');
  const [country, setCountry] = useState(profile?.country ?? '');
  const [language, setLanguage] = useState(profile?.language ?? '');

  const handleSave = async () => {
    // Logge den User
    console.log("Aktueller User im ProfileCompleteScreen:", user);
    if (!user?.id) {
      Alert.alert("Fehler", "Kein User ID gefunden.");
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({
        username,
        first_name: firstName,
        last_name: lastName,
        country,
        language
      })
      .eq('id', user.id);

    if (error) {
      Alert.alert("Fehler beim Speichern", error.message);
      console.error(error);
    } else {
      Alert.alert("Erfolg", "Profil gespeichert!");
      onDone && onDone();
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <Text>Benutzername</Text>
      <TextInput value={username} onChangeText={setUsername} style={{ borderWidth: 1, marginBottom: 10 }} />
      <Text>Vorname</Text>
      <TextInput value={firstName} onChangeText={setFirstName} style={{ borderWidth: 1, marginBottom: 10 }} />
      <Text>Nachname</Text>
      <TextInput value={lastName} onChangeText={setLastName} style={{ borderWidth: 1, marginBottom: 10 }} />
      <Text>Land</Text>
      <TextInput value={country} onChangeText={setCountry} style={{ borderWidth: 1, marginBottom: 10 }} />
      <Text>Sprache</Text>
      <TextInput value={language} onChangeText={setLanguage} style={{ borderWidth: 1, marginBottom: 10 }} />
      <Button title="Profil speichern" onPress={handleSave} />
      {showSkip && (
        <View style={{ marginTop: 16 }}>
          <Button title="Überspringen" color="gray" onPress={onDone} />
        </View>
      )}
    </View>
  );
}
