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
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4CAF50" />}
    >
      {/* ─── Balance Header ─────────────────────────────────── */}
      <View style={styles.balanceCard}>
        <Ionicons name="flash" size={32} color="#4CAF50" />
        <View style={{ marginLeft: 12, flex: 1 }}>
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
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
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
          <Ionicons name="cart-outline" size={18} color={tab === 'packages' ? '#fff' : '#666'} />
          <Text style={[styles.tabText, tab === 'packages' && styles.tabTextActive]}>
            Shop
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'usage' && styles.tabBtnActive]}
          onPress={() => setTab('usage')}
        >
          <Ionicons name="bar-chart-outline" size={18} color={tab === 'usage' ? '#fff' : '#666'} />
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
                  <Ionicons name="flash" size={14} color="#4CAF50" /> {pkg.credits} Credits/Monat
                </Text>
                <Text style={styles.packageDesc}>{pkg.description}</Text>
              </View>
              {purchasing === pkg.id && (
                <ActivityIndicator size="small" color="#4CAF50" style={{ marginTop: 8 }} />
              )}
            </TouchableOpacity>
          ))}

          {/* ─── Einmalkauf-Pakete ────────────────────────────── */}
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Einmalkauf</Text>
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
                  <Ionicons name="flash" size={14} color="#4CAF50" /> {pkg.credits} Credits
                </Text>
                <Text style={styles.packageDesc}>{pkg.description}</Text>
              </View>
              {purchasing === pkg.id && (
                <ActivityIndicator size="small" color="#4CAF50" style={{ marginTop: 8 }} />
              )}
            </TouchableOpacity>
          ))}

          {/* ─── Restore & Info ───────────────────────────────── */}
          <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore}>
            <Text style={styles.restoreText}>Käufe wiederherstellen</Text>
          </TouchableOpacity>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={18} color="#888" />
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
              <Ionicons name="leaf-outline" size={48} color="#ccc" />
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
          <Ionicons name="stats-chart" size={16} color="#aaa" />
          <Text style={styles.adminBtnText}>Admin Dashboard</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Balance
  balanceCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', margin: 16, marginBottom: 8,
    padding: 20, borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  balanceLabel: { color: '#888', fontSize: 13 },
  balanceValue: { fontSize: 28, fontWeight: 'bold', color: '#222' },
  subBadge: {
    backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  subBadgeText: { color: '#4CAF50', fontWeight: 'bold', fontSize: 12 },

  // Active Sub
  activeSubCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#E8F5E9', marginHorizontal: 16, marginBottom: 8,
    padding: 12, borderRadius: 10,
  },
  activeSubText: { color: '#333', marginLeft: 6, fontSize: 14 },
  manageLink: { color: '#4CAF50', fontWeight: 'bold', fontSize: 13 },

  // Tabs
  tabRow: {
    flexDirection: 'row', marginHorizontal: 16, marginVertical: 8,
    backgroundColor: '#eee', borderRadius: 12, padding: 3,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 10, gap: 6,
  },
  tabBtnActive: { backgroundColor: '#4CAF50' },
  tabText: { color: '#666', fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: '#fff' },

  // Section
  sectionTitle: {
    fontSize: 18, fontWeight: 'bold', color: '#333',
    marginHorizontal: 16, marginTop: 12, marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 13, color: '#888', marginHorizontal: 16, marginBottom: 10,
  },

  // Packages
  packageCard: {
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10,
    padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: '#eee',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  packageCardPopular: { borderColor: '#4CAF50', borderWidth: 2 },
  popularBadge: {
    position: 'absolute', top: -10, right: 16,
    backgroundColor: '#4CAF50', paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 8,
  },
  popularText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  packageHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 6,
  },
  packageName: { fontSize: 18, fontWeight: 'bold', color: '#222' },
  packagePrice: { fontSize: 17, fontWeight: 'bold', color: '#4CAF50' },
  packageDetails: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  packageCredits: { fontSize: 14, color: '#555' },
  packageDesc: { fontSize: 13, color: '#999' },

  // Restore
  restoreBtn: { alignSelf: 'center', marginTop: 20, padding: 10 },
  restoreText: { color: '#888', fontSize: 13, textDecorationLine: 'underline' },

  // Info Box
  infoBox: {
    flexDirection: 'row', backgroundColor: '#f0f0f0', margin: 16,
    padding: 12, borderRadius: 10, gap: 8,
  },
  infoText: { flex: 1, color: '#888', fontSize: 12, lineHeight: 18 },

  // Usage
  usageRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 6,
    padding: 14, borderRadius: 10,
  },
  usageAction: { fontSize: 15, color: '#333', fontWeight: '500' },
  usageDate: { fontSize: 12, color: '#999', marginTop: 2 },
  usageCredits: { fontSize: 16, fontWeight: 'bold', color: '#e53935' },

  // Empty State
  emptyState: { alignItems: 'center', padding: 40 },
  emptyText: { color: '#bbb', marginTop: 10, fontSize: 15 },

  // Admin
  adminBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 20, padding: 10,
  },
  adminBtnText: { color: '#bbb', fontSize: 12 },
});
