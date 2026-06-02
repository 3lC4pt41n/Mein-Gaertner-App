// Edge Function: Stripe Webhook fuer Web-Credit-Kaeufe
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getCreditPackage } from '../_shared/creditPackages.ts';
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

function extractPurchasePayload(event: any): {
  providerTransactionId: string;
  userId: string;
  packageId: string;
} | null {
  if (event?.type === 'checkout.session.completed') {
    const session = event.data?.object;
    const metadata = session?.metadata || {};
    return {
      providerTransactionId: `stripe_${metadata.purchase_id || session.id}`,
      userId: metadata.user_id || session.client_reference_id,
      packageId: metadata.package,
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
    const purchase = extractPurchasePayload(event);
    if (!purchase) {
      return jsonResponse({ ok: true, skipped: true }, 200, corsHeaders);
    }

    const pkg = getCreditPackage(purchase.packageId);
    if (!pkg || !purchase.userId) {
      console.warn('Stripe Webhook ohne gueltiges Paket/User:', {
        type: event.type,
        package: purchase.packageId,
        userId: purchase.userId,
      });
      return jsonResponse({ ok: true, skipped: true }, 200, corsHeaders);
    }

    const serviceClient = getServiceClient();
    const { data: result, error } = await serviceClient.rpc('credit_purchase', {
      p_user_id: purchase.userId,
      p_provider_transaction_id: purchase.providerTransactionId,
      p_package: purchase.packageId,
      p_credits: pkg.credits,
      p_amount_eur: pkg.amountEur,
      p_type: pkg.type,
    });

    if (error) throw error;

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
