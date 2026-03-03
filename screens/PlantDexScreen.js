import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { fetchDex, getDexProgress } from '../services/dexService';
import DexCard from '../components/DexCard';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import { t } from '../i18n';
import { useAuth } from '../contexts/AuthContext';

const PlantDexScreen = () => {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [species, setSpecies] = useState([]);
  const [progress, setProgress] = useState({ total: 0, discovered: 0, firstDiscoveries: 0 });
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDexData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const [dexData, progressData] = await Promise.all([
        fetchDex(user.id, filter),
        getDexProgress(user.id),
      ]);
      setSpecies(dexData);
      setProgress(progressData);
    } catch (err) {
      console.error('Error loading Dex data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user, filter]);

  useFocusEffect(
    useCallback(() => {
      loadDexData();
    }, [loadDexData])
  );

  const progressPercent = progress.total > 0 ? (progress.discovered / progress.total) * 100 : 0;

  const filterOptions = [
    { label: t('dex.filters.all'), value: 'all' },
    { label: t('dex.filters.discovered'), value: 'discovered' },
    { label: t('dex.filters.first'), value: 'first' },
  ];

  const renderFilterChip = (option) => (
    <TouchableOpacity
      key={option.value}
      style={[
        styles.filterChip,
        filter === option.value && styles.filterChipActive,
      ]}
      onPress={() => setFilter(option.value)}
    >
      <Text
        style={[
          styles.filterChipText,
          filter === option.value && styles.filterChipTextActive,
        ]}
      >
        {option.label}
      </Text>
    </TouchableOpacity>
  );

  const renderSpeciesGrid = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{t('common.error')}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadDexData}>
            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (species.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>{t('dex.empty')}</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={species}
        renderItem={({ item }) => (
          <DexCard
            species={item}
            discovered={item.discovered}
            isFirstDiscoverer={item.isFirstDiscoverer}
            onPress={(speciesId) => navigation.navigate('DexDetail', { speciesId, species: item })}
          />
        )}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.gridContainer}
      />
    );
  };

  return (
    <View style={styles.container}>
      {/* Progress Section */}
      <View style={styles.progressSection}>
        <Text style={styles.progressLabel}>
          {progress.discovered}/{progress.total} {t('dex.species')}
        </Text>
        <View style={styles.progressBarContainer}>
          <View
            style={[
              styles.progressBar,
              { width: `${progressPercent}%` },
            ]}
          />
        </View>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        {filterOptions.map(renderFilterChip)}
      </View>

      {/* Species Grid */}
      {renderSpeciesGrid()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  progressSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.primarySurface,
  },
  progressLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  progressBarContainer: {
    height: 12,
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
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
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: colors.surface,
  },
  gridContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  gridRow: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  errorText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
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
