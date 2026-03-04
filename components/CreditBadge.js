import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchBalance } from '../services/creditService';
import { colors, spacing, radius } from '../theme/tokens';

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
    const interval = setInterval(loadBalance, 30000);
    return () => clearInterval(interval);
  }, []);

  if (balance === null) return null;

  const isLow = balance < 20;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: isLow ? colors.warningSurface : colors.primarySurface,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
          borderRadius: radius.lg,
        },
        style,
      ]}
    >
      <Ionicons
        name="flash"
        size={16}
        color={isLow ? colors.warning : colors.primaryLight}
        style={{ marginRight: spacing.xs }}
      />
      <Text
        style={{
          fontWeight: 'bold',
          fontSize: 14,
          color: isLow ? colors.warning : colors.primary,
        }}
      >
        {balance}
      </Text>
    </TouchableOpacity>
  );
}
