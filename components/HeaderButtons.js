import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function HeaderButtons({ navigation }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Ionicons
        name="home-outline"
        size={24}
        color="#4CAF50"
        style={{ marginRight: 16 }}
        onPress={() => navigation.navigate('Heute')}
      />
      <Ionicons
        name="clipboard-outline"
        size={24}
        color="#4CAF50"
        style={{ marginRight: 16 }}
        onPress={() => navigation.navigate('Aufgaben')}
      />
      <Ionicons
        name="person-circle-outline"
        size={28}
        color="#4CAF50"
        onPress={() => navigation.navigate('ProfilBearbeiten')}
      />
    </View>
  );
}
