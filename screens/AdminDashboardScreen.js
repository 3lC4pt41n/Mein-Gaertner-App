import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import { t } from '../i18n';
import { useAuth } from '../contexts/AuthContext';

// Admin Dashboard – nur für User mit is_admin = true.
// Doppelte Absicherung: Frontend-Check + DB-Views geben nur
// Daten zurück wenn is_admin() = true (siehe Migration).

export default function AdminDashboardScreen() {
  const { isAdmin: authorized, loading: authLoading } = useAuth();
  const [dailyStats, setDailyStats] = useState([]);
  const [userEconomics, setUserEconomics] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('overview'); // 'overview' | 'users' | 'daily'

  const loadData = useCallback(async () => {
    try {
      const [statsRes, econRes] = await Promise.all([
        supabase.from('daily_stats').select('*').order('day', { ascending: false }).limit(14),
        supabase.from('user_economics').select('*'),
      ]);

      const stats = statsRes.data || [];
      const econ = econRes.data || [];

      setDailyStats(stats);
      setUserEconomics(econ);

      // Totals berechnen
      const totalRevenue = econ.reduce((s, u) => s + parseFloat(u.total_revenue_eur || 0), 0);
      const totalCost = econ.reduce((s, u) => s + parseFloat(u.total_openai_cost_usd || 0), 0);
      const totalUsers = econ.length;
      const activeSubscribers = econ.filter(
        (u) => u.plan_status === 'active' && u.current_plan !== 'none'
      ).length;
      const totalCreditsUsed = econ.reduce((s, u) => s + (u.total_credits_used || 0), 0);

      setTotals({ totalRevenue, totalCost, totalUsers, activeSubscribers, totalCreditsUsed });
    } catch (e) {
      console.warn('Admin Dashboard laden:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (authorized) loadData();
  }, [authorized, loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (authLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primaryLight} />
      </View>
    );
  }

  if (!authorized) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed" size={48} color={colors.textDisabled} />
        <Text style={{ color: colors.textTertiary, marginTop: spacing.md, fontSize: 16 }}>
          {t('common.noAccess')}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primaryLight}
        />
      }
    >
      <Text style={styles.pageTitle}>{t('admin.title')}</Text>

      {/* ─── KPI Cards ──────────────────────────────────────── */}
      {totals && (
        <View style={styles.kpiRow}>
          <KPICard icon="people" color={colors.info} label="User" value={totals.totalUsers} />
          <KPICard
            icon="card"
            color={colors.primary}
            label="Revenue"
            value={`${totals.totalRevenue.toFixed(2)} €`}
          />
          <KPICard
            icon="trending-down"
            color={colors.danger}
            label="OpenAI Cost"
            value={`$${totals.totalCost.toFixed(2)}`}
          />
          <KPICard
            icon="flash"
            color={colors.warning}
            label="Credits used"
            value={totals.totalCreditsUsed}
          />
        </View>
      )}

      {/* Margin */}
      {totals && (
        <View
          style={[
            styles.marginCard,
            {
              backgroundColor:
                totals.totalRevenue - totals.totalCost > 0
                  ? colors.primarySurface
                  : colors.dangerSurface,
            },
          ]}
        >
          <Text style={styles.marginLabel}>{t('admin.netMargin')}</Text>
          <Text
            style={[
              styles.marginValue,
              {
                color: totals.totalRevenue - totals.totalCost > 0 ? colors.primary : colors.danger,
              },
            ]}
          >
            {(totals.totalRevenue - totals.totalCost).toFixed(2)} €
          </Text>
          <Text style={styles.marginSub}>
            {t('admin.activeSubscriptions', {
              active: totals.activeSubscribers,
              total: totals.totalUsers,
            })}
          </Text>
        </View>
      )}

      {/* ─── Tab Switcher ───────────────────────────────────── */}
      <View style={styles.tabRow}>
        {['daily', 'users'].map((tabKey) => (
          <TouchableOpacity
            key={tabKey}
            style={[styles.tabBtn, tab === tabKey && styles.tabBtnActive]}
            onPress={() => setTab(tabKey)}
          >
            <Text style={[styles.tabText, tab === tabKey && styles.tabTextActive]}>
              {tabKey === 'daily' ? t('admin.dailyTab') : t('admin.usersTab')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ─── Daily Stats ────────────────────────────────────── */}
      {tab === 'daily' && (
        <>
          {dailyStats.length === 0 ? (
            <Text style={styles.emptyText}>{t('admin.noData')}</Text>
          ) : (
            dailyStats.map((day, idx) => (
              <View key={day.day || idx} style={styles.dayCard}>
                <Text style={styles.dayDate}>{day.day}</Text>
                <View style={styles.dayStats}>
                  <StatPill icon="people" value={day.active_users} label="User" />
                  <StatPill icon="camera" value={day.scans} label="Scans" />
                  <StatPill icon="chatbox" value={day.chats} label="Chats" />
                  <StatPill icon="heart" value={day.healthchecks} label="HC" />
                </View>
                <View style={styles.dayBottom}>
                  <Text style={styles.dayCost}>
                    Credits: {day.credits_consumed} | Cost: $
                    {parseFloat(day.openai_cost_usd || 0).toFixed(3)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </>
      )}

      {/* ─── User Economics ─────────────────────────────────── */}
      {tab === 'users' && (
        <>
          {userEconomics.length === 0 ? (
            <Text style={styles.emptyText}>{t('admin.noUserData')}</Text>
          ) : (
            userEconomics.map((u, idx) => {
              const margin =
                parseFloat(u.total_revenue_eur || 0) - parseFloat(u.total_openai_cost_usd || 0);
              return (
                <View key={u.user_id || idx} style={styles.userCard}>
                  <View style={styles.userHeader}>
                    <Text style={styles.userId} numberOfLines={1}>
                      {u.user_id?.substring(0, 8)}...
                    </Text>
                    {u.current_plan && u.current_plan !== 'none' && (
                      <View style={styles.planBadge}>
                        <Text style={styles.planText}>{u.current_plan}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.userStats}>
                    <View style={styles.userStat}>
                      <Text style={styles.userStatLabel}>Balance</Text>
                      <Text style={styles.userStatValue}>{u.current_balance}</Text>
                    </View>
                    <View style={styles.userStat}>
                      <Text style={styles.userStatLabel}>Revenue</Text>
                      <Text style={[styles.userStatValue, { color: colors.primary }]}>
                        {parseFloat(u.total_revenue_eur || 0).toFixed(2)} €
                      </Text>
                    </View>
                    <View style={styles.userStat}>
                      <Text style={styles.userStatLabel}>Cost</Text>
                      <Text style={[styles.userStatValue, { color: colors.danger }]}>
                        ${parseFloat(u.total_openai_cost_usd || 0).toFixed(3)}
                      </Text>
                    </View>
                    <View style={styles.userStat}>
                      <Text style={styles.userStatLabel}>Margin</Text>
                      <Text
                        style={[
                          styles.userStatValue,
                          {
                            color: margin >= 0 ? colors.primary : colors.danger,
                          },
                        ]}
                      >
                        {margin.toFixed(2)} €
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Sub-Komponenten ──────────────────────────────────────────
function KPICard({ icon, color, label, value }) {
  return (
    <View style={styles.kpiCard}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function StatPill({ icon, value, label }) {
  return (
    <View style={styles.statPill}>
      <Ionicons name={icon} size={14} color={colors.textSecondary} />
      <Text style={styles.statPillValue}>{value || 0}</Text>
      <Text style={styles.statPillLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pageTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.textPrimary,
    margin: spacing.lg,
    marginBottom: spacing.sm,
  },

  // KPI
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: spacing.md,
    gap: spacing.sm,
  },
  kpiCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    ...shadows.sm,
  },
  kpiValue: { fontSize: 20, fontWeight: 'bold', color: colors.textPrimary, marginTop: spacing.xs },
  kpiLabel: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },

  // Margin
  marginCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  marginLabel: { fontSize: 12, color: colors.textSecondary },
  marginValue: { fontSize: 28, fontWeight: 'bold', marginVertical: spacing.xs },
  marginSub: { fontSize: 12, color: colors.textTertiary },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.border,
    borderRadius: radius.md,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  tabBtnActive: { backgroundColor: colors.primary },
  tabText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: colors.surface },

  // Daily
  dayCard: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: 14,
    borderRadius: radius.md,
  },
  dayDate: {
    fontWeight: 'bold',
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  dayStats: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  dayBottom: {
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
    paddingTop: 6,
  },
  dayCost: { fontSize: 12, color: colors.textTertiary },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  statPillValue: { fontWeight: 'bold', fontSize: 14, color: colors.textPrimary },
  statPillLabel: { fontSize: 12, color: colors.textTertiary },

  // Users
  userCard: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: 14,
    borderRadius: radius.md,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  userId: { fontSize: 14, color: colors.textSecondary, fontFamily: 'monospace' },
  planBadge: {
    backgroundColor: colors.primarySurface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  planText: { color: colors.primary, fontSize: 12, fontWeight: 'bold' },
  userStats: { flexDirection: 'row', justifyContent: 'space-between' },
  userStat: { alignItems: 'center' },
  userStatLabel: { fontSize: 12, color: colors.textTertiary },
  userStatValue: { fontSize: 14, fontWeight: 'bold', color: colors.textPrimary },

  emptyText: { textAlign: 'center', color: colors.textDisabled, padding: 30, fontSize: 14 },
});
