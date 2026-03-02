import React, { useEffect, useRef } from 'react';
import { View, Text, Modal, Animated, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../theme/tokens';
import { t } from '../i18n';

const DiscoveryModal = ({ visible, onClose, speciesName, isFirst }) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 60,
          friction: 7,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
    }
  }, [visible, scaleAnim, opacityAnim]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          {/* Celebration Icon */}
          <View style={styles.iconContainer}>
            <Ionicons
              name="sparkles"
              size={64}
              color={colors.primary}
            />
          </View>

          {/* Main Title */}
          <Text style={styles.title}>{t('discovery.newSpecies')}</Text>

          {/* Species Name */}
          <Text style={styles.speciesName}>{speciesName}</Text>

          {/* First Discoverer Badge */}
          {isFirst && (
            <View style={styles.firstDiscoveryContainer}>
              <Ionicons name="star" size={24} color={colors.gold} />
              <Text style={styles.firstDiscoveryText}>
                {t('discovery.firstDiscoverer')}
              </Text>
              <Ionicons name="trophy" size={20} color={colors.gold} />
            </View>
          )}

          {/* Continue Button */}
          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleDismiss}
            activeOpacity={0.7}
          >
            <Text style={styles.continueButtonText}>{t('common.continue')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    maxWidth: 280,
  },
  iconContainer: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  speciesName: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  firstDiscoveryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFF8E1',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xl,
  },
  firstDiscoveryText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.gold,
    flex: 1,
  },
  continueButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    minWidth: 200,
  },
  continueButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default DiscoveryModal;
