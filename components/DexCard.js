import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme/tokens';

const DexCard = ({ species, discovered, isFirstDiscoverer, onPress }) => {
  const handlePress = () => {
    if (onPress) {
      onPress(species.id);
    }
  };

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={handlePress}
    >
      {discovered ? (
        <>
          {/* Discovered Species */}
          <View style={styles.imageContainer}>
            {species.image_url ? (
              <Image
                source={{ uri: species.image_url }}
                style={styles.image}
              />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="leaf" size={40} color={colors.primary} />
              </View>
            )}
          </View>

          {/* First Discoverer Badge */}
          {isFirstDiscoverer && (
            <View style={styles.starBadge}>
              <Ionicons name="star" size={16} color={colors.gold} />
            </View>
          )}

          {/* Species Name */}
          <Text style={styles.speciesName} numberOfLines={2}>
            {species.canonical_name}
          </Text>

          {/* Discoverers Count */}
          <View style={styles.discoverersBadge}>
            <Ionicons name="people" size={12} color={colors.textTertiary} />
            <Text style={styles.discoverersText}>
              {species.total_discoverers || 1}
            </Text>
          </View>
        </>
      ) : (
        <>
          {/* Undiscovered Species */}
          <View style={styles.imageSilhouette}>
            <Text style={styles.questionMark}>?</Text>
          </View>

          {/* Hidden Name */}
          <Text style={styles.hiddenName}>---</Text>

          {/* Discoverers Count */}
          <View style={styles.discoverersBadge}>
            <Ionicons name="help-circle" size={12} color={colors.textTertiary} />
            <Text style={styles.discoverersText}>{t('dex.notDiscovered')}</Text>
          </View>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadows.md,
  },
  /* Discovered State */
  imageContainer: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primarySurface,
  },
  starBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.xs,
    ...shadows.sm,
  },
  speciesName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    textAlign: 'center',
  },
  /* Undiscovered State */
  imageSilhouette: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  questionMark: {
    fontSize: 48,
    fontWeight: '300',
    color: '#666666',
  },
  hiddenName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    textAlign: 'center',
    letterSpacing: 2,
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
    fontSize: 12,
    color: colors.textTertiary,
  },
});

export default DexCard;
