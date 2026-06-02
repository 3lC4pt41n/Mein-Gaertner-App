// Edge Function: Stripe Checkout fuer Web-Credit-Kaeufe
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getAnyCreditPackage, toStripeAmountCents } from '../_shared/creditPackages.ts';
import { getCorsHeaders, rejectDisallowedOrigin } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { getUserIdFromAuth } from '../_shared/credits.ts';

const DEFAULT_WEB_APP_URL = 'https://florascout.app';
const DEFAULT_STRIPE_API_VERSION = '2026-03-04.preview';

const STRIPE_PRICE_ENV_BY_PACKAGE: Record<string, string> = {
  credits_starter: 'STRIPE_PRICE_CREDITS_STARTER',
  credits_standard: 'STRIPE_PRICE_CREDITS_STANDARD',
  credits_pro: 'STRIPE_PRICE_CREDITS_PRO',
  sub_hobby: 'STRIPE_PRICE_SUB_HOBBY',
  sub_gaertner: 'STRIPE_PRICE_SUB_GAERTNER',
  sub_profi: 'STRIPE_PRICE_SUB_PROFI',
};

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getWebAppUrl(): string {
  return (Deno.env.get('WEB_APP_URL') || DEFAULT_WEB_APP_URL).replace(/\/+$/, '');
}

function packageDisplayName(packageId: string): string {
  const names: Record<string, string> = {
    credits_starter: 'FloraScout Starter Credits',
    credits_standard: 'FloraScout Standard Credits',
    credits_pro: 'FloraScout Pro Credits',
    sub_hobby: 'FloraScout Hobby Abo',
    sub_gaertner: 'FloraScout Gärtner Abo',
    sub_profi: 'FloraScout Profi Abo',
  };
  return names[packageId] || 'FloraScout Credits';
}

function isManagedPaymentsEnabled(): boolean {
  return Deno.env.get('STRIPE_MANAGED_PAYMENTS_ENABLED') !== 'false';
}

function getStripePriceId(packageId: string): { envName: string | null; priceId: string | null } {
  const envName = STRIPE_PRICE_ENV_BY_PACKAGE[packageId] || null;
  return { envName, priceId: envName ? Deno.env.get(envName) : null };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const originRejection = rejectDisallowedOrigin(req, corsHeaders);
  if (originRejection) return originRejection;

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
    }

    const serviceClient = getServiceClient();
    const userId = await getUserIdFromAuth(serviceClient, authHeader);
    const body = await req.json().catch(() => ({}));
    const packageId = String(body.package || '');
    const pkg = getAnyCreditPackage(packageId);

    if (!pkg) {
      return jsonResponse({ error: 'Unknown credit package' }, 400, corsHeaders);
    }

    const webAppUrl = getWebAppUrl();
    const purchaseId = crypto.randomUUID();
    const successUrl =
      Deno.env.get('STRIPE_SUCCESS_URL') ||
      `${webAppUrl}/?stripe_checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = Deno.env.get('STRIPE_CANCEL_URL') || `${webAppUrl}/?stripe_checkout=cancel`;

    const form = new URLSearchParams();
    const managedPaymentsEnabled = isManagedPaymentsEnabled();
    const mode = pkg.type === 'subscription' ? 'subscription' : 'payment';
    const { envName: priceEnvName, priceId } = getStripePriceId(packageId);

    form.set('mode', mode);
    form.set('success_url', successUrl);
    form.set('cancel_url', cancelUrl);
    form.set('client_reference_id', userId);
    form.set('metadata[user_id]', userId);
    form.set('metadata[package]', packageId);
    form.set('metadata[purchase_id]', purchaseId);
    if (managedPaymentsEnabled) {
      form.set('managed_payments[enabled]', 'true');
    }

    if (mode === 'subscription') {
      form.set('subscription_data[metadata][user_id]', userId);
      form.set('subscription_data[metadata][package]', packageId);
    } else {
      form.set('payment_intent_data[metadata][user_id]', userId);
      form.set('payment_intent_data[metadata][package]', packageId);
      form.set('payment_intent_data[metadata][purchase_id]', purchaseId);
    }

    form.set('line_items[0][quantity]', '1');

    if (priceId) {
      form.set('line_items[0][price]', priceId);
    } else {
      if (managedPaymentsEnabled || mode === 'subscription') {
        throw new Error(`${priceEnvName || 'STRIPE_PRICE_*'} is not configured`);
      }

      form.set('line_items[0][price_data][currency]', 'eur');
      form.set('line_items[0][price_data][unit_amount]', String(toStripeAmountCents(pkg.amountEur)));
      form.set('line_items[0][price_data][product_data][name]', packageDisplayName(packageId));
      form.set('line_items[0][price_data][product_data][metadata][package]', packageId);
    }

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(managedPaymentsEnabled
          ? { 'Stripe-Version': Deno.env.get('STRIPE_API_VERSION') || DEFAULT_STRIPE_API_VERSION }
          : {}),
      },
      body: form,
    });

    const stripeBody = await stripeResponse.json();
    if (!stripeResponse.ok) {
      console.error('Stripe Checkout konnte nicht erstellt werden:', stripeBody);
      return jsonResponse(
        { error: stripeBody?.error?.message || 'Stripe Checkout failed' },
        stripeResponse.status,
        corsHeaders
      );
    }

    return jsonResponse({ url: stripeBody.url }, 200, corsHeaders);
  } catch (error: any) {
    if (error?.code === 'UNAUTHORIZED') {
      return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
    }

    console.error('Stripe Checkout Error:', error);
    return jsonResponse({ error: error.message || 'Stripe Checkout failed' }, 500, corsHeaders);
  }
});
