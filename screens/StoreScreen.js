import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchBalance, fetchSubscription, fetchCreditHistory } from '../services/creditService';
import {
  ONE_TIME_PACKAGES,
  SUBSCRIPTION_PACKAGES,
  getOfferings,
  getPackagesWithLivePrices,
  purchasePackage,
  openManageSubscriptions,
  restorePurchases,
} from '../services/purchaseService';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import i18n, { t } from '../i18n';
import { AI_COSTS } from '../services/pricingConfig';

// ─── Per-credit pricing helper ─────────────────────────────────
function parsePrice(priceStr) {
  const num = parseFloat(priceStr.replace(/[^0-9.,]/g, '').replace(',', '.'));
  return isNaN(num) ? 0 : num;
}

function perCreditCent(priceStr, credits) {
  const price = parsePrice(priceStr);
  if (!credits || !price) return 0;
  return ((price / credits) * 100).toFixed(1);
}

// Base rate = most expensive per-credit (Starter one-time) for savings calculation
const BASE_RATE =
  (parsePrice(ONE_TIME_PACKAGES[0]?.price) / (ONE_TIME_PACKAGES[0]?.credits || 1)) * 100;

function savingsPercent(priceStr, credits) {
  const rate = (parsePrice(priceStr) / (credits || 1)) * 100;
  if (!BASE_RATE || rate >= BASE_RATE) return 0;
  return Math.round((1 - rate / BASE_RATE) * 100);
}

