import { supabase } from '../supabase';

// Aktuelles Credit-Guthaben laden
export async function fetchBalance() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');

  const { data, error } = await supabase
    .from('credit_balances')
    .select('balance')
    .eq('user_id', user.id)
    .single();

  if (error) throw error;
  return data?.balance ?? 0;
}

// Abo-Status laden
export async function fetchSubscription() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error) throw error;
  return data;
}

// Usage-History laden (letzte N Einträge)
export async function fetchUsageHistory(limit = 50) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');

  const { data, error } = await supabase
    .from('usage_log')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

// Transaktions-History laden
export async function fetchTransactions(limit = 50) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Vollständige Credit-History: Verbrauch + Käufe + Discovery-Rewards
 * Gibt eine chronologisch sortierte Liste zurück.
 *
 * Jeder Eintrag hat:
 *   { id, type: 'usage'|'purchase'|'discovery', credits: number (neg/pos),
 *     label: string, detail?: string, date: string (ISO) }
 */
export async function fetchCreditHistory(limit = 50) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');

  // Fetch all three sources in parallel
  const [usageRes, txRes, discoveryRes] = await Promise.all([
    supabase
      .from('usage_log')
      .select('id, action, cost_credits, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('transactions')
      .select('id, type, package_name, credits_added, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('discovery_events')
      .select(
        'id, is_first, credits_awarded, species_id, created_at, species:species_id(canonical_name)'
      )
      .eq('user_id', user.id)
      .gt('credits_awarded', 0)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  const entries = [];

  // Usage entries (negative credits)
  for (const u of usageRes.data || []) {
    entries.push({
      id: u.id,
      type: 'usage',
      credits: -(u.cost_credits || 0),
      label: u.action,
      date: u.created_at,
    });
  }

  // Transaction entries (positive credits)
  for (const tx of txRes.data || []) {
    entries.push({
      id: tx.id,
      type: 'purchase',
      credits: tx.credits_added || 0,
      label: tx.type,
      detail: tx.package_name,
      date: tx.created_at,
    });
  }

  // Discovery reward entries (positive credits)
  for (const d of discoveryRes.data || []) {
    entries.push({
      id: d.id,
      type: 'discovery',
      credits: d.credits_awarded || 0,
      label: d.is_first ? 'first_discovery' : 'discovery',
      detail: d.species?.canonical_name || null,
      date: d.created_at,
    });
  }

  // Sort by date descending
  entries.sort((a, b) => new Date(b.date) - new Date(a.date));

  return entries.slice(0, limit);
}
