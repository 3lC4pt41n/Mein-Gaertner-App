import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.50.2";

// Credit-Kosten pro Aktion (in Credits, 1 Credit ≈ 1 Cent OpenAI-Kosten)
export const CREDIT_COSTS: Record<string, number> = {
  plant_scan: 12,     // Erkennung (~$0.08-0.12)
  plant_details: 15,  // Detail-Generierung (~$0.10-0.15)
  healthcheck: 8,     // Einzelner Healthcheck (~$0.03-0.08)
  chat: 3,            // Chat-Nachricht (~$0.01-0.03)
};

// Balance prüfen
export async function checkBalance(
  serviceClient: SupabaseClient,
  userId: string,
  requiredCredits: number
): Promise<{ balance: number; sufficient: boolean }> {
  const { data, error } = await serviceClient
    .from("credit_balances")
    .select("balance")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return { balance: 0, sufficient: false };
  }

  return {
    balance: data.balance,
    sufficient: data.balance >= requiredCredits,
  };
}

// Credits abziehen
export async function deductCredits(
  serviceClient: SupabaseClient,
  userId: string,
  amount: number
): Promise<number> {
  // Atomar abziehen mit RPC wäre ideal, aber für Beta reicht das
  const { data, error } = await serviceClient
    .from("credit_balances")
    .select("balance")
    .eq("user_id", userId)
    .single();

  if (error || !data) throw new Error("Credit-Balance nicht gefunden");

  const newBalance = data.balance - amount;
  if (newBalance < 0) throw new Error("Nicht genügend Credits");

  const { error: updateError } = await serviceClient
    .from("credit_balances")
    .update({ balance: newBalance })
    .eq("user_id", userId);

  if (updateError) throw new Error("Credits konnten nicht abgezogen werden");

  return newBalance;
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
  const { error } = await serviceClient.from("usage_log").insert([
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

  if (error) console.error("Usage-Log Fehler:", error);
}

// CORS Headers
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// User-ID aus JWT extrahieren
export async function getUserIdFromAuth(
  serviceClient: SupabaseClient,
  authHeader: string
): Promise<string> {
  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error,
  } = await serviceClient.auth.getUser(token);

  if (error || !user) throw new Error("Nicht authentifiziert");
  return user.id;
}
