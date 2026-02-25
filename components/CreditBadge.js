import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchBalance } from '../services/creditService';

// Zeigt das aktuelle Credit-Guthaben an
// Kann in Header oder als Tab-Icon Badge genutzt werden
export default function CreditBadge({ onPress, style }) {
  const [balance, setBalance] = useState(null);

  const loadBalance = async () => {
    try {
      const bal = await fetchBalance();
      setBalance(bal);
    } catch {
      setBalance(null);
    }
  };

  useEffect(() => {
    loadBalance();
    // Alle 30 Sekunden aktualisieren
    const interval = setInterval(loadBalance, 30000);
    return () => clearInterval(interval);
  }, []);

  if (balance === null) return null;

  const isLow = balance < 20;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: isLow ? "#FFF3E0" : "#E8F5E9",
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 16,
      }, style]}
    >
      <Ionicons
        name="flash"
        size={16}
        color={isLow ? "#FF9800" : "#4CAF50"}
        style={{ marginRight: 4 }}
      />
      <Text style={{
        fontWeight: "bold",
        fontSize: 14,
        color: isLow ? "#FF9800" : "#4CAF50",
      }}>
        {balance}
      </Text>
    </TouchableOpacity>
  );
}
