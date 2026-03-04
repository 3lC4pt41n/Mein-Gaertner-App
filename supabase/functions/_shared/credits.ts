import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';

// Credit-Kosten pro Aktion (in Credits, 1 Credit ≈ 1 Cent OpenAI-Kosten)
export const CREDIT_COSTS: Record<string, number> = {
  plant_scan: 12, // Erkennung (~$0.08-0.12)
  plant_details: 15, // Detail-Generierung (~$0.10-0.15)
  healthcheck: 8, // Einzelner Healthcheck (~$0.03-0.08)
  chat: 3, // Chat-Nachricht (~$0.01-0.03)
};

// Atomare Credit-Lastschrift: check + deduct in einem DB-Statement
// Verhindert Race Conditions bei parallelen Requests
export async function deductCreditsAtomic(
  serviceClient: SupabaseClient,
  userId: string,
  amount: number
): Promise<number> {
  const { data, error } = await serviceClient.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: amount,
  });

  if (error) {
    if (error.message?.includes('INSUFFICIENT_CREDITS')) {
      // Balance aus Fehlermeldung extrahieren
      const match = error.message.match(/INSUFFICIENT_CREDITS:(\d+)/);
      const currentBalance = match ? parseInt(match[1]) : 0;
      const err: any = new Error('Nicht genügend Credits');
      err.code = 'INSUFFICIENT_CREDITS';
      err.balance = currentBalance;
      err.required = amount;
      throw err;
    }
    throw error;
  }

  return data as number; // neuer Balance-Wert
}

// Credits zurueckgeben (Refund bei fehlgeschlagenem API-Call)
export async function refundCredits(
  serviceClient: SupabaseClient,
  userId: string,
  amount: number
): Promise<void> {
  const { error } = await serviceClient.rpc('refund_credits', {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) {
    console.error('Refund fehlgeschlagen fuer User:', userId, 'Amount:', amount, error);
  }
}

// Usage loggen
export async function logUsage(
  serviceClient: SupabaseClient,
  params: {
    user_id: string;
    action: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost_credits: number;
    openai_cost_usd: number;
    model: string;
    metadata?: Record<string, any>;
  }
) {
  const { error } = await serviceClient.from('usage_log').insert([
    {
      user_id: params.user_id,
      action: params.action,
      prompt_tokens: params.prompt_tokens,
      completion_tokens: params.completion_tokens,
      total_tokens: params.total_tokens,
      cost_credits: params.cost_credits,
      openai_cost_usd: params.openai_cost_usd,
      model: params.model,
      metadata: params.metadata || {},
    },
  ]);

  if (error) console.error('Usage-Log Fehler:', error);
}

// CORS Headers
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// User-ID aus JWT extrahieren
export async function getUserIdFromAuth(
  serviceClient: SupabaseClient,
  authHeader: string
): Promise<string> {
  const token = authHeader.replace('Bearer ', '');
  const {
    data: { user },
    error,
  } = await serviceClient.auth.getUser(token);

  if (error || !user) throw new Error('Nicht authentifiziert');
  return user.id;
}
