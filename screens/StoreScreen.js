import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, StyleSheet, RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchBalance, fetchSubscription, fetchUsageHistory, fetchTransactions } from '../services/creditService';
import {
  ONE_TIME_PACKAGES, SUBSCRIPTION_PACKAGES,
  getOfferings, purchasePackage, openManageSubscriptions, restorePurchases
} from '../services/purchaseService';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, radius, shadows } from '../theme';

export default function StoreScreen({ isAdmin }) {
  const navigation = useNavigation();
  const [balance, setBalance] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [recentUsage, setRecentUsage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null); // welches Paket gerade kauft
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('packages'); // 'packages' | 'usage'

  const loadData = useCallback(async () => {
    try {
      const [bal, sub, usage] = await Promise.all([
        fetchBalance(),
        fetchSubscription().catch(() => null),
        fetchUsageHistory(20).catch(() => []),
      ]);
      setBalance(bal);
      setSubscription(sub);
      setRecentUsage(usage);
    } catch (e) {
      console.warn('Store Daten laden:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  // ─── Kauf-Handler ───────────────────────────────────────────
  const handlePurchase = async (pkg) => {
    setPurchasing(pkg.id);
    try {
      // RevenueCat Offerings laden und passendes Package finden
      const offerings = await getOfferings();
      if (!offerings?.current?.availablePackages) {
        // Fallback: Direkt über Product ID (für Development)
        Alert.alert(
          "Store nicht verfügbar",
          "In-App-Käufe sind in der Entwicklungsumgebung nicht verfügbar.\n\nDies funktioniert erst nach dem Build mit EAS und Store-Konfiguration.",
          [{ text: "OK" }]
        );
        return;
      }

      const rcPackage = offerings.current.availablePackages.find(
        p => p.product.identifier === pkg.id
      );

      if (!rcPackage) {
        Alert.alert("Fehler", `Paket "${pkg.name}" nicht im Store gefunden.`);
        return;
      }

      const result = await purchasePackage(rcPackage);

      if (result.success) {
        Alert.alert(
          "Kauf erfolgreich! 🎉",
          `${pkg.credits} Credits wurden deinem Konto gutgeschrieben.`,
          [{ text: "Super!" }]
        );
        // Balance neu laden (Webhook verarbeitet die Credits)
        setTimeout(loadData, 2000);
      } else if (result.cancelled) {
        // User hat abgebrochen – nichts tun
      }
    } catch (e) {
      Alert.alert("Kauf fehlgeschlagen", e.message);
    } finally {
      setPurchasing(null);
    }
  };

  // ─── Restore Handler ───────────────────────────────────────
  const handleRestore = async () => {
    try {
      await restorePurchases();
      Alert.alert("Wiederhergestellt", "Deine Käufe wurden wiederhergestellt.");
      loadData();
    } catch (e) {
      Alert.alert("Fehler", e.message);
    }
  };

  // ─── Action Labels für Usage ───────────────────────────────
  const actionLabels = {
    plant_scan: '🌱 Pflanze erkannt',
    plant_details: '📋 Details generiert',
    healthcheck: '💚 Healthcheck',
    chat: '💬 Chat mit Ben',
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primaryLight} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryLight} />}
    >
      {/* ─── Balance Header ─────────────────────────────────── */}
      <View style={styles.balanceCard}>
        <Ionicons name="flash" size={32} color={colors.primaryLight} />
        <View style={{ marginLeft: spacing.md, flex: 1 }}>
          <Text style={styles.balanceLabel}>Dein Guthaben</Text>
          <Text style={styles.balanceValue}>{balance ?? 0} Credits</Text>
        </View>
        {subscription?.plan && subscription.plan !== 'none' && (
          <View style={styles.subBadge}>
            <Text style={styles.subBadgeText}>
              {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)}
            </Text>
          </View>
        )}
      </View>

      {/* ─── Aktives Abo Info ───────────────────────────────── */}
      {subscription?.status === 'active' && subscription?.plan !== 'none' && (
        <View style={styles.activeSubCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="checkmark-circle" size={20} color={colors.primaryLight} />
            <Text style={styles.activeSubText}>
              Abo aktiv: <Text style={{ fontWeight: 'bold' }}>
                {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)}
              </Text>
            </Text>
          </View>
          <TouchableOpacity onPress={openManageSubscriptions}>
            <Text style={styles.manageLink}>Verwalten</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Tab-Switcher ───────────────────────────────────── */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'packages' && styles.tabBtnActive]}
          onPress={() => setTab('packages')}
        >
          <Ionicons name="cart-outline" size={18} color={tab === 'packages' ? colors.surface : colors.textSecondary} />
          <Text style={[styles.tabText, tab === 'packages' && styles.tabTextActive]}>
            Shop
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'usage' && styles.tabBtnActive]}
          onPress={() => setTab('usage')}
        >
          <Ionicons name="bar-chart-outline" size={18} color={tab === 'usage' ? colors.surface : colors.textSecondary} />
          <Text style={[styles.tabText, tab === 'usage' && styles.tabTextActive]}>
            Verbrauch
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'packages' ? (
        <>
          {/* ─── Abo-Pakete ──────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Monatliches Abo</Text>
          <Text style={styles.sectionSubtitle}>
            33% günstiger als Einmalkauf – jeden Monat frische Credits
          </Text>
          {SUBSCRIPTION_PACKAGES.map(pkg => (
            <TouchableOpacity
              key={pkg.id}
              style={[styles.packageCard, pkg.popular && styles.packageCardPopular]}
              onPress={() => handlePurchase(pkg)}
              disabled={purchasing !== null}
            >
              {pkg.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>Beliebt</Text>
                </View>
              )}
              <View style={styles.packageHeader}>
                <Text style={styles.packageName}>{pkg.name}</Text>
                <Text style={styles.packagePrice}>{pkg.price}</Text>
              </View>
              <View style={styles.packageDetails}>
                <Text style={styles.packageCredits}>
                  <Ionicons name="flash" size={14} color={colors.primaryLight} /> {pkg.credits} Credits/Monat
                </Text>
                <Text style={styles.packageDesc}>{pkg.description}</Text>
              </View>
              {purchasing === pkg.id && (
                <ActivityIndicator size="small" color={colors.primaryLight} style={{ marginTop: spacing.sm }} />
              )}
            </TouchableOpacity>
          ))}

          {/* ─── Einmalkauf-Pakete ────────────────────────────── */}
          <Text style={[styles.sectionTitle, { marginTop: spacing.xxl }]}>Einmalkauf</Text>
          <Text style={styles.sectionSubtitle}>
            Credits ohne Abo – nie ablaufend
          </Text>
          {ONE_TIME_PACKAGES.map(pkg => (
            <TouchableOpacity
              key={pkg.id}
              style={[styles.packageCard, pkg.popular && styles.packageCardPopular]}
              onPress={() => handlePurchase(pkg)}
              disabled={purchasing !== null}
            >
              {pkg.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>Bestes Angebot</Text>
                </View>
              )}
              <View style={styles.packageHeader}>
                <Text style={styles.packageName}>{pkg.name}</Text>
                <Text style={styles.packagePrice}>{pkg.price}</Text>
              </View>
              <View style={styles.packageDetails}>
                <Text style={styles.packageCredits}>
                  <Ionicons name="flash" size={14} color={colors.primaryLight} /> {pkg.credits} Credits
                </Text>
                <Text style={styles.packageDesc}>{pkg.description}</Text>
              </View>
              {purchasing === pkg.id && (
                <ActivityIndicator size="small" color={colors.primaryLight} style={{ marginTop: spacing.sm }} />
              )}
            </TouchableOpacity>
          ))}

          {/* ─── Restore & Info ───────────────────────────────── */}
          <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore}>
            <Text style={styles.restoreText}>Käufe wiederherstellen</Text>
          </TouchableOpacity>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textTertiary} />
            <Text style={styles.infoText}>
              Credits werden für KI-Funktionen verbraucht: Pflanzen-Erkennung, Healthchecks und Chat mit Ben.
              Abo-Credits sind 33% günstiger und werden monatlich aufgefüllt.
            </Text>
          </View>
        </>
      ) : (
        <>
          {/* ─── Usage Tab ───────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Letzter Verbrauch</Text>
          {recentUsage.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="leaf-outline" size={48} color={colors.textDisabled} />
              <Text style={styles.emptyText}>Noch keine KI-Nutzung</Text>
            </View>
          ) : (
            recentUsage.map((item, idx) => (
              <View key={item.id || idx} style={styles.usageRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.usageAction}>
                    {actionLabels[item.action] || item.action}
                  </Text>
                  <Text style={styles.usageDate}>
                    {new Date(item.created_at).toLocaleDateString('de-DE', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </Text>
                </View>
                <Text style={styles.usageCredits}>-{item.cost_credits}</Text>
              </View>
            ))
          )}
        </>
      )}

      {/* ─── Admin Dashboard (nur für Admins) ─────────────── */}
      {isAdmin && (
        <TouchableOpacity
          style={styles.adminBtn}
          onPress={() => navigation.navigate('AdminDashboard')}
        >
          <Ionicons name="stats-chart" size={16} color={colors.textTertiary} />
          <Text style={styles.adminBtnText}>Admin Dashboard</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Balance
  balanceCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, margin: spacing.lg, marginBottom: spacing.sm,
    padding: spacing.xl, borderRadius: radius.lg,
    ...shadows.md,
  },
  balanceLabel: { color: colors.textTertiary, fontSize: 13 },
  balanceValue: { fontSize: 28, fontWeight: 'bold', color: colors.textPrimary },
  subBadge: {
    backgroundColor: colors.primarySurface, paddingHorizontal: 10, paddingVertical: spacing.xs, borderRadius: radius.md,
  },
  subBadgeText: { color: colors.primary, fontWeight: 'bold', fontSize: 12 },

  // Active Sub
  activeSubCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.primarySurface, marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    padding: spacing.md, borderRadius: radius.md,
  },
  activeSubText: { color: colors.textPrimary, marginLeft: 6, fontSize: 14 },
  manageLink: { color: colors.primary, fontWeight: 'bold', fontSize: 13 },

  // Tabs
  tabRow: {
    flexDirection: 'row', marginHorizontal: spacing.lg, marginVertical: spacing.sm,
    backgroundColor: colors.borderLight, borderRadius: radius.md, padding: 3,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: radius.md, gap: 6,
  },
  tabBtnActive: { backgroundColor: colors.primary },
  tabText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: colors.surface },

  // Section
  sectionTitle: {
    fontSize: 18, fontWeight: 'bold', color: colors.textPrimary,
    marginHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 13, color: colors.textTertiary, marginHorizontal: spacing.lg, marginBottom: 10,
  },

  // Packages
  packageCard: {
    backgroundColor: colors.surface, marginHorizontal: spacing.lg, marginBottom: 10,
    padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.borderLight,
    ...shadows.sm,
  },
  packageCardPopular: { borderColor: colors.primary, borderWidth: 2 },
  popularBadge: {
    position: 'absolute', top: -10, right: spacing.lg,
    backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: radius.sm,
  },
  popularText: { color: colors.surface, fontSize: 11, fontWeight: 'bold' },
  packageHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 6,
  },
  packageName: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary },
  packagePrice: { fontSize: 17, fontWeight: 'bold', color: colors.primary },
  packageDetails: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  packageCredits: { fontSize: 14, color: colors.textSecondary },
  packageDesc: { fontSize: 13, color: colors.textTertiary },

  // Restore
  restoreBtn: { alignSelf: 'center', marginTop: spacing.xl, padding: 10 },
  restoreText: { color: colors.textTertiary, fontSize: 13, textDecorationLine: 'underline' },

  // Info Box
  infoBox: {
    flexDirection: 'row', backgroundColor: colors.background, margin: spacing.lg,
    padding: spacing.md, borderRadius: radius.md, gap: spacing.sm,
  },
  infoText: { flex: 1, color: colors.textTertiary, fontSize: 12, lineHeight: 18 },

  // Usage
  usageRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, marginHorizontal: spacing.lg, marginBottom: 6,
    padding: 14, borderRadius: radius.md,
  },
  usageAction: { fontSize: 15, color: colors.textPrimary, fontWeight: '500' },
  usageDate: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  usageCredits: { fontSize: 16, fontWeight: 'bold', color: colors.danger },

  // Empty State
  emptyState: { alignItems: 'center', padding: 40 },
  emptyText: { color: colors.textDisabled, marginTop: 10, fontSize: 15 },

  // Admin
  adminBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: spacing.xl, padding: 10,
  },
  adminBtnText: { color: colors.textDisabled, fontSize: 12 },
});
