import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { fetchDex, getDexProgress } from '../services/dexService';
import DexCard from '../components/DexCard';
import { colors, spacing, radius } from '../theme/tokens';
import { t } from '../i18n';
import { useAuth } from '../contexts/AuthContext';

const FILTERS = [
  { label: 'all', value: 'all' },
  { label: 'discovered', value: 'discovered' },
  { label: 'first', value: 'first' },
];

// Category display order & icon mapping
const CATEGORY_ORDER = ['houseplant', 'succulent', 'flowering', 'tree', 'groundcover', 'other'];

const CATEGORY_ICONS = {
  houseplant: 'leaf',
  succulent: 'water',
  flowering: 'flower',
  tree: 'git-branch-outline',
  groundcover: 'layers-outline',
  other: 'ellipsis-horizontal',
};

const CATEGORY_COLORS = {
  houseplant: '#4CAF50',
  succulent: '#8BC34A',
  flowering: '#E91E63',
  tree: '#795548',
  groundcover: '#009688',
  other: '#607D8B',
};

/**
 * Group flat species list into SectionList sections by plant_type.
 * Each section's data is chunked into pairs for a 2-column grid.
 */
function groupIntoSections(speciesList) {
  const groups = {};
  for (const s of speciesList) {
    const type = s.plant_type || 'other';
    if (!groups[type]) groups[type] = [];
    groups[type].push(s);
  }

  return CATEGORY_ORDER.filter((cat) => groups[cat]?.length > 0).map((cat) => {
    const items = groups[cat];
    // Chunk into pairs for 2-column grid
    const rows = [];
    for (let i = 0; i < items.length; i += 2) {
      rows.push(items.slice(i, i + 2));
    }
    return {
      key: cat,
      title: t(`dex.categories.${cat}`),
      icon: CATEGORY_ICONS[cat],
      color: CATEGORY_COLORS[cat],
      count: items.length,
      data: rows,
    };
  });
}

