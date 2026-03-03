import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  Share,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchSpeciesDetail } from '../services/dexService';
import { formatDisplayName } from '../services/discoveryService';
import { colors, spacing, radius } from '../theme/tokens';
import DSButton from '../theme/DSButton';
import { t } from '../i18n';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_HEIGHT = Math.min(SCREEN_WIDTH * 0.75, 340);

export default function DexDetailScreen({ route }) {
  const { speciesId, species: initialSpecies } = route.params;
  const [species, setSpecies] = useState(initialSpecies || null);
  const [loading, setLoading] = useState(!initialSpecies?.description);

  useEffect(() => {
    if (!speciesId) return;
    (async () => {
      try {
        setLoading(true);
        const detail = await fetchSpeciesDetail(speciesId);
        setSpecies((prev) => ({ ...prev, ...detail }));
      } catch {
        // Detail fetch failed — show what we have
      } finally {
        setLoading(false);
      }
    })();
  }, [speciesId]);

  const handleShare = async () => {
    if (!species) return;
    const speciesDisplayName = formatDisplayName(species.canonical_name);
    try {
      await Share.share({
        message: `${speciesDisplayName} — ${t('dex.discoveredBy', { count: species.total_discoverers || 1 })} 🌱`,
      });
    } catch (error) {
      const cancelled = error?.code === 'ERR_CANCELED' || error?.message === 'User did not share';
      if (!cancelled) {
        Alert.alert(t('common.error'), t('common.shareFailed'));
      }
    }
  };

  if (!species) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const displayName = formatDisplayName(species.canonical_name);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero Image (responsive) */}
      {species.image_url ? (
        <Image source={{ uri: species.image_url }} style={styles.heroImage} />
      ) : (
        <View style={styles.heroPlaceholder}>
          <Ionicons name="leaf" size={80} color={colors.primary} />
        </View>
      )}

      {/* Name + Actions Row */}
      <View style={styles.nameRow}>
        <Text style={styles.speciesName}>{displayName}</Text>
        <TouchableOpacity
          onPress={handleShare}
          style={styles.shareButton}
          accessibilityRole="button"
          accessibilityLabel="Share"
        >
          <Ionicons name="share-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* First Discoverer Badge */}
      {species.isFirstDiscoverer && (
        <View style={styles.badgeRow}>
          <Ionicons name="star" size={16} color={colors.gold} />
          <Text style={styles.badgeText}>{t('dex.firstDiscoverer')}</Text>
        </View>
      )}

      {/* Discoverers */}
      <View style={styles.statRow}>
        <Ionicons name="people" size={16} color={colors.textSecondary} />
        <Text style={styles.statText}>
          {species.total_discoverers || 0} {t('dex.discoverers')}
        </Text>
      </View>

      {loading && (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
      )}

      {/* Description */}
      {species.description ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('dex.description')}</Text>
          <Text style={styles.sectionBody}>{species.description}</Text>
        </View>
      ) : null}

      {/* Care Summary */}
      {species.care_summary ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('dex.careSummary')}</Text>
          <Text style={styles.sectionBody}>{species.care_summary}</Text>
        </View>
      ) : null}

      {/* First Discovered By */}
      {species.first_discoverer?.username ? (
        <View style={styles.section}>
          <View style={styles.discovererRow}>
            <Ionicons name="trophy" size={18} color={colors.gold} />
            <Text style={styles.sectionTitle}>{t('dex.firstDiscoveredBy')}</Text>
          </View>
          <Text style={styles.discovererName}>
            {species.first_discoverer.display_name || species.first_discoverer.username}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxxl * 2 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heroImage: {
    width: '100%',
    height: HERO_HEIGHT,
    resizeMode: 'cover',
    backgroundColor: colors.primarySurface,
  },
  heroPlaceholder: {
    width: '100%',
    height: HERO_HEIGHT,
    backgroundColor: colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  speciesName: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  shareButton: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySurface,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.gold,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  statText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  sectionBody: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  discovererRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  discovererName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
});
