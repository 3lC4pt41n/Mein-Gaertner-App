import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchBalance } from '../services/creditService';
import { colors, spacing, radius } from '../theme/tokens';
import { t } from '../i18n';

const LOW_BALANCE_THRESHOLD = 20;

/**
 * CreditBar — Unified credit display for all AI-enabled screens.
 *
 * Props:
 *   onBalanceChange(balance) — called whenever balance updates (for parent error handling)
 *   style                   — optional outer style override
 */
export default function CreditBar({ onBalanceChange, style }) {
  const navigation = useNavigation();
  const [balance, setBalance] = useState(null);
  const onBalanceChangeRef = useRef(onBalanceChange);

  useEffect(() => {
    onBalanceChangeRef.current = onBalanceChange;
  }, [onBalanceChange]);

  const loadBalance = useCallback(async () => {
    try {
      const bal = await fetchBalance();
      setBalance(bal);
      if (onBalanceChangeRef.current) onBalanceChangeRef.current(bal);
    } catch {
      setBalance(null);
    }
  }, []);

  // Load on mount + poll every 30s
  useEffect(() => {
    loadBalance();
    const interval = setInterval(loadBalance, 30000);
    return () => clearInterval(interval);
  }, [loadBalance]);

  // Refresh when screen gains focus
  useFocusEffect(
    useCallback(() => {
      loadBalance();
    }, [loadBalance])
  );

  if (balance === null) return null;

  const isLow = balance < LOW_BALANCE_THRESHOLD;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isLow ? colors.warningSurface : colors.primarySurface },
        style,
      ]}
    >
      <View style={styles.left}>
        <Ionicons
          name="flash"
          size={18}
          color={isLow ? colors.warning : colors.primaryLight}
          style={styles.icon}
        />
        <Text style={styles.label}>{t('common.credits')}</Text>
      </View>

      <View style={styles.right}>
        {isLow && (
          <TouchableOpacity
            onPress={() => navigation.navigate('Mehr', { screen: 'ShopMain' })}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.buyLink}>{t('common.buyCredits')}</Text>
          </TouchableOpacity>
        )}
        <Text style={[styles.value, { color: isLow ? colors.warning : colors.primary }]}>
          {balance}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: spacing.xs,
  },
  label: {
    fontWeight: '600',
    fontSize: 14,
    color: colors.textSecondary,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  buyLink: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  value: {
    fontWeight: 'bold',
    fontSize: 18,
  },
});
