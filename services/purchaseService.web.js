import { Linking } from 'react-native';
import { supabase } from '../supabase';
import { ONE_TIME_PACKAGES, SUBSCRIPTION_PACKAGES } from './purchasePackages';

export { ONE_TIME_PACKAGES, SUBSCRIPTION_PACKAGES };

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

export async function purchasePackage(pkg) {
  if (!pkg?.id) throw unavailable();

  const { data, error } = await supabase.functions.invoke('stripe-create-checkout', {
    body: { package: pkg.id },
  });

  if (error) {
    throw new Error(error.message || 'Stripe-Checkout konnte nicht gestartet werden.');
  }

  if (!data?.url) {
    throw new Error('Stripe-Checkout-URL fehlt.');
  }

  if (typeof window !== 'undefined' && window.location?.assign) {
    window.location.assign(data.url);
  } else {
    await Linking.openURL(data.url);
  }

  return { success: false, redirected: true };
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
