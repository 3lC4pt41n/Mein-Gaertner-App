import React, { useState } from 'react';
import { TextInput, Button, Card, Title } from 'react-native-paper';
import { createLocation } from '../lib/api/locations';
import { t } from '../i18n';

export default function HomeLocationForm({ afterSave }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  // Beispiel für optionale Felder, falls du später GPS etc. willst:
  // const [lat, setLat] = useState('');
  // const [lon, setLon] = useState('');
  // const [country, setCountry] = useState('');
  // const [locality, setLocality] = useState('');
  // const [postalCode, setPostalCode] = useState('');

  const [loading, setLoading] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    try {
      setLoading(true);
      const locationData = {
        name,
        address: address || null,
        label: label || null,
        // lat: lat ? Number(lat) : null,
        // lon: lon ? Number(lon) : null,
        // country: country || null,
        // locality: locality || null,
        // postal_code: postalCode || null,
      };
      await createLocation(locationData);
      setName('');
      setAddress('');
      setLabel('');
      // setLat(''); setLon(''); setCountry(''); setLocality(''); setPostalCode('');
      if (afterSave) afterSave();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <Card.Content>
        <Title>{t('home.newHome')}</Title>
        <TextInput
          label={t('common.name')}
          value={name}
          onChangeText={setName}
          style={{ marginBottom: 12 }}
        />
        <TextInput
          label={t('home.addressPlaceholder')}
          value={address}
          onChangeText={setAddress}
          style={{ marginBottom: 12 }}
        />
        <TextInput
          label={t('home.labelPlaceholder')}
          value={label}
          onChangeText={setLabel}
          style={{ marginBottom: 12 }}
        />
        {/*
        // Falls du noch andere Felder der Tabelle aufnehmen willst:
        <TextInput label="Land (optional)" value={country} onChangeText={setCountry} style={{ marginBottom: 12 }} />
        <TextInput label="Ort (optional)" value={locality} onChangeText={setLocality} style={{ marginBottom: 12 }} />
        <TextInput label="Postleitzahl (optional)" value={postalCode} onChangeText={setPostalCode} style={{ marginBottom: 12 }} />
        <TextInput label="Breitengrad (optional)" value={lat} onChangeText={setLat} keyboardType="numeric" style={{ marginBottom: 12 }} />
        <TextInput label="Längengrad (optional)" value={lon} onChangeText={setLon} keyboardType="numeric" style={{ marginBottom: 12 }} />
        */}
        <Button mode="contained" onPress={save} loading={loading} disabled={loading}>
          {t('common.save')}
        </Button>
      </Card.Content>
    </Card>
  );
}
