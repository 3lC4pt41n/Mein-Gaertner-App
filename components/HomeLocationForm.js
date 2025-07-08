import React, { useState } from 'react';
import { TextInput, Button, Card, Title } from 'react-native-paper';
import { createLocation } from '../lib/api/locations';

export default function HomeLocationForm() {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    try {
      setLoading(true);
      await createLocation({ name, address });
      setName('');
      setAddress('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <Card.Content>
        <Title>Neues Zuhause</Title>
        <TextInput
          label="Name"
          value={name}
          onChangeText={setName}
          style={{ marginBottom: 12 }}
        />
        <TextInput
          label="Adresse (optional)"
          value={address}
          onChangeText={setAddress}
          style={{ marginBottom: 12 }}
        />
        <Button mode="contained" onPress={save} loading={loading}>
          Speichern
        </Button>
      </Card.Content>
    </Card>
  );
}