export default function StoreScreen({ isAdmin }) {
  const navigation = useNavigation();
  const [balance, setBalance] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [creditHistory, setCreditHistory] = useState([]);
  const [creditHistoryWarning, setCreditHistoryWarning] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null); // welches Paket gerade kauft
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('packages'); // 'packages' | 'usage'
  const [liveOneTime, setLiveOneTime] = useState(ONE_TIME_PACKAGES);
  const [liveSubs, setLiveSubs] = useState(SUBSCRIPTION_PACKAGES);

  const loadData = useCallback(async () => {
    try {
      const [bal, sub, livePrices] = await Promise.all([
        fetchBalance(),
        fetchSubscription().catch(() => null),
        getPackagesWithLivePrices().catch(() => null),
      ]);

      let history = [];
      let historyWarning = null;
      try {
        history = await fetchCreditHistory(30);
      } catch (err) {
        if (err?.code === 'CREDIT_HISTORY_INCOMPLETE' && Array.isArray(err.partialEntries)) {
          history = err.partialEntries;
          historyWarning = t('store.historyPartial');
          console.warn('Credit history partially loaded:', err.message);
        } else {
          history = [];
          historyWarning = t('store.historyUnavailable');
          console.warn('Credit history load failed:', err?.message || err);
        }
      }

      setBalance(bal);
      setSubscription(sub);
      setCreditHistory(history);
      setCreditHistoryWarning(historyWarning);
      if (livePrices) {
        setLiveOneTime(livePrices.oneTime);
        setLiveSubs(livePrices.subscriptions);
      }
    } catch (e) {
      console.warn('Store Daten laden:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // ─── Kauf-Handler ───────────────────────────────────────────
  const handlePurchase = async (pkg) => {
    setPurchasing(pkg.id);
    try {
      // Use pre-loaded RC package from live prices, or fetch fresh
      let rcPackage = pkg._rcPackage;
      if (!rcPackage) {
        const offerings = await getOfferings();
        if (!offerings?.current?.availablePackages) {
          Alert.alert(t('store.storeUnavailable'), t('store.storeUnavailableMessage'), [
            { text: 'OK' },
          ]);
          return;
        }
        rcPackage = offerings.current.availablePackages.find(
          (p) => p.product.identifier === pkg.id
        );
      }

      if (!rcPackage) {
        Alert.alert(t('common.error'), t('store.packageNotFound', { name: pkg.name }));
        return;
      }

      const result = await purchasePackage(rcPackage);

      if (result.success) {
        Alert.alert(
          t('store.purchaseSuccess'),
          t('store.purchaseSuccessMessage', { credits: pkg.credits }),
          [{ text: t('store.purchaseSuccessButton') }]
        );
        // Poll for balance update (webhook may take a moment)
        const prevBal = balance ?? 0;
        const pollStart = Date.now();
        const poll = async () => {
          while (Date.now() - pollStart < 10000) {
            await new Promise((r) => setTimeout(r, 1000));
            const newBal = await fetchBalance();
            if (newBal > prevBal) {
              // Balance updated — reload all store data
              await loadData();
              return;
            }
          }
          // Timeout fallback — reload anyway
          await loadData();
        };
        poll().catch(console.warn);
      } else if (result.cancelled) {
        // User hat abgebrochen – nichts tun
      }
    } catch (e) {
      Alert.alert(t('store.purchaseFailed'), e.message);
    } finally {
      setPurchasing(null);
    }
  };

  // ─── Restore Handler ───────────────────────────────────────
  const handleRestore = async () => {
    try {
      await restorePurchases();
      Alert.alert(t('store.restored'), t('store.restoreSuccess'));
      loadData();
    } catch (e) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  // ─── Labels für Credit-History ──────────────────────────────
  const historyLabel = (item) => {
    if (item.type === 'usage') {
      const map = {
        plant_scan: t('store.actionLabels.plantScan'),
        plant_details: t('store.actionLabels.plantDetails'),
        healthcheck: t('store.actionLabels.healthcheck'),
        chat: t('store.actionLabels.chat'),
      };
      return map[item.label] || item.label;
    }
    if (item.type === 'discovery') {
      return item.label === 'first_discovery'
        ? t('store.historyLabels.firstDiscovery')
        : t('store.historyLabels.discovery');
    }
    if (item.type === 'purchase') {
      const map = {
        beta_welcome: t('store.historyLabels.betaWelcome'),
        purchase: t('store.historyLabels.purchase'),
        subscription: t('store.historyLabels.subscription'),
      };
      return map[item.label] || t('store.historyLabels.purchase');
    }
    return item.label;
  };

  const historyIcon = (item) => {
    if (item.type === 'usage') return 'flash-outline';
    if (item.type === 'discovery') return item.label === 'first_discovery' ? 'trophy' : 'sparkles';
    if (item.type === 'purchase') return 'cart-outline';
    return 'ellipse-outline';
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
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primaryLight}
        />
      }
    >
      {/* ─── Balance Header ─────────────────────────────────── */}
      <View style={styles.balanceCard}>
        <Ionicons name="flash" size={32} color={colors.primaryLight} />
        <View style={{ marginLeft: spacing.md, flex: 1 }}>
          <Text style={styles.balanceLabel}>{t('store.balance')}</Text>
          <Text style={styles.balanceValue}>
            {balance ?? 0} {t('store.creditsUnit')}
          </Text>
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
              {t('store.subscriptionActive')}:{' '}
              <Text style={{ fontWeight: 'bold' }}>
                {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)}
              </Text>
            </Text>
          </View>
          <TouchableOpacity onPress={openManageSubscriptions}>
            <Text style={styles.manageLink}>{t('store.manage')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Tab-Switcher ───────────────────────────────────── */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'packages' && styles.tabBtnActive]}
          onPress={() => setTab('packages')}
        >
          <Ionicons
            name="cart-outline"
            size={18}
            color={tab === 'packages' ? colors.surface : colors.textSecondary}
          />
          <Text style={[styles.tabText, tab === 'packages' && styles.tabTextActive]}>
            {t('store.shopTab')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'usage' && styles.tabBtnActive]}
          onPress={() => setTab('usage')}
        >
          <Ionicons
            name="bar-chart-outline"
            size={18}
            color={tab === 'usage' ? colors.surface : colors.textSecondary}
          />
          <Text style={[styles.tabText, tab === 'usage' && styles.tabTextActive]}>
            {t('store.usageTab')}
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'packages' ? (
        <>
          {/* ─── Abo-Pakete ──────────────────────────────────── */}
          <Text style={styles.sectionTitle}>{t('store.subscriptionTitle')}</Text>
          <Text style={styles.sectionSubtitle}>{t('store.subscriptionSubtitle')}</Text>
          {liveSubs.map((pkg) => {
            const pcc = perCreditCent(pkg.price, pkg.credits);
            const savings = savingsPercent(pkg.price, pkg.credits);
            return (
              <TouchableOpacity
                key={pkg.id}
                style={[styles.packageCard, pkg.popular && styles.packageCardPopular]}
                onPress={() => handlePurchase(pkg)}
                disabled={purchasing !== null}
                accessibilityRole="button"
                accessibilityLabel={`${pkg.name} – ${pkg.price}`}
              >
                {pkg.popular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularText}>{t('store.popular')}</Text>
                  </View>
                )}
                <View style={styles.packageHeader}>
                  <Text style={styles.packageName}>{pkg.name}</Text>
                  <Text style={styles.packagePrice}>{pkg.price}</Text>
                </View>
                <View style={styles.packageDetails}>
                  <Text style={styles.packageCredits}>
                    <Ionicons name="flash" size={14} color={colors.primaryLight} /> {pkg.credits}{' '}
                    {t('store.creditsPerMonth')}
                  </Text>
                  <Text style={styles.packageDesc}>{pkg.description}</Text>
                </View>
                <View style={styles.packageMeta}>
                  <Text style={styles.perCreditText}>
                    {pcc} ct/{t('store.perCredit')}
                  </Text>
                  {savings > 0 && (
                    <View style={styles.savingsBadge}>
                      <Text style={styles.savingsText}>
                        {t('store.savePercent', { percent: savings })}
                      </Text>
                    </View>
                  )}
                </View>
                {purchasing === pkg.id && (
                  <ActivityIndicator
                    size="small"
                    color={colors.primaryLight}
                    style={{ marginTop: spacing.sm }}
                  />
                )}
              </TouchableOpacity>
            );
          })}

          {/* ─── Einmalkauf-Pakete ────────────────────────────── */}
          <Text style={[styles.sectionTitle, { marginTop: spacing.xxl }]}>
            {t('store.oneTimeTitle')}
          </Text>
          <Text style={styles.sectionSubtitle}>{t('store.oneTimeSubtitle')}</Text>
          {liveOneTime.map((pkg) => {
            const pcc = perCreditCent(pkg.price, pkg.credits);
            const savings = savingsPercent(pkg.price, pkg.credits);
            return (
              <TouchableOpacity
                key={pkg.id}
                style={[styles.packageCard, pkg.popular && styles.packageCardPopular]}
                onPress={() => handlePurchase(pkg)}
                disabled={purchasing !== null}
                accessibilityRole="button"
                accessibilityLabel={`${pkg.name} – ${pkg.price}`}
              >
                {pkg.popular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularText}>{t('store.bestDeal')}</Text>
                  </View>
                )}
                <View style={styles.packageHeader}>
                  <Text style={styles.packageName}>{pkg.name}</Text>
                  <Text style={styles.packagePrice}>{pkg.price}</Text>
                </View>
                <View style={styles.packageDetails}>
                  <Text style={styles.packageCredits}>
                    <Ionicons name="flash" size={14} color={colors.primaryLight} /> {pkg.credits}{' '}
                    {t('store.creditsUnit')}
                  </Text>
                  <Text style={styles.packageDesc}>{pkg.description}</Text>
                </View>
                <View style={styles.packageMeta}>
                  <Text style={styles.perCreditText}>
                    {pcc} ct/{t('store.perCredit')}
                  </Text>
                  {savings > 0 && (
                    <View style={styles.savingsBadge}>
                      <Text style={styles.savingsText}>
                        {t('store.savePercent', { percent: savings })}
                      </Text>
                    </View>
                  )}
                </View>
                {purchasing === pkg.id && (
                  <ActivityIndicator
                    size="small"
                    color={colors.primaryLight}
                    style={{ marginTop: spacing.sm }}
                  />
                )}
              </TouchableOpacity>
            );
          })}

          {/* ─── Credit Cost Comparison ────────────────────────── */}
          <View style={styles.comparisonBox}>
            <Text style={styles.comparisonTitle}>{t('store.costComparisonTitle')}</Text>
            {[
              {
                icon: 'search-outline',
                label: t('store.actionLabels.plantScan'),
                cost: String(AI_COSTS.scan),
              },
              {
                icon: 'document-text-outline',
                label: t('store.costDetails'),
                cost: String(AI_COSTS.details),
              },
              {
                icon: 'heart-outline',
                label: t('store.actionLabels.healthcheck'),
                cost: String(AI_COSTS.healthcheck),
              },
              {
                icon: 'chatbubble-outline',
                label: t('store.costChat'),
                cost: String(AI_COSTS.chat),
              },
            ].map((item, i) => (
              <View key={i} style={styles.comparisonRow}>
                <Ionicons name={item.icon} size={16} color={colors.primary} />
                <Text style={styles.comparisonLabel}>{item.label}</Text>
                <Text style={styles.comparisonCost}>{item.cost} Cr.</Text>
              </View>
            ))}
          </View>

          {/* ─── Restore & Info ───────────────────────────────── */}
          <TouchableOpacity
            style={styles.restoreBtn}
            onPress={handleRestore}
            accessibilityRole="button"
          >
            <Text style={styles.restoreText}>{t('store.restorePurchases')}</Text>
          </TouchableOpacity>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textTertiary} />
            <Text style={styles.infoText}>{t('store.infoText')}</Text>
          </View>
        </>
      ) : (
        <>
          {/* ─── Credit History Tab ──────────────────────────── */}
          <Text style={styles.sectionTitle}>{t('store.historyTitle')}</Text>
          {creditHistoryWarning ? (
            <View style={styles.historyWarningBox}>
              <Ionicons name="warning-outline" size={16} color={colors.warning} />
              <Text style={styles.historyWarningText}>{creditHistoryWarning}</Text>
            </View>
          ) : null}
          {creditHistory.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="leaf-outline" size={48} color={colors.textDisabled} />
              <Text style={styles.emptyText}>{t('store.noUsage')}</Text>
            </View>
          ) : (
            creditHistory.map((item, idx) => {
              const isPositive = item.credits > 0;
              return (
                <View key={item.id || idx} style={styles.usageRow}>
                  <View
                    style={[
                      styles.historyIconBg,
                      isPositive ? styles.historyIconBgPositive : styles.historyIconBgNegative,
                    ]}
                  >
                    <Ionicons
                      name={historyIcon(item)}
                      size={16}
                      color={isPositive ? colors.primaryLight : colors.textTertiary}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={styles.usageAction}>{historyLabel(item)}</Text>
                    {item.detail ? (
                      <Text style={styles.usageDetail} numberOfLines={1}>
                        {item.detail}
                      </Text>
                    ) : null}
                    <Text style={styles.usageDate}>
                      {new Date(item.date).toLocaleDateString(i18n.locale, {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.usageCredits,
                      isPositive ? styles.creditsPositive : styles.creditsNegative,
                    ]}
                  >
                    {isPositive ? '+' : ''}
                    {item.credits}
                  </Text>
                </View>
              );
            })
          )}
        </>
      )}

      {/* ─── Feedback (Beta) ──────────────────────────────── */}
      <TouchableOpacity style={styles.adminBtn} onPress={() => navigation.navigate('FeedbackMain')}>
        <Ionicons name="chatbox-ellipses-outline" size={16} color={colors.primary} />
        <Text style={[styles.adminBtnText, { color: colors.primary }]}>{t('feedback.title')}</Text>
      </TouchableOpacity>

      {/* ─── Admin Dashboard (nur für Admins) ─────────────── */}
      {isAdmin && (
        <TouchableOpacity style={styles.adminBtn} onPress={() => navigation.navigate('AdminMain')}>
          <Ionicons name="stats-chart" size={16} color={colors.textTertiary} />
          <Text style={styles.adminBtnText}>{t('store.adminDashboard')}</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    margin: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.xl,
    borderRadius: radius.lg,
    ...shadows.md,
  },
  balanceLabel: { color: colors.textTertiary, fontSize: 14 },
  balanceValue: { fontSize: 28, fontWeight: 'bold', color: colors.textPrimary },
  subBadge: {
    backgroundColor: colors.primarySurface,
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  subBadgeText: { color: colors.primary, fontWeight: 'bold', fontSize: 12 },

  // Active Sub
  activeSubCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primarySurface,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  activeSubText: { color: colors.textPrimary, marginLeft: spacing.xs, fontSize: 14 },
  manageLink: { color: colors.primary, fontWeight: 'bold', fontSize: 14 },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    backgroundColor: colors.borderLight,
    borderRadius: radius.md,
    padding: spacing.xs,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  tabBtnActive: { backgroundColor: colors.primary },
  tabText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: colors.surface },

  // Section
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.textTertiary,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },

  // Packages
  packageCard: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  packageCardPopular: { borderColor: colors.primary, borderWidth: 2 },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  popularText: { color: colors.surface, fontSize: 12, fontWeight: 'bold' },
  packageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  packageName: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary },
  packagePrice: { fontSize: 18, fontWeight: 'bold', color: colors.primary },
  packageDetails: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  packageCredits: { fontSize: 14, color: colors.textSecondary },
  packageDesc: { fontSize: 14, color: colors.textTertiary },
  packageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  perCreditText: { fontSize: 12, color: colors.textTertiary },
  savingsBadge: {
    backgroundColor: colors.primarySurface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  savingsText: { fontSize: 12, fontWeight: 'bold', color: colors.primary },

  // Comparison
  comparisonBox: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    ...shadows.sm,
  },
  comparisonTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  comparisonLabel: { flex: 1, fontSize: 14, color: colors.textSecondary },
  comparisonCost: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },

  // Restore
  restoreBtn: { alignSelf: 'center', marginTop: spacing.xl, padding: spacing.md },
  restoreText: { color: colors.textTertiary, fontSize: 14, textDecorationLine: 'underline' },

  // Info Box
  infoBox: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    margin: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  infoText: { flex: 1, color: colors.textTertiary, fontSize: 12, lineHeight: 18 },

  // Usage
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  usageAction: { fontSize: 14, color: colors.textPrimary, fontWeight: '500' },
  usageDetail: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  usageDate: { fontSize: 12, color: colors.textTertiary, marginTop: spacing.xs },
  usageCredits: { fontSize: 16, fontWeight: 'bold' },
  creditsPositive: { color: colors.primaryLight },
  creditsNegative: { color: colors.danger ?? '#e74c3c' },
  historyIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyIconBgPositive: { backgroundColor: colors.primarySurface },
  historyIconBgNegative: { backgroundColor: colors.borderLight ?? '#f0f0f0' },
  historyWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.warningSurface ?? '#FFF8E1',
  },
  historyWarningText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
  },

  // Empty State
  emptyState: { alignItems: 'center', padding: spacing.xxxl },
  emptyText: { color: colors.textDisabled, marginTop: spacing.md, fontSize: 14 },

  // Admin
  adminBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    padding: spacing.md,
  },
  adminBtnText: { color: colors.textDisabled, fontSize: 12 },
});
