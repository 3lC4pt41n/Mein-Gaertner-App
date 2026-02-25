// Edge Function: RevenueCat Webhook
// Wird von RevenueCat aufgerufen bei Kauf, Abo-Erneuerung, Kündigung etc.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getServiceClient } from "../_shared/supabase-client.ts";
import { corsHeaders } from "../_shared/credits.ts";

// Credit-Pakete (müssen mit RevenueCat Product IDs übereinstimmen)
const PACKAGES: Record<string, { credits: number; type: string }> = {
  // Einmalkauf
  "credits_starter": { credits: 500, type: "one_time" },
  "credits_standard": { credits: 1500, type: "one_time" },
  "credits_pro": { credits: 5000, type: "one_time" },
  // Abo (monatliche Credits)
  "sub_hobby": { credits: 300, type: "subscription_renewal" },
  "sub_gaertner": { credits: 1000, type: "subscription_renewal" },
  "sub_profi": { credits: 3000, type: "subscription_renewal" },
};

// Abo-Plan Mapping
const SUB_PLANS: Record<string, string> = {
  "sub_hobby": "hobby",
  "sub_gaertner": "gaertner",
  "sub_profi": "profi",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // RevenueCat Webhook Auth prüfen
    const authHeader = req.headers.get("Authorization");
    const expectedToken = Deno.env.get("REVENUCAT_WEBHOOK_SECRET");
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const event = body.event;

    if (!event) {
      return new Response(JSON.stringify({ error: "No event" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = getServiceClient();
    const appUserId = event.app_user_id; // Supabase User ID
    const productId = event.product_id;
    const eventType = event.type;

    console.log(`RevenueCat Event: ${eventType}, User: ${appUserId}, Product: ${productId}`);

    // Events die Credits gutschreiben
    if (
      eventType === "INITIAL_PURCHASE" ||
      eventType === "RENEWAL" ||
      eventType === "NON_RENEWING_PURCHASE"
    ) {
      const pkg = PACKAGES[productId];
      if (!pkg) {
        console.warn(`Unbekanntes Produkt: ${productId}`);
        return new Response(JSON.stringify({ ok: true, skipped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Credits gutschreiben
      const { data: balance } = await serviceClient
        .from("credit_balances")
        .select("balance")
        .eq("user_id", appUserId)
        .single();

      const currentBalance = balance?.balance || 0;

      await serviceClient
        .from("credit_balances")
        .upsert({
          user_id: appUserId,
          balance: currentBalance + pkg.credits,
        });

      // Transaktion loggen
      await serviceClient.from("transactions").insert([
        {
          user_id: appUserId,
          type: pkg.type,
          package_name: productId,
          credits_added: pkg.credits,
          amount_eur: event.price || 0,
          provider_transaction_id: event.transaction_id || event.id,
        },
      ]);

      // Abo-Status aktualisieren (falls Abo)
      if (SUB_PLANS[productId]) {
        await serviceClient.from("subscriptions").upsert({
          user_id: appUserId,
          plan: SUB_PLANS[productId],
          status: "active",
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
    if (eventType === "CANCELLATION" || eventType === "EXPIRATION") {
      await serviceClient
        .from("subscriptions")
        .update({ status: eventType === "EXPIRATION" ? "expired" : "cancelled" })
        .eq("user_id", appUserId);

      console.log(`Abo ${eventType} für User ${appUserId}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("Webhook Error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
