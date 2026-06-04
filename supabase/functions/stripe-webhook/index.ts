// Edge Function: Stripe Webhook fuer Web-Credit-Kaeufe
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getAnyCreditPackage, SUB_PLANS } from '../_shared/creditPackages.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';

const SIGNATURE_TOLERANCE_SECONDS = 300;

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

function parseStripeSignature(header: string): { timestamp: number; signatures: string[] } {
  const parts = header.split(',').map((part) => part.trim());
  const timestamp = Number(parts.find((part) => part.startsWith('t='))?.slice(2));
  const signatures = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3))
    .filter(Boolean);

  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    throw new Error('Ungueltige Stripe-Signatur');
  }

  return { timestamp, signatures };
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return toHex(signature);
}

async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string
): Promise<void> {
  if (!signatureHeader) throw new Error('Stripe-Signature fehlt');

  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  const ageSeconds = Math.abs(Date.now() / 1000 - timestamp);
  if (ageSeconds > SIGNATURE_TOLERANCE_SECONDS) {
    throw new Error('Stripe-Signatur ist zu alt');
  }

  const expected = await hmacSha256Hex(webhookSecret, `${timestamp}.${rawBody}`);
  const matches = signatures.some((candidate) => timingSafeEqual(candidate, expected));
  if (!matches) throw new Error('Stripe-Signatur passt nicht');
}

function stripeObjectId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') {
    return value.id;
  }
  return null;
}

function extractPurchasePayload(event: any): {
  providerTransactionId: string;
  userId: string;
  packageId: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
} | null {
  if (
    event?.type === 'checkout.session.completed' ||
    event?.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = event.data?.object;
    if (session?.mode === 'subscription') return null;

    const metadata = session?.metadata || {};
    return {
      providerTransactionId: `stripe_${metadata.purchase_id || session.id}`,
      userId: metadata.user_id || session.client_reference_id,
      packageId: metadata.package,
    };
  }

  if (event?.type === 'invoice.payment_succeeded' || event?.type === 'invoice.paid') {
    const invoice = event.data?.object;
    const line = invoice?.lines?.data?.[0] || {};
    const metadata =
      invoice?.subscription_details?.metadata ||
      invoice?.parent?.subscription_details?.metadata ||
      line?.metadata ||
      {};

    return {
      providerTransactionId: `stripe_${invoice?.id}`,
      userId: metadata.user_id,
      packageId: metadata.package,
      currentPeriodStart: line?.period?.start
        ? new Date(line.period.start * 1000).toISOString()
        : null,
      currentPeriodEnd: line?.period?.end ? new Date(line.period.end * 1000).toISOString() : null,
    };
  }

  if (event?.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data?.object;
    const metadata = paymentIntent?.metadata || {};
    if (!metadata.user_id || !metadata.package) return null;
    return {
      providerTransactionId: `stripe_${metadata.purchase_id || paymentIntent.id}`,
      userId: metadata.user_id,
      packageId: metadata.package,
    };
  }

  return null;
}

function extractSubscriptionStatusPayload(event: any): {
  userId: string;
  packageId: string;
  status: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
} | null {
  if (event?.type === 'checkout.session.completed') {
    const session = event.data?.object;
    if (session?.mode !== 'subscription') return null;

    const metadata = session?.metadata || {};
    const packageId = metadata.package;
    const plan = packageId ? SUB_PLANS[packageId as keyof typeof SUB_PLANS] : null;
    const userId = metadata.user_id || session.client_reference_id;
    if (!userId || !plan) return null;

    return {
      userId,
      packageId,
      status: 'active',
      stripeCustomerId: stripeObjectId(session.customer),
      stripeSubscriptionId: stripeObjectId(session.subscription),
    };
  }

  if (
    event?.type !== 'customer.subscription.created' &&
    event?.type !== 'customer.subscription.updated' &&
    event?.type !== 'customer.subscription.deleted'
  ) {
    return null;
  }

  const subscription = event.data?.object;
  const metadata = subscription?.metadata || {};
  const packageId = metadata.package;
  const plan = packageId ? SUB_PLANS[packageId as keyof typeof SUB_PLANS] : null;
  if (!metadata.user_id || !plan) return null;

  return {
    userId: metadata.user_id,
    packageId,
    status: event.type === 'customer.subscription.deleted' ? 'cancelled' : subscription?.status,
    currentPeriodStart: subscription?.current_period_start
      ? new Date(subscription.current_period_start * 1000).toISOString()
      : null,
    currentPeriodEnd: subscription?.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
    stripeCustomerId: stripeObjectId(subscription?.customer),
    stripeSubscriptionId: stripeObjectId(subscription?.id),
  };
}

