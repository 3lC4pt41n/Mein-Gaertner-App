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
    credits: 150,
    price: '4,99 €',
    description: '~15 Pflanzen-Scans',
    popular: false,
  },
  {
    id: 'credits_standard',
    name: 'Standard',
    credits: 450,
    price: '12,99 €',
    description: '~45 Pflanzen-Scans',
    popular: true,
  },
  {
    id: 'credits_pro',
    name: 'Pro',
    credits: 1000,
    price: '24,99 €',
    description: '~100 Pflanzen-Scans',
    popular: false,
  },
];

export const SUBSCRIPTION_PACKAGES = [
  {
    id: 'sub_hobby',
    name: 'Hobby',
    credits: 200,
    price: '2,99 €/Monat',
    description: '~20 Scans/Monat',
    popular: false,
  },
  {
    id: 'sub_gaertner',
    name: 'Gärtner',
    credits: 600,
    price: '7,99 €/Monat',
    description: '~60 Scans/Monat',
    popular: true,
  },
  {
    id: 'sub_profi',
    name: 'Profi',
    credits: 1200,
    price: '12,99 €/Monat',
    description: '~120 Scans/Monat',
    popular: false,
  },
];

// ─── RevenueCat initialisieren ──────────────────────────────────
// Architecture:
// - configure() is called once per app lifecycle (SDK requirement).
// - logIn(userId) is called on every auth state change (login / account switch).
// - logOut() MUST be called before Supabase sign-out (see AuthContext.signOut).
// This ensures entitlements are always scoped to the correct Supabase user.
let isConfigured = false;

export async function initPurchases(userId) {
  if (!userId) return;

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

  // Always log in with the current user. RC SDK handles switching:
  // if a different user was logged in, logIn() transfers the anonymous
  // subscriber to the new app user ID automatically.
  try {
    const { customerInfo } = await Purchases.logIn(userId);
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('RevenueCat identity:', customerInfo.originalAppUserId);
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

// ─── Live-Preise aus RC Offerings in Paket-Definitionen mergen ──
// Returns copies of ONE_TIME_PACKAGES / SUBSCRIPTION_PACKAGES with
// `price` replaced by the store-localised priceString from RevenueCat.
// Hardcoded prices remain as fallback if offerings are unavailable.
export async function getPackagesWithLivePrices() {
  const offerings = await getOfferings();
  const available = offerings?.current?.availablePackages || [];

  // Build lookup: package identifier → priceString
  // On Android, product.identifier for subscriptions includes the base plan
  // (e.g. "sub_hobby:sub-hobby-monthly"), so we match by RC package identifier
  // which always equals our custom package ID (e.g. "sub_hobby").
  const priceMap = {};
  for (const pkg of available) {
    priceMap[pkg.identifier] = pkg.product.priceString;
    priceMap[pkg.product.identifier] = pkg.product.priceString; // fallback
  }

  const mapPrices = (packages) =>
    packages.map((p) => ({
      ...p,
      price: priceMap[p.id] || p.price, // live price or hardcoded fallback
      _rcPackage:
        available.find((rc) => rc.identifier === p.id) ||
        available.find((rc) => rc.product.identifier === p.id) ||
        null,
    }));

  return {
    oneTime: mapPrices(ONE_TIME_PACKAGES),
    subscriptions: mapPrices(SUBSCRIPTION_PACKAGES),
    hasLivePrices: Object.keys(priceMap).length > 0,
  };
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
