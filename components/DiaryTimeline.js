import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchDiaryEntries } from '../services/diaryService';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import { t } from '../i18n';

const typeIcons = {
  manual: '📝',
  healthcheck: '💚',
  task: '✅',
  discovery: '🌱',
};

const typeBorderColors = {
  manual: colors.primary,
  healthcheck: colors.success,
  task: colors.warning,
  discovery: colors.info,
};

export default function DiaryTimeline({ plantId }) {
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);

  const loadEntries = useCallback(
    async (pageNum) => {
      try {
        setLoading(true);
        const { entries: newEntries, total: totalCount, hasMore: more } = await fetchDiaryEntries(
          plantId,
          pageNum,
          20
        );
        if (pageNum === 0) {
          setEntries(newEntries);
        } else {
          setEntries((prev) => [...prev, ...newEntries]);
        }
        setTotal(totalCount);
        setHasMore(more);
        setPage(pageNum);
      } catch (error) {
        // Load diary entries failed
      } finally {
        setLoading(false);
      }
    },
    [plantId]
  );

  useEffect(() => {
    loadEntries(0);
  }, [plantId, loadEntries]);

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      loadEntries(page + 1);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (date.toDateString() === yesterday.toDateString()) {
      return t('diary.yesterday');
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const renderEntry = ({ item }) => (
    <View
      style={[
        styles.entryContainer,
        item.type === 'manual' && styles.entryManual,
        { borderLeftColor: typeBorderColors[item.type] || colors.border },
      ]}
    >
      <View style={styles.entryHeader}>
        <Text style={styles.typeIcon}>{typeIcons[item.type] || '📌'}</Text>
        <View style={styles.headerContent}>
          <Text style={styles.entryTitle}>{item.title}</Text>
          <Text style={styles.entryDate}>{formatDate(item.created_at)}</Text>
        </View>
      </View>

      {item.note && (
        <Text
          style={[
            styles.entryNote,
            item.type === 'manual' ? styles.entryNoteLarge : styles.entryNoteSmall,
          ]}
          numberOfLines={item.type === 'manual' ? 4 : 2}
        >
          {item.note}
        </Text>
      )}

      {item.image_url && (
        <Image
          source={{ uri: item.image_url }}
          style={[
            styles.entryImage,
            item.type === 'manual' && styles.entryImageLarge,
          ]}
          resizeMode="cover"
        />
      )}
    </View>
  );

  const renderFooter = () => {
    if (!loading && !hasMore && entries.length > 0) {
      return (
        <View style={styles.footerContainer}>
          <Text style={styles.footerText}>
            {t('diary.endOfList')} · {total} {t('diary.entries')}
          </Text>
        </View>
      );
    }

    if (loading && page === 0) {
      return (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    if (loading && page > 0) {
      return (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      );
    }

    if (!loading && hasMore) {
      return (
        <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMore}>
          <Text style={styles.loadMoreText}>{t('diary.loadMore')}</Text>
        </TouchableOpacity>
      );
    }

    return null;
  };

  if (loading && page === 0) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!loading && entries.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="document-text-outline" size={48} color={colors.textSecondary} />
        <Text style={styles.emptyText}>{t('diary.noEntries')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={entries}
      keyExtractor={(item) => item.id.toString()}
      renderItem={renderEntry}
      ListFooterComponent={renderFooter}
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.5}
      scrollEventThrottle={16}
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  entryContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    ...shadows.sm,
  },
  entryManual: {
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  typeIcon: {
    fontSize: 20,
    marginRight: spacing.md,
    marginTop: 2,
  },
  headerContent: {
    flex: 1,
  },
  entryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  entryDate: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  entryNote: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  entryNoteLarge: {
    fontSize: 15,
    fontWeight: '500',
  },
  entryNoteSmall: {
    fontSize: 13,
    fontWeight: '400',
  },
  entryImage: {
    height: 150,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  entryImageLarge: {
    height: 220,
    marginTop: spacing.md,
  },
  loadMoreButton: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  loaderContainer: {
    paddingVertical: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerContainer: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    marginTop: spacing.md,
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