const PlantDexScreen = () => {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [species, setSpecies] = useState([]);
  const [progress, setProgress] = useState({ total: 0, discovered: 0, firstDiscoveries: 0 });
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadDexData = useCallback(async () => {
    if (!user) return;
    try {
      setError(null);
      const [dexData, progressData] = await Promise.all([
        fetchDex(user.id, filter),
        getDexProgress(user.id),
      ]);
      setSpecies(dexData);
      setProgress(progressData);
    } catch (err) {
      setError(err.message);
    }
  }, [user, filter]);

  // Always reload on focus — no dependency on loadDexData to avoid stale closures
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      (async () => {
        if (!user) return;
        try {
          setError(null);
          const [dexData, progressData] = await Promise.all([
            fetchDex(user.id, filter),
            getDexProgress(user.id),
          ]);
          if (!cancelled) {
            setSpecies(dexData);
            setProgress(progressData);
          }
        } catch (err) {
          if (!cancelled) setError(err.message);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [user, filter])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDexData();
    setRefreshing(false);
  }, [loadDexData]);

  const sections = useMemo(() => groupIntoSections(species), [species]);

  const progressPercent = progress.total > 0 ? (progress.discovered / progress.total) * 100 : 0;

  const filterItems = useMemo(
    () =>
      FILTERS.map((f) => ({
        label: t(`dex.filters.${f.label}`),
        value: f.value,
      })),
    []
  );

  // Stable callback for card press — avoids re-creating in renderRow
  const handleCardPress = useCallback(
    (speciesId, speciesData) => {
      navigation.navigate('DexDetail', { speciesId, species: speciesData });
    },
    [navigation]
  );

  const renderHeader = useCallback(
    () => (
      <View>
        {/* Collection Header */}
        <View style={styles.collectionHeader}>
          <View style={styles.progressSection}>
            {/* Main Progress */}
            <Text style={styles.progressTitle}>
              {progress.discovered}
              <Text style={styles.progressTotal}> / {progress.total}</Text>
            </Text>
            <Text style={styles.progressSubtitle}>{t('dex.species')}</Text>

            {/* Progress Bar */}
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBar, { width: `${Math.min(progressPercent, 100)}%` }]} />
            </View>

            {/* Stats Row */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Ionicons name="star" size={16} color={colors.gold} />
                <Text style={styles.statValue}>{progress.firstDiscoveries}</Text>
                <Text style={styles.statLabel}>{t('dex.filters.first')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Ionicons name="leaf" size={16} color={colors.primaryLight} />
                <Text style={styles.statValue}>{progress.discovered}</Text>
                <Text style={styles.statLabel}>{t('dex.filters.discovered')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Ionicons name="lock-closed" size={16} color={colors.textDisabled} />
                <Text style={styles.statValue}>
                  {Math.max(0, progress.total - progress.discovered)}
                </Text>
                <Text style={styles.statLabel}>{t('dex.notDiscovered')}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Filter Chips */}
        <View style={styles.filterContainer}>
          {filterItems.map((item) => (
            <TouchableOpacity
              key={item.value}
              style={[styles.filterChip, filter === item.value && styles.filterChipActive]}
              onPress={() => setFilter(item.value)}
            >
              <Text
                style={[styles.filterChipText, filter === item.value && styles.filterChipTextActive]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    ),
    [progress, progressPercent, filter, filterItems]
  );

  // Show loading / error / empty when no sections
  const renderListEmpty = useCallback(() => {
    if (loading && species.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textDisabled} />
          <Text style={styles.errorText}>{t('common.error')}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadDexData}>
            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="leaf-outline" size={48} color={colors.textDisabled} />
        <Text style={styles.emptyText}>{t('dex.empty')}</Text>
      </View>
    );
  }, [loading, species.length, error, loadDexData]);

  const renderSectionHeader = useCallback(
    ({ section }) => (
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIconBg, { backgroundColor: section.color + '22' }]}>
          <Ionicons name={section.icon} size={18} color={section.color} />
        </View>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionCount}>{section.count}</Text>
      </View>
    ),
    []
  );

  // Each "item" is a pair (row of 2 cards)
  const renderRow = useCallback(
    ({ item: pair }) => (
      <View style={styles.gridRow}>
        {pair.map((sp) => (
          <DexCard
            key={sp.id}
            species={sp}
            discovered={sp.discovered}
            isFirstDiscoverer={sp.isFirstDiscoverer}
            slotNumber={sp.dexNumber}
            onPress={(speciesId) => handleCardPress(speciesId, sp)}
          />
        ))}
        {/* Spacer if odd number of items */}
        {pair.length === 1 && <View style={styles.spacer} />}
      </View>
    ),
    [handleCardPress]
  );

  const keyExtractor = useCallback((pair, idx) => pair[0]?.id || `row-${idx}`, []);

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        renderItem={renderRow}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.gridContainer}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderListEmpty}
        stickySectionHeadersEnabled={false}
        // ── Virtualization tuning ──
        // Render 3 screens worth of items above/below viewport.
        // Default is 21 (≈10 screens) which renders far too many items at once.
        windowSize={7}
        // Render 4 rows per JS frame (= 8 cards) instead of default 10
        maxToRenderPerBatch={4}
        // Start with 6 rows visible (= 12 cards)
        initialNumToRender={6}
        // Keep 2 off-screen rows before unmounting
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primaryLight}
          />
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  /* Collection Header */
  collectionHeader: {
    backgroundColor: colors.primarySurface,
    paddingBottom: spacing.md,
  },
  progressSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    alignItems: 'center',
  },
  progressTitle: {
    fontSize: 42,
    fontWeight: '800',
    color: colors.primary,
  },
  progressTotal: {
    fontSize: 24,
    fontWeight: '400',
    color: colors.textTertiary,
  },
  progressSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
  },

  /* Stats Row — responsive: wraps on narrow screens */
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingBottom: spacing.sm,
  },
  statItem: {
    minWidth: 80,
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.xs,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textTertiary,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },

  /* Filter */
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: colors.surface,
    fontWeight: '600',
  },

  /* Section Headers */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionIconBg: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textTertiary,
    backgroundColor: colors.borderLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },

  /* Grid */
  gridContainer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  gridRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  spacer: {
    flex: 1,
  },

  /* States */
  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxxl,
    minHeight: 200,
    gap: spacing.md,
  },
  errorText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  retryButtonText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 16,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});

export default PlantDexScreen;
