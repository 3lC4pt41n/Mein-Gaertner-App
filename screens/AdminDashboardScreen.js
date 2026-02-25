import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, StyleSheet,
  RefreshControl, TouchableOpacity
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';

// HINWEIS: Dieser Screen ist nur für dich (Admin) gedacht.
// Er liest die daily_stats und user_economics Views.
// Zugriff einschränken: Entweder über eine admin-Flag im Profil
// oder nur in Development-Builds einblenden.

export default function AdminDashboardScreen() {
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
      const activeSubscribers = econ.filter(u => u.plan_status === 'active' && u.current_plan !== 'none').length;
      const totalCreditsUsed = econ.reduce((s, u) => s + (u.total_credits_used || 0), 0);

      setTotals({ totalRevenue, totalCost, totalUsers, activeSubscribers, totalCreditsUsed });
    } catch (e) {
      console.warn('Admin Dashboard laden:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4CAF50" />}
    >
      <Text style={styles.pageTitle}>Admin Dashboard</Text>

      {/* ─── KPI Cards ──────────────────────────────────────── */}
      {totals && (
        <View style={styles.kpiRow}>
          <KPICard
            icon="people" color="#2196F3"
            label="User" value={totals.totalUsers}
          />
          <KPICard
            icon="card" color="#4CAF50"
            label="Revenue" value={`${totals.totalRevenue.toFixed(2)} €`}
          />
          <KPICard
            icon="trending-down" color="#e53935"
            label="OpenAI Cost" value={`$${totals.totalCost.toFixed(2)}`}
          />
          <KPICard
            icon="flash" color="#FF9800"
            label="Credits used" value={totals.totalCreditsUsed}
          />
        </View>
      )}

      {/* Margin */}
      {totals && (
        <View style={[styles.marginCard, {
          backgroundColor: totals.totalRevenue - totals.totalCost > 0 ? '#E8F5E9' : '#FFEBEE'
        }]}>
          <Text style={styles.marginLabel}>Netto-Margin</Text>
          <Text style={[styles.marginValue, {
            color: totals.totalRevenue - totals.totalCost > 0 ? '#4CAF50' : '#e53935'
          }]}>
            {(totals.totalRevenue - totals.totalCost).toFixed(2)} €
          </Text>
          <Text style={styles.marginSub}>
            Abos aktiv: {totals.activeSubscribers} / {totals.totalUsers}
          </Text>
        </View>
      )}

      {/* ─── Tab Switcher ───────────────────────────────────── */}
      <View style={styles.tabRow}>
        {['daily', 'users'].map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'daily' ? 'Tagesstatistik' : 'User-Details'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ─── Daily Stats ────────────────────────────────────── */}
      {tab === 'daily' && (
        <>
          {dailyStats.length === 0 ? (
            <Text style={styles.emptyText}>Noch keine Daten vorhanden.</Text>
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
                    Credits: {day.credits_consumed} | Cost: ${parseFloat(day.openai_cost_usd || 0).toFixed(3)}
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
            <Text style={styles.emptyText}>Noch keine User-Daten.</Text>
          ) : (
            userEconomics.map((u, idx) => {
              const margin = parseFloat(u.total_revenue_eur || 0) - parseFloat(u.total_openai_cost_usd || 0);
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
                      <Text style={[styles.userStatValue, { color: '#4CAF50' }]}>
                        {parseFloat(u.total_revenue_eur || 0).toFixed(2)} €
                      </Text>
                    </View>
                    <View style={styles.userStat}>
                      <Text style={styles.userStatLabel}>Cost</Text>
                      <Text style={[styles.userStatValue, { color: '#e53935' }]}>
                        ${parseFloat(u.total_openai_cost_usd || 0).toFixed(3)}
                      </Text>
                    </View>
                    <View style={styles.userStat}>
                      <Text style={styles.userStatLabel}>Margin</Text>
                      <Text style={[styles.userStatValue, {
                        color: margin >= 0 ? '#4CAF50' : '#e53935'
                      }]}>
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
      <Ionicons name={icon} size={14} color="#666" />
      <Text style={styles.statPillValue}>{value || 0}</Text>
      <Text style={styles.statPillLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pageTitle: {
    fontSize: 22, fontWeight: 'bold', color: '#333',
    margin: 16, marginBottom: 8,
  },

  // KPI
  kpiRow: {
    flexDirection: 'row', flexWrap: 'wrap',
    marginHorizontal: 12, gap: 8,
  },
  kpiCard: {
    flex: 1, minWidth: '45%', backgroundColor: '#fff',
    padding: 14, borderRadius: 12, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  kpiValue: { fontSize: 20, fontWeight: 'bold', color: '#222', marginTop: 4 },
  kpiLabel: { fontSize: 12, color: '#888', marginTop: 2 },

  // Margin
  marginCard: {
    marginHorizontal: 16, marginTop: 12, padding: 16,
    borderRadius: 12, alignItems: 'center',
  },
  marginLabel: { fontSize: 13, color: '#666' },
  marginValue: { fontSize: 28, fontWeight: 'bold', marginVertical: 4 },
  marginSub: { fontSize: 12, color: '#888' },

  // Tabs
  tabRow: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 16,
    backgroundColor: '#ddd', borderRadius: 10, padding: 3,
  },
  tabBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8,
  },
  tabBtnActive: { backgroundColor: '#4CAF50' },
  tabText: { color: '#666', fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: '#fff' },

  // Daily
  dayCard: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 8,
    padding: 14, borderRadius: 10,
  },
  dayDate: { fontWeight: 'bold', fontSize: 15, color: '#333', marginBottom: 8 },
  dayStats: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  dayBottom: { marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#eee', paddingTop: 6 },
  dayCost: { fontSize: 12, color: '#999' },
  statPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f5f5f5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  statPillValue: { fontWeight: 'bold', fontSize: 14, color: '#333' },
  statPillLabel: { fontSize: 11, color: '#888' },

  // Users
  userCard: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 8,
    padding: 14, borderRadius: 10,
  },
  userHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  userId: { fontSize: 14, color: '#666', fontFamily: 'monospace' },
  planBadge: { backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  planText: { color: '#4CAF50', fontSize: 12, fontWeight: 'bold' },
  userStats: { flexDirection: 'row', justifyContent: 'space-between' },
  userStat: { alignItems: 'center' },
  userStatLabel: { fontSize: 11, color: '#999' },
  userStatValue: { fontSize: 15, fontWeight: 'bold', color: '#333' },

  emptyText: { textAlign: 'center', color: '#bbb', padding: 30, fontSize: 15 },
});
