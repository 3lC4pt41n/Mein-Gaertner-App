// Edge Function: RevenueCat Webhook
// Wird von RevenueCat aufgerufen bei Kauf, Abo-Erneuerung, Kündigung etc.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { getAnyCreditPackage, SUB_PLANS } from '../_shared/creditPackages.ts';

function toRevenueCatPurchaseType(packageType: string): string {
  return packageType === 'subscription' ? 'subscription_renewal' : packageType;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // RevenueCat Webhook Auth prüfen
    const WEBHOOK_SECRET = Deno.env.get('REVENUCAT_WEBHOOK_SECRET');
    if (!WEBHOOK_SECRET) {
      throw new Error('REVENUCAT_WEBHOOK_SECRET is not configured');
    }

    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const event = body.event;

    if (!event) {
      return new Response(JSON.stringify({ error: 'No event' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = getServiceClient();
    const appUserId = event.app_user_id; // Supabase User ID
    const productId = event.product_id;
    const eventType = event.type;

    console.log(`RevenueCat Event: ${eventType}, User: ${appUserId}, Product: ${productId}`);

    // Events die Credits gutschreiben
    if (
      eventType === 'INITIAL_PURCHASE' ||
      eventType === 'RENEWAL' ||
      eventType === 'NON_RENEWING_PURCHASE'
    ) {
      const pkg = getAnyCreditPackage(productId);
      if (!pkg) {
        console.warn(`Unbekanntes Produkt: ${productId}`);
        return new Response(JSON.stringify({ ok: true, skipped: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Credits gutschreiben (idempotent via RPC)
      const { data: result, error } = await serviceClient.rpc('credit_purchase', {
        p_user_id: appUserId,
        p_provider_transaction_id: event.transaction_id || event.id,
        p_package: productId,
        p_credits: pkg.credits,
        p_amount_eur: event.price ?? pkg.amountEur,
        p_type: toRevenueCatPurchaseType(pkg.type),
      });

      if (error) {
        throw error;
      }

      if (!result) {
        console.log(
          `Duplicate webhook for transaction ${event.transaction_id || event.id}, skipping credit application`
        );
      }

      // Abo-Status aktualisieren (falls Abo)
      if (SUB_PLANS[productId]) {
        await serviceClient.from('subscriptions').upsert({
          user_id: appUserId,
          plan: SUB_PLANS[productId],
          status: 'active',
          current_period_start: event.period_start
            ? new Date(event.period_start * 1000).toISOString()
            : new Date().toISOString(),
          current_period_end: event.expiration_at_ms
            ? new Date(event.expiration_at_ms).toISOString()
            : null,
          revenucat_subscriber_id: event.original_app_user_id || appUserId,
        });
      }

      console.log(`+${pkg.credits} Credits für User ${appUserId}`);
    }

    // Abo-Kündigung
    if (eventType === 'CANCELLATION' || eventType === 'EXPIRATION') {
      await serviceClient
        .from('subscriptions')
        .update({ status: eventType === 'EXPIRATION' ? 'expired' : 'cancelled' })
        .eq('user_id', appUserId);

      console.log(`Abo ${eventType} für User ${appUserId}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('Webhook Error:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