function toStripePurchaseType(packageType: string): string {
  return packageType === 'subscription' ? 'subscription_renewal' : packageType;
}

async function upsertStripeSubscription(
  serviceClient: ReturnType<typeof getServiceClient>,
  payload: {
    userId: string;
    packageId: string;
    status: string;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
  }
) {
  const plan = SUB_PLANS[payload.packageId as keyof typeof SUB_PLANS];
  if (!plan) return;

  const updates: Record<string, unknown> = {
    user_id: payload.userId,
    plan,
    status: payload.status,
    current_period_start: payload.currentPeriodStart || null,
    current_period_end: payload.currentPeriodEnd || null,
  };

  if (payload.stripeCustomerId) {
    updates.stripe_customer_id = payload.stripeCustomerId;
  }

  if (payload.stripeSubscriptionId) {
    updates.stripe_subscription_id = payload.stripeSubscriptionId;
  }

  const { error } = await serviceClient
    .from('subscriptions')
    .upsert(updates, { onConflict: 'user_id' });

  if (error) throw error;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, 'POST, OPTIONS', 'stripe-signature, content-type');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  try {
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    }

    const rawBody = await req.text();
    await verifyStripeSignature(rawBody, req.headers.get('Stripe-Signature'), webhookSecret);

    const event = JSON.parse(rawBody);
    const serviceClient = getServiceClient();
    const subscriptionStatus = extractSubscriptionStatusPayload(event);
    if (subscriptionStatus) {
      await upsertStripeSubscription(serviceClient, subscriptionStatus);
      return jsonResponse({ ok: true, subscriptionUpdated: true }, 200, corsHeaders);
    }

    const purchase = extractPurchasePayload(event);
    if (!purchase) {
      return jsonResponse({ ok: true, skipped: true }, 200, corsHeaders);
    }

    const pkg = getAnyCreditPackage(purchase.packageId);
    if (!pkg || !purchase.userId) {
      console.warn('Stripe Webhook ohne gueltiges Paket/User:', {
        type: event.type,
        package: purchase.packageId,
        userId: purchase.userId,
      });
      return jsonResponse({ ok: true, skipped: true }, 200, corsHeaders);
    }

    const { data: result, error } = await serviceClient.rpc('credit_purchase', {
      p_user_id: purchase.userId,
      p_provider_transaction_id: purchase.providerTransactionId,
      p_package: purchase.packageId,
      p_credits: pkg.credits,
      p_amount_eur: pkg.amountEur,
      p_type: toStripePurchaseType(pkg.type),
    });

    if (error) throw error;

    if (SUB_PLANS[purchase.packageId as keyof typeof SUB_PLANS]) {
      await upsertStripeSubscription(serviceClient, {
        userId: purchase.userId,
        packageId: purchase.packageId,
        status: 'active',
        currentPeriodStart: purchase.currentPeriodStart,
        currentPeriodEnd: purchase.currentPeriodEnd,
      });
    }

    if (!result) {
      console.log(`Stripe Webhook doppelt empfangen: ${purchase.providerTransactionId}`);
    } else {
      console.log(`+${pkg.credits} Credits via Stripe fuer User ${purchase.userId}`);
    }

    return jsonResponse({ ok: true, credited: !!result }, 200, corsHeaders);
  } catch (error: any) {
    const message = error?.message || 'Stripe Webhook failed';
    const isSignatureError =
      message.includes('Signatur') ||
      message.includes('Signature') ||
      message.includes('fehlt') ||
      message.includes('passt nicht');

    console.error('Stripe Webhook Error:', error);
    return jsonResponse({ error: message }, isSignatureError ? 400 : 500, corsHeaders);
  }
});
