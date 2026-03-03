import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  Animated,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import DSButton from '../theme/DSButton';
import { t } from '../i18n';

/**
 * Fullscreen discovery reveal after a plant scan.
 *
 * Props:
 * - visible: boolean
 * - discovery: { speciesId, isFirst, isNewForUser, totalDiscoverers, displayName }
 * - imageUri: string (plant photo)
 * - onContinue: () => void
 * - onViewDex: () => void
 */
export default function DiscoveryRevealModal({
  visible,
  discovery,
  imageUri,
  onContinue,
  onViewDex,
}) {
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const badgeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    if (visible) {
      // Reset
      scaleAnim.setValue(0.3);
      opacityAnim.setValue(0);
      badgeAnim.setValue(0);
      slideAnim.setValue(40);

      // Staggered entrance animation
      Animated.sequence([
        // 1. Fade in background
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        // 2. Scale up image with spring
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }),
        // 3. Slide in badge + text
        Animated.parallel([
          Animated.spring(badgeAnim, {
            toValue: 1,
            friction: 5,
            tension: 60,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }
  }, [visible]);

  if (!discovery) return null;

  const { isFirst, isNewForUser, totalDiscoverers, displayName } = discovery;

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      statusBarTranslucent
      onRequestClose={onContinue}
    >
      <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
        <View style={styles.content}>
          {/* Discovery Type Badge */}
          <Animated.View
            style={[
              styles.typeBadge,
              isFirst ? styles.typeBadgeFirst : styles.typeBadgeNew,
              {
                transform: [{ scale: badgeAnim }],
              },
            ]}
          >
            <Ionicons
              name={isFirst ? 'star' : 'sparkles'}
              size={18}
              color={isFirst ? colors.gold : colors.surface}
            />
            <Text style={styles.typeBadgeText}>
              {isFirst
                ? t('dex.firstDiscoveryTitle')
                : isNewForUser
                ? t('dex.newDiscovery')
                : t('plants.savedSuccess')}
            </Text>
          </Animated.View>

          {/* Plant Image */}
          <Animated.View
            style={[
              styles.imageContainer,
              {
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.image} />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="leaf" size={60} color={colors.primary} />
              </View>
            )}
            {/* First Discoverer Star */}
            {isFirst && (
              <Animated.View
                style={[
                  styles.starBadge,
                  { transform: [{ scale: badgeAnim }] },
                ]}
              >
                <Ionicons name="star" size={28} color={colors.gold} />
              </Animated.View>
            )}
          </Animated.View>

          {/* Species Name */}
          <Animated.View
            style={{ transform: [{ translateY: slideAnim }], opacity: opacityAnim }}
          >
            <Text style={styles.speciesName}>{displayName}</Text>

            {/* Discoverer Count */}
            <View style={styles.statRow}>
              <Ionicons name="people" size={16} color={colors.textTertiary} />
              <Text style={styles.statText}>
                {totalDiscoverers} {t('dex.discoverers')}
              </Text>
            </View>

            {/* First Discoverer Highlight */}
            {isFirst && (
              <View style={styles.firstBadgeRow}>
                <Ionicons name="trophy" size={20} color={colors.gold} />
                <Text style={styles.firstBadgeText}>
                  {t('dex.firstDiscoverer')}
                </Text>
              </View>
            )}
          </Animated.View>

          {/* Action Buttons */}
          <Animated.View
            style={[
              styles.actions,
              { transform: [{ translateY: slideAnim }], opacity: opacityAnim },
            ]}
          >
            <DSButton
              onPress={onContinue}
              fullWidth
              icon="arrow-forward-outline"
              iconPosition="right"
            >
              {t('dex.continue')}
            </DSButton>

            {isNewForUser && (
              <TouchableOpacity
                style={styles.dexLink}
                onPress={onViewDex}
                accessibilityRole="button"
                accessibilityLabel={t('dex.title')}
              >
                <Ionicons name="grid-outline" size={16} color={colors.primary} />
                <Text style={styles.dexLinkText}>{t('dex.title')}</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  content: {
    width: '100%',
    alignItems: 'center',
    maxWidth: 360,
  },

  // Type Badge
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    marginBottom: spacing.xl,
  },
  typeBadgeFirst: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderWidth: 1,
    borderColor: colors.gold,
  },
  typeBadgeNew: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  typeBadgeText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.surface,
  },

  // Image
  imageContainer: {
    width: 220,
    height: 220,
    borderRadius: 110,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: colors.primaryLight,
    marginBottom: spacing.xl,
    ...shadows.lg,
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  starBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    padding: spacing.sm,
  },

  // Text
  speciesName: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.surface,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  statText: {
    fontSize: 14,
    color: colors.textTertiary,
  },
  firstBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  firstBadgeText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gold,
  },

  // Actions
  actions: {
    width: '100%',
    marginTop: spacing.xxl,
    gap: spacing.md,
  },
  dexLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  dexLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
});
