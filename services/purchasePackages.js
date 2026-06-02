import { CREDIT_PACKAGES, SUB_PACKAGES } from '../supabase/functions/_shared/creditPackages';

function formatEuro(amount) {
  return `${amount.toFixed(2).replace('.', ',')} €`;
}

function formatMonthlyEuro(amount) {
  return `${formatEuro(amount)}/Monat`;
}

export const ONE_TIME_PACKAGES = [
  {
    id: 'credits_starter',
    name: 'Starter',
    credits: CREDIT_PACKAGES.credits_starter.credits,
    price: formatEuro(CREDIT_PACKAGES.credits_starter.amountEur),
    description: '~15 Pflanzen-Scans',
    popular: false,
  },
  {
    id: 'credits_standard',
    name: 'Standard',
    credits: CREDIT_PACKAGES.credits_standard.credits,
    price: formatEuro(CREDIT_PACKAGES.credits_standard.amountEur),
    description: '~45 Pflanzen-Scans',
    popular: true,
  },
  {
    id: 'credits_pro',
    name: 'Pro',
    credits: CREDIT_PACKAGES.credits_pro.credits,
    price: formatEuro(CREDIT_PACKAGES.credits_pro.amountEur),
    description: '~100 Pflanzen-Scans',
    popular: false,
  },
];

export const SUBSCRIPTION_PACKAGES = [
  {
    id: 'sub_hobby',
    name: 'Hobby',
    credits: SUB_PACKAGES.sub_hobby.credits,
    price: formatMonthlyEuro(SUB_PACKAGES.sub_hobby.amountEur),
    description: '~20 Scans/Monat',
    popular: false,
  },
  {
    id: 'sub_gaertner',
    name: 'Gärtner',
    credits: SUB_PACKAGES.sub_gaertner.credits,
    price: formatMonthlyEuro(SUB_PACKAGES.sub_gaertner.amountEur),
    description: '~60 Scans/Monat',
    popular: true,
  },
  {
    id: 'sub_profi',
    name: 'Profi',
    credits: SUB_PACKAGES.sub_profi.credits,
    price: formatMonthlyEuro(SUB_PACKAGES.sub_profi.amountEur),
    description: '~120 Scans/Monat',
    popular: false,
  },
];
