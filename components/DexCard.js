import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import PropTypes from 'prop-types';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import { t } from '../i18n';
import { formatDisplayName } from '../services/discoveryService';

// expo-image: blurhash placeholder while loading, automatic disk + memory cache,
// no manual timeout needed — the library handles retries & caching internally.
const BLURHASH_PLACEHOLDER = 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.';

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * DexCard — A single species card in the Plant Dex grid.
 *
 * Shows discovered species with image, name, badges.
 * Shows undiscovered species as locked silhouettes.
 */
const DexCard = memo(({ species, discovered, isFirstDiscoverer, slotNumber, onPress }) => {
  const handlePress = () => {
    if (onPress && discovered) {
      onPress(species.id);
    }
  };

  const displayName = formatDisplayName(species.canonical_name);
  const localName = typeof species.local_name === 'string' ? species.local_name.trim() : '';
  const showLocalName = localName && normalizeName(localName) !== normalizeName(displayName);
  const accessibilityName = showLocalName ? `${localName}, ${displayName}` : displayName;

  return (
    <TouchableOpacity
      style={[styles.card, discovered && isFirstDiscoverer && styles.cardFirst]}
      activeOpacity={discovered ? 0.7 : 0.9}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={
        discovered
          ? `${accessibilityName}, ${isFirstDiscoverer ? t('dex.firstDiscoverer') : t('dex.discoverers')}`
          : t('dex.notDiscovered')
      }
    >
      {/* Slot Number */}
      <View style={styles.slotBadge}>
        <Text style={styles.slotText}>#{slotNumber || '?'}</Text>
      </View>

      {discovered ? (
        <>
          {/* Discovered Species */}
          <View style={styles.imageContainer}>
            {species.image_url ? (
              <Image
                source={{ uri: species.image_url }}
                style={styles.image}
                contentFit="cover"
                placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
                placeholderContentFit="cover"
                transition={200}
                cachePolicy="disk"
                recyclingKey={species.id}
              />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="leaf" size={32} color={colors.primary} />
              </View>
            )}
          </View>

          {/* First Discoverer Badge */}
          {isFirstDiscoverer && (
            <View style={styles.starBadge}>
              <Ionicons name="star" size={14} color={colors.gold} />
            </View>
          )}

          {/* Species Name */}
          <View style={styles.nameBlock}>
            {showLocalName ? (
              <Text style={styles.localName} numberOfLines={2}>
                {localName}
              </Text>
            ) : null}
            <Text
              style={[styles.speciesName, showLocalName && styles.speciesNameSecondary]}
              numberOfLines={2}
            >
              {displayName}
            </Text>
          </View>

          {/* Discoverers Count */}
          <View style={styles.discoverersBadge}>
            <Ionicons name="people" size={12} color={colors.textTertiary} />
            <Text style={styles.discoverersText}>{species.total_discoverers || 1}</Text>
          </View>
        </>
      ) : (
        <>
          {/* Undiscovered Species — Locked Silhouette */}
          <View style={styles.imageSilhouette}>
            <Ionicons name="help-outline" size={36} color={colors.textDisabled} />
          </View>

          {/* Hidden Name */}
          <Text style={styles.hiddenName}>{t('dex.undiscovered')}</Text>

          {/* Not Discovered Label */}
          <View style={styles.discoverersBadge}>
            <Ionicons name="lock-closed" size={11} color={colors.textDisabled} />
            <Text style={styles.discoverersText}>{t('dex.notDiscovered')}</Text>
          </View>
        </>
      )}
    </TouchableOpacity>
  );
});

DexCard.displayName = 'DexCard';

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardFirst: {
    borderColor: colors.gold,
    borderWidth: 2,
  },

  /* Slot Number */
  slotBadge: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    zIndex: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
  },
  slotText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.surface,
  },

  /* Discovered State */
  imageContainer: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.primarySurface,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primarySurface,
  },
  starBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.sm,
    padding: spacing.xs,
  },
  nameBlock: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: 2,
  },
  localName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
  },
  speciesName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  speciesNameSecondary: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    fontStyle: 'italic',
  },

  /* Undiscovered State */
  imageSilhouette: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.divider,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hiddenName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textDisabled,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    textAlign: 'center',
    minHeight: 36,
    letterSpacing: 1,
  },

  /* Shared */
  discoverersBadge: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  discoverersText: {
    fontSize: 11,
    color: colors.textTertiary,
  },
});

DexCard.propTypes = {
  species: PropTypes.shape({
    id: PropTypes.string,
    canonical_name: PropTypes.string,
    local_name: PropTypes.string,
    image_url: PropTypes.string,
    total_discoverers: PropTypes.number,
  }).isRequired,
  discovered: PropTypes.bool,
  isFirstDiscoverer: PropTypes.bool,
  slotNumber: PropTypes.number,
  onPress: PropTypes.func,
};

DexCard.defaultProps = {
  discovered: false,
  isFirstDiscoverer: false,
  slotNumber: null,
  onPress: null,
};

export default DexCard;
