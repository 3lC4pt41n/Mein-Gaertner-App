import React, { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchSpeciesDetail } from '../services/dexService';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import { t } from '../i18n';

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
      } catch (e) {
        console.warn('DexDetail load error:', e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [speciesId]);

  if (!species) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero Image */}
      {species.image_url ? (
        <Image source={{ uri: species.image_url }} style={styles.heroImage} />
      ) : (
        <View style={styles.heroPlaceholder}>
          <Ionicons name="leaf" size={80} color={colors.primary} />
        </View>
      )}

      {/* Name */}
      <Text style={styles.speciesName}>{species.canonical_name}</Text>

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

      {loading && <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />}

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
          <Text style={styles.sectionTitle}>{t('dex.firstDiscoveredBy')}</Text>
          <Text style={styles.sectionBody}>
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
    height: 280,
    resizeMode: 'cover',
    backgroundColor: colors.primarySurface,
  },
  heroPlaceholder: {
    width: '100%',
    height: 280,
    backgroundColor: colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  speciesName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
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
});
