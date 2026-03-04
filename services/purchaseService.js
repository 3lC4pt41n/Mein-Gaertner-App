import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

// ─── RevenueCat API Keys ────────────────────────────────────────
// Echte Store Keys (aus RevenueCat Dashboard, konfiguriert 27.02.2026)
const REVENUECAT_IOS_KEY = 'appl_iYDKIehHAjYNRfXLvMSuQwsjxXd';
const REVENUECAT_ANDROID_KEY = 'goog_dhZDpcPamDGUtdzIgdwwLCjRuEq';

// ─── Paket-Definitionen (für UI) ────────────────────────────────
export const ONE_TIME_PACKAGES = [
  {
    id: 'credits_starter',
    name: 'Starter',
    credits: 500,
    price: '9,99 €',
    description: '~50 Pflanzen-Scans',
    popular: false,
  },
  {
    id: 'credits_standard',
    name: 'Standard',
    credits: 1500,
    price: '29,99 €',
    description: '~150 Pflanzen-Scans',
    popular: true,
  },
  {
    id: 'credits_pro',
    name: 'Pro',
    credits: 5000,
    price: '89,99 €',
    description: '~500 Pflanzen-Scans',
    popular: false,
  },
];

export const SUBSCRIPTION_PACKAGES = [
  {
    id: 'sub_hobby',
    name: 'Hobby',
    credits: 300,
    price: '3,99 €/Monat',
    description: '~30 Scans/Monat',
    popular: false,
  },
  {
    id: 'sub_gaertner',
    name: 'Gärtner',
    credits: 1000,
    price: '12,99 €/Monat',
    description: '~100 Scans/Monat',
    popular: true,
  },
  {
    id: 'sub_profi',
    name: 'Profi',
    credits: 3000,
    price: '34,99 €/Monat',
    description: '~300 Scans/Monat',
    popular: false,
  },
];

// ─── RevenueCat initialisieren ──────────────────────────────────
let isConfigured = false;

export async function initPurchases(userId) {
  // One-time SDK configuration
  if (!isConfigured) {
    try {
      const apiKey = Platform.OS === 'ios' ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;
      await Purchases.configure({ apiKey });
      isConfigured = true;
    } catch (e) {
      console.warn('RevenueCat Konfiguration fehlgeschlagen:', e.message);
      return;
    }
  }

  // Always log in with the current user (for account switching)
  try {
    if (userId) {
      await Purchases.logIn(userId);
    }
  } catch (e) {
    console.warn('RevenueCat logIn fehlgeschlagen:', e.message);
  }
}

// ─── Verfügbare Offerings laden ─────────────────────────────────
export async function getOfferings() {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings;
  } catch (e) {
    console.warn('Offerings laden fehlgeschlagen:', e.message);
    return null;
  }
}

// ─── Kauf durchführen ───────────────────────────────────────────
export async function purchasePackage(pkg) {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { success: true, customerInfo };
  } catch (e) {
    if (e.userCancelled) {
      return { success: false, cancelled: true };
    }
    throw e;
  }
}

// ─── Produkt direkt kaufen (by Product ID) ──────────────────────
export async function purchaseProduct(productId) {
  try {
    const { customerInfo } = await Purchases.purchaseStoreProduct({
      productIdentifier: productId,
    });
    return { success: true, customerInfo };
  } catch (e) {
    if (e.userCancelled) {
      return { success: false, cancelled: true };
    }
    throw e;
  }
}

// ─── Aktuellen Subscriber-Info laden ────────────────────────────
export async function getCustomerInfo() {
  try {
    const info = await Purchases.getCustomerInfo();
    return info;
  } catch (e) {
    console.warn('CustomerInfo laden fehlgeschlagen:', e.message);
    return null;
  }
}

// ─── Abo-Status prüfen ─────────────────────────────────────────
export async function getActiveSubscription() {
  try {
    const info = await Purchases.getCustomerInfo();
    const entitlements = info.entitlements.active;

    if (entitlements.profi) return 'profi';
    if (entitlements.gaertner) return 'gaertner';
    if (entitlements.hobby) return 'hobby';

    return null;
  } catch {
    return null;
  }
}

// ─── Abo kündigen / verwalten ───────────────────────────────────
export function openManageSubscriptions() {
  // Öffnet den nativen Store Abo-Manager
  // iOS: Einstellungen → Abos, Android: Play Store → Abos
  Purchases.showManageSubscriptions();
}

// ─── Restore Purchases ─────────────────────────────────────────
export async function restorePurchases() {
  try {
    const info = await Purchases.restorePurchases();
    return info;
  } catch (e) {
    throw new Error('Wiederherstellen fehlgeschlagen: ' + e.message);
  }
}

// ─── Logout / Reset RevenueCat ───────────────────────────────
export async function logoutPurchases() {
  try {
    await Purchases.logOut();
  } catch (e) {
    console.warn('RevenueCat logOut fehlgeschlagen:', e.message);
  }
}
