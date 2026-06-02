export const CREDIT_PACKAGES = {
  credits_starter: { credits: 150, amountEur: 5.99, type: 'one_time' },
  credits_standard: { credits: 450, amountEur: 14.99, type: 'one_time' },
  credits_pro: { credits: 1000, amountEur: 29.99, type: 'one_time' },
} as const;

export const SUB_PACKAGES = {
  sub_hobby: { credits: 200, amountEur: 3.59, type: 'subscription' },
  sub_gaertner: { credits: 600, amountEur: 9.49, type: 'subscription' },
  sub_profi: { credits: 1200, amountEur: 14.99, type: 'subscription' },
} as const;

export const SUB_PLANS = {
  sub_hobby: 'hobby',
  sub_gaertner: 'gaertner',
  sub_profi: 'profi',
} as const;

export type CreditPackageId = keyof typeof CREDIT_PACKAGES;
export type SubscriptionPackageId = keyof typeof SUB_PACKAGES;
export type CreditPackageType = (typeof CREDIT_PACKAGES)[CreditPackageId];
export type SubscriptionPackageType = (typeof SUB_PACKAGES)[SubscriptionPackageId];

export function getCreditPackage(packageId: string): CreditPackageType | null {
  return CREDIT_PACKAGES[packageId as CreditPackageId] ?? null;
}

export function getAnyCreditPackage(
  packageId: string
): CreditPackageType | SubscriptionPackageType | null {
  return (
    CREDIT_PACKAGES[packageId as CreditPackageId] ??
    SUB_PACKAGES[packageId as SubscriptionPackageId] ??
    null
  );
}

export function toStripeAmountCents(amountEur: number): number {
  return Math.round(amountEur * 100);
}
