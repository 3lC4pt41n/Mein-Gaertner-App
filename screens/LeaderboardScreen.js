import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Image,
  Share,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getLeaderboard, getMyRank, getMyStats } from '../services/leaderboardService';
import { colors, spacing, radius } from '../theme/tokens';
import DSButton from '../theme/DSButton';
import { t } from '../i18n';
import { useAuth } from '../contexts/AuthContext';

const RANK_ICONS = ['trophy', 'medal', 'ribbon'];
const RANK_COLORS = [colors.gold, colors.silver, colors.bronze];

export default function LeaderboardScreen() {
  const TIME_WINDOWS = [
    { key: 'week', label: t('leaderboard.timeWindows.week') },
    { key: 'month', label: t('leaderboard.timeWindows.month') },
    { key: 'all', label: t('leaderboard.timeWindows.all') },
  ];

  const SCORE_TYPES = [
    { key: 'gardener', label: t('leaderboard.scoreTypes.gardener') },
    { key: 'discovery', label: t('leaderboard.scoreTypes.discovery') },
  ];

  const { userId, profile: authProfile, updateProfile } = useAuth();
  const [timeWindow, setTimeWindow] = useState('week');
  const [scoreType, setScoreType] = useState('gardener');
  const [leaderboard, setLeaderboard] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [myStats, setMyStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [optedIn, setOptedIn] = useState(false);

  useEffect(() => {
    setOptedIn(authProfile?.leaderboard_opt_in ?? false);
  }, [authProfile]);

  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      const [board, rank, stats] = await Promise.all([
        getLeaderboard(timeWindow, scoreType, 50),
        optedIn ? getMyRank(userId, timeWindow, scoreType) : null,
        getMyStats(userId),
      ]);
      setLeaderboard(board);
      setMyRank(rank);
      setMyStats(stats);
    } catch (_e) {
      // Leaderboard load failed silently
    }
  }, [userId, timeWindow, scoreType, optedIn]);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const renderTabBar = (items, selected, onSelect) => (
    <View style={styles.tabBar}>
      {items.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={[styles.tab, selected === item.key && styles.tabActive]}
          onPress={() => onSelect(item.key)}
        >
          <Text style={[styles.tabText, selected === item.key && styles.tabTextActive]}>
            {item.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderItem = ({ item }) => {
    const isMe = item.user_id === userId;
    const isTop3 = item.rank <= 3;

    return (
      <View style={[styles.listItem, isMe && styles.listItemMe]}>
        <View style={styles.rankCol}>
          {isTop3 ? (
            <Ionicons
              name={RANK_ICONS[item.rank - 1]}
              size={22}
              color={RANK_COLORS[item.rank - 1]}
            />
          ) : (
            <Text style={styles.rankText}>{item.rank}.</Text>
          )}
        </View>
        <View style={styles.avatarCol}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
          ) : (
            <Ionicons name="person-circle" size={36} color={colors.textDisabled} />
          )}
        </View>
        <View style={styles.nameCol}>
          <Text style={[styles.nameText, isMe && styles.nameTextMe]} numberOfLines={1}>
            {item.display_name || t('common.anonymous')}
          </Text>
        </View>
        <View style={styles.scoreCol}>
          <Text style={[styles.scoreText, isMe && styles.scoreTextMe]}>
            {formatScore(item.score)} {t('common.points')}
          </Text>
        </View>
      </View>
    );
  };

  const statsKey = scoreType === 'gardener' ? 'gardenerScore' : 'discoveryScore';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="trophy" size={28} color={colors.gold} />
        <Text style={styles.headerTitle}> {t('leaderboard.title')}</Text>
      </View>

      {/* Zeitfenster-Tabs */}
      {renderTabBar(TIME_WINDOWS, timeWindow, setTimeWindow)}

      {/* Score-Typ Tabs */}
      {renderTabBar(SCORE_TYPES, scoreType, setScoreType)}

      {loading ? (
        <ActivityIndicator size="large" color={colors.primaryLight} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={leaderboard}
          keyExtractor={(item) => item.user_id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primaryLight}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="leaf-outline" size={48} color={colors.textDisabled} />
              <Text style={styles.emptyText}>{t('leaderboard.noEntries')}</Text>
            </View>
          }
          ListFooterComponent={
            <View style={{ paddingBottom: spacing.xl }}>
              {/* Mein Rang Karte */}
              {optedIn && myRank && (
                <View style={styles.myRankCard}>
                  <Ionicons name="location" size={20} color={colors.primary} />
                  <Text style={styles.myRankTitle}>
                    {' '}
                    {t('leaderboard.yourRank', { rank: myRank.rank })}
                  </Text>
                  <Text style={styles.myRankScore}>
                    {formatScore(myRank.score)} {t('common.pointsFull')}
                  </Text>
                </View>
              )}

              {/* Eigene Stats (immer sichtbar) */}
              {myStats && (
                <View style={styles.statsCard}>
                  <Text style={styles.statsTitle}>{t('leaderboard.yourStats')}</Text>
                  <View style={styles.statsRow}>
                    <StatItem
                      icon="flame"
                      label={t('leaderboard.streak')}
                      value={t('leaderboard.streakValue', { days: myStats.streak })}
                    />
                    <StatItem
                      icon="star"
                      label={
                        scoreType === 'gardener'
                          ? t('leaderboard.gardenerScore')
                          : t('leaderboard.discoveryScore')
                      }
                      value={formatScore(myStats[statsKey]?.[timeWindow] ?? 0)}
                    />
                    <StatItem
                      icon="leaf"
                      label={t('leaderboard.discovered')}
                      value={myStats.totalDiscoveries}
                    />
                  </View>
                  {scoreType === 'gardener' && (
                    <View style={styles.bonusRow}>
                      <View style={styles.bonusItem}>
                        <Ionicons name="flower-outline" size={16} color={colors.textTertiary} />
                        <Text style={styles.bonusLabel}>
                          {' '}
                          {t('leaderboard.plantCount', { count: myStats.plantCount ?? 0 })}
                        </Text>
                      </View>
                      <View style={styles.bonusItem}>
                        <Ionicons name="heart-outline" size={16} color={colors.textTertiary} />
                        <Text style={styles.bonusLabel}>
                          {' '}
                          {t('leaderboard.avgHealth', {
                            score: myStats.avgHealthScore ?? 0,
                          })}
                        </Text>
                      </View>
                      <View style={styles.bonusItem}>
                        <Ionicons
                          name="trending-up-outline"
                          size={16}
                          color={colors.textTertiary}
                        />
                        <Text style={styles.bonusLabel}>
                          {' '}
                          ×{(myStats.healthMultiplier ?? 1).toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  )}
                  <DSButton
                    variant="ghost"
                    size="sm"
                    icon="share-outline"
                    onPress={async () => {
                      const scoreName =
                        scoreType === 'gardener'
                          ? t('leaderboard.gardenerScore')
                          : t('leaderboard.discoveryScore');
                      const scoreVal = formatScore(myStats[statsKey]?.[timeWindow] ?? 0);
                      try {
                        await Share.share({
                          message: `🌱 ${scoreName}: ${scoreVal} ${t('common.pointsFull')} | ${t('leaderboard.streakValue', { days: myStats.streak })} Streak | ${myStats.totalDiscoveries} ${t('leaderboard.discovered')} — Digitaler Gärtner`,
                        });
                      } catch (error) {
                        const cancelled =
                          error?.code === 'ERR_CANCELED' || error?.message === 'User did not share';
                        if (!cancelled) {
                          Alert.alert(t('common.error'), t('common.shareFailed'));
                        }
                      }
                    }}
                    style={{ marginTop: spacing.sm, alignSelf: 'center' }}
                  >
                    {t('common.share') || 'Teilen'}
                  </DSButton>
                </View>
              )}

              {/* Opt-in CTA */}
              {!optedIn && (
                <View style={styles.optInCard}>
                  <Ionicons name="information-circle-outline" size={24} color={colors.warning} />
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={styles.optInTitle}>{t('leaderboard.notInRanking')}</Text>
                    <Text style={styles.optInText}>{t('leaderboard.optInMessage')}</Text>
                    <DSButton
                      variant="primary"
                      size="sm"
                      icon="trophy-outline"
                      onPress={async () => {
                        try {
                          await updateProfile({ leaderboard_opt_in: true });
                          setOptedIn(true);
                        } catch (_e) {
                          // Opt-in failed silently
                        }
                      }}
                      style={{ marginTop: spacing.sm }}
                    >
                      {t('leaderboard.joinButton')}
                    </DSButton>
                  </View>
                </View>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

function StatItem({ icon, label, value }) {
  return (
    <View style={styles.statItem}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function formatScore(score) {
  if (typeof score !== 'number') return '0';
  return score % 1 === 0 ? String(score) : score.toFixed(1);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 50,
    paddingBottom: spacing.sm,
  },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: colors.textPrimary },

  // Tab Bar
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  tab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.divider,
  },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  tabTextActive: { color: colors.surface, fontWeight: '600' },

  // List Items
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  listItemMe: { backgroundColor: colors.primarySurface },
  rankCol: { width: 36, alignItems: 'center' },
  rankText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  avatarCol: { width: 44, alignItems: 'center' },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  nameCol: { flex: 1, paddingHorizontal: spacing.sm },
  nameText: { fontSize: 14, color: colors.textPrimary },
  nameTextMe: { fontWeight: 'bold', color: colors.primary },
  scoreCol: { alignItems: 'flex-end' },
  scoreText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  scoreTextMe: { color: colors.primary },

  // Empty State
  emptyContainer: { alignItems: 'center', paddingTop: 60 },
  emptyText: { marginTop: spacing.md, color: colors.textTertiary, fontSize: 14 },

  // My Rank Card
  myRankCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.primarySurface,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  myRankTitle: { fontSize: 16, fontWeight: 'bold', color: colors.primary },
  myRankScore: { fontSize: 14, color: colors.primary, marginLeft: 'auto' },

  // Stats Card
  statsCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  statsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', gap: spacing.xs },
  statValue: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary },
  statLabel: { fontSize: 12, color: colors.textTertiary },
  bonusRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  bonusItem: { flexDirection: 'row', alignItems: 'center' },
  bonusLabel: { fontSize: 11, color: colors.textTertiary },

  // Opt-in CTA
  optInCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.warningSurface,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  optInTitle: { fontWeight: 'bold', fontSize: 14, color: colors.warning },
  optInText: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
});
