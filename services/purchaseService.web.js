// Web v1: mobile in-app purchases are intentionally unavailable.
// The UI can still show package definitions, but purchase actions stay disabled.

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

const unavailable = () => new Error('Purchases are not available on web yet.');

export async function initPurchases() {
  return undefined;
}

export async function getOfferings() {
  return null;
}

export async function getPackagesWithLivePrices() {
  return {
    oneTime: ONE_TIME_PACKAGES,
    subscriptions: SUBSCRIPTION_PACKAGES,
    hasLivePrices: false,
  };
}

export async function purchasePackage() {
  throw unavailable();
}

export async function purchaseProduct() {
  throw unavailable();
}

export async function getCustomerInfo() {
  return null;
}

export async function getActiveSubscription() {
  return null;
}

export function openManageSubscriptions() {
  throw unavailable();
}

export async function restorePurchases() {
  throw unavailable();
}

export async function logoutPurchases() {
  return undefined;
}
