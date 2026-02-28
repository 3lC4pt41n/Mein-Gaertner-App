import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { getLeaderboard, getMyRank, getMyStats } from '../services/leaderboardService';
import { colors, spacing, radius } from '../theme';

const TIME_WINDOWS = [
  { key: 'week', label: 'Woche' },
  { key: 'month', label: 'Monat' },
  { key: 'all', label: 'Gesamt' },
];

const SCORE_TYPES = [
  { key: 'gardener', label: 'Gärtner' },
  { key: 'discovery', label: 'Entdecker' },
];

const RANK_ICONS = ['trophy', 'medal', 'ribbon'];
const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

export default function LeaderboardScreen() {
  const [userId, setUserId] = useState(null);
  const [timeWindow, setTimeWindow] = useState('week');
  const [scoreType, setScoreType] = useState('gardener');
  const [leaderboard, setLeaderboard] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [myStats, setMyStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [optedIn, setOptedIn] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        // Check Opt-in Status
        const { data: profile } = await supabase
          .from('profiles')
          .select('leaderboard_opt_in')
          .eq('id', user.id)
          .single();
        setOptedIn(profile?.leaderboard_opt_in ?? false);
      }
    })();
  }, []);

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
    } catch (e) {
      console.warn('Leaderboard load error:', e.message);
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
      {items.map(item => (
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
            {item.display_name || 'Anonym'}
          </Text>
        </View>
        <View style={styles.scoreCol}>
          <Text style={[styles.scoreText, isMe && styles.scoreTextMe]}>
            {formatScore(item.score)} Pkt
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
        <Ionicons name="trophy" size={28} color="#FFD700" />
        <Text style={styles.headerTitle}> Rangliste</Text>
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
          keyExtractor={item => item.user_id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryLight} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="leaf-outline" size={48} color={colors.textDisabled} />
              <Text style={styles.emptyText}>Noch keine Einträge im Ranking.</Text>
            </View>
          }
          ListFooterComponent={
            <View style={{ paddingBottom: spacing.xl }}>
              {/* Mein Rang Karte */}
              {optedIn && myRank && (
                <View style={styles.myRankCard}>
                  <Ionicons name="location" size={20} color={colors.primaryLight} />
                  <Text style={styles.myRankTitle}> Dein Rang: #{myRank.rank}</Text>
                  <Text style={styles.myRankScore}>
                    {formatScore(myRank.score)} Punkte
                  </Text>
                </View>
              )}

              {/* Eigene Stats (immer sichtbar) */}
              {myStats && (
                <View style={styles.statsCard}>
                  <Text style={styles.statsTitle}>Deine Statistiken</Text>
                  <View style={styles.statsRow}>
                    <StatItem
                      icon="flame"
                      label="Streak"
                      value={`${myStats.streak} Tage`}
                    />
                    <StatItem
                      icon="star"
                      label={scoreType === 'gardener' ? 'Gärtner-Score' : 'Entdecker-Score'}
                      value={formatScore(myStats[statsKey]?.[timeWindow] ?? 0)}
                    />
                    <StatItem
                      icon="leaf"
                      label="Entdeckt"
                      value={myStats.totalDiscoveries}
                    />
                  </View>
                </View>
              )}

              {/* Opt-in CTA */}
              {!optedIn && (
                <View style={styles.optInCard}>
                  <Ionicons name="information-circle-outline" size={24} color={colors.warning} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.optInTitle}>Nicht im Ranking?</Text>
                    <Text style={styles.optInText}>
                      Aktiviere die Rangliste in deinem Profil, um dich mit anderen zu messen.
                    </Text>
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
      <Ionicons name={icon} size={20} color={colors.primaryLight} />
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
    paddingBottom: 10,
  },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: colors.textPrimary },

  // Tab Bar
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    gap: spacing.sm,
  },
  tab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.divider,
  },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  tabTextActive: { color: colors.surface, fontWeight: '600' },

  // List Items
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  listItemMe: { backgroundColor: colors.primarySurface },
  rankCol: { width: 36, alignItems: 'center' },
  rankText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  avatarCol: { width: 44, alignItems: 'center' },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  nameCol: { flex: 1, paddingHorizontal: 10 },
  nameText: { fontSize: 15, color: colors.textPrimary },
  nameTextMe: { fontWeight: 'bold', color: colors.primary },
  scoreCol: { alignItems: 'flex-end' },
  scoreText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  scoreTextMe: { color: colors.primary },

  // Empty State
  emptyContainer: { alignItems: 'center', paddingTop: 60 },
  emptyText: { marginTop: spacing.md, color: colors.textTertiary, fontSize: 15 },

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
  statsTitle: { fontSize: 15, fontWeight: 'bold', color: colors.textPrimary, marginBottom: spacing.md },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', gap: spacing.xs },
  statValue: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary },
  statLabel: { fontSize: 11, color: colors.textTertiary },

  // Opt-in CTA
  optInCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: 14,
    backgroundColor: '#FFF8E1',
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  optInTitle: { fontWeight: 'bold', fontSize: 14, color: '#F57C00' },
  optInText: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
