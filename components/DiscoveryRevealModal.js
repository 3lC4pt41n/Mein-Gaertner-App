import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  Animated,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  Share,
  Alert,
} from 'react-native';
import PropTypes from 'prop-types';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import DSButton from '../theme/DSButton';
import { t } from '../i18n';

/**
 * Fullscreen discovery reveal after a plant scan.
 *
 * Two tiers of celebration (only shown for new discoveries):
 *   1. isFirst        → "WORLD FIRST" — gold theme, strong haptic, star badge, share CTA
 *   2. isNewForUser   → "New species!"  — green theme, medium haptic, share CTA
 *
 * Note: This modal is only opened when the species is new for the user
 * (see AddPlantScreen — `discovery?.isNewForUser`). If the user re-scans a
 * known species, no reveal is shown; the normal save-success flow handles it.
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
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible && discovery) {
      // Reset all animations
      scaleAnim.setValue(0.3);
      opacityAnim.setValue(0);
      badgeAnim.setValue(0);
      slideAnim.setValue(40);
      pulseAnim.setValue(1);

      // Haptic feedback — stronger for first discovery
      if (discovery.isFirst) {
        // Triple burst for WORLD FIRST
        Vibration.vibrate([0, 80, 60, 80, 60, 120]);
      } else if (discovery.isNewForUser) {
        // Double burst for new unlock
        Vibration.vibrate([0, 60, 40, 80]);
      }

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
      ]).start(() => {
        // 4. Pulse animation on first discovery badge
        if (discovery.isFirst) {
          Animated.loop(
            Animated.sequence([
              Animated.timing(pulseAnim, {
                toValue: 1.08,
                duration: 800,
                useNativeDriver: true,
              }),
              Animated.timing(pulseAnim, {
                toValue: 1,
                duration: 800,
                useNativeDriver: true,
              }),
            ])
          ).start();
        }
      });
    }
  }, [visible, discovery, scaleAnim, opacityAnim, badgeAnim, slideAnim, pulseAnim]);

  if (!discovery) return null;

  const { isFirst, isNewForUser, totalDiscoverers, displayName, creditsAwarded } = discovery;

  // Determine tier for styling (only two tiers — modal is not shown for known species)
  const tier = isFirst ? 'first' : 'new';

  const handleShare = async () => {
    const message = isFirst
      ? `${displayName} — ${t('dex.firstDiscoveryTitle')} 🏆🌱`
      : `${displayName} — ${t('dex.newDiscovery')} 🌱`;
    try {
      await Share.share({ message });
    } catch (error) {
      const cancelled = error?.code === 'ERR_CANCELED' || error?.message === 'User did not share';
      if (!cancelled) {
        Alert.alert(t('common.error'), t('common.shareFailed'));
      }
    }
  };

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
          {/* Discovery Type Badge — visually differentiated per tier */}
          <Animated.View
            style={[
              styles.typeBadge,
              tier === 'first' && styles.typeBadgeFirst,
              tier === 'new' && styles.typeBadgeNew,

              {
                transform: [{ scale: Animated.multiply(badgeAnim, pulseAnim) }],
              },
            ]}
          >
            <Ionicons
              name={isFirst ? 'trophy' : 'sparkles'}
              size={isFirst ? 22 : 18}
              color={isFirst ? colors.gold : colors.surface}
            />
            <Text style={[styles.typeBadgeText, isFirst && styles.typeBadgeTextFirst]}>
              {isFirst ? t('dex.firstDiscoveryTitle') : t('dex.newDiscovery')}
            </Text>
          </Animated.View>

          {/* Plant Image — gold ring for first, green for new */}
          <Animated.View
            style={[
              styles.imageContainer,
              isFirst && styles.imageContainerFirst,
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
            {/* First Discoverer Crown */}
            {isFirst && (
              <Animated.View style={[styles.crownBadge, { transform: [{ scale: badgeAnim }] }]}>
                <Ionicons name="star" size={28} color={colors.gold} />
              </Animated.View>
            )}
          </Animated.View>

          {/* Species Name */}
          <Animated.View style={{ transform: [{ translateY: slideAnim }], opacity: opacityAnim }}>
            <Text style={styles.speciesName}>{displayName}</Text>

            {/* Discoverer Count */}
            <View style={styles.statRow}>
              <Ionicons name="people" size={16} color={colors.textTertiary} />
              <Text style={styles.statText}>
                {totalDiscoverers} {t('dex.discoverers')}
              </Text>
            </View>

            {/* Credit Reward */}
            {creditsAwarded > 0 && (
              <View style={styles.creditRewardRow}>
                <Ionicons name="diamond" size={18} color={colors.gold} />
                <Text style={styles.creditRewardText}>
                  +{creditsAwarded} {t('common.credits')}
                </Text>
              </View>
            )}

            {/* First Discoverer Highlight — more prominent */}
            {isFirst && (
              <View style={styles.firstBadgeRow}>
                <Ionicons name="trophy" size={22} color={colors.gold} />
                <Text style={styles.firstBadgeText}>{t('dex.firstDiscoverer')}</Text>
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
            {/* Share CTA — prominent for first, secondary for new */}
            {(isFirst || isNewForUser) && (
              <DSButton
                variant={isFirst ? 'primary' : 'secondary'}
                onPress={handleShare}
                fullWidth
                icon="share-outline"
              >
                {t('common.share')}
              </DSButton>
            )}

            <DSButton
              variant="secondary"
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

DiscoveryRevealModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  discovery: PropTypes.shape({
    speciesId: PropTypes.string,
    isFirst: PropTypes.bool,
    isNewForUser: PropTypes.bool,
    totalDiscoverers: PropTypes.number,
    displayName: PropTypes.string,
    creditsAwarded: PropTypes.number,
  }),
  imageUri: PropTypes.string,
  onContinue: PropTypes.func.isRequired,
  onViewDex: PropTypes.func,
};

DiscoveryRevealModal.defaultProps = {
  discovery: null,
  imageUri: null,
  onViewDex: null,
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  content: {
    width: '100%',
    alignItems: 'center',
    maxWidth: 360,
  },

  // Type Badge — two visual tiers (first / new)
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
    backgroundColor: 'rgba(255, 215, 0, 0.25)',
    borderWidth: 2,
    borderColor: colors.gold,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
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
  typeBadgeTextFirst: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.gold,
    letterSpacing: 0.5,
  },

  // Image — gold ring for first discoverers
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
  imageContainerFirst: {
    borderWidth: 5,
    borderColor: colors.gold,
    width: 240,
    height: 240,
    borderRadius: 120,
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
  crownBadge: {
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
    backgroundColor: 'rgba(255, 215, 0, 0.18)',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.35)',
  },
  firstBadgeText: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.gold,
    letterSpacing: 0.3,
  },

  // Credit Reward
  creditRewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  creditRewardText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFD700',
    letterSpacing: 0.3,
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
