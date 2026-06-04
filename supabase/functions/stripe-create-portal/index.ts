// Edge Function: Stripe Customer Portal fuer Web-Abos
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getCorsHeaders, rejectDisallowedOrigin } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { getUserIdFromAuth } from '../_shared/credits.ts';

const DEFAULT_WEB_APP_URL = 'https://app.florapilot.app';
const DEFAULT_STRIPE_API_VERSION = '2026-03-04.preview';

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

async function stripeRequest(
  stripeSecretKey: string,
  path: string,
  body?: URLSearchParams,
  method = 'POST'
) {
  const url =
    method === 'GET' && body
      ? `https://api.stripe.com/v1/${path}?${body.toString()}`
      : `https://api.stripe.com/v1/${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': Deno.env.get('STRIPE_API_VERSION') || DEFAULT_STRIPE_API_VERSION,
    },
    body: method === 'GET' ? undefined : body,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Stripe request failed: ${path}`);
  }
  return payload;
}

async function findStripeCustomerId(
  stripeSecretKey: string,
  serviceClient: ReturnType<typeof getServiceClient>,
  userId: string
): Promise<string | null> {
  const { data: subscription } = await serviceClient
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (subscription?.stripe_customer_id) {
    return subscription.stripe_customer_id;
  }

  const { data: authUser, error } = await serviceClient.auth.admin.getUserById(userId);
  if (error || !authUser?.user?.email) {
    return null;
  }

  const search = new URLSearchParams();
  search.set('query', `email:'${authUser.user.email.replace(/'/g, "\\'")}'`);
  search.set('limit', '1');
  const customers = await stripeRequest(stripeSecretKey, 'customers/search', search, 'GET');
  const customerId = customers?.data?.[0]?.id || null;

  if (customerId) {
    await serviceClient
      .from('subscriptions')
      .upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: 'user_id' });
  }

  return customerId;
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
    const customerId = await findStripeCustomerId(stripeSecretKey, serviceClient, userId);

    if (!customerId) {
      return jsonResponse({ error: 'No Stripe customer found for this user' }, 404, corsHeaders);
    }

    const body = await req.json().catch(() => ({}));
    const returnUrl = String(body.return_url || `${getWebAppUrl()}/`).replace(/[\r\n]/g, '');

    const form = new URLSearchParams();
    form.set('customer', customerId);
    form.set('return_url', returnUrl);

    const portal = await stripeRequest(stripeSecretKey, 'billing_portal/sessions', form);
    return jsonResponse({ url: portal.url }, 200, corsHeaders);
  } catch (error: any) {
    if (error?.code === 'UNAUTHORIZED') {
      return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
    }

    console.error('Stripe Portal Error:', error);
    return jsonResponse({ error: error.message || 'Stripe portal failed' }, 500, corsHeaders);
  }
});
