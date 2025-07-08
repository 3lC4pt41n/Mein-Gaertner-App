import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import HomeLocationForm from '../components/HomeLocationForm';

export default function HomeManager() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <HomeLocationForm />
      {/* TODO: List existing homes here */}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 16 },
});
